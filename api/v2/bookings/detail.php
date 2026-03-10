<?php
/**
 * GET /api/v2/bookings/detail/{id}
 * 
 * Get a specific booking with full details.
 * 
 * Response: { success: true, data: { booking: {...}, services: [...] } }
 */

require_once __DIR__ . '/../middleware/auth.php';
require_method('GET');

$bookingId = (int) ($routeId ?? $_GET['id'] ?? 0);

if ($bookingId <= 0) {
    api_error('Booking ID is required', 422);
}

// Get booking — verify ownership
$booking = get_booking_by_id($bookingId);

if (!$booking) {
    api_error('Booking not found', 404);
}

if ((int) $booking['customer_id'] !== $authCustomerId) {
    api_error('Booking not found', 404); // Don't reveal it exists for another customer
}

// Get services for this booking
$stmt = $conn->prepare("SELECT * FROM booking_services_to_perform WHERE booking_id = ?");
$stmt->bind_param("i", $bookingId);
$stmt->execute();
$servicesResult = $stmt->get_result();
$services = [];
while ($row = $servicesResult->fetch_assoc()) {
    $services[] = $row;
}
$stmt->close();

api_success([
    'booking' => $booking,
    'services' => $services
], 'Booking details retrieved');
