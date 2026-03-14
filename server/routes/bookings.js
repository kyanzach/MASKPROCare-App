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

// --- Capacity defaults (from booking_capacity_helper.php) ---
const CAPACITY_DEFAULTS = {
  'Nano Ceramic Coating': 4,
  'Nano Ceramic Tint': 4,
  'Nano Fix (Maintenance)': 5,
  'Auto Paint & Repair': 1,
  'PPF': 1,
  'Paint Protection Film (PPF)': 1
};

// --- Helper: Get branch-specific capacity ---
async function getBranchServiceCapacity(serviceName, branchId) {
  // Normalize PPF
  if (/PPF|Paint Protection Film/i.test(serviceName)) serviceName = 'PPF';

  if (branchId && branchId > 0) {
    try {
      const [rows] = await pool.query(
        "SELECT max_capacity FROM branch_booking_capacity WHERE branch_id = ? AND service_name = ?",
        [branchId, serviceName]
      );
      if (rows.length > 0) return rows[0].max_capacity;
    } catch { /* fall through */ }
  }
  return CAPACITY_DEFAULTS[serviceName] ?? 10;
}

// --- Helper: Get available slots for date+service+branch ---
async function getAvailableSlots(date, serviceName, branchId) {
  const capacity = await getBranchServiceCapacity(serviceName, branchId);

  // Normalize PPF
  const normalized = /PPF|Paint Protection Film/i.test(serviceName) ? 'PPF' : serviceName;
  const likePattern = `%${normalized}%`;

  // Count confirmed bookings
  let confirmedCount = 0;
  try {
    let query = `SELECT COUNT(*) as count FROM bookings b
      JOIN bookings_service_types bst ON b.booking_id = bst.booking_id
      WHERE DATE(b.booking_date) = ?
      AND (bst.service_name = ? OR bst.service_name LIKE ?)
      AND (b.notes IS NULL OR b.notes NOT LIKE '%CANCELLED:%')
      AND (bst.status IS NULL OR bst.status != 'Cancelled')`;
    const params = [date, normalized, likePattern];
    if (branchId && branchId > 0) {
      query += ' AND b.branch_id = ?';
      params.push(branchId);
    }
    const [rows] = await pool.query(query, params);
    confirmedCount = rows[0]?.count || 0;
  } catch { /* ignore */ }

  // Count pending requests
  let pendingCount = 0;
  try {
    let query = `SELECT COUNT(*) as count FROM booking_requests br
      JOIN booking_request_services brs ON br.request_id = brs.request_id
      WHERE DATE(br.booking_date) = ?
      AND (brs.service_name = ? OR brs.service_name LIKE ?)
      AND br.status = 'pending'`;
    const params = [date, normalized, likePattern];
    if (branchId && branchId > 0) {
      query += ' AND br.branch_id = ?';
      params.push(branchId);
    }
    const [rows] = await pool.query(query, params);
    pendingCount = rows[0]?.count || 0;
  } catch { /* ignore */ }

  return Math.max(0, capacity - confirmedCount - pendingCount);
}

// --- Helper: Get customer's branch_id from DB ---
async function getCustomerBranch(customerId, jwtBranchId) {
  try {
    const [rows] = await pool.query("SELECT branch_id FROM customers WHERE id = ?", [customerId]);
    if (rows[0]?.branch_id) return rows[0].branch_id;
  } catch { /* fallthrough */ }
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
               GROUP_CONCAT(DISTINCT bst.service_name SEPARATOR ', ') as service_names
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
        if ((row.notes || '').includes('CANCELLED:')) {
          row.status = 'cancelled';
        } else {
          const bookingDate = new Date(row.booking_date).toISOString().slice(0, 10);
          row.status = bookingDate >= today ? 'scheduled' : 'done';
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
    const branchId = await getCustomerBranch(customerId, req.user.branch_id);

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

    if (!service || !action) {
      return res.status(422).json({ success: false, data: null, message: 'Service and action are required', errors: [] });
    }

    const branchId = await getCustomerBranch(req.user.customer_id, req.user.branch_id);

    // Load branch capacity
    let branchCapacity = {};
    try {
      const [rows] = await pool.query("SELECT service_name, max_capacity FROM branch_booking_capacity WHERE branch_id = ?", [branchId]);
      for (const r of rows) branchCapacity[r.service_name] = r.max_capacity;
    } catch { /* ignore */ }

    if (action === 'get_available_dates') {
      const days = Math.min(365, Math.max(30, parseInt(body.days || 90, 10)));
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + days);

      const monthStart = startDate.toISOString().slice(0, 10);
      const monthEnd = endDate.toISOString().slice(0, 10);

      // Bulk booking counts
      const bookingCounts = {};
      try {
        const [rows] = await pool.query(`
          SELECT DATE(b.booking_date) as dt, COUNT(*) as cnt
          FROM bookings b
          JOIN bookings_service_types bst ON bst.booking_id = b.booking_id
          WHERE b.branch_id = ?
          AND b.booking_date >= ? AND b.booking_date < DATE_ADD(?, INTERVAL 1 DAY)
          AND bst.service_name = ?
          AND (b.notes IS NULL OR b.notes NOT LIKE '%CANCELLED:%')
          AND (bst.status IS NULL OR bst.status != 'Cancelled')
          GROUP BY dt
        `, [branchId, monthStart, monthEnd, service]);
        for (const r of rows) bookingCounts[r.dt] = r.cnt;
      } catch { /* ignore */ }

      // Bulk pending counts
      const pendingCounts = {};
      try {
        const [rows] = await pool.query(`
          SELECT DATE(br.booking_date) as dt, COUNT(*) as cnt
          FROM booking_requests br
          LEFT JOIN booking_request_services brs ON br.request_id = brs.request_id
          WHERE br.branch_id = ?
          AND br.booking_date >= ? AND br.booking_date < DATE_ADD(?, INTERVAL 1 DAY)
          AND (br.latest_service = ? OR brs.service_name = ?)
          AND br.status = 'pending'
          GROUP BY dt
        `, [branchId, monthStart, monthEnd, service, service]);
        for (const r of rows) pendingCounts[r.dt] = r.cnt;
      } catch { /* ignore */ }

      const availableDates = [];
      const current = new Date(startDate);
      while (current <= endDate) {
        const dateStr = current.toISOString().slice(0, 10);
        const dayOfWeek = current.getDay(); // 0=Sun

        if (dayOfWeek !== 0) { // Skip Sundays
          const booked = (bookingCounts[dateStr] || 0) + (pendingCounts[dateStr] || 0);
          const max = branchCapacity[service] || CAPACITY_DEFAULTS[service] || 0;
          const isAvailable = max > 0 ? booked < max : true;

          availableDates.push({
            date: dateStr,
            formatted: current.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            day: current.toLocaleDateString('en-US', { weekday: 'long' }),
            available: isAvailable,
            booked,
            capacity: max
          });
        }

        current.setDate(current.getDate() + 1);
      }

      return res.json({
        success: true,
        data: { dates: availableDates, capacity: branchCapacity[service] || CAPACITY_DEFAULTS[service] || 0, branch_id: branchId },
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
