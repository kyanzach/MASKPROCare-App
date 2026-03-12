/**
 * Dashboard Routes — Stats
 * 
 * GET /api/dashboard/stats — Dashboard statistics
 */

const express = require('express');
const router = express.Router();

const pool = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

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

// ─── GET /api/dashboard/stats ─────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const customerId = req.user.customer_id;
    const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Get vehicles
    const [vehicles] = await pool.query("SELECT * FROM vehicles WHERE customer_id = ? ORDER BY created_at DESC", [customerId]);
    const totalVehicles = vehicles.length;

    // Calculate vehicles needing service
    let vehiclesNeedingService = 0;
    for (const v of vehicles) {
      v.service_status = await getVehicleServiceStatus(v.id);
      try {
        const [lastSvc] = await pool.query(
          "SELECT MAX(booking_date) as last_service FROM bookings WHERE customer_vehicle_id = ? AND customer_id = ? AND (notes IS NULL OR notes NOT LIKE '%CANCELLED:%')",
          [v.id, customerId]
        );
        if (!lastSvc[0]?.last_service || lastSvc[0].last_service < sixMonthsAgo) {
          vehiclesNeedingService++;
        }
      } catch {
        vehiclesNeedingService++;
      }
    }

    // Upcoming bookings
    let upcoming = [];
    try {
      const [rows] = await pool.query(`
        SELECT b.booking_id, b.booking_date, b.latest_service, b.notes,
               v.make, v.model, v.plate_no
        FROM bookings b
        LEFT JOIN vehicles v ON b.customer_vehicle_id = v.id
        WHERE b.customer_id = ? AND b.booking_date >= NOW()
        AND (b.notes IS NULL OR b.notes NOT LIKE '%CANCELLED:%')
        ORDER BY b.booking_date ASC
        LIMIT 5
      `, [customerId]);
      upcoming = rows;
    } catch { /* ignore */ }

    // Recent completed bookings
    let recent = [];
    try {
      const [rows] = await pool.query(`
        SELECT b.booking_id, b.booking_date, b.latest_service, b.notes,
               v.make, v.model, v.plate_no
        FROM bookings b
        LEFT JOIN vehicles v ON b.customer_vehicle_id = v.id
        WHERE b.customer_id = ? AND b.booking_date < NOW()
        AND (b.notes IS NULL OR b.notes NOT LIKE '%CANCELLED:%')
        ORDER BY b.booking_date DESC
        LIMIT 5
      `, [customerId]);
      recent = rows;
    } catch { /* ignore */ }

    // Pending requests count
    let pendingCount = 0;
    try {
      const [rows] = await pool.query("SELECT COUNT(*) as cnt FROM booking_requests WHERE customer_id = ? AND status = 'pending'", [customerId]);
      pendingCount = rows[0]?.cnt || 0;
    } catch { /* ignore */ }

    // Completed services count
    let completedCount = 0;
    try {
      const [rows] = await pool.query("SELECT COUNT(*) as cnt FROM bookings WHERE customer_id = ? AND booking_date < NOW() AND (notes IS NULL OR notes NOT LIKE '%CANCELLED:%')", [customerId]);
      completedCount = rows[0]?.cnt || 0;
    } catch { /* ignore */ }

    return res.json({
      success: true,
      data: {
        stats: {
          total_vehicles: totalVehicles,
          vehicles_needing_service: vehiclesNeedingService,
          upcoming_bookings: upcoming.length,
          pending_requests: pendingCount,
          completed_services: completedCount
        },
        vehicles,
        upcoming_bookings: upcoming,
        recent_bookings: recent
      },
      message: 'Dashboard data retrieved',
      errors: []
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Failed to load dashboard data: ' + err.message, errors: [] });
  }
});

module.exports = router;
