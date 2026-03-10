<?php
/**
 * PUT /api/v2/vehicles/update
 * 
 * Update an existing vehicle.
 * 
 * Request body: { "id": 42, "make": "Toyota", "model": "Vios", "plate_no": "XYZ 5678" }
 * Response: { success: true, data: { vehicle: {...} } }
 */

require_once __DIR__ . '/../middleware/auth.php';
require_method(['PUT', 'POST']); // Accept both PUT and POST for compatibility

$body = get_json_body();
$vehicleId = (int) ($body['id'] ?? $routeId ?? $_GET['id'] ?? 0);

if ($vehicleId <= 0) {
    api_error('Vehicle ID is required', 422);
}

// Verify ownership
$stmt = $conn->prepare("SELECT * FROM vehicles WHERE id = ? AND customer_id = ?");
$stmt->bind_param("ii", $vehicleId, $authCustomerId);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    $stmt->close();
    api_error('Vehicle not found', 404);
}

$existingVehicle = $result->fetch_assoc();
$stmt->close();

// Merge updates with existing data
$make = trim($body['make'] ?? $existingVehicle['make']);
$model = trim($body['model'] ?? $existingVehicle['model']);
$plateNo = trim($body['plate_no'] ?? $existingVehicle['plate_no']);
$color = trim($body['color'] ?? $existingVehicle['color'] ?? '');
$regDate = isset($body['registration_date']) ? (trim($body['registration_date']) ?: null) : (isset($body['registration_expiry']) ? (trim($body['registration_expiry']) ?: null) : ($existingVehicle['registration_date'] ?? $existingVehicle['registration_expiry'] ?? null));

// Check for duplicate plate (if changed)
if (!empty($plateNo) && $plateNo !== $existingVehicle['plate_no']) {
    $stmt = $conn->prepare("SELECT id FROM vehicles WHERE plate_no = ? AND id != ?");
    $stmt->bind_param("si", $plateNo, $vehicleId);
    $stmt->execute();
    if ($stmt->get_result()->num_rows > 0) {
        $stmt->close();
        api_error('A vehicle with this plate number already exists', 409);
    }
    $stmt->close();
}

// Update
$stmt = $conn->prepare("UPDATE vehicles SET make = ?, model = ?, plate_no = ?, color = ?, registration_date = ? WHERE id = ? AND customer_id = ?");
$stmt->bind_param("sssssii", $make, $model, $plateNo, $color, $regDate, $vehicleId, $authCustomerId);

if (!$stmt->execute()) {
    $stmt->close();
    api_error('Failed to update vehicle', 500);
}
$stmt->close();

$vehicle = get_vehicle_by_id($vehicleId);

api_success(['vehicle' => $vehicle], 'Vehicle updated successfully');
