/**
 * Profile Routes — Get, Update
 * 
 * GET  /api/profile/get    — Get profile + stats
 * POST /api/profile/update — Update profile (also PUT)
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const pool = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');

// Ensure uploads directory exists
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'photos');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer config: 5MB max, image/* only, temp storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

router.use(authenticateToken);

// --- Helper: Get customer stats ---
async function getCustomerStats(customerId) {
  const stats = { total_vehicles: 0, total_bookings: 0, completed_services: 0, vehicles_needing_service: 0 };
  try {
    const [v] = await pool.query("SELECT COUNT(*) as total FROM vehicles WHERE customer_id = ?", [customerId]);
    stats.total_vehicles = v[0]?.total || 0;

    const [b] = await pool.query("SELECT COUNT(*) as total FROM bookings WHERE customer_id = ?", [customerId]);
    stats.total_bookings = b[0]?.total || 0;

    const [c] = await pool.query("SELECT COUNT(*) as total FROM bookings WHERE customer_id = ? AND booking_date < NOW() AND (notes IS NULL OR notes NOT LIKE '%CANCELLED:%')", [customerId]);
    stats.completed_services = c[0]?.total || 0;
  } catch { /* ignore */ }
  return stats;
}

// ─── GET /api/profile/get ─────────────────────────────────────────
router.get('/get', async (req, res) => {
  try {
    const [customers] = await pool.query("SELECT * FROM customers WHERE id = ?", [req.user.customer_id]);
    if (customers.length === 0) {
      return res.status(404).json({ success: false, data: null, message: 'Customer not found', errors: [] });
    }

    const stats = await getCustomerStats(req.user.customer_id);

    return res.json({ success: true, data: { customer: customers[0], stats }, message: 'Profile retrieved', errors: [] });
  } catch (err) {
    console.error('Profile get error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Failed to load profile', errors: [] });
  }
});

// ─── POST|PUT /api/profile/update ─────────────────────────────────
router.post('/update', handleProfileUpdate);
router.put('/update', handleProfileUpdate);

async function handleProfileUpdate(req, res) {
  try {
    const [customers] = await pool.query("SELECT * FROM customers WHERE id = ?", [req.user.customer_id]);
    if (customers.length === 0) {
      return res.status(404).json({ success: false, data: null, message: 'Customer not found', errors: [] });
    }

    const customer = customers[0];
    const fullName = String(req.body.full_name ?? customer.full_name ?? '').trim();
    const email = String(req.body.email ?? customer.email ?? '').trim();
    const address = String(req.body.address ?? customer.address ?? '').trim();

    // Validate email if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(422).json({ success: false, data: null, message: 'Invalid email address', errors: [] });
    }

    await pool.query("UPDATE customers SET full_name = ?, email = ?, address = ? WHERE id = ?", [fullName, email, address, req.user.customer_id]);

    const [updated] = await pool.query("SELECT * FROM customers WHERE id = ?", [req.user.customer_id]);
    return res.json({ success: true, data: { customer: updated[0] }, message: 'Profile updated successfully', errors: [] });
  } catch (err) {
    console.error('Profile update error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Failed to update profile', errors: [] });
  }
}

// ─── POST /api/profile/photo ────────────────────────────────────────
router.post('/photo', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, data: null, message: 'No image file provided', errors: [] });
    }

    const customerId = req.user.customer_id;
    const filename = `profile_${customerId}_${Date.now()}.webp`;
    const outputPath = path.join(UPLOAD_DIR, filename);

    // Convert to 512x512 WebP at 80% quality
    await sharp(req.file.buffer)
      .resize(512, 512, { fit: 'cover', position: 'centre' })
      .webp({ quality: 80 })
      .toFile(outputPath);

    // Delete old photo if exists
    const [existing] = await pool.query("SELECT profile_photo FROM customers WHERE id = ?", [customerId]);
    if (existing[0]?.profile_photo) {
      const oldFile = path.join(UPLOAD_DIR, existing[0].profile_photo);
      if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
    }

    // Update DB
    await pool.query("UPDATE customers SET profile_photo = ? WHERE id = ?", [filename, customerId]);

    return res.json({
      success: true,
      data: { profile_photo: filename },
      message: 'Profile photo updated',
      errors: [],
    });
  } catch (err) {
    console.error('Profile photo upload error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Failed to upload photo', errors: [] });
  }
});

// ─── DELETE /api/profile/photo ──────────────────────────────────────
router.delete('/photo', async (req, res) => {
  try {
    const customerId = req.user.customer_id;
    const [existing] = await pool.query("SELECT profile_photo FROM customers WHERE id = ?", [customerId]);

    if (existing[0]?.profile_photo) {
      const filePath = path.join(UPLOAD_DIR, existing[0].profile_photo);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await pool.query("UPDATE customers SET profile_photo = NULL WHERE id = ?", [customerId]);

    return res.json({ success: true, data: null, message: 'Profile photo removed', errors: [] });
  } catch (err) {
    console.error('Profile photo delete error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Failed to remove photo', errors: [] });
  }
});

module.exports = router;
