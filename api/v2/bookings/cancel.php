<?php
/**
 * POST /api/v2/bookings/cancel
 * 
 * Cancel a pending/confirmed booking.
 * 
 * Request body: { "booking_id": 42 }
 * Response: { success: true, message: "Booking cancelled" }
 */

require_once __DIR__ . '/../middleware/auth.php';
require_method('POST');

$body = get_json_body();
$bookingId = (int) ($body['booking_id'] ?? $routeId ?? 0);

if ($bookingId <= 0) {
    api_error('Booking ID is required', 422);
}

// Verify booking belongs to customer and is cancellable
$stmt = $conn->prepare("SELECT booking_id, notes FROM bookings WHERE booking_id = ? AND customer_id = ?");
$stmt->bind_param("ii", $bookingId, $authCustomerId);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    $stmt->close();
    api_error('Booking not found', 404);
}

$booking = $result->fetch_assoc();
$stmt->close();

// Check if already cancelled (notes contain CANCELLED:)
if (strpos($booking['notes'] ?? '', 'CANCELLED:') !== false) {
    api_error('This booking is already cancelled', 409);
}

// Cancel the booking by appending to notes (matches current bookings.php pattern)
$cancelNote = "CANCELLED: Cancelled by customer via app on " . date('M d, Y g:i A');
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

    api_success(null, 'Booking cancelled successfully');

} catch (Exception $e) {
    api_error('Failed to cancel booking. Please try again.', 500);
}
