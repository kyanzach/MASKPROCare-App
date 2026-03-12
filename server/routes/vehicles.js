/**
 * Vehicle Routes — CRUD + Photo Upload
 * 
 * GET  /api/vehicles/list          — List customer's vehicles
 * GET  /api/vehicles/detail/:id    — Vehicle detail + service history
 * POST /api/vehicles/create        — Add vehicle
 * POST /api/vehicles/update        — Update vehicle (also PUT)
 * POST /api/vehicles/delete        — Delete vehicle (also DELETE)
 * POST /api/vehicles/upload-photo  — Upload photo (multer + sharp)
 */

const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const pool = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');

// All vehicle routes require authentication
router.use(authenticateToken);

// Multer config for photo upload (memory storage, max 10MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: JPEG, PNG, WebP, HEIC.'));
    }
  }
});

// --- Helper: Get vehicle service status ---
async function getVehicleServiceStatus(vehicleId) {
  try {
    const [rows] = await pool.query(
      "SELECT booking_date FROM bookings WHERE customer_vehicle_id = ? AND (notes IS NULL OR notes NOT LIKE '%CANCELLED:%') ORDER BY booking_date DESC LIMIT 1",
      [vehicleId]
    );
    const lastService = rows[0]?.booking_date;
    if (!lastService) return 'Unknown';
    const diff = Date.now() - new Date(lastService).getTime();
    const months = diff / (1000 * 60 * 60 * 24 * 30);
    if (months > 3) return 'Overdue';
    if (months > 2) return 'Due Soon';
    return 'Up to Date';
  } catch {
    return 'Unknown';
  }
}

// ─── GET /api/vehicles/list ───────────────────────────────────────
router.get('/list', async (req, res) => {
  try {
    const [vehicles] = await pool.query(
      "SELECT * FROM vehicles WHERE customer_id = ? ORDER BY created_at DESC",
      [req.user.customer_id]
    );

    // Add service status
    for (const v of vehicles) {
      v.service_status = await getVehicleServiceStatus(v.id);
    }

    return res.json({ success: true, data: { vehicles }, message: 'Vehicles retrieved successfully', errors: [] });
  } catch (err) {
    console.error('Vehicles list error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Failed to load vehicles', errors: [] });
  }
});

// ─── GET /api/vehicles/detail/:id ─────────────────────────────────
router.get('/detail/:id', async (req, res) => {
  try {
    const vehicleId = parseInt(req.params.id, 10);
    if (!vehicleId || vehicleId <= 0) {
      return res.status(422).json({ success: false, data: null, message: 'Vehicle ID is required', errors: [] });
    }

    const [vehicles] = await pool.query(
      "SELECT * FROM vehicles WHERE id = ? AND customer_id = ?",
      [vehicleId, req.user.customer_id]
    );

    if (vehicles.length === 0) {
      return res.status(404).json({ success: false, data: null, message: 'Vehicle not found', errors: [] });
    }

    const vehicle = vehicles[0];
    vehicle.service_status = await getVehicleServiceStatus(vehicle.id);

    // Get service history
    let serviceHistory = [];
    try {
      const [history] = await pool.query(
        "SELECT b.*, bst.service_name FROM bookings b LEFT JOIN bookings_service_types bst ON b.booking_id = bst.booking_id WHERE b.customer_vehicle_id = ? ORDER BY b.booking_date DESC",
        [vehicleId]
      );
      serviceHistory = history;
    } catch { /* table may differ */ }

    return res.json({ success: true, data: { vehicle, service_history: serviceHistory }, message: 'Vehicle details retrieved', errors: [] });
  } catch (err) {
    console.error('Vehicle detail error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Failed to load vehicle details', errors: [] });
  }
});

// ─── POST /api/vehicles/create ────────────────────────────────────
router.post('/create', async (req, res) => {
  try {
    const { make, model, plate_no, color, registration_date, registration_expiry } = req.body;
    const errors = [];
    if (!make || !String(make).trim()) errors.push('make is required');
    if (!model || !String(model).trim()) errors.push('model is required');
    if (errors.length > 0) {
      return res.status(422).json({ success: false, data: null, message: 'Validation failed', errors });
    }

    const trimMake = String(make).trim();
    const trimModel = String(model).trim();
    const trimPlate = String(plate_no || '').trim();
    const trimColor = String(color || '').trim();
    const regDate = registration_date ? String(registration_date).trim() : (registration_expiry ? String(registration_expiry).trim() : null);

    // Check duplicate plate
    if (trimPlate) {
      const [dupes] = await pool.query("SELECT id FROM vehicles WHERE plate_no = ? AND customer_id != ?", [trimPlate, req.user.customer_id]);
      if (dupes.length > 0) {
        return res.status(409).json({ success: false, data: null, message: 'A vehicle with this plate number already exists', errors: [] });
      }
    }

    const [result] = await pool.query(
      "INSERT INTO vehicles (customer_id, make, model, plate_no, color, registration_date, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())",
      [req.user.customer_id, trimMake, trimModel, trimPlate, trimColor, regDate]
    );

    const [created] = await pool.query("SELECT * FROM vehicles WHERE id = ?", [result.insertId]);

    return res.status(201).json({ success: true, data: { vehicle: created[0] }, message: 'Vehicle added successfully', errors: [] });
  } catch (err) {
    console.error('Vehicle create error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Failed to add vehicle', errors: [] });
  }
});

// ─── POST|PUT /api/vehicles/update ────────────────────────────────
router.post('/update', handleUpdate);
router.put('/update', handleUpdate);

async function handleUpdate(req, res) {
  try {
    const vehicleId = parseInt(req.body.id || req.params.id || 0, 10);
    if (!vehicleId || vehicleId <= 0) {
      return res.status(422).json({ success: false, data: null, message: 'Vehicle ID is required', errors: [] });
    }

    // Verify ownership
    const [existing] = await pool.query("SELECT * FROM vehicles WHERE id = ? AND customer_id = ?", [vehicleId, req.user.customer_id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, data: null, message: 'Vehicle not found', errors: [] });
    }

    const ev = existing[0];
    const make = String(req.body.make ?? ev.make).trim();
    const model = String(req.body.model ?? ev.model).trim();
    const plateNo = String(req.body.plate_no ?? ev.plate_no).trim();
    const color = String(req.body.color ?? ev.color ?? '').trim();
    const regDate = req.body.registration_date !== undefined
      ? (String(req.body.registration_date).trim() || null)
      : (req.body.registration_expiry !== undefined
        ? (String(req.body.registration_expiry).trim() || null)
        : (ev.registration_date || null));

    // Check duplicate plate if changed
    if (plateNo && plateNo !== ev.plate_no) {
      const [dupes] = await pool.query("SELECT id FROM vehicles WHERE plate_no = ? AND id != ?", [plateNo, vehicleId]);
      if (dupes.length > 0) {
        return res.status(409).json({ success: false, data: null, message: 'A vehicle with this plate number already exists', errors: [] });
      }
    }

    await pool.query(
      "UPDATE vehicles SET make = ?, model = ?, plate_no = ?, color = ?, registration_date = ? WHERE id = ? AND customer_id = ?",
      [make, model, plateNo, color, regDate, vehicleId, req.user.customer_id]
    );

    const [updated] = await pool.query("SELECT * FROM vehicles WHERE id = ?", [vehicleId]);
    return res.json({ success: true, data: { vehicle: updated[0] }, message: 'Vehicle updated successfully', errors: [] });
  } catch (err) {
    console.error('Vehicle update error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Failed to update vehicle', errors: [] });
  }
}

// ─── POST|DELETE /api/vehicles/delete ─────────────────────────────
router.post('/delete', handleDelete);
router.delete('/delete', handleDelete);

async function handleDelete(req, res) {
  try {
    const vehicleId = parseInt(req.body.id || req.params.id || req.query.id || 0, 10);
    if (!vehicleId || vehicleId <= 0) {
      return res.status(422).json({ success: false, data: null, message: 'Vehicle ID is required', errors: [] });
    }

    const [existing] = await pool.query("SELECT id FROM vehicles WHERE id = ? AND customer_id = ?", [vehicleId, req.user.customer_id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, data: null, message: 'Vehicle not found', errors: [] });
    }

    await pool.query("DELETE FROM vehicles WHERE id = ? AND customer_id = ?", [vehicleId, req.user.customer_id]);
    return res.json({ success: true, data: null, message: 'Vehicle deleted successfully', errors: [] });
  } catch (err) {
    console.error('Vehicle delete error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Failed to delete vehicle', errors: [] });
  }
}

// ─── POST /api/vehicles/upload-photo ──────────────────────────────
router.post('/upload-photo', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(422).json({ success: false, data: null, message: 'No file uploaded', errors: [] });
    }

    const vehicleId = parseInt(req.body.vehicle_id || 0, 10);
    if (!vehicleId || vehicleId <= 0) {
      return res.status(422).json({ success: false, data: null, message: 'Vehicle ID is required', errors: [] });
    }

    // Verify ownership
    const [existing] = await pool.query("SELECT id, photo FROM vehicles WHERE id = ? AND customer_id = ?", [vehicleId, req.user.customer_id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, data: null, message: 'Vehicle not found', errors: [] });
    }

    // Ensure upload dir exists
    const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'vehicles');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const filename = `vehicle_${vehicleId}_${Date.now()}.webp`;
    const outputPath = path.join(uploadDir, filename);

    // Process with sharp: resize (max 1200px) + convert to WebP
    let quality = 80;
    await sharp(req.file.buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toFile(outputPath);

    // If too large, reduce quality
    let fileSize = fs.statSync(outputPath).size;
    const maxFileSize = 200 * 1024; // 200KB
    while (fileSize > maxFileSize && quality > 30) {
      quality -= 10;
      await sharp(req.file.buffer)
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality })
        .toFile(outputPath);
      fileSize = fs.statSync(outputPath).size;
    }

    // Delete old photo
    const oldPhoto = existing[0].photo;
    if (oldPhoto) {
      const oldPath = path.join(__dirname, '..', '..', path.basename(path.dirname(oldPhoto)), path.basename(oldPhoto));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    // Update DB
    const relativePath = `uploads/vehicles/${filename}`;
    await pool.query("UPDATE vehicles SET photo = ? WHERE id = ? AND customer_id = ?", [relativePath, vehicleId, req.user.customer_id]);

    // Build URL
    const protocol = req.protocol;
    const host = req.get('host');
    const photoUrl = `${protocol}://${host}/${relativePath}`;

    return res.json({
      success: true,
      data: { photo_url: photoUrl, photo_path: relativePath, file_size: fileSize, quality },
      message: 'Vehicle photo uploaded successfully',
      errors: []
    });
  } catch (err) {
    console.error('Photo upload error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Failed to process image. Please try again.', errors: [] });
  }
});

module.exports = router;
