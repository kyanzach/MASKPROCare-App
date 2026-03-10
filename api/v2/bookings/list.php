<?php
/**
 * GET /api/v2/bookings/list
 * 
 * Get all bookings for the authenticated customer.
 * Uses REAL database schema (customer_vehicle_id, booking_id as PK).
 * 
 * Response: { success: true, data: { bookings: [...], pending_requests: [...] } }
 */

require_once __DIR__ . '/../middleware/auth.php';
require_method('GET');

// Get bookings with vehicle info using REAL schema
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
        // Determine status from notes
        $row['status'] = (strpos($row['notes'] ?? '', 'CANCELLED:') !== false) ? 'cancelled' : 'active';
        $bookings[] = $row;
    }
    $stmt->close();
} catch (\Throwable $e) {
    // Fall back gracefully
}

// Get pending booking requests
$pendingRequests = [];
try {
    $stmt = $conn->prepare("
        SELECT br.*, 
               v.make, v.model, v.plate_no,
               GROUP_CONCAT(brs.service_name SEPARATOR ', ') as service_names
        FROM booking_requests br
        LEFT JOIN vehicles v ON br.vehicle_id = v.id
        LEFT JOIN booking_request_services brs ON br.request_id = brs.request_id
        WHERE br.customer_id = ? AND br.status = 'pending'
        GROUP BY br.request_id
        ORDER BY br.created_at DESC
    ");
    $stmt->bind_param("i", $authCustomerId);
    $stmt->execute();
    $result = $stmt->get_result();
    while ($row = $result->fetch_assoc()) {
        $pendingRequests[] = $row;
    }
    $stmt->close();
} catch (\Throwable $e) {
    // Table may not exist yet
}

api_success([
    'bookings' => $bookings,
    'pending_requests' => $pendingRequests,
    'total_bookings' => count($bookings),
    'total_pending' => count($pendingRequests)
], 'Bookings retrieved successfully');
