/**
 * Auth Routes — Login (OTP), Verify, Logout
 * 
 * POST /api/auth/login   — Send OTP to mobile
 * POST /api/auth/verify  — Verify OTP, return JWT
 * POST /api/auth/logout  — Invalidate session (client-side)
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

const pool = require('../db/connection');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');
const { sendOtpSms } = require('../services/sms');
const { standardizeMobile, getLast10, isValidPhMobile } = require('../utils/mobile');

const JWT_EXPIRY = parseInt(process.env.JWT_EXPIRY, 10) || 86400;
const OTP_EXPIRY_SECONDS = 300; // 5 minutes
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

    // Rate limiting: max 3 OTP per mobile per 15 minutes
    const [rateLimit] = await pool.query(
      "SELECT COUNT(*) as otp_count FROM login_otp WHERE mobile_number = ? AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)",
      [formattedMobile]
    );
    if ((rateLimit[0]?.otp_count || 0) >= 3) {
      return res.status(429).json({ success: false, data: null, message: 'Too many OTP requests. Please wait 15 minutes before trying again.', errors: [] });
    }

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));

    // Store OTP — update if exists, insert if new
    // Use MySQL DATE_ADD(NOW(), ...) for timezone-consistent expiry (Asia/Manila)
    const [existing] = await pool.query("SELECT id FROM login_otp WHERE mobile_number = ?", [formattedMobile]);

    if (existing.length > 0) {
      await pool.query(
        "UPDATE login_otp SET otp_code = ?, otp_expires = DATE_ADD(NOW(), INTERVAL ? SECOND), updated_at = NOW() WHERE mobile_number = ?",
        [otp, OTP_EXPIRY_SECONDS, formattedMobile]
      );
    } else {
      await pool.query(
        "INSERT INTO login_otp (mobile_number, customer_id, otp_code, otp_expires, created_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND), NOW())",
        [formattedMobile, customerId, otp, OTP_EXPIRY_SECONDS]
      );
    }

    // Send OTP via SMS
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

    // Verify OTP
    const [otpRecords] = await pool.query(
      "SELECT * FROM login_otp WHERE mobile_number = ? AND otp_code = ? AND otp_expires > NOW()",
      [formattedMobile, String(otp).trim()]
    );

    if (otpRecords.length === 0) {
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
