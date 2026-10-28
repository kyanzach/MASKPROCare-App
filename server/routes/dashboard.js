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

const addMonths = (date, n) => {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + n);
  if (d.getDate() < day) d.setDate(0); // clamp e.g. Aug 31 + 6mo -> Feb 28
  return d;
};

/**
 * NanoFix maintenance status per vehicle — mirrors Unify's "Maintenance Due" logic
 * (dashboard_sales_fetch_maintenance.php + recalculate_due_date):
 *  - A vehicle qualifies once it has a Nano Ceramic Coating (or NanoFix maintenance) visit.
 *  - Next maintenance is due 6 months after the last coating/NanoFix visit.
 *  - It "needs maintenance" from 5 months after the last visit, unless a NanoFix is already booked.
 *  - Every 6-month due date that passed without a visit counts as a missed visit.
 */
async function getMaintenanceSummary(customerId) {
  const [visitRows] = await pool.query(`
    SELECT b.customer_vehicle_id AS vehicle_id, MAX(b.booking_date) AS last_visit
    FROM bookings b
    JOIN bookings_service_types s ON s.booking_id = b.booking_id
    WHERE b.customer_id = ?
      AND (s.service_name LIKE '%Nano Ceramic Coating%' OR s.service_name = 'Nano Fix (Maintenance)')
      AND s.status IN ('Done', 'Scheduled', 'completed')
      AND b.booking_date <= NOW()
      AND (b.notes IS NULL OR b.notes NOT LIKE '%CANCELLED:%')
    GROUP BY b.customer_vehicle_id
  `, [customerId]);

  const [scheduledRows] = await pool.query(`
    SELECT DISTINCT b.customer_vehicle_id AS vehicle_id, MIN(b.booking_date) AS next_booking
    FROM bookings b
    JOIN bookings_service_types s ON s.booking_id = b.booking_id
    WHERE b.customer_id = ?
      AND s.service_name = 'Nano Fix (Maintenance)'
      AND s.status <> 'Cancelled'
      AND b.booking_date >= CURDATE()
      AND (b.notes IS NULL OR b.notes NOT LIKE '%CANCELLED:%')
    GROUP BY b.customer_vehicle_id
  `, [customerId]);
  const scheduled = new Map(scheduledRows.map((r) => [r.vehicle_id, r.next_booking]));

  const now = new Date();
  const byVehicle = {};
  let vehiclesNeedingMaintenance = 0;
  let missedVisits = 0;
  let lastMissed = null;

  for (const row of visitRows) {
    const lastVisit = new Date(row.last_visit);
    let due = addMonths(lastVisit, 6);
    let missed = 0;
    let vehicleLastMissed = null;
    while (due < now) {
      vehicleLastMissed = new Date(due.getTime());
      due = addMonths(due, 6);
      missed++;
    }
    const nextBooking = scheduled.get(row.vehicle_id) || null;
    const needs = !nextBooking && addMonths(lastVisit, 5) <= now;
    const status = nextBooking ? 'scheduled' : missed > 0 ? 'overdue' : needs ? 'due' : 'ok';

    if (needs) vehiclesNeedingMaintenance++;
    if (!nextBooking) {
      missedVisits += missed;
      if (vehicleLastMissed && (!lastMissed || vehicleLastMissed > lastMissed)) lastMissed = vehicleLastMissed;
    }

    byVehicle[row.vehicle_id] = {
      status,
      last_visit: lastVisit,
      next_due: due,
      missed_visits: missed,
      last_missed: vehicleLastMissed,
      next_booking: nextBooking,
    };
  }

  return { byVehicle, vehiclesNeedingMaintenance, missedVisits, lastMissed };
}

// ─── GET /api/dashboard/stats ─────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const customerId = req.user.customer_id;
    const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Get vehicles
    const [vehicles] = await pool.query("SELECT *, DATE_FORMAT(registration_date, '%Y-%m-%d') AS registration_date FROM vehicles WHERE customer_id = ? ORDER BY created_at DESC", [customerId]);
    const totalVehicles = vehicles.length;

    // NanoFix maintenance (replaces the old generic "needs service" calc, which compared a Date to a string and always returned 0)
    let maintenance = { byVehicle: {}, vehiclesNeedingMaintenance: 0, missedVisits: 0, lastMissed: null };
    try {
      maintenance = await getMaintenanceSummary(customerId);
    } catch (mErr) {
      console.warn('Maintenance summary error:', mErr.message);
    }
    for (const v of vehicles) {
      v.service_status = await getVehicleServiceStatus(v.id);
      v.maintenance = maintenance.byVehicle[v.id] || null;
    }
    const vehiclesNeedingService = maintenance.vehiclesNeedingMaintenance;

    // Upcoming bookings
    let upcoming = [];
    try {
      const [rows] = await pool.query(`
        SELECT b.booking_id, b.booking_date, b.latest_service, b.notes,
               v.make, v.model, v.plate_no, v.photo as vehicle_photo
        FROM bookings b
        LEFT JOIN vehicles v ON b.customer_vehicle_id = v.id
        WHERE b.customer_id = ? AND b.booking_date >= NOW()
        AND (b.notes IS NULL OR b.notes NOT LIKE '%CANCELLED:%')
        AND NOT EXISTS (SELECT 1 FROM bookings_service_types bst WHERE bst.booking_id = b.booking_id AND bst.status = 'Cancelled')
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
               v.make, v.model, v.plate_no, v.photo as vehicle_photo
        FROM bookings b
        LEFT JOIN vehicles v ON b.customer_vehicle_id = v.id
        WHERE b.customer_id = ? AND b.booking_date < NOW()
        AND (b.notes IS NULL OR b.notes NOT LIKE '%CANCELLED:%')
        AND NOT EXISTS (SELECT 1 FROM bookings_service_types bst WHERE bst.booking_id = b.booking_id AND bst.status = 'Cancelled')
        ORDER BY b.booking_date DESC
        LIMIT 5
      `, [customerId]);
      recent = rows;
    } catch { /* ignore */ }

    // Pending requests & offers
    let pendingRequests = [];
    let pendingCount = 0;
    try {
      const [rows] = await pool.query(`
        SELECT br.request_id, br.booking_date, br.latest_service, br.notes, br.branch_id,
               br.status, br.cancellation_reason, br.rejection_reason, br.offered_date,
               br.counter_date, br.offer_status, br.customer_offer_reply, br.time_added,
               v.make, v.model, v.plate_no, v.photo as vehicle_photo,
               GROUP_CONCAT(brs.service_name SEPARATOR ', ') as service_names
        FROM booking_requests br
        LEFT JOIN vehicles v ON br.customer_vehicle_id = v.id
        LEFT JOIN booking_request_services brs ON br.request_id = brs.request_id
        WHERE br.customer_id = ? 
          AND (br.status IN ('pending', 'negotiating', 'waitlisted') OR (br.status = 'rejected' AND (br.offered_date IS NOT NULL OR br.time_added >= DATE_SUB(NOW(), INTERVAL 30 DAY))))
        GROUP BY br.request_id
        ORDER BY 
          CASE 
            WHEN (br.status = 'negotiating' OR br.status = 'rejected') AND br.offer_status = 'offered' THEN 1
            WHEN br.status = 'negotiating' THEN 2
            WHEN br.status = 'pending' THEN 3
            ELSE 4
          END,
          br.time_added DESC
        LIMIT 10
      `, [customerId]);
      pendingRequests = rows;

      pendingCount = rows.filter(r => ['pending', 'negotiating', 'waitlisted'].includes(r.status) || (r.status === 'rejected' && r.offer_status === 'offered')).length;
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
          vehicles_needing_maintenance: vehiclesNeedingService,
          missed_maintenance_visits: maintenance.missedVisits,
          last_missed_maintenance: maintenance.lastMissed,
          upcoming_bookings: upcoming.length,
          pending_requests: pendingCount,
          completed_services: completedCount
        },
        vehicles,
        pending_requests: pendingRequests,
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
