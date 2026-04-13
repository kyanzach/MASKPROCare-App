<?php
/**
 * GET /api/v2/bookings/list
 * 
 * Get all bookings + booking requests for the authenticated customer.
 * Returns a unified list for the frontend.
 * 
 * Response: { success: true, data: { bookings: [...], requests: [...] } }
 */

require_once __DIR__ . '/../middleware/auth.php';
require_method('GET');

date_default_timezone_set('Asia/Manila');
$today = date('Y-m-d');

// Get approved bookings with vehicle info
$bookings = [];
try {
    $stmt = $conn->prepare("
        SELECT b.booking_id, b.booking_date, b.latest_service, b.notes, b.branch_id,
               v.make, v.model, v.plate_no, v.color, v.size
        FROM bookings b
        LEFT JOIN vehicles v ON b.customer_vehicle_id = v.id
        WHERE b.customer_id = ?
        ORDER BY b.booking_date DESC
        LIMIT 50
    ");
    $stmt->bind_param("i", $authCustomerId);
    $stmt->execute();
    $result = $stmt->get_result();
    while ($row = $result->fetch_assoc()) {
        // Determine status
        if (strpos($row['notes'] ?? '', 'CANCELLED:') !== false) {
            $row['status'] = 'cancelled';
        } else {
            $bookingDate = date('Y-m-d', strtotime($row['booking_date']));
            $row['status'] = ($bookingDate >= $today) ? 'scheduled' : 'done';
        }
        $row['type'] = 'booking';
        $bookings[] = $row;
    }
    $stmt->close();
} catch (\Throwable $e) {
    // Fall back gracefully
}

// Get ALL booking requests (pending, cancelled, rejected — NOT approved since those are in bookings)
$requests = [];
try {
    $stmt = $conn->prepare("
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
    ");
    $stmt->bind_param("i", $authCustomerId);
    $stmt->execute();
    $result = $stmt->get_result();
    while ($row = $result->fetch_assoc()) {
        $row['type'] = 'request';
        // Decode edit_history if present
        if (!empty($row['edit_history'])) {
            $row['edit_history'] = json_decode($row['edit_history'], true);
        }
        $requests[] = $row;
    }
    $stmt->close();
} catch (\Throwable $e) {
    // Table may not exist yet
}

api_success([
    'bookings' => $bookings,
    'requests' => $requests,
    'total_bookings' => count($bookings),
    'total_requests' => count($requests)
], 'Bookings retrieved successfully');
