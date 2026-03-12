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

const JWT_SECRET = process.env.JWT_SECRET || 'mpc_jwt_s3cr3t_k3y_2026_xK9pLm2nQ7rT';

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
      customer_id: parseInt(payload.sub, 10),
      mobile: payload.mobile || '',
      branch_id: parseInt(payload.branch_id, 10) || 1
    };
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

module.exports = { authenticateToken, JWT_SECRET };
