<?php
/**
 * PUT /api/v2/profile/update
 * 
 * Update the authenticated customer's profile.
 * 
 * Request body: { "full_name": "Juan Dela Cruz", "email": "juan@example.com" }
 * Response: { success: true, data: { customer: {...} } }
 */

require_once __DIR__ . '/../middleware/auth.php';
require_method(['PUT', 'POST']);

$body = get_json_body();

// Get current customer data
$customer = get_customer_by_id($authCustomerId);
if (!$customer) {
    api_error('Customer not found', 404);
}

// Merge updates with existing data
$fullName = trim($body['full_name'] ?? $customer['full_name'] ?? '');
$email = trim($body['email'] ?? $customer['email'] ?? '');
$address = trim($body['address'] ?? $customer['address'] ?? '');

// Validate email format if provided
if (!empty($email) && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    api_error('Invalid email address', 422);
}

// Update customer
$stmt = $conn->prepare("UPDATE customers SET full_name = ?, email = ?, address = ? WHERE id = ?");
$stmt->bind_param("sssi", $fullName, $email, $address, $authCustomerId);

if (!$stmt->execute()) {
    $stmt->close();
    api_error('Failed to update profile', 500);
}
$stmt->close();

// Return updated profile
$updatedCustomer = get_customer_by_id($authCustomerId);

api_success([
    'customer' => $updatedCustomer
], 'Profile updated successfully');
