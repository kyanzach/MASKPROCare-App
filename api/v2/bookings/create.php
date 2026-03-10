<?php
/**
 * POST /api/v2/bookings/create
 * 
 * Create a new booking request.
 * Note: This creates a BOOKING REQUEST (pending approval), not a direct booking.
 * This matches the current bookings.php flow.
 * 
 * Request body: {
 *   "vehicle_id": 42,
 *   "service_type": "Nano Ceramic Coating",
 *   "booking_date": "2026-03-15",
 *   "booking_time": "09:00",
 *   "notes": "Optional notes"
 * }
 */

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../../../includes/booking_capacity_helper.php';
require_method('POST');

$body = get_json_body();
$errors = validate_required($body, ['vehicle_id', 'service_type', 'booking_date', 'booking_time']);
if (!empty($errors)) {
    api_error('Validation failed', 422, $errors);
}

$vehicleId = (int) $body['vehicle_id'];
$serviceType = trim($body['service_type']);
$bookingDate = trim($body['booking_date']);
$bookingTime = trim($body['booking_time']);
$notes = trim($body['notes'] ?? '');

// Validate date format
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $bookingDate)) {
    api_error('Invalid date format. Use YYYY-MM-DD.', 422);
}

// Validate time format
if (!preg_match('/^\d{2}:\d{2}$/', $bookingTime)) {
    api_error('Invalid time format. Use HH:MM.', 422);
}

$bookingDatetime = $bookingDate . ' ' . $bookingTime;

// Check if in the future
if (strtotime($bookingDatetime) <= time()) {
    api_error('Please select a future date and time.', 422);
}

// Check capacity
// Check capacity (branch-specific)
$availableSlots = getAvailableSlots($conn, $bookingDate, $serviceType, $branchId);
if ($availableSlots <= 0) {
    api_error(
        htmlspecialchars($serviceType) . ' is fully booked on ' . date('M d, Y', strtotime($bookingDate)) . '. Please select another date.',
        409
    );
}

// Verify vehicle belongs to customer
$stmt = $conn->prepare("SELECT id FROM vehicles WHERE id = ? AND customer_id = ?");
$stmt->bind_param("ii", $vehicleId, $authCustomerId);
$stmt->execute();
if ($stmt->get_result()->num_rows === 0) {
    $stmt->close();
    api_error('Vehicle not found', 404);
}
$stmt->close();

// Get customer's branch_id
$branchStmt = $conn->prepare("SELECT branch_id FROM customers WHERE id = ?");
$branchStmt->bind_param("i", $authCustomerId);
$branchStmt->execute();
$branchResult = $branchStmt->get_result()->fetch_assoc();
$branchId = (int) ($branchResult['branch_id'] ?? $authBranchId);
$branchStmt->close();

// Create booking request
try {
    $stmt = $conn->prepare("
        INSERT INTO booking_requests 
        (customer_id, vehicle_id, booking_date, latest_service, notes, branch_id, status, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW())
    ");
    $stmt->bind_param("iisssi", $authCustomerId, $vehicleId, $bookingDatetime, $serviceType, $notes, $branchId);
    $stmt->execute();
    $requestId = $conn->insert_id;
    $stmt->close();

    // Insert service into booking_request_services
    $stmt = $conn->prepare("INSERT INTO booking_request_services (request_id, service_name) VALUES (?, ?)");
    $stmt->bind_param("is", $requestId, $serviceType);
    $stmt->execute();
    $stmt->close();

    api_success([
        'request_id' => $requestId,
        'status' => 'pending',
        'booking_date' => $bookingDatetime,
        'service_type' => $serviceType
    ], 'Booking request submitted successfully! Your request is pending approval.', 201);

} catch (Exception $e) {
    api_error('Failed to create booking request. Please try again.', 500);
}
