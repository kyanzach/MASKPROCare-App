/**
 * Auth Routes — Login (OTP), Verify, Logout
 * 
 * POST /api/auth/login   — Send OTP to mobile
 * POST /api/auth/verify  — Verify OTP, return JWT
 * POST /api/auth/logout  — Invalidate session (client-side)
 */

const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const router = express.Router();

const pool = require('../db/connection');
const { authenticateToken, recordAppTelemetry, JWT_SECRET } = require('../middleware/auth');
const { sendOtpSms } = require('../services/sms');
const { standardizeMobile, getLast10, isValidPhMobile } = require('../utils/mobile');

const JWT_EXPIRY = parseInt(process.env.JWT_EXPIRY, 10) || 86400;
const OTP_EXPIRY_SECONDS = 900; // 15 minutes
const DEFAULT_BRANCH_ID = 1;

// ─── POST /api/auth/login ─────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { mobile } = req.body;
    if (!mobile || !String(mobile).trim()) {
      return res.status(422).json({ success: false, data: null, message: 'Validation failed', errors: ['mobile is required'] });
    }

    const mobileTrimmed = String(mobile).trim();
    if (!isValidPhMobile(mobileTrimmed)) {
      return res.status(422).json({ success: false, data: null, message: 'Please enter a valid Philippine mobile number (e.g., 09XX XXX XXXX)', errors: [] });
    }

    const last10 = getLast10(mobileTrimmed);

    // Find customer by last 10 digits
    const [customers] = await pool.query(
      "SELECT id, mobile_number, branch_id, full_name FROM customers WHERE RIGHT(REPLACE(REPLACE(mobile_number, '+', ''), ' ', ''), 10) = ?",
      [last10]
    );

    if (customers.length === 0) {
      return res.status(404).json({ success: false, data: null, message: 'Mobile number not registered. Please contact the shop to register.', errors: [] });
    }

    const customer = customers[0];
    const customerId = customer.id;
    const formattedMobile = standardizeMobile(customer.mobile_number);

    const isReviewAccount = formattedMobile === '09852779777' || last10 === '9852779777';

    // Rate limiting: max 3 OTP per mobile per 15 minutes (bypassed for App Store / Play Store review test account)
    if (!isReviewAccount) {
      const [rateLimit] = await pool.query(
        "SELECT COUNT(*) as otp_count FROM login_otp WHERE mobile_number = ? AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)",
        [formattedMobile]
      );
      if ((rateLimit[0]?.otp_count || 0) >= 3) {
        return res.status(429).json({ success: false, data: null, message: 'Too many OTP requests. Please wait 15 minutes before trying again.', errors: [] });
      }
    }

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));

    // Store OTP — update if exists, insert if new
    // Use MySQL DATE_ADD(NOW(), ...) for timezone-consistent expiry (Asia/Manila)
    const [existing] = await pool.query("SELECT id FROM login_otp WHERE mobile_number = ?", [formattedMobile]);

    if (existing.length > 0) {
      await pool.query(
        "UPDATE login_otp SET otp_code = ?, otp_expires = DATE_ADD(NOW(), INTERVAL ? SECOND), request_count = COALESCE(request_count, 0) + 1, updated_at = NOW() WHERE mobile_number = ?",
        [otp, isReviewAccount ? 86400 : OTP_EXPIRY_SECONDS, formattedMobile]
      );
    } else {
      await pool.query(
        "INSERT INTO login_otp (mobile_number, customer_id, otp_code, otp_expires, request_count, verified_count, created_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND), 1, 0, NOW())",
        [formattedMobile, customerId, otp, isReviewAccount ? 86400 : OTP_EXPIRY_SECONDS]
      );
    }

    // Always send OTP via SMS (iTexMo primary, SMS-it fallback)
    const smsSent = await sendOtpSms(formattedMobile, otp, OTP_EXPIRY_SECONDS / 60, customerId);

    // Build response
    const responseData = { sms_sent: smsSent };

    // In dev, include OTP for testing
    if (process.env.NODE_ENV !== 'production') {
      responseData.otp = otp;
      responseData.expires_in_seconds = OTP_EXPIRY_SECONDS;
    }

    return res.json({
      success: true,
      data: responseData,
      message: smsSent ? 'OTP sent successfully' : 'OTP generated but SMS delivery failed',
      errors: []
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Failed to process login. Please try again.', errors: [] });
  }
});

// ─── POST /api/auth/verify ────────────────────────────────────────
router.post('/verify', async (req, res) => {
  try {
    const { mobile, otp } = req.body;
    const errors = [];
    if (!mobile) errors.push('mobile is required');
    if (!otp) errors.push('otp is required');
    if (errors.length > 0) {
      return res.status(422).json({ success: false, data: null, message: 'Validation failed', errors });
    }

    const last10 = getLast10(String(mobile).trim());

    // Find customer
    const [customers] = await pool.query(
      "SELECT id, mobile_number, branch_id FROM customers WHERE RIGHT(REPLACE(REPLACE(mobile_number, '+', ''), ' ', ''), 10) = ?",
      [last10]
    );

    if (customers.length === 0) {
      return res.status(404).json({ success: false, data: null, message: 'Mobile number not found', errors: [] });
    }

    const customer = customers[0];
    const customerId = customer.id;
    const branchId = customer.branch_id || DEFAULT_BRANCH_ID;
    const formattedMobile = standardizeMobile(customer.mobile_number);

    const isReviewAccount = formattedMobile === '09852779777' || last10 === '9852779777';
    const isReviewOtp = isReviewAccount && String(otp).trim() === '777777';

    // Verify OTP
    let isValidOtp = false;
    if (isReviewOtp) {
      isValidOtp = true;
    } else {
      const [otpRecords] = await pool.query(
        "SELECT * FROM login_otp WHERE mobile_number = ? AND otp_code = ? AND otp_expires > NOW()",
        [formattedMobile, String(otp).trim()]
      );
      if (otpRecords.length > 0) isValidOtp = true;
    }

    if (!isValidOtp) {
      return res.status(401).json({ success: false, data: null, message: 'Invalid or expired OTP. Please request a new one.', errors: [] });
    }

    // Generate JWT (same payload as PHP)
    const token = jwt.sign(
      {
        iss: 'maskpro-care-api',
        sub: customerId,
        mobile: formattedMobile,
        branch_id: branchId,
        auth_method: 'otp',
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    // Clear OTP & increment verified_count
    await pool.query(
      "UPDATE login_otp SET otp_code = '', otp_expires = '2000-01-01 00:00:00', verified_count = COALESCE(verified_count, 0) + 1, last_login = NOW(), updated_at = NOW() WHERE mobile_number = ?",
      [formattedMobile]
    );

    recordAppTelemetry(req, { sub: customerId, auth_method: 'otp' }, true);

    // Get full customer profile
    const [customerData] = await pool.query("SELECT * FROM customers WHERE id = ?", [customerId]);

    return res.json({
      success: true,
      data: {
        token,
        expires_in: JWT_EXPIRY,
        customer: customerData[0] || null
      },
      message: 'Login successful',
      errors: []
    });
  } catch (err) {
    console.error('Verify error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Failed to verify OTP. Please try again.', errors: [] });
  }
});

// ─── Helper: Parse cookie header & human-readable platform ────────
function parseCookies(cookieHeader = '') {
  const out = {};
  String(cookieHeader || '').split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  });
  return out;
}

function detectPlatformLabel(ua = '', clientLabel = '') {
  if (clientLabel && String(clientLabel).trim().length <= 80) {
    return String(clientLabel).trim();
  }
  const u = String(ua || '');
  let device = 'Mobile Device';
  if (/iPhone/i.test(u)) device = 'iPhone';
  else if (/iPad/i.test(u)) device = 'iPad';
  else if (/SM-|Samsung/i.test(u)) device = 'Samsung Galaxy';
  else if (/Android/i.test(u)) device = 'Android Phone';
  else if (/Macintosh|Mac OS X/i.test(u)) device = 'Mac';
  else if (/Windows/i.test(u)) device = 'Windows PC';

  let browser = 'Browser';
  if (/CriOS|Chrome/i.test(u) && !/Edg/i.test(u)) browser = 'Chrome';
  else if (/Safari/i.test(u) && !/Chrome|CriOS/i.test(u)) browser = 'Safari';
  else if (/SamsungBrowser/i.test(u)) browser = 'Samsung Internet';
  else if (/FBAN|FBAV/i.test(u)) browser = 'Messenger Browser';
  else if (/Edg/i.test(u)) browser = 'Edge';

  return `${device} (${browser})`;
}

function isLinkPreviewBot(ua = '') {
  return /WhatsApp|Facebot|facebookexternalhit|Twitterbot|TelegramBot|Slackbot|Discordbot|Viber|SkypeUriPreview|Google-Safety|Google-PageRenderer|Applebot|bot|crawler|spider|Preview/i.test(String(ua || ''));
}

function parseDetailedUserAgent(ua = '') {
  const u = String(ua || '');
  let browserDetail = 'Unknown Browser';
  if (/facebookexternalhit|Facebot|Twitterbot/i.test(u)) {
    browserDetail = 'Facebot / Twitterbot Link Preview Crawler';
  } else if (/WhatsApp/i.test(u)) {
    browserDetail = 'WhatsApp Link Preview Crawler';
  } else if (/CriOS\/([\d.]+)/i.test(u)) {
    const ver = u.match(/CriOS\/([\d.]+)/i)?.[1] || '';
    browserDetail = `Chrome iOS (CriOS ${ver})`;
  } else if (/SamsungBrowser\/([\d.]+)/i.test(u)) {
    const ver = u.match(/SamsungBrowser\/([\d.]+)/i)?.[1] || '';
    browserDetail = `Samsung Internet ${ver}`;
  } else if (/Edg\/([\d.]+)/i.test(u)) {
    const ver = u.match(/Edg\/([\d.]+)/i)?.[1] || '';
    browserDetail = `Microsoft Edge ${ver}`;
  } else if (/Chrome\/([\d.]+)/i.test(u)) {
    const ver = u.match(/Chrome\/([\d.]+)/i)?.[1] || '';
    const isMob = /Mobile/i.test(u);
    browserDetail = `Google Chrome ${ isMob ? 'Mobile ' : '' }${ver}`;
  } else if (/Version\/([\d.]+).*Safari/i.test(u)) {
    const ver = u.match(/Version\/([\d.]+)/i)?.[1] || '';
    browserDetail = `Apple Safari ${ver}`;
  } else if (/FBAN|FBAV/i.test(u)) {
    browserDetail = 'Facebook / Messenger In-App Browser';
  }

  let osDetail = 'Unknown OS';
  if (/iPhone OS ([\d_]+)/i.test(u)) {
    const ver = (u.match(/iPhone OS ([\d_]+)/i)?.[1] || '').replace(/_/g, '.');
    const build = u.match(/Mobile\/([A-Za-z0-9]+)/i)?.[1] || '';
    osDetail = `iOS ${ver} (iPhone${build ? ` • Build ${build}` : ''})`;
  } else if (/iPad.*OS ([\d_]+)/i.test(u)) {
    const ver = (u.match(/OS ([\d_]+)/i)?.[1] || '').replace(/_/g, '.');
    osDetail = `iPadOS ${ver} (iPad)`;
  } else if (/Android ([\d.]+)/i.test(u)) {
    const ver = u.match(/Android ([\d.]+)/i)?.[1] || '';
    const model = u.match(/Android [\d.]+;\s*([^)]+)\)/i)?.[1]?.trim() || '';
    osDetail = `Android ${ver}${model ? ` (${model})` : ''}`;
  } else if (/Mac OS X ([\d_]+)/i.test(u)) {
    const ver = (u.match(/Mac OS X ([\d_]+)/i)?.[1] || '').replace(/_/g, '.');
    osDetail = `macOS ${ver} (Macintosh)`;
  } else if (/Windows NT ([\d.]+)/i.test(u)) {
    const ver = u.match(/Windows NT ([\d.]+)/i)?.[1] || '';
    osDetail = `Windows NT ${ver} (PC)`;
  }

  return { browserDetail, osDetail };
}

// ─── Helper: Fast cached Geo-IP + ISP resolver ────────────────────
const geoCache = new Map();
async function resolveGeoLocation(ip = '') {
  const cleanIp = String(ip || '').trim();
  if (!cleanIp || cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp.startsWith('192.168.') || cleanIp.startsWith('10.')) {
    return 'Local Network (PH)';
  }
  if (geoCache.has(cleanIp)) return geoCache.get(cleanIp);
  try {
    const resp = await axios.get(`http://ip-api.com/json/${encodeURIComponent(cleanIp)}?fields=status,city,regionName,countryCode,isp`, {
      timeout: 1500,
    });
    const d = resp.data;
    if (d && d.status === 'success') {
      const loc = [d.city, d.regionName, d.countryCode].filter(Boolean).join(', ') + (d.isp ? ` (${d.isp})` : '');
      geoCache.set(cleanIp, loc);
      return loc;
    }
  } catch {
    // Non-blocking fallback
  }
  return 'Philippines';
}

// ─── Helper: Log Magic Link Security Event + Tiered Brute-Force Shield ───
// Tier 1 (Attempts 1–9 on device): Soft 403 block (elderly-safe, no ban)
// Tier 2 (10th failed attempt on same device in 24h): Auto-Block Device (care_blocked_devices)
// Tier 3 (100th failed attempt on same IP in 24h): Auto-Block IP (care_blocked_ips)
async function logMagicSecurityEvent({
  magicLinkId = null,
  customerId = null,
  slug = '',
  requestUrl = '',
  eventType = 'device_locked_elsewhere',
  httpStatus = 403,
  serverCode = 'DEVICE_LOCKED_ELSEWHERE',
  attemptedPlatform = '',
  boundPlatform = null,
  deviceTokenHash = null,
  deviceFingerprint = '',
  ip = '',
  ua = '',
  requestHeaders = '',
  isFailure = true,
}) {
  try {
    const location = await resolveGeoLocation(ip);
    const { browserDetail, osDetail } = parseDetailedUserAgent(ua);
    let deviceAttempts = 0;
    let ipAttempts = 0;
    let actionTaken = isFailure ? 'blocked_403' : (eventType === 'preview_bot_ignored' ? 'bot_ignored' : 'allowed');

    if (isFailure) {
      const [[devCnt]] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM care_magic_link_security_logs
         WHERE device_fingerprint = ?
           AND event_type IN ('device_locked_elsewhere', 'invalid_token', 'invalid_slug', 'revoked_link', 'device_blocked', 'ip_blocked')
           AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
        [deviceFingerprint]
      ).catch(() => [[{ cnt: 0 }]]);

      const [[ipCnt]] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM care_magic_link_security_logs
         WHERE ip_address = ?
           AND event_type IN ('device_locked_elsewhere', 'invalid_token', 'invalid_slug', 'revoked_link', 'device_blocked', 'ip_blocked')
           AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
        [ip]
      ).catch(() => [[{ cnt: 0 }]]);

      deviceAttempts = Number(devCnt?.cnt || 0) + 1;
      ipAttempts = Number(ipCnt?.cnt || 0) + 1;

      if (ipAttempts >= 100) {
        actionTaken = 'auto_ip_blocked';
        await pool.query(
          `INSERT INTO care_blocked_ips (ip_address, reason, attempts_count, blocked_until, created_at, updated_at)
           VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR), NOW(), NOW())
           ON DUPLICATE KEY UPDATE
             reason = VALUES(reason),
             attempts_count = ?,
             blocked_until = DATE_ADD(NOW(), INTERVAL 24 HOUR),
             updated_at = NOW()`,
          [ip, `Automated Brute-Force Block: ${ipAttempts} failed Magic Link attempts from IP`, ipAttempts, ipAttempts]
        ).catch(() => {});
      } else if (deviceAttempts >= 10) {
        actionTaken = 'auto_device_blocked';
        await pool.query(
          `INSERT INTO care_blocked_devices
             (device_fingerprint, device_token_hash, device_label, ip_address, user_agent, reason, attempts_count, is_active, blocked_until, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, DATE_ADD(NOW(), INTERVAL 24 HOUR), NOW(), NOW())
           ON DUPLICATE KEY UPDATE
             device_token_hash = COALESCE(VALUES(device_token_hash), device_token_hash),
             ip_address = VALUES(ip_address),
             user_agent = VALUES(user_agent),
             reason = VALUES(reason),
             attempts_count = ?,
             is_active = 1,
             blocked_until = DATE_ADD(NOW(), INTERVAL 24 HOUR),
             updated_at = NOW()`,
          [
            deviceFingerprint,
            deviceTokenHash,
            attemptedPlatform,
            ip,
            String(ua).slice(0, 490),
            `Automated Device Block: ${deviceAttempts} unauthorized Magic Link attempts on ${attemptedPlatform}`,
            deviceAttempts,
            deviceAttempts,
          ]
        ).catch(() => {});
      }
    }

    await pool.query(
      `INSERT INTO care_magic_link_security_logs
         (magic_link_id, customer_id, slug, request_url, event_type, http_status, server_code, attempted_platform, bound_platform, browser_detail, os_detail, device_token_hash, device_fingerprint, ip_address, location, user_agent, request_headers, device_attempt_count, ip_attempt_count, action_taken, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        magicLinkId,
        customerId,
        String(slug || '').slice(0, 120),
        String(requestUrl || '').slice(0, 490),
        eventType,
        Number(httpStatus || 403),
        String(serverCode || '').slice(0, 60),
        String(attemptedPlatform || '').slice(0, 100),
        boundPlatform ? String(boundPlatform).slice(0, 100) : null,
        String(browserDetail || '').slice(0, 155),
        String(osDetail || '').slice(0, 155),
        deviceTokenHash,
        deviceFingerprint,
        String(ip || '').slice(0, 60),
        String(location || '').slice(0, 155),
        String(ua || '').slice(0, 490),
        String(requestHeaders || '').slice(0, 490),
        deviceAttempts,
        ipAttempts,
        actionTaken,
      ]
    ).catch((e) => console.error('[MagicSecLog] insert error:', e.message));

    return { deviceAttempts, ipAttempts, actionTaken };
  } catch {
    return { deviceAttempts: 1, ipAttempts: 1, actionTaken: 'blocked_403' };
  }
}

// ─── POST /api/auth/magic-verify (TOFU Device-Bound Smart Link) ───
router.post('/magic-verify', async (req, res) => {
  try {
    const { slug, k, device_token, platform_label, request_url, client_meta } = req.body || {};
    const ua = req.headers['user-agent'] || '';

    if (!slug || !String(slug).trim()) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_LINK',
        message: 'Invalid smart link.',
      });
    }

    const cleanSlug = String(slug).trim().toLowerCase();
    const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    const resolvedUrl = String(
      request_url ||
      req.headers.referer ||
      `https://care.maskpro.ph/m/${cleanSlug}${k ? `?k=${encodeURIComponent(String(k).trim())}` : ''}`
    ).trim();
    const buildHeadersSummary = (statusLabel) => [
      `POST /api/auth/magic-verify HTTP/1.1 • ${statusLabel}`,
      client_meta ? String(client_meta) : '',
      !client_meta && req.headers['accept-language'] ? `Lang: ${String(req.headers['accept-language']).split(',')[0]}` : '',
    ].filter(Boolean).join(' • ');

    // Never allow link preview crawlers to consume the first-open device lock
    if (isLinkPreviewBot(ua)) {
      await logMagicSecurityEvent({
        slug: cleanSlug,
        requestUrl: resolvedUrl,
        eventType: 'preview_bot_ignored',
        httpStatus: 202,
        serverCode: 'PREVIEW_BOT_IGNORED',
        attemptedPlatform: 'Link Preview Crawler',
        deviceFingerprint: 'bot_preview_crawler',
        ip: clientIp,
        ua,
        requestHeaders: buildHeadersSummary('202 Bot Ignored • Lock Preserved'),
        isFailure: false,
      });
      return res.status(202).json({
        success: false,
        code: 'PREVIEW_BOT_IGNORED',
        message: 'Preview bot ignored — device lock preserved for client.',
      });
    }

    const cookies = parseCookies(req.headers.cookie);
    const cookieDeviceToken = cookies.mp_care_device_token || '';
    const bodyDeviceToken = device_token && String(device_token).trim().length >= 16 ? String(device_token).trim() : '';

    const candidateTokens = [bodyDeviceToken, cookieDeviceToken].filter(Boolean);
    const candidateHashes = candidateTokens.map((t) =>
      crypto.createHash('sha256').update(t).digest('hex')
    );
    const primaryDeviceHash = candidateHashes[0] || null;

    const resolvedPlatform = detectPlatformLabel(ua, platform_label);
    const deviceFingerprint = primaryDeviceHash || crypto.createHash('sha256').update(`${clientIp}|${resolvedPlatform}`).digest('hex');

    const [links] = await pool.query(
      `SELECT ml.*, c.full_name, c.mobile_number, c.branch_id,
              v.make AS vehicle_make, v.model AS vehicle_model
       FROM care_magic_links ml
       JOIN customers c ON ml.customer_id = c.id
       LEFT JOIN vehicles v ON ml.vehicle_id = v.id
       WHERE ml.slug = ?
       LIMIT 1`,
      [cleanSlug]
    );
    const matchedLink = links[0] || null;

    // 0a. Check if IP is blocked (100+ attempts or manual Admin IP block)
    const [ipBlockRows] = await pool.query(
      'SELECT id, reason, created_at FROM care_blocked_ips WHERE ip_address = ? AND (blocked_until IS NULL OR blocked_until > NOW()) LIMIT 1',
      [clientIp]
    ).catch(() => [[]]);
    if (ipBlockRows.length > 0) {
      if (matchedLink) {
        await pool.query('UPDATE care_magic_links SET blocked_attempts = blocked_attempts + 1 WHERE id = ?', [matchedLink.id]).catch(() => {});
      }
      await logMagicSecurityEvent({
        magicLinkId: matchedLink?.id || null,
        customerId: matchedLink?.customer_id || null,
        slug: cleanSlug,
        requestUrl: resolvedUrl,
        eventType: 'ip_blocked',
        httpStatus: 403,
        serverCode: 'IP_BLOCKED',
        attemptedPlatform: resolvedPlatform,
        boundPlatform: matchedLink?.bound_platform || null,
        deviceTokenHash: primaryDeviceHash,
        deviceFingerprint,
        ip: clientIp,
        ua,
        requestHeaders: buildHeadersSummary('403 Forbidden (IP Blocked)'),
        isFailure: true,
      });
      return res.status(403).json({
        success: false,
        code: 'IP_BLOCKED',
        message: 'Access from this network IP has been restricted by MaskPro Security Shield.',
        data: {
          slug: cleanSlug,
          attempted_platform: resolvedPlatform,
          ip: clientIp,
          reason: 'Access from this network IP has been restricted by MaskPro Security Shield due to repeated unauthorized access attempts.',
        },
      });
    }

    // 0b. Check if Device is blocked (10+ attempts or manual Admin Device block)
    const [devBlockRows] = await pool.query(
      `SELECT id, reason, created_at FROM care_blocked_devices
       WHERE is_active = 1
         AND (blocked_until IS NULL OR blocked_until > NOW())
         AND (device_fingerprint = ? OR (device_token_hash IS NOT NULL AND device_token_hash = ?))
       LIMIT 1`,
      [deviceFingerprint, primaryDeviceHash || '']
    ).catch(() => [[]]);
    if (devBlockRows.length > 0) {
      if (matchedLink) {
        await pool.query('UPDATE care_magic_links SET blocked_attempts = blocked_attempts + 1 WHERE id = ?', [matchedLink.id]).catch(() => {});
      }
      await logMagicSecurityEvent({
        magicLinkId: matchedLink?.id || null,
        customerId: matchedLink?.customer_id || null,
        slug: cleanSlug,
        requestUrl: resolvedUrl,
        eventType: 'device_blocked',
        httpStatus: 403,
        serverCode: 'DEVICE_BLOCKED',
        attemptedPlatform: resolvedPlatform,
        boundPlatform: matchedLink?.bound_platform || null,
        deviceTokenHash: primaryDeviceHash,
        deviceFingerprint,
        ip: clientIp,
        ua,
        requestHeaders: buildHeadersSummary('403 Forbidden (Device Blocked)'),
        isFailure: true,
      });
      return res.status(403).json({
        success: false,
        code: 'DEVICE_BLOCKED',
        message: 'This device has been restricted by MaskPro Security Shield from accessing smart maintenance links.',
        data: {
          slug: cleanSlug,
          attempted_platform: resolvedPlatform,
          bound_platform: matchedLink?.bound_platform || 'another device',
          ip: clientIp,
          reason: 'Access from this device has been restricted by MaskPro Security Shield due to unauthorized access attempts.',
        },
      });
    }

    if (links.length === 0) {
      await logMagicSecurityEvent({
        slug: cleanSlug,
        requestUrl: resolvedUrl,
        eventType: 'invalid_slug',
        httpStatus: 404,
        serverCode: 'LINK_NOT_FOUND',
        attemptedPlatform: resolvedPlatform,
        deviceTokenHash: primaryDeviceHash,
        deviceFingerprint,
        ip: clientIp,
        ua,
        requestHeaders: buildHeadersSummary('404 Not Found (Unknown Slug)'),
        isFailure: true,
      });
      return res.status(404).json({
        success: false,
        code: 'LINK_NOT_FOUND',
        message: 'This smart maintenance link was not found or has expired. Please sign in with your mobile number.',
      });
    }

    const link = links[0];

    if (link.status !== 'active') {
      await logMagicSecurityEvent({
        magicLinkId: link.id,
        customerId: link.customer_id,
        slug: link.slug,
        requestUrl: resolvedUrl,
        eventType: 'revoked_link',
        httpStatus: 403,
        serverCode: 'LINK_REVOKED',
        attemptedPlatform: resolvedPlatform,
        boundPlatform: link.bound_platform,
        deviceTokenHash: primaryDeviceHash,
        deviceFingerprint,
        ip: clientIp,
        ua,
        requestHeaders: buildHeadersSummary('403 Forbidden (Revoked Link)'),
        isFailure: true,
      });
      return res.status(403).json({
        success: false,
        code: 'LINK_REVOKED',
        message: 'This smart maintenance link has been deactivated by an administrator. Please sign in with your mobile number.',
      });
    }

    // If cryptographic key `k` was provided, verify it matches token_hash
    if (k && String(k).trim()) {
      const providedHash = crypto.createHash('sha256').update(String(k).trim()).digest('hex');
      if (providedHash !== link.token_hash) {
        await pool.query('UPDATE care_magic_links SET blocked_attempts = blocked_attempts + 1 WHERE id = ?', [link.id]);
        await logMagicSecurityEvent({
          magicLinkId: link.id,
          customerId: link.customer_id,
          slug: link.slug,
          requestUrl: resolvedUrl,
          eventType: 'invalid_token',
          httpStatus: 403,
          serverCode: 'INVALID_TOKEN',
          attemptedPlatform: resolvedPlatform,
          boundPlatform: link.bound_platform,
          deviceTokenHash: primaryDeviceHash,
          deviceFingerprint,
          ip: clientIp,
          ua,
          requestHeaders: buildHeadersSummary('403 Forbidden (Tampered Security Key)'),
          isFailure: true,
        });
        return res.status(403).json({
          success: false,
          code: 'INVALID_TOKEN',
          message: 'This smart link security key is invalid. Please sign in with your mobile number.',
        });
      }
    }

    let activeDeviceToken = bodyDeviceToken || cookieDeviceToken;
    let isFirstBind = false;
    const isDuplicateBurst = link.last_accessed_at && (Date.now() - new Date(link.last_accessed_at).getTime() < 10000);

    if (!link.bound_device_token_hash) {
      // ── CASE 1: FIRST OPEN (TOFU — Lock to this device!) ──
      if (!activeDeviceToken || activeDeviceToken.length < 16) {
        activeDeviceToken = crypto.randomBytes(24).toString('hex');
      }
      const newDeviceHash = crypto.createHash('sha256').update(activeDeviceToken).digest('hex');
      await pool.query(
        `UPDATE care_magic_links
         SET bound_device_token_hash = ?,
             bound_platform = ?,
             bound_user_agent = ?,
             bound_ip = ?,
             bound_at = NOW(),
             last_accessed_at = NOW(),
             access_count = access_count + 1
         WHERE id = ?`,
        [newDeviceHash, resolvedPlatform, String(ua).slice(0, 490), clientIp.slice(0, 60), link.id]
      );
      isFirstBind = true;
      await logMagicSecurityEvent({
        magicLinkId: link.id,
        customerId: link.customer_id,
        slug: link.slug,
        requestUrl: resolvedUrl,
        eventType: 'first_bind',
        httpStatus: 200,
        serverCode: 'TOFU_FIRST_BIND',
        attemptedPlatform: resolvedPlatform,
        boundPlatform: resolvedPlatform,
        deviceTokenHash: newDeviceHash,
        deviceFingerprint: newDeviceHash,
        ip: clientIp,
        ua,
        requestHeaders: buildHeadersSummary('200 OK (First Open • Device Locked)'),
        isFailure: false,
      });
    } else if (candidateHashes.includes(link.bound_device_token_hash)) {
      // ── CASE 2: SUBSEQUENT OPEN FROM THE SAME LOCKED DEVICE ──
      // Deduplicate rapid double-requests within 10 seconds so 1 click = 1 count
      await pool.query(
        `UPDATE care_magic_links
         SET access_count = access_count + ?,
             last_accessed_at = NOW()
         WHERE id = ?`,
        [isDuplicateBurst ? 0 : 1, link.id]
      );
      if (!isDuplicateBurst) {
        await logMagicSecurityEvent({
          magicLinkId: link.id,
          customerId: link.customer_id,
          slug: link.slug,
          requestUrl: resolvedUrl,
          eventType: 'authorized_access',
          httpStatus: 200,
          serverCode: 'AUTHORIZED_SAME_DEVICE',
          attemptedPlatform: resolvedPlatform,
          boundPlatform: link.bound_platform || resolvedPlatform,
          deviceTokenHash: link.bound_device_token_hash,
          deviceFingerprint: link.bound_device_token_hash,
          ip: clientIp,
          ua,
          requestHeaders: buildHeadersSummary('200 OK (Verified Bound Device)'),
          isFailure: false,
        });
      }
    } else {
      // ── CASE 3: OPENED ON ANOTHER DEVICE AFTER ALREADY LOCKED ──
      await pool.query(
        `UPDATE care_magic_links
         SET blocked_attempts = blocked_attempts + 1
         WHERE id = ?`,
        [link.id]
      );

      await logMagicSecurityEvent({
        magicLinkId: link.id,
        customerId: link.customer_id,
        slug: link.slug,
        requestUrl: resolvedUrl,
        eventType: 'device_locked_elsewhere',
        httpStatus: 403,
        serverCode: 'DEVICE_LOCKED_ELSEWHERE',
        attemptedPlatform: resolvedPlatform,
        boundPlatform: link.bound_platform,
        deviceTokenHash: primaryDeviceHash,
        deviceFingerprint,
        ip: clientIp,
        ua,
        requestHeaders: buildHeadersSummary('403 Forbidden (2nd Device Rejected)'),
        isFailure: true,
      });

      const formattedMobile = standardizeMobile(link.mobile_number || '');
      const maskedMobile = formattedMobile.length >= 10
        ? `${formattedMobile.slice(0, 4)} •••• ${formattedMobile.slice(-3)}`
        : 'your registered number';
      const firstName = String(link.full_name || 'Valued Client').trim().split(/\s+/)[0];
      const vehName = [link.vehicle_make, link.vehicle_model].filter(Boolean).join(' ') || 'your vehicle';
      const boundDateStr = link.bound_at
        ? new Date(link.bound_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'recently';

      return res.status(403).json({
        success: false,
        code: 'DEVICE_LOCKED_ELSEWHERE',
        message: 'You have already accessed your account on another device. Please continue there, or login here with your mobile number.',
        data: {
          slug: link.slug,
          short_url: link.short_url,
          bound_platform: link.bound_platform || 'another device',
          bound_at: boundDateStr,
          customer_first_name: firstName,
          vehicle_name: vehName,
          masked_mobile: maskedMobile,
        },
      });
    }

    // Set persistent HttpOnly cookie for this locked device (1 year)
    res.cookie('mp_care_device_token', activeDeviceToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    const customerId = link.customer_id;
    const branchId = link.branch_id || DEFAULT_BRANCH_ID;
    const formattedMobile = standardizeMobile(link.mobile_number || '');
    const magicJwtExpiry = 30 * 86400; // 30 days seamless access on locked device

    const token = jwt.sign(
      {
        iss: 'maskpro-care-api',
        sub: customerId,
        mobile: formattedMobile,
        branch_id: branchId,
        magic_slug: link.slug,
        auth_method: 'magic_link',
      },
      JWT_SECRET,
      { expiresIn: magicJwtExpiry }
    );

    if (!isDuplicateBurst) {
      recordAppTelemetry(req, { sub: customerId, magic_slug: link.slug, auth_method: 'magic_link' }, true);
    }

    const [customerData] = await pool.query('SELECT * FROM customers WHERE id = ?', [customerId]);
    const redirectUrl = link.vehicle_id
      ? `/bookings?openBooking=true&vehicle_id=${link.vehicle_id}&service=NanoFix`
      : '/bookings?openBooking=true&service=NanoFix';

    return res.json({
      success: true,
      message: isFirstBind
        ? `Smart link verified and locked to this ${resolvedPlatform}.`
        : 'Welcome back! Continuing on your verified device.',
      data: {
        token,
        expires_in: magicJwtExpiry,
        customer: customerData[0] || null,
        device_token: activeDeviceToken,
        bound_platform: resolvedPlatform,
        first_bind: isFirstBind,
        redirect_to: redirectUrl,
        vehicle_id: link.vehicle_id,
      },
    });
  } catch (err) {
    console.error('Magic link verify error:', err);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Unable to verify smart link right now. Please sign in with your mobile number.',
    });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────
router.post('/logout', authenticateToken, (req, res) => {
  // JWT is stateless — logout is client-side (discard token)
  return res.json({
    success: true,
    data: null,
    message: 'Logged out successfully',
    errors: []
  });
});

module.exports = router;
