<?php
/**
 * POST /api/v2/auth/login
 * 
 * Send OTP to customer's mobile number.
 * No JWT required — this is the entry point for authentication.
 * 
 * Request body: { "mobile": "09171234567" }
 * Response: { success: true, data: { sms_sent: true }, message: "OTP sent" }
 */

require_once __DIR__ . '/../../../SMS_API_settings.php';

require_method('POST');

$body = get_json_body();
$errors = validate_required($body, ['mobile']);
if (!empty($errors)) {
    api_error('Validation failed', 422, $errors);
}

$mobile = trim($body['mobile']);

// Validate Philippine mobile format
if (!preg_match('/^(\+63|63|0)?9\d{9}$/', $mobile)) {
    api_error('Please enter a valid Philippine mobile number (e.g., 09XX XXX XXXX)', 422);
}

// Get last 10 digits for DB lookup
$mobileClean = preg_replace('/[^0-9]/', '', $mobile);
$last10 = substr($mobileClean, -10);

// Find customer by mobile number
$stmt = $conn->prepare("SELECT id, mobile_number, branch_id, full_name FROM customers WHERE RIGHT(REPLACE(REPLACE(mobile_number, '+', ''), ' ', ''), 10) = ?");
$stmt->bind_param("s", $last10);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    $stmt->close();
    api_error('Mobile number not registered. Please contact the shop to register.', 404);
}

$customer = $result->fetch_assoc();
$customerId = (int) $customer['id'];
$customerMobile = $customer['mobile_number'];
$stmt->close();

// Standardize mobile format for storage
$formattedMobile = standardize_mobile_number($customerMobile);

// Rate limiting: max 3 OTP per mobile per 15 minutes
$rateLimitStmt = $conn->prepare("SELECT COUNT(*) as otp_count FROM login_otp WHERE mobile_number = ? AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)");
$rateLimitStmt->bind_param("s", $formattedMobile);
$rateLimitStmt->execute();
$rateLimitResult = $rateLimitStmt->get_result()->fetch_assoc();
$rateLimitStmt->close();

if (($rateLimitResult['otp_count'] ?? 0) >= 3) {
    api_error('Too many OTP requests. Please wait 15 minutes before trying again.', 429);
}

// Generate OTP
$otp = sprintf("%06d", mt_rand(100000, 999999));
$expiry = date('Y-m-d H:i:s', strtotime('+' . OTP_EXPIRY . ' seconds'));

// Store OTP — update if exists, insert if new
$checkStmt = $conn->prepare("SELECT id FROM login_otp WHERE mobile_number = ?");
$checkStmt->bind_param("s", $formattedMobile);
$checkStmt->execute();
$existsResult = $checkStmt->get_result();

if ($existsResult->num_rows > 0) {
    $stmt = $conn->prepare("UPDATE login_otp SET otp_code = ?, otp_expires = ?, updated_at = NOW() WHERE mobile_number = ?");
    $stmt->bind_param("sss", $otp, $expiry, $formattedMobile);
} else {
    $stmt = $conn->prepare("INSERT INTO login_otp (mobile_number, customer_id, otp_code, otp_expires, created_at) VALUES (?, ?, ?, ?, NOW())");
    $stmt->bind_param("siss", $formattedMobile, $customerId, $otp, $expiry);
}
$checkStmt->close();

if (!$stmt->execute()) {
    $stmt->close();
    api_error('Failed to generate OTP. Please try again.', 500);
}
$stmt->close();

// Send OTP via SMS
$smsMessage = "Your MaskPro Care OTP is: $otp. Valid for " . (OTP_EXPIRY / 60) . " minutes. Do not share this code.";

$smsSent = sendSms($baseURL, "MASKPRO", $formattedMobile, $smsMessage, $customerId);

// Fallback to SMS-it if primary fails
if (!$smsSent) {
    writeToLog("Primary SMS failed for $formattedMobile, trying fallback SMS-it");
    $retryResult = retrySms($formattedMobile, $smsMessage, $customerId);
    $smsSent = ($retryResult['status'] === 'Sent');
}

// Build response
$responseData = ['sms_sent' => $smsSent];

// In dev, include OTP for testing
if (!IS_PRODUCTION) {
    $responseData['otp'] = $otp;
    $responseData['expiry'] = $expiry;
}

api_success($responseData, $smsSent ? 'OTP sent successfully' : 'OTP generated but SMS delivery failed');
