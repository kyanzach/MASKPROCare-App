<?php
/**
 * POST /api/v2/auth/verify
 * 
 * Verify OTP and return a JWT token.
 * No JWT required — this completes the authentication flow.
 * 
 * Request body: { "mobile": "09171234567", "otp": "123456" }
 * Response: { success: true, data: { token: "eyJ...", customer: {...} } }
 */

require_once __DIR__ . '/../config/jwt.php';

require_method('POST');

$body = get_json_body();
$errors = validate_required($body, ['mobile', 'otp']);
if (!empty($errors)) {
    api_error('Validation failed', 422, $errors);
}

$mobile = trim($body['mobile']);
$otp = trim($body['otp']);

// Get last 10 digits for DB lookup
$mobileClean = preg_replace('/[^0-9]/', '', $mobile);
$last10 = substr($mobileClean, -10);

// Find customer by mobile number
$stmt = $conn->prepare("SELECT id, mobile_number, branch_id FROM customers WHERE RIGHT(REPLACE(REPLACE(mobile_number, '+', ''), ' ', ''), 10) = ?");
$stmt->bind_param("s", $last10);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    $stmt->close();
    api_error('Mobile number not found', 404);
}

$customer = $result->fetch_assoc();
$customerMobile = $customer['mobile_number'];
$customerId = (int) $customer['id'];
$branchId = (int) ($customer['branch_id'] ?? DEFAULT_BRANCH_ID);
$stmt->close();

// Standardize mobile for OTP lookup
$formattedMobile = standardize_mobile_number($customerMobile);

// Verify OTP
$stmt = $conn->prepare("SELECT * FROM login_otp WHERE mobile_number = ? AND otp_code = ? AND otp_expires > NOW()");
$stmt->bind_param("ss", $formattedMobile, $otp);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    $stmt->close();
    api_error('Invalid or expired OTP. Please request a new one.', 401);
}
$stmt->close();

// OTP is valid — generate JWT
$token = jwt_encode_token($customerId, $formattedMobile, $branchId);

// Clear OTP after successful verification (expire it so it can't be reused)
$stmt = $conn->prepare("UPDATE login_otp SET otp_code = '', otp_expires = '2000-01-01 00:00:00', last_login = NOW(), updated_at = NOW() WHERE mobile_number = ?");
$stmt->bind_param("s", $formattedMobile);
$stmt->execute();
$stmt->close();

// Get full customer profile
$customerData = get_customer_by_id($customerId);

api_success([
    'token' => $token,
    'expires_in' => JWT_EXPIRY_SECONDS,
    'customer' => $customerData
], 'Login successful');
