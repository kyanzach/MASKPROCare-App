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
const router = express.Router();

const pool = require('../db/connection');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');
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
        "UPDATE login_otp SET otp_code = ?, otp_expires = DATE_ADD(NOW(), INTERVAL ? SECOND), updated_at = NOW() WHERE mobile_number = ?",
        [otp, isReviewAccount ? 86400 : OTP_EXPIRY_SECONDS, formattedMobile]
      );
    } else {
      await pool.query(
        "INSERT INTO login_otp (mobile_number, customer_id, otp_code, otp_expires, created_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND), NOW())",
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
        branch_id: branchId
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    // Clear OTP
    await pool.query(
      "UPDATE login_otp SET otp_code = '', otp_expires = '2000-01-01 00:00:00', last_login = NOW(), updated_at = NOW() WHERE mobile_number = ?",
      [formattedMobile]
    );

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

// ─── POST /api/auth/magic-verify (TOFU Device-Bound Smart Link) ───
router.post('/magic-verify', async (req, res) => {
  try {
    const { slug, k, device_token, platform_label } = req.body || {};
    const ua = req.headers['user-agent'] || '';

    if (!slug || !String(slug).trim()) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_LINK',
        message: 'Invalid smart link.',
      });
    }

    // Never allow link preview crawlers to consume the first-open device lock
    if (isLinkPreviewBot(ua)) {
      return res.status(202).json({
        success: false,
        code: 'PREVIEW_BOT_IGNORED',
        message: 'Preview bot ignored — device lock preserved for client.',
      });
    }

    const cleanSlug = String(slug).trim().toLowerCase();
    const [links] = await pool.query(
      `SELECT ml.*, c.full_name, c.mobile_number, c.branch_id,
              v.make AS vehicle_make, v.model AS vehicle_model
       FROM care_magic_links ml
       JOIN customers c ON ml.customer_id = c.id
       LEFT JOIN vehicles v ON ml.vehicle_id = v.id
       WHERE ml.slug = ? AND ml.status = 'active'
       LIMIT 1`,
      [cleanSlug]
    );

    if (links.length === 0) {
      return res.status(404).json({
        success: false,
        code: 'LINK_NOT_FOUND',
        message: 'This smart maintenance link was not found or has expired. Please sign in with your mobile number.',
      });
    }

    const link = links[0];

    // If cryptographic key `k` was provided, verify it matches token_hash
    if (k && String(k).trim()) {
      const providedHash = crypto.createHash('sha256').update(String(k).trim()).digest('hex');
      if (providedHash !== link.token_hash) {
        return res.status(403).json({
          success: false,
          code: 'INVALID_TOKEN',
          message: 'This smart link security key is invalid. Please sign in with your mobile number.',
        });
      }
    }

    const cookies = parseCookies(req.headers.cookie);
    const cookieDeviceToken = cookies.mp_care_device_token || '';
    const bodyDeviceToken = device_token && String(device_token).trim().length >= 16 ? String(device_token).trim() : '';

    const candidateTokens = [bodyDeviceToken, cookieDeviceToken].filter(Boolean);
    const candidateHashes = candidateTokens.map((t) =>
      crypto.createHash('sha256').update(t).digest('hex')
    );

    const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    const resolvedPlatform = detectPlatformLabel(ua, platform_label);

    let activeDeviceToken = bodyDeviceToken || cookieDeviceToken;
    let isFirstBind = false;

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
    } else if (candidateHashes.includes(link.bound_device_token_hash)) {
      // ── CASE 2: SUBSEQUENT OPEN FROM THE SAME LOCKED DEVICE ──
      await pool.query(
        `UPDATE care_magic_links
         SET last_accessed_at = NOW(),
             access_count = access_count + 1
         WHERE id = ?`,
        [link.id]
      );
    } else {
      // ── CASE 3: OPENED ON ANOTHER DEVICE AFTER ALREADY LOCKED ──
      await pool.query(
        `UPDATE care_magic_links
         SET blocked_attempts = blocked_attempts + 1
         WHERE id = ?`,
        [link.id]
      );

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
      },
      JWT_SECRET,
      { expiresIn: magicJwtExpiry }
    );

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
