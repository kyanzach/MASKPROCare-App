/**
 * Booking Routes — List, Detail, Create, Cancel, Availability, Edit-Request
 * 
 * GET  /api/bookings/list             — List bookings + requests
 * GET  /api/bookings/detail/:id       — Booking detail
 * POST /api/bookings/create           — Create booking request
 * POST /api/bookings/cancel           — Cancel booking or request
 * POST /api/bookings/availability     — Check slot availability (also GET)
 * POST /api/bookings/edit-request     — Edit pending request
 */

const express = require('express');
const router = express.Router();

const pool = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');

// All booking routes require authentication
router.use(authenticateToken);

// --- Helper: Format Date to YYYY-MM-DD in local timezone (Manila) ---
function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// --- Service name normalization map (matches Unify naming conventions) ---
// Care sends api_name → must match bookings_service_types.service_name AND branch_booking_capacity.service_name
const SERVICE_NAME_MAP = {
  'Nano Fix (Maintenance)': 'Nano Fix (Maintenance)',
  'NanoFix': 'Nano Fix (Maintenance)',
  'Maintenance (NanoFix)': 'Nano Fix (Maintenance)',
  'PPF': 'PPF',
  'Paint Protection Film (PPF)': 'PPF',
  'Paint Protection Film': 'PPF',
};
function normalizeServiceName(name) {
  return SERVICE_NAME_MAP[name] || name;
}

// --- Helper: Get branch-specific capacity from DB (matches Unify's booking_capacity.php) ---
// Capacity is ALWAYS read from branch_booking_capacity table, managed by admins in Unify.
// 0 = unlimited (never full). No hardcoded defaults.
async function getBranchServiceCapacity(serviceName, branchId) {
  const normalized = normalizeServiceName(serviceName);

  if (branchId && branchId > 0) {
    try {
      const [rows] = await pool.query(
        "SELECT max_capacity FROM branch_booking_capacity WHERE branch_id = ? AND service_name = ?",
        [branchId, normalized]
      );
      if (rows.length > 0) return rows[0].max_capacity;
    } catch { /* fall through */ }
  }
  return 0; // No DB row = unlimited (matches Unify: $row ? intval($row['max_capacity']) : 0)
}

// --- Helper: Get available slots for date+service+branch ---
// Only counts confirmed bookings (matches Unify — no pending requests in count)
async function getAvailableSlots(date, serviceName, branchId) {
  const capacity = await getBranchServiceCapacity(serviceName, branchId);

  // 0 = unlimited — always available
  if (capacity === 0) return Infinity;

  // Normalize PPF/NanoFix variants to canonical name
  const normalized = normalizeServiceName(serviceName);

  // Count confirmed bookings only (exact match, no LIKE — matches Unify)
  let confirmedCount = 0;
  try {
    let query = `SELECT COUNT(*) as count FROM bookings b
      JOIN bookings_service_types bst ON b.booking_id = bst.booking_id
      WHERE DATE(b.booking_date) = ?
      AND bst.service_name = ?
      AND (b.notes IS NULL OR b.notes NOT LIKE '%CANCELLED:%')
      AND (bst.status IS NULL OR bst.status != 'Cancelled')`;
    const params = [date, normalized];
    if (branchId && branchId > 0) {
      query += ' AND b.branch_id = ?';
      params.push(branchId);
    }
    const [rows] = await pool.query(query, params);
    confirmedCount = rows[0]?.count || 0;
  } catch { /* ignore */ }

  return Math.max(0, capacity - confirmedCount);
}

// --- Helper: Resolve branch_id for capacity checks ---
async function getCustomerBranch(customerId, jwtBranchId, vehicleId) {
  const vehId = parseInt(vehicleId || 0, 10);
  if (vehId > 0) {
    try {
      const [rows] = await pool.query(
        "SELECT branch_id FROM bookings WHERE customer_id = ? AND customer_vehicle_id = ? AND branch_id IS NOT NULL ORDER BY booking_date ASC LIMIT 1",
        [customerId, vehId]
      );
      if (rows[0]?.branch_id) return rows[0].branch_id;
    } catch { /* ignore */ }

    try {
      const [rows] = await pool.query(
        "SELECT branch_id FROM booking_requests WHERE customer_id = ? AND customer_vehicle_id = ? AND branch_id IS NOT NULL ORDER BY time_added ASC LIMIT 1",
        [customerId, vehId]
      );
      if (rows[0]?.branch_id) return rows[0].branch_id;
    } catch { /* ignore */ }
  }

  try {
    const [rows] = await pool.query("SELECT branch_id FROM customers WHERE id = ?", [customerId]);
    if (rows[0]?.branch_id) return rows[0].branch_id;
  } catch { /* ignore */ }

  try {
    const [rows] = await pool.query(
      "SELECT branch_id FROM bookings WHERE customer_id = ? AND branch_id IS NOT NULL ORDER BY booking_date DESC LIMIT 1",
      [customerId]
    );
    if (rows[0]?.branch_id) return rows[0].branch_id;
  } catch { /* ignore */ }

  try {
    const [rows] = await pool.query(
      "SELECT branch_id FROM booking_requests WHERE customer_id = ? AND branch_id IS NOT NULL ORDER BY time_added DESC LIMIT 1",
      [customerId]
    );
    if (rows[0]?.branch_id) return rows[0].branch_id;
  } catch { /* ignore */ }

  return jwtBranchId || 1;
}

// Time slots (8 AM to 3 PM)
const TIME_SLOTS = [
  { time: '08:00', label: '8:00 AM' },
  { time: '09:00', label: '9:00 AM' },
  { time: '10:00', label: '10:00 AM' },
  { time: '11:00', label: '11:00 AM' },
  { time: '13:00', label: '1:00 PM' },
  { time: '14:00', label: '2:00 PM' },
  { time: '15:00', label: '3:00 PM' }
];

// ─── GET /api/bookings/list ───────────────────────────────────────
router.get('/list', async (req, res) => {
  try {
    const customerId = req.user.customer_id;

    // Get approved bookings
    const bookings = [];
    try {
      const [rows] = await pool.query(`
        SELECT b.booking_id, b.booking_date, b.latest_service, b.notes, b.branch_id,
               v.make, v.model, v.plate_no, v.color, v.size,
               GROUP_CONCAT(DISTINCT bst.service_name SEPARATOR ', ') as service_names,
               GROUP_CONCAT(DISTINCT bst.status SEPARATOR ', ') as service_statuses
        FROM bookings b
        LEFT JOIN vehicles v ON b.customer_vehicle_id = v.id
        LEFT JOIN bookings_service_types bst ON b.booking_id = bst.booking_id
        WHERE b.customer_id = ?
        GROUP BY b.booking_id
        ORDER BY b.booking_date DESC
        LIMIT 50
      `, [customerId]);

      const today = new Date().toISOString().slice(0, 10);
      for (const row of rows) {
        // Use service_names from JOIN, fallback to latest_service
        row.latest_service = row.service_names || row.latest_service || 'N/A';
        delete row.service_names;

        // Derive status — check MULTIPLE signals for cancellation
        const serviceStatuses = (row.service_statuses || '').split(', ').map(s => s.trim().toLowerCase());
        delete row.service_statuses;

        const isCancelledByNotes = (row.notes || '').includes('CANCELLED:');
        const isCancelledByStatus = serviceStatuses.includes('cancelled');

        if (isCancelledByNotes || isCancelledByStatus) {
          row.status = 'cancelled';
        } else {
          // Check for other Unify statuses
          const isDone = serviceStatuses.includes('done');
          const isScheduled = serviceStatuses.some(s => ['scheduled', 'rescheduled'].includes(s));

          if (isDone) {
            row.status = 'done';
          } else if (isScheduled) {
            row.status = 'scheduled';
          } else {
            // Fallback to date-based for bookings without explicit status
            const bookingDate = new Date(row.booking_date).toISOString().slice(0, 10);
            row.status = bookingDate >= today ? 'scheduled' : 'done';
          }
        }
        row.type = 'booking';
        bookings.push(row);
      }
    } catch { /* fallback */ }

    // Get booking requests (pending, cancelled, rejected)
    const requests = [];
    try {
      const [rows] = await pool.query(`
        SELECT br.request_id, br.booking_date, br.latest_service, br.notes, br.branch_id,
               br.status, br.cancellation_reason, br.rejection_reason, br.edit_history,
               br.time_added,
               v.make, v.model, v.plate_no,
               GROUP_CONCAT(brs.service_name SEPARATOR ', ') as service_names
        FROM booking_requests br
        LEFT JOIN vehicles v ON br.customer_vehicle_id = v.id
        LEFT JOIN booking_request_services brs ON br.request_id = brs.request_id
        WHERE br.customer_id = ? AND br.status IN ('pending', 'cancelled', 'rejected')
        GROUP BY br.request_id
        ORDER BY br.time_added DESC
      `, [customerId]);

      for (const row of rows) {
        row.type = 'request';
        if (row.edit_history) {
          try { row.edit_history = JSON.parse(row.edit_history); } catch { /* keep string */ }
        }
        requests.push(row);
      }
    } catch { /* table may not exist */ }

    return res.json({
      success: true,
      data: { bookings, requests, total_bookings: bookings.length, total_requests: requests.length },
      message: 'Bookings retrieved successfully',
      errors: []
    });
  } catch (err) {
    console.error('Bookings list error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Failed to load bookings', errors: [] });
  }
});

// ─── GET /api/bookings/detail/:id ─────────────────────────────────
router.get('/detail/:id', async (req, res) => {
  try {
    const bookingId = parseInt(req.params.id, 10);
    if (!bookingId || bookingId <= 0) {
      return res.status(422).json({ success: false, data: null, message: 'Booking ID is required', errors: [] });
    }

    // Get booking
    const [bookings] = await pool.query("SELECT * FROM bookings WHERE booking_id = ?", [bookingId]);
    if (bookings.length === 0) {
      return res.status(404).json({ success: false, data: null, message: 'Booking not found', errors: [] });
    }

    const booking = bookings[0];
    if (parseInt(booking.customer_id, 10) !== req.user.customer_id) {
      return res.status(404).json({ success: false, data: null, message: 'Booking not found', errors: [] });
    }

    // Get services
    const [services] = await pool.query("SELECT * FROM booking_services_to_perform WHERE booking_id = ?", [bookingId]);

    return res.json({ success: true, data: { booking, services }, message: 'Booking details retrieved', errors: [] });
  } catch (err) {
    console.error('Booking detail error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Failed to load booking details', errors: [] });
  }
});

// ─── POST /api/bookings/create ────────────────────────────────────
router.post('/create', async (req, res) => {
  try {
    const { vehicle_id, service_type, booking_date, booking_time, notes } = req.body;
    const errors = [];
    if (!vehicle_id) errors.push('vehicle_id is required');
    if (!service_type) errors.push('service_type is required');
    if (!booking_date) errors.push('booking_date is required');
    if (!booking_time) errors.push('booking_time is required');
    if (errors.length > 0) {
      return res.status(422).json({ success: false, data: null, message: 'Validation failed', errors });
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(booking_date)) {
      return res.status(422).json({ success: false, data: null, message: 'Invalid date format. Use YYYY-MM-DD.', errors: [] });
    }
    if (!/^\d{2}:\d{2}$/.test(booking_time)) {
      return res.status(422).json({ success: false, data: null, message: 'Invalid time format. Use HH:MM.', errors: [] });
    }

    const bookingDatetime = `${booking_date} ${booking_time}`;
    const customerId = req.user.customer_id;

    // Get branch
    const branchId = await getCustomerBranch(customerId, req.user.branch_id, vehicle_id);

    // Check capacity
    const available = await getAvailableSlots(booking_date, String(service_type).trim(), branchId);
    if (available <= 0) {
      const formattedDate = new Date(booking_date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
      return res.status(409).json({
        success: false, data: null,
        message: `${service_type} is fully booked on ${formattedDate}. Please select another date.`,
        errors: []
      });
    }

    // Verify vehicle ownership
    const [vehicles] = await pool.query("SELECT id FROM vehicles WHERE id = ? AND customer_id = ?", [parseInt(vehicle_id, 10), customerId]);
    if (vehicles.length === 0) {
      return res.status(404).json({ success: false, data: null, message: 'Vehicle not found', errors: [] });
    }

    // Check future date
    if (new Date(bookingDatetime) <= new Date()) {
      return res.status(422).json({ success: false, data: null, message: 'Please select a future date and time.', errors: [] });
    }

    // Create booking request
    const [result] = await pool.query(
      "INSERT INTO booking_requests (customer_id, customer_vehicle_id, booking_date, latest_service, notes, branch_id, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')",
      [customerId, parseInt(vehicle_id, 10), bookingDatetime, String(service_type).trim(), String(notes || '').trim(), branchId]
    );
    const requestId = result.insertId;

    // Insert service
    await pool.query("INSERT INTO booking_request_services (request_id, service_name) VALUES (?, ?)", [requestId, String(service_type).trim()]);

    return res.status(201).json({
      success: true,
      data: { request_id: requestId, status: 'pending', booking_date: bookingDatetime, service_type: String(service_type).trim() },
      message: 'Booking request submitted successfully! Your request is pending approval.',
      errors: []
    });
  } catch (err) {
    console.error('Booking create error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Failed to create booking request. Please try again.', errors: [] });
  }
});

// ─── POST /api/bookings/cancel ────────────────────────────────────
router.post('/cancel', async (req, res) => {
  try {
    const { type, reason, booking_id, request_id } = req.body;
    const cancelType = type || 'booking';
    const cancelReason = String(reason || '').trim();

    if (!cancelReason) {
      return res.status(422).json({ success: false, data: null, message: 'Cancellation reason is required', errors: [] });
    }

    if (cancelType === 'request') {
      // Cancel pending booking request
      const reqId = parseInt(request_id || 0, 10);
      if (!reqId || reqId <= 0) {
        return res.status(422).json({ success: false, data: null, message: 'Request ID is required', errors: [] });
      }

      const [requests] = await pool.query(
        "SELECT request_id, status FROM booking_requests WHERE request_id = ? AND customer_id = ?",
        [reqId, req.user.customer_id]
      );
      if (requests.length === 0) {
        return res.status(404).json({ success: false, data: null, message: 'Booking request not found', errors: [] });
      }
      if (requests[0].status !== 'pending') {
        return res.status(409).json({ success: false, data: null, message: `This request has already been ${requests[0].status}`, errors: [] });
      }

      const [updateResult] = await pool.query(
        "UPDATE booking_requests SET status = 'cancelled', cancellation_reason = ? WHERE request_id = ? AND status = 'pending'",
        [cancelReason, reqId]
      );
      if (updateResult.affectedRows === 0) {
        return res.status(409).json({ success: false, data: null, message: 'Request was already processed by another action', errors: [] });
      }

      return res.json({ success: true, data: null, message: 'Booking request cancelled successfully', errors: [] });
    } else {
      // Cancel approved booking
      const bId = parseInt(booking_id || 0, 10);
      if (!bId || bId <= 0) {
        return res.status(422).json({ success: false, data: null, message: 'Booking ID is required', errors: [] });
      }

      const [bookings] = await pool.query(
        "SELECT booking_id, booking_date, notes FROM bookings WHERE booking_id = ? AND customer_id = ?",
        [bId, req.user.customer_id]
      );
      if (bookings.length === 0) {
        return res.status(404).json({ success: false, data: null, message: 'Booking not found', errors: [] });
      }

      const booking = bookings[0];
      if ((booking.notes || '').includes('CANCELLED:')) {
        return res.status(409).json({ success: false, data: null, message: 'This booking is already cancelled', errors: [] });
      }

      const bookingDate = new Date(booking.booking_date).toISOString().slice(0, 10);
      if (bookingDate < new Date().toISOString().slice(0, 10)) {
        return res.status(422).json({ success: false, data: null, message: 'Cannot cancel a past booking', errors: [] });
      }

      // Cancel by appending to notes (matches Unify pattern)
      const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
      const cancelNote = `CANCELLED: ${cancelReason} — Cancelled by customer via app on ${now}`;
      const updatedNotes = booking.notes ? `${booking.notes}\n${cancelNote}` : cancelNote;

      await pool.query("UPDATE bookings SET notes = ? WHERE booking_id = ?", [updatedNotes, bId]);
      await pool.query("UPDATE booking_services_to_perform SET status = 'Cancelled' WHERE booking_id = ?", [bId]);
      await pool.query("UPDATE bookings_service_types SET status = 'Cancelled' WHERE booking_id = ?", [bId]);

      return res.json({ success: true, data: null, message: 'Booking cancelled successfully', errors: [] });
    }
  } catch (err) {
    console.error('Booking cancel error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Failed to cancel. Please try again.', errors: [] });
  }
});

// ─── POST|GET /api/bookings/availability ──────────────────────────
router.post('/availability', handleAvailability);
router.get('/availability', handleAvailability);

async function handleAvailability(req, res) {
  try {
    const body = req.method === 'GET' ? req.query : req.body;
    const service = String(body.service || body.service_type || '').trim();
    const action = String(body.action || '').trim();
    const vehicleId = parseInt(body.vehicle_id || 0, 10);

    if (!service || !action) {
      return res.status(422).json({ success: false, data: null, message: 'Service and action are required', errors: [] });
    }

    if (vehicleId > 0) {
      const [vehicles] = await pool.query(
        "SELECT id FROM vehicles WHERE id = ? AND customer_id = ?",
        [vehicleId, req.user.customer_id]
      );
      if (vehicles.length === 0) {
        return res.status(404).json({ success: false, data: null, message: 'Vehicle not found', errors: [] });
      }
    }

    const branchId = await getCustomerBranch(req.user.customer_id, req.user.branch_id, vehicleId);

    // Load branch capacity
    let branchCapacity = {};
    try {
      const [rows] = await pool.query("SELECT service_name, max_capacity FROM branch_booking_capacity WHERE branch_id = ?", [branchId]);
      for (const r of rows) branchCapacity[r.service_name] = r.max_capacity;
    } catch { /* ignore */ }

    if (action === 'get_available_dates') {
      const month = String(body.month || '').trim();
      let startDate;
      let endDate;

      if (/^\d{4}-\d{2}$/.test(month)) {
        const [y, m] = month.split('-').map(Number);
        startDate = new Date(y, m - 1, 1);
        endDate = new Date(y, m, 0);
      } else {
        const days = Math.min(365, Math.max(30, parseInt(body.days || 90, 10)));
        startDate = new Date();
        endDate = new Date();
        endDate.setDate(endDate.getDate() + days);
      }

      // Use local date strings (YYYY-MM-DD) — NOT toISOString() which is UTC
      const monthStart = toLocalDateStr(startDate);
      const monthEnd = toLocalDateStr(endDate);

      // Normalize service name for DB queries
      const normalizedService = normalizeServiceName(service);

      // Bulk booking counts — use DATE_FORMAT to get string keys (mysql2 returns DATE() as JS Date object!)
      const bookingCounts = {};
      try {
        const [rows] = await pool.query(`
          SELECT DATE_FORMAT(b.booking_date, '%Y-%m-%d') as dt, COUNT(*) as cnt
          FROM bookings b
          JOIN bookings_service_types bst ON bst.booking_id = b.booking_id
          WHERE b.branch_id = ?
          AND b.booking_date >= ? AND b.booking_date < DATE_ADD(?, INTERVAL 1 DAY)
          AND bst.service_name = ?
          AND (b.notes IS NULL OR b.notes NOT LIKE '%CANCELLED:%')
          AND (bst.status IS NULL OR bst.status != 'Cancelled')
          GROUP BY dt
        `, [branchId, monthStart, monthEnd, normalizedService]);
        for (const r of rows) bookingCounts[r.dt] = r.cnt;
      } catch { /* ignore */ }

      // Look up capacity using normalized service name
      const max = branchCapacity[normalizedService] ?? 0; // 0 = unlimited (from DB)

      // Only count confirmed bookings (no pending requests — matches Unify)
      const availableDates = [];
      const current = new Date(startDate);
      while (current <= endDate) {
        const dateStr = toLocalDateStr(current); // Local timezone, NOT UTC
        const dayOfWeek = current.getDay(); // 0=Sun

        if (dayOfWeek !== 0) { // Skip Sundays
          const booked = bookingCounts[dateStr] || 0;

          // Compute status matching Unify's logic (bookings_create.php lines 116-153)
          let status;
          if (max === 0) {
            // Unlimited capacity — always available
            status = 'available';
          } else if (booked >= max) {
            status = 'full';
          } else if (booked >= max - 1) {
            // Only 1 slot remaining — "Almost Full" (Unify calls it 'limited')
            status = 'limited';
          } else {
            status = 'available';
          }

          availableDates.push({
            date: dateStr,
            formatted: current.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            day: current.toLocaleDateString('en-US', { weekday: 'long' }),
            status,
            available: status !== 'full',
            booked,
            capacity: max === 0 ? '∞' : max
          });
        }

        current.setDate(current.getDate() + 1);
      }

      return res.json({
        success: true,
        data: { dates: availableDates, capacity: max, branch_id: branchId },
        message: 'Available dates retrieved',
        errors: []
      });

    } else if (action === 'get_available_times') {
      const date = String(body.date || '').trim();
      if (!date) {
        return res.status(422).json({ success: false, data: null, message: 'Date is required', errors: [] });
      }

      const now = new Date();
      const isToday = date === now.toISOString().slice(0, 10);
      const nowHour = now.getHours();
      const nowMin = now.getMinutes();

      const availableTimes = [];
      for (const slot of TIME_SLOTS) {
        const [slotH, slotM] = slot.time.split(':').map(Number);
        const isPast = isToday && (slotH < nowHour || (slotH === nowHour && slotM <= nowMin));

        let isAvailable = !isPast;
        if (isAvailable) {
          // Check time-specific availability
          try {
            const datetime = `${date} ${slot.time}:00`;
            const [rows] = await pool.query(`
              SELECT COUNT(*) as cnt FROM bookings b
              JOIN bookings_service_types bst ON bst.booking_id = b.booking_id
              WHERE b.branch_id = ? AND b.booking_date = ? AND bst.service_name = ?
              AND (b.notes IS NULL OR b.notes NOT LIKE '%CANCELLED:%')
              AND (bst.status IS NULL OR bst.status != 'Cancelled')
            `, [branchId, datetime, service]);
            isAvailable = (rows[0]?.cnt || 0) < 1;
          } catch {
            isAvailable = false;
          }
        }

        availableTimes.push({ time: slot.time, label: slot.label, available: isAvailable });
      }

      return res.json({ success: true, data: { times: availableTimes }, message: 'Available times retrieved', errors: [] });
    } else {
      return res.status(422).json({ success: false, data: null, message: 'Invalid action. Use get_available_dates or get_available_times.', errors: [] });
    }
  } catch (err) {
    console.error('Availability error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Server error checking availability', errors: [] });
  }
}

// ─── POST /api/bookings/edit-request ──────────────────────────────
router.post('/edit-request', async (req, res) => {
  try {
    const { request_id, new_date, reason } = req.body;
    const reqId = parseInt(request_id || 0, 10);

    if (!reqId || reqId <= 0) {
      return res.status(422).json({ success: false, data: null, message: 'Request ID is required', errors: [] });
    }
    if (!new_date) {
      return res.status(422).json({ success: false, data: null, message: 'New date is required', errors: [] });
    }
    if (!reason || !String(reason).trim()) {
      return res.status(422).json({ success: false, data: null, message: 'Reason for change is required', errors: [] });
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(new_date)) {
      return res.status(422).json({ success: false, data: null, message: 'Invalid date format. Use YYYY-MM-DD.', errors: [] });
    }
    if (new_date <= new Date().toISOString().slice(0, 10)) {
      return res.status(422).json({ success: false, data: null, message: 'New date must be in the future', errors: [] });
    }

    // Verify request
    const [requests] = await pool.query(
      "SELECT request_id, booking_date, status, edit_history, notes FROM booking_requests WHERE request_id = ? AND customer_id = ?",
      [reqId, req.user.customer_id]
    );
    if (requests.length === 0) {
      return res.status(404).json({ success: false, data: null, message: 'Booking request not found', errors: [] });
    }

    const request = requests[0];
    if (request.status !== 'pending') {
      return res.status(409).json({ success: false, data: null, message: `This request has already been ${request.status} and cannot be edited`, errors: [] });
    }

    // Build edit history
    const oldDate = new Date(request.booking_date).toISOString().slice(0, 10);
    const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' });
    const editEntry = { from: oldDate, to: new_date, reason: String(reason).trim(), date: new Date().toISOString().slice(0, 19).replace('T', ' ') };

    let editHistory = [];
    if (request.edit_history) {
      try { editHistory = JSON.parse(request.edit_history); } catch { editHistory = []; }
    }
    editHistory.push(editEntry);

    const newBookingDate = `${new_date} 08:00:00`;
    const editHistoryJson = JSON.stringify(editHistory);
    const noteAppend = `Edited on ${now}: Changed date from ${oldDate} to ${new_date}. Reason: ${String(reason).trim()}`;
    const updatedNotes = request.notes ? `${request.notes}\n${noteAppend}` : noteAppend;

    const [updateResult] = await pool.query(
      "UPDATE booking_requests SET booking_date = ?, edit_history = ?, notes = ? WHERE request_id = ? AND status = 'pending'",
      [newBookingDate, editHistoryJson, updatedNotes, reqId]
    );

    if (updateResult.affectedRows === 0) {
      return res.status(409).json({ success: false, data: null, message: 'Request was already processed by another action', errors: [] });
    }

    // Return updated request
    const [updated] = await pool.query(`
      SELECT br.*, v.make, v.model, v.plate_no,
             GROUP_CONCAT(brs.service_name SEPARATOR ', ') as service_names
      FROM booking_requests br
      LEFT JOIN vehicles v ON br.customer_vehicle_id = v.id
      LEFT JOIN booking_request_services brs ON br.request_id = brs.request_id
      WHERE br.request_id = ?
      GROUP BY br.request_id
    `, [reqId]);

    const updatedRow = updated[0];
    if (updatedRow?.edit_history) {
      try { updatedRow.edit_history = JSON.parse(updatedRow.edit_history); } catch { /* keep string */ }
    }
    if (updatedRow) updatedRow.type = 'request';

    return res.json({ success: true, data: { request: updatedRow }, message: 'Booking request updated successfully', errors: [] });
  } catch (err) {
    console.error('Edit request error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Failed to update request. Please try again.', errors: [] });
  }
});

module.exports = router;
