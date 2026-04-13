<?php
/**
 * POST /api/v2/bookings/cancel
 * 
 * Cancel a booking or a pending booking request.
 * 
 * Request body: 
 *   For approved bookings: { "type": "booking", "booking_id": 42, "reason": "Schedule conflict" }
 *   For pending requests:  { "type": "request", "request_id": 6, "reason": "Service no longer needed" }
 * 
 * Response: { success: true, message: "Cancelled successfully" }
 */

require_once __DIR__ . '/../middleware/auth.php';
require_method('POST');

date_default_timezone_set('Asia/Manila');

$body = get_json_body();
$type = $body['type'] ?? 'booking';
$reason = trim($body['reason'] ?? '');

if (empty($reason)) {
    api_error('Cancellation reason is required', 422);
}

if ($type === 'request') {
    // Cancel a pending booking request
    $requestId = (int) ($body['request_id'] ?? 0);
    if ($requestId <= 0) {
        api_error('Request ID is required', 422);
    }

    // Verify request belongs to customer and is still pending
    $stmt = $conn->prepare("SELECT request_id, status FROM booking_requests WHERE request_id = ? AND customer_id = ?");
    $stmt->bind_param("ii", $requestId, $authCustomerId);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows === 0) {
        $stmt->close();
        api_error('Booking request not found', 404);
    }

    $request = $result->fetch_assoc();
    $stmt->close();

    if ($request['status'] !== 'pending') {
        api_error('This request has already been ' . $request['status'], 409);
    }

    // Set status to cancelled with reason
    try {
        $stmt = $conn->prepare("UPDATE booking_requests SET status = 'cancelled', cancellation_reason = ? WHERE request_id = ? AND status = 'pending'");
        $stmt->bind_param("si", $reason, $requestId);
        $stmt->execute();
        $stmt->close();

        if ($stmt->affected_rows === 0) {
            api_error('Request was already processed by another action', 409);
        }

        api_success(null, 'Booking request cancelled successfully');
    } catch (Exception $e) {
        api_error('Failed to cancel request. Please try again.', 500);
    }

} else {
    // Cancel an approved booking (existing flow)
    $bookingId = (int) ($body['booking_id'] ?? $routeId ?? 0);
    if ($bookingId <= 0) {
        api_error('Booking ID is required', 422);
    }

    // Verify booking belongs to customer and is cancellable
    $stmt = $conn->prepare("SELECT booking_id, booking_date, notes FROM bookings WHERE booking_id = ? AND customer_id = ?");
    $stmt->bind_param("ii", $bookingId, $authCustomerId);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows === 0) {
        $stmt->close();
        api_error('Booking not found', 404);
    }

    $booking = $result->fetch_assoc();
    $stmt->close();

    // Check if already cancelled
    if (strpos($booking['notes'] ?? '', 'CANCELLED:') !== false) {
        api_error('This booking is already cancelled', 409);
    }

    // Check if booking is in the past
    $bookingDate = date('Y-m-d', strtotime($booking['booking_date']));
    if ($bookingDate < date('Y-m-d')) {
        api_error('Cannot cancel a past booking', 422);
    }

    // Cancel by appending to notes (matches Unify pattern)
    $cancelNote = "CANCELLED: " . $reason . " — Cancelled by customer via app on " . date('M d, Y g:i A');
    $existingNotes = $booking['notes'] ?? '';
    $updatedNotes = $existingNotes ? $existingNotes . "\n" . $cancelNote : $cancelNote;

    try {
        $stmt = $conn->prepare("UPDATE bookings SET notes = ? WHERE booking_id = ?");
        $stmt->bind_param("si", $updatedNotes, $bookingId);
        $stmt->execute();
        $stmt->close();

        // Also update booking_services_to_perform status
        $stmt = $conn->prepare("UPDATE booking_services_to_perform SET status = 'Cancelled' WHERE booking_id = ?");
        $stmt->bind_param("i", $bookingId);
        $stmt->execute();
        $stmt->close();

        // Also update bookings_service_types status
        $stmt = $conn->prepare("UPDATE bookings_service_types SET status = 'Cancelled' WHERE booking_id = ?");
        $stmt->bind_param("i", $bookingId);
        $stmt->execute();
        $stmt->close();

        api_success(null, 'Booking cancelled successfully');
    } catch (Exception $e) {
        api_error('Failed to cancel booking. Please try again.', 500);
    }
}
