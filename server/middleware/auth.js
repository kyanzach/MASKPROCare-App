/**
 * JWT Authentication Middleware
 * 
 * Verifies Bearer token from Authorization header.
 * Sets req.user = { customer_id, mobile, branch_id }
 * 
 * Same secret and payload structure as the PHP version:
 *   { iss: 'maskpro-care-api', sub: customer_id, mobile, branch_id, iat, exp }
 */

const jwt = require('jsonwebtoken');
const pool = require('../db/connection');

const JWT_SECRET = process.env.JWT_SECRET || 'mpc_jwt_s3cr3t_k3y_2026_xK9pLm2nQ7rT';

// In-memory throttle map so telemetry writes at most once every 2 minutes per user+platform
const telemetryThrottle = new Map();
const activityDedupMap = new Map();

function parseCookieHeader(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  String(cookieHeader)
    .split(';')
    .forEach((part) => {
      const idx = part.indexOf('=');
      if (idx > 0) {
        const k = part.slice(0, idx).trim();
        const v = part.slice(idx + 1).trim();
        try {
          out[k] = decodeURIComponent(v);
        } catch {
          out[k] = v;
        }
      }
    });
  return out;
}

function detectPlatformInfo(req) {
  const ua = String(req.headers['user-agent'] || '');
  const clientPlatform = String(req.headers['x-client-platform'] || '').toLowerCase();

  let platform = 'web';
  let appType = 'desktop_web';
  let deviceLabel = 'Web Browser';

  if (clientPlatform === 'ios' || (/CFNetwork|Darwin|Expo.*iOS/i.test(ua) && !/Safari/i.test(ua))) {
    platform = 'ios';
    appType = 'native_ios';
    deviceLabel = 'iOS Native App';
  } else if (clientPlatform === 'android' || /okhttp|Dalvik|Expo.*Android/i.test(ua)) {
    platform = 'android';
    appType = 'native_android';
    deviceLabel = 'Android Native App';
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    platform = 'web';
    appType = 'mobile_web';
    const browser = /CriOS/i.test(ua) ? 'Chrome' : 'Safari';
    deviceLabel = `iPhone (${browser})`;
  } else if (/Android/i.test(ua)) {
    platform = 'web';
    appType = 'mobile_web';
    deviceLabel = 'Android Phone (Chrome)';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    platform = 'web';
    appType = 'desktop_web';
    deviceLabel = 'Mac Web Browser';
  } else if (/Windows/i.test(ua)) {
    platform = 'web';
    appType = 'desktop_web';
    deviceLabel = 'Windows Web Browser';
  }

  return { platform, appType, deviceLabel, ua: ua.slice(0, 500) };
}

function logCustomerActivity(req, payload, { eventType = 'page_view', pagePath = '/', pageLabel = 'App Page', actionDetail = null, dedupWindowMs = 20000 } = {}) {
  try {
    const customerId = parseInt(payload?.sub || payload?.customer_id, 10);
    if (!customerId || customerId <= 0) return;
    if (payload?.impersonated_by) return;

    const { appType, deviceLabel } = detectPlatformInfo(req);
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);

    const dedupKey = `${customerId}:${eventType}:${pagePath}:${actionDetail || ''}`;
    const now = Date.now();
    const lastLogged = activityDedupMap.get(dedupKey) || 0;
    if (dedupWindowMs > 0 && now - lastLogged < dedupWindowMs) return;
    activityDedupMap.set(dedupKey, now);

    pool.query(
      `INSERT INTO care_app_activity_logs
        (customer_id, platform, event_type, page_path, page_label, action_detail, ip_address, device_label, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        customerId,
        String(appType || 'web').slice(0, 32),
        String(eventType || 'page_view').slice(0, 32),
        String(pagePath || '/').slice(0, 160),
        String(pageLabel || 'App Page').slice(0, 120),
        actionDetail ? String(actionDetail).slice(0, 255) : null,
        ip || null,
        String(deviceLabel || 'Web Browser').slice(0, 120),
      ]
    ).catch(() => {});
  } catch {
    // Non-blocking
  }
}

function recordAppTelemetry(req, payload, forceNewSession = false) {
  try {
    const customerId = parseInt(payload.sub || payload.customer_id, 10);
    if (!customerId || customerId <= 0) return;
    // Skip recording impersonated sessions as customer platform logins
    if (payload.impersonated_by) return;

    const { platform, appType, deviceLabel, ua } = detectPlatformInfo(req);
    const key = `${customerId}:${platform}:${appType}`;
    const now = Date.now();
    const lastRecorded = telemetryThrottle.get(key) || 0;
    if (!forceNewSession && now - lastRecorded < 120000) return; // 2 min throttle for passive API hits
    telemetryThrottle.set(key, now);

    let authMethod = 'otp';
    if (payload.is_admin) authMethod = 'admin_login';
    else if (payload.magic_slug) authMethod = 'magic_link';
    else if (payload.auth_method) authMethod = String(payload.auth_method);

    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);

    if (forceNewSession) {
      pool.query(
        `INSERT INTO care_app_telemetry
          (customer_id, platform, app_type, device_label, auth_method, user_agent, ip_address, session_count, api_hits, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           device_label = VALUES(device_label),
           auth_method = VALUES(auth_method),
           user_agent = VALUES(user_agent),
           ip_address = VALUES(ip_address),
           api_hits = api_hits + 1,
           session_count = session_count + 1,
           last_seen_at = NOW()`,
        [customerId, platform, appType, deviceLabel, authMethod, ua, ip]
      ).catch(() => {});
    } else {
      pool.query(
        `INSERT INTO care_app_telemetry
          (customer_id, platform, app_type, device_label, auth_method, user_agent, ip_address, session_count, api_hits, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           device_label = VALUES(device_label),
           auth_method = IF(VALUES(auth_method) IN ('magic_link', 'ai_helper', 'admin_login', 'otp'), VALUES(auth_method), auth_method),
           user_agent = VALUES(user_agent),
           ip_address = VALUES(ip_address),
           api_hits = api_hits + 1,
           session_count = IF(TIMESTAMPDIFF(MINUTE, last_seen_at, NOW()) > 30, session_count + 1, session_count),
           last_seen_at = NOW()`,
        [customerId, platform, appType, deviceLabel, authMethod, ua, ip]
      ).catch(() => {});
    }
  } catch (e) {
    // Non-blocking
  }
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const cookies = parseCookieHeader(req.headers.cookie);
  const token = (authHeader && authHeader.startsWith('Bearer '))
    ? authHeader.slice(7)
    : (cookies.mpc_auth_token || null);

  if (!token) {
    return res.status(401).json({
      success: false,
      data: null,
      message: 'Authentication required. Please provide a Bearer token.',
      errors: []
    });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const rawBranchId = parseInt(payload.branch_id, 10) || 1;
    req.user = {
      customer_id: parseInt(payload.sub || payload.customer_id, 10),
      mobile: payload.mobile || '',
      // Remap Gensan (branch_id = 2, closed partner) to Davao Main (branch_id = 1)
      branch_id: rawBranchId === 2 ? 1 : rawBranchId,
      impersonated_by: payload.impersonated_by || null,
    };
    recordAppTelemetry(req, payload, false);

    // Passive fallback logging for key API interactions
    const baseUrl = String(req.baseUrl || '') + String(req.path || '');
    if (baseUrl.includes('/bookings/availability')) {
      const m = req.query?.month || '';
      const svc = req.query?.service_type || 'Service';
      logCustomerActivity(req, payload, {
        eventType: 'action',
        pagePath: '/bookings',
        pageLabel: m ? `Checked Available Dates (${m})` : 'Checked Available Dates',
        actionDetail: `Viewed ${m || 'upcoming'} calendar slots for ${svc}`,
        dedupWindowMs: 10000,
      });
    } else if (baseUrl.includes('/loyalty/cards')) {
      logCustomerActivity(req, payload, {
        eventType: 'page_view',
        pagePath: '/profile?tab=loyalty',
        pageLabel: 'My MASKPROCare Cards',
        actionDetail: 'Viewed active MASKPROCare loyalty cards & maintenance credits',
        dedupWindowMs: 45000,
      });
    }

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      data: null,
      message: 'Invalid or expired token. Please log in again.',
      errors: []
    });
  }
}

module.exports = { authenticateToken, recordAppTelemetry, logCustomerActivity, JWT_SECRET };
