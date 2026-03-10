<?php
/**
 * GET /api/v2/vehicles/detail/{id}
 * 
 * Get a specific vehicle with its service history.
 * 
 * Request: Authorization: Bearer <token>
 * URL param: id (passed via $routeId from router)
 * Query param: ?id=42 (fallback)
 * Response: { success: true, data: { vehicle: {...}, service_history: [...] } }
 */

require_once __DIR__ . '/../middleware/auth.php';
require_method('GET');

$vehicleId = (int) ($routeId ?? $_GET['id'] ?? 0);

if ($vehicleId <= 0) {
    api_error('Vehicle ID is required', 422);
}

// Get vehicle — verify ownership
$stmt = $conn->prepare("SELECT * FROM vehicles WHERE id = ? AND customer_id = ?");
$stmt->bind_param("ii", $vehicleId, $authCustomerId);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    $stmt->close();
    api_error('Vehicle not found', 404);
}

$vehicle = $result->fetch_assoc();
try {
    $vehicle['service_status'] = get_vehicle_service_status($vehicle);
} catch (\Throwable $e) {
    $vehicle['service_status'] = 'Unknown';
}
$stmt->close();

// Get service history
$serviceHistory = get_vehicle_service_history($vehicleId);

api_success([
    'vehicle' => $vehicle,
    'service_history' => $serviceHistory
], 'Vehicle details retrieved');
