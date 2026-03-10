<?php
/**
 * DELETE /api/v2/vehicles/delete
 * 
 * Delete a vehicle owned by the authenticated customer.
 * 
 * Request body or URL: { "id": 42 } or /vehicles/delete/42
 * Response: { success: true, message: "Vehicle deleted" }
 */

require_once __DIR__ . '/../middleware/auth.php';
require_method(['DELETE', 'POST']); // Accept both DELETE and POST for compatibility

$body = get_json_body();
$vehicleId = (int) ($body['id'] ?? $routeId ?? $_GET['id'] ?? 0);

if ($vehicleId <= 0) {
    api_error('Vehicle ID is required', 422);
}

// Verify ownership
$stmt = $conn->prepare("SELECT id FROM vehicles WHERE id = ? AND customer_id = ?");
$stmt->bind_param("ii", $vehicleId, $authCustomerId);
$stmt->execute();

if ($stmt->get_result()->num_rows === 0) {
    $stmt->close();
    api_error('Vehicle not found', 404);
}
$stmt->close();

// Delete
$stmt = $conn->prepare("DELETE FROM vehicles WHERE id = ? AND customer_id = ?");
$stmt->bind_param("ii", $vehicleId, $authCustomerId);

if (!$stmt->execute()) {
    $stmt->close();
    api_error('Failed to delete vehicle', 500);
}
$stmt->close();

api_success(null, 'Vehicle deleted successfully');
