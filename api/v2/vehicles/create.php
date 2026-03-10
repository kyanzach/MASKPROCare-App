<?php
/**
 * POST /api/v2/vehicles/create
 * 
 * Add a new vehicle for the authenticated customer.
 * 
 * Request body: { "make": "Toyota", "model": "Vios", "plate_no": "ABC 1234", "color": "White" }
 * Response: { success: true, data: { vehicle: {...} } }
 */

require_once __DIR__ . '/../middleware/auth.php';
require_method('POST');

$body = get_json_body();
$errors = validate_required($body, ['make', 'model']);
if (!empty($errors)) {
    api_error('Validation failed', 422, $errors);
}

$make = trim($body['make']);
$model = trim($body['model']);
$plateNo = trim($body['plate_no'] ?? '');
$color = trim($body['color'] ?? '');
$regDate = !empty($body['registration_date']) ? trim($body['registration_date']) : (!empty($body['registration_expiry']) ? trim($body['registration_expiry']) : null);

// Check for duplicate plate number (if provided)
if (!empty($plateNo)) {
    $stmt = $conn->prepare("SELECT id FROM vehicles WHERE plate_no = ? AND customer_id != ?");
    $stmt->bind_param("si", $plateNo, $authCustomerId);
    $stmt->execute();
    if ($stmt->get_result()->num_rows > 0) {
        $stmt->close();
        api_error('A vehicle with this plate number already exists', 409);
    }
    $stmt->close();
}

// Insert vehicle
$stmt = $conn->prepare("INSERT INTO vehicles (customer_id, make, model, plate_no, color, registration_date, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())");
$stmt->bind_param("isssss", $authCustomerId, $make, $model, $plateNo, $color, $regDate);

if (!$stmt->execute()) {
    $stmt->close();
    api_error('Failed to add vehicle', 500);
}

$vehicleId = $conn->insert_id;
$stmt->close();

// Return the created vehicle
$vehicle = get_vehicle_by_id($vehicleId);

api_success(['vehicle' => $vehicle], 'Vehicle added successfully', 201);
