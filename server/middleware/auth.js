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

function detectPlatformInfo(req) {
  const ua = String(req.headers['user-agent'] || '');
  const clientPlatform = String(req.headers['x-client-platform'] || '').toLowerCase();

  let platform = 'web';
  let appType = 'desktop_web';
  let deviceLabel = 'Web Browser';

  if (clientPlatform === 'ios' || /CFNetwork|Darwin|Expo.*iOS/i.test(ua) && !/Safari/i.test(ua)) {
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
    deviceLabel = 'iPhone / iOS Web';
  } else if (/Android/i.test(ua)) {
    platform = 'web';
    appType = 'mobile_web';
    deviceLabel = 'Android Web';
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
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

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
    req.user = {
      customer_id: parseInt(payload.sub || payload.customer_id, 10),
      mobile: payload.mobile || '',
      branch_id: parseInt(payload.branch_id, 10) || 1
    };
    recordAppTelemetry(req, payload, false);
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

module.exports = { authenticateToken, recordAppTelemetry, JWT_SECRET };
