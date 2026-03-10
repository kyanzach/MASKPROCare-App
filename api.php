<?php
// API endpoints for nanofix-maintenance app

// Include required files
require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';
require_once 'SMS_API_settings.php';

// Set content type to JSON
header('Content-Type: application/json');

// Get request method and endpoint
$method = $_SERVER['REQUEST_METHOD'];
$endpoint = isset($_GET['endpoint']) ? $_GET['endpoint'] : '';

// API response structure
function api_response($success, $data = null, $message = '') {
    return json_encode([
        'success' => $success,
        'data' => $data,
        'message' => $message
    ]);
}

// Handle OPTIONS requests (CORS preflight)
if ($method === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    exit(0);
}

// Set CORS headers for all other requests
header('Access-Control-Allow-Origin: *');

// Get JSON request body for POST, PUT requests
$json_body = null;
if ($method === 'POST' || $method === 'PUT') {
    $json_body = json_decode(file_get_contents('php://input'), true);
}

// API endpoints
switch ($endpoint) {
    // Mobile validation endpoint
    case 'mobile_validation':
        if ($method === 'POST') {
            // Validate mobile number
            if (!isset($json_body['mobile']) || empty($json_body['mobile'])) {
                echo api_response(false, null, 'Mobile number is required');
                exit;
            }
            
            $mobile = sanitize_input($json_body['mobile']);
            
            // Check if mobile number exists in customers table
            $query = "SELECT id, first_name, last_name FROM customers WHERE mobile = ?";
            $stmt = $mysqli->prepare($query);
            $stmt->bind_param("s", $mobile);
            $stmt->execute();
            $result = $stmt->get_result();
            
            if ($result->num_rows > 0) {
                $customer = $result->fetch_assoc();
                echo api_response(true, [
                    'exists' => true,
                    'customer_id' => $customer['id'],
                    'name' => $customer['first_name'] . ' ' . $customer['last_name']
                ], 'Customer found');
            } else {
                echo api_response(true, [
                    'exists' => false
                ], 'Customer not found');
            }
        } else {
            echo api_response(false, null, 'Method not allowed');
        }
        break;
    
    // OTP service endpoint
    case 'otp_service':
        if ($method === 'POST') {
            // Send OTP
            if (!isset($json_body['mobile']) || empty($json_body['mobile'])) {
                echo api_response(false, null, 'Mobile number is required');
                exit;
            }
            
            $mobile = sanitize_input($json_body['mobile']);
            
            // Generate OTP
            $otp = sprintf("%06d", mt_rand(100000, 999999));
            $expiry = date('Y-m-d H:i:s', strtotime('+' . OTP_EXPIRY . ' seconds'));
            
            // Store OTP in login_otp table
            // First check if customer exists
            // Get last 10 digits of mobile number for comparison
            $mobile_clean = preg_replace('/[^0-9]/', '', $mobile);
            $last10Digits = substr($mobile_clean, -10);
            
            $customerQuery = "SELECT id, mobile_number FROM customers WHERE RIGHT(REPLACE(REPLACE(mobile_number, '+', ''), ' ', ''), 10) = ?";
            $customerStmt = $mysqli->prepare($customerQuery);
            $customerStmt->bind_param("s", $last10Digits);
            $customerStmt->execute();
            $customerResult = $customerStmt->get_result();
            
            if ($customerResult->num_rows > 0) {
                $customer = $customerResult->fetch_assoc();
                $customerId = $customer['id'];
                $customerMobile = $customer['mobile_number'];
                
                // Format mobile number to standard format for storage
                $formattedMobile = $customerMobile;
                if (!preg_match('/^\+/', $formattedMobile)) {
                    // Add + prefix if not already present
                    $mobile_clean = preg_replace('/[^0-9]/', '', $formattedMobile);
                    
                    // Format based on pattern
                    if (substr($mobile_clean, 0, 2) === '63' && strlen($mobile_clean) >= 12) {
                        $formattedMobile = '+' . $mobile_clean;
                    } else if (substr($mobile_clean, 0, 1) === '0' && strlen($mobile_clean) >= 11) {
                        $formattedMobile = '+63' . substr($mobile_clean, 1);
                    } else if (substr($mobile_clean, 0, 1) === '9' && strlen($mobile_clean) >= 10) {
                        $formattedMobile = '+63' . $mobile_clean;
                    }
                }
                
                // Check if entry exists in login_otp
                $checkQuery = "SELECT * FROM login_otp WHERE mobile_number = ?";
                $checkStmt = $mysqli->prepare($checkQuery);
                $checkStmt->bind_param("s", $formattedMobile);
                $checkStmt->execute();
                $checkResult = $checkStmt->get_result();
                
                if ($checkResult->num_rows > 0) {
                    // Update existing entry
                    $query = "UPDATE login_otp SET otp_code = ?, otp_expires = ?, updated_at = NOW() WHERE mobile_number = ?";
                    $stmt = $mysqli->prepare($query);
                    $stmt->bind_param("sss", $otp, $expiry, $formattedMobile);
                } else {
                    // Insert new entry
                    $query = "INSERT INTO login_otp (mobile_number, customer_id, otp_code, otp_expires, created_at) VALUES (?, ?, ?, ?, NOW())";
                    $stmt = $mysqli->prepare($query);
                    $stmt->bind_param("siss", $formattedMobile, $customerId, $otp, $expiry);
                }
                $checkStmt->close();
            } else {
                // Customer doesn't exist
                $customerStmt->close();
                echo api_response(false, null, 'Customer not found');
                exit;
            }
            $customerStmt->close();
            $result = $stmt->execute();
            
            if ($result) {
                // Send OTP via SMS
                $sms_message = "Your NanoFix OTP code is: $otp. Valid for " . (OTP_EXPIRY/60) . " minutes. Do not share this code.";
                
                // Try primary SMS API (ITEXMO)
                $sms_sent = sendSms($baseURL, "MASKPRO", $formattedMobile, $sms_message, $customerId);
                
                // If primary fails, try fallback SMS API (SMS-it)
                if (!$sms_sent) {
                    writeToLog("Primary SMS failed for $formattedMobile, trying fallback SMS-it");
                    $retry_result = retrySms($formattedMobile, $sms_message, $customerId);
                    $sms_sent = ($retry_result['status'] === 'Sent');
                }
                
                if (!IS_PRODUCTION) {
                    // In development, also return OTP in response for testing
                    echo api_response(true, [
                        'otp' => $otp,
                        'expiry' => $expiry,
                        'sms_sent' => $sms_sent
                    ], $sms_sent ? 'OTP sent successfully (DEV MODE)' : 'OTP generated but SMS failed (DEV MODE)');
                } else {
                    // In production, don't return OTP in response
                    echo api_response(true, [
                        'sms_sent' => $sms_sent
                    ], $sms_sent ? 'OTP sent successfully' : 'OTP generated but SMS delivery failed');
                }
            } else {
                echo api_response(false, null, 'Failed to generate OTP');
            }
        } else {
            echo api_response(false, null, 'Method not allowed');
        }
        break;
    
    // Verify OTP endpoint
    case 'verify_otp':
        if ($method === 'POST') {
            // Verify OTP
            if (!isset($json_body['mobile']) || empty($json_body['mobile']) ||
                !isset($json_body['otp']) || empty($json_body['otp'])) {
                echo api_response(false, null, 'Mobile number and OTP are required');
                exit;
            }
            
            $mobile = sanitize_input($json_body['mobile']);
            $otp = sanitize_input($json_body['otp']);
            
            // Get last 10 digits of mobile number for comparison
            $mobile_clean = preg_replace('/[^0-9]/', '', $mobile);
            $last10Digits = substr($mobile_clean, -10);
            
            // First find the customer by last 10 digits
            $customerQuery = "SELECT id, mobile_number FROM customers WHERE RIGHT(REPLACE(REPLACE(mobile_number, '+', ''), ' ', ''), 10) = ?";
            $customerStmt = $mysqli->prepare($customerQuery);
            $customerStmt->bind_param("s", $last10Digits);
            $customerStmt->execute();
            $customerResult = $customerStmt->get_result();
            
            if ($customerResult->num_rows > 0) {
                $customer = $customerResult->fetch_assoc();
                $customerMobile = $customer['mobile_number'];
                
                // Format mobile number to standard format for lookup
                $formattedMobile = $customerMobile;
                if (!preg_match('/^\+/', $formattedMobile)) {
                    // Add + prefix if not already present
                    $mobile_clean = preg_replace('/[^0-9]/', '', $formattedMobile);
                    
                    // Format based on pattern
                    if (substr($mobile_clean, 0, 2) === '63' && strlen($mobile_clean) >= 12) {
                        $formattedMobile = '+' . $mobile_clean;
                    } else if (substr($mobile_clean, 0, 1) === '0' && strlen($mobile_clean) >= 11) {
                        $formattedMobile = '+63' . substr($mobile_clean, 1);
                    } else if (substr($mobile_clean, 0, 1) === '9' && strlen($mobile_clean) >= 10) {
                        $formattedMobile = '+63' . $mobile_clean;
                    }
                }
                
                // Check OTP in login_otp table using the formatted mobile number
                $query = "SELECT * FROM login_otp WHERE mobile_number = ? AND otp_code = ? AND otp_expires > NOW()";
                $stmt = $mysqli->prepare($query);
                $stmt->bind_param("ss", $formattedMobile, $otp);
                $stmt->execute();
                $result = $stmt->get_result();
            } else {
                echo api_response(false, null, 'Mobile number not found');
                exit;
            }
            $customerStmt->close();
            
            if ($result->num_rows > 0) {
                // OTP is valid, get customer info
                $otpData = $result->fetch_assoc();
                $customer_id = $otpData['customer_id'];
                
                // Generate session token
                $session_token = bin2hex(random_bytes(32));
                $expiry = date('Y-m-d H:i:s', strtotime('+' . SESSION_LIFETIME . ' seconds'));
                
                // Update login_otp with session token
                $query = "UPDATE login_otp SET 
                         session_token = ?, 
                         token_expiry = ?, 
                         last_login = NOW(),
                         updated_at = NOW() 
                         WHERE mobile_number = ?";
                
                $stmt = $mysqli->prepare($query);
                $stmt->bind_param("sss", $session_token, $expiry, $formattedMobile);
                $stmt->execute();
                
                // Get customer data
                $query = "SELECT * FROM customers WHERE id = ?";
                $stmt = $mysqli->prepare($query);
                $stmt->bind_param("i", $customer_id);
                $stmt->execute();
                $result = $stmt->get_result();
                $customer = $result->fetch_assoc();
                
                echo api_response(true, [
                    'customer_id' => $customer_id,
                    'session_token' => $session_token,
                    'expiry' => $expiry,
                    'customer' => $customer
                ], 'OTP verified successfully');
            } else {
                echo api_response(false, null, 'Invalid or expired OTP');
            }
        } else {
            echo api_response(false, null, 'Method not allowed');
        }
        break;
    
    // Get customer data endpoint
    case 'customer':
        if ($method === 'GET') {
            // Validate session token
            if (!isset($_GET['token']) || empty($_GET['token'])) {
                echo api_response(false, null, 'Session token is required');
                exit;
            }
            
            $token = sanitize_input($_GET['token']);
            
            // Check token in client_access table
            $query = "SELECT ca.mobile, ca.customer_id FROM client_access ca 
                     WHERE ca.session_token = ? AND ca.token_expiry > NOW()";
            
            $stmt = $mysqli->prepare($query);
            $stmt->bind_param("s", $token);
            $stmt->execute();
            $result = $stmt->get_result();
            
            if ($result->num_rows > 0) {
                $access = $result->fetch_assoc();
                $customer_id = $access['customer_id'];
                
                // Get customer data
                $customer = get_customer_by_id($customer_id);
                
                if ($customer) {
                    echo api_response(true, [
                        'customer' => $customer
                    ], 'Customer data retrieved successfully');
                } else {
                    echo api_response(false, null, 'Customer not found');
                }
            } else {
                echo api_response(false, null, 'Invalid or expired session token');
            }
        } else {
            echo api_response(false, null, 'Method not allowed');
        }
        break;
    
    // Get customer vehicles endpoint
    case 'vehicles':
        if ($method === 'GET') {
            // Validate session token
            if (!isset($_GET['token']) || empty($_GET['token'])) {
                echo api_response(false, null, 'Session token is required');
                exit;
            }
            
            $token = sanitize_input($_GET['token']);
            
            // Check token in client_access table
            $query = "SELECT ca.mobile, ca.customer_id FROM client_access ca 
                     WHERE ca.session_token = ? AND ca.token_expiry > NOW()";
            
            $stmt = $mysqli->prepare($query);
            $stmt->bind_param("s", $token);
            $stmt->execute();
            $result = $stmt->get_result();
            
            if ($result->num_rows > 0) {
                $access = $result->fetch_assoc();
                $customer_id = $access['customer_id'];
                
                // Get customer vehicles
                $vehicles = get_customer_vehicles($customer_id);
                
                // Add service status to each vehicle
                foreach ($vehicles as &$vehicle) {
                    $vehicle['service_status'] = get_vehicle_service_status($vehicle);
                }
                
                echo api_response(true, [
                    'vehicles' => $vehicles
                ], 'Vehicles retrieved successfully');
            } else {
                echo api_response(false, null, 'Invalid or expired session token');
            }
        } else {
            echo api_response(false, null, 'Method not allowed');
        }
        break;
    
    // Get customer bookings endpoint
    case 'bookings':
        if ($method === 'GET') {
            // Validate session token
            if (!isset($_GET['token']) || empty($_GET['token'])) {
                echo api_response(false, null, 'Session token is required');
                exit;
            }
            
            $token = sanitize_input($_GET['token']);
            
            // Check token in client_access table
            $query = "SELECT ca.mobile, ca.customer_id FROM client_access ca 
                     WHERE ca.session_token = ? AND ca.token_expiry > NOW()";
            
            $stmt = $mysqli->prepare($query);
            $stmt->bind_param("s", $token);
            $stmt->execute();
            $result = $stmt->get_result();
            
            if ($result->num_rows > 0) {
                $access = $result->fetch_assoc();
                $customer_id = $access['customer_id'];
                
                // Get customer bookings
                $bookings = get_customer_bookings($customer_id);
                
                echo api_response(true, [
                    'bookings' => $bookings
                ], 'Bookings retrieved successfully');
            } else {
                echo api_response(false, null, 'Invalid or expired session token');
            }
        } else {
            echo api_response(false, null, 'Method not allowed');
        }
        break;
    
    // Get service types endpoint
    case 'service_types':
        if ($method === 'GET') {
            // Get all service types
            $service_types = get_service_types();
            
            echo api_response(true, [
                'service_types' => $service_types
            ], 'Service types retrieved successfully');
        } else {
            echo api_response(false, null, 'Method not allowed');
        }
        break;
    
    // Get available booking slots endpoint
    case 'booking_slots':
        if ($method === 'GET') {
            // Validate date parameter
            if (!isset($_GET['date']) || empty($_GET['date'])) {
                echo api_response(false, null, 'Date is required');
                exit;
            }
            
            $date = sanitize_input($_GET['date']);
            $branch_id = isset($_GET['branch_id']) ? (int) $_GET['branch_id'] : DEFAULT_BRANCH_ID;
            
            // Get available booking slots
            $slots = get_available_booking_slots($date, $branch_id);
            
            echo api_response(true, [
                'slots' => $slots
            ], 'Booking slots retrieved successfully');
        } else {
            echo api_response(false, null, 'Method not allowed');
        }
        break;
    
    // Create booking endpoint
    case 'create_booking':
        if ($method === 'POST') {
            // Validate session token
            if (!isset($json_body['token']) || empty($json_body['token'])) {
                echo api_response(false, null, 'Session token is required');
                exit;
            }
            
            $token = sanitize_input($json_body['token']);
            
            // Check token in client_access table
            $query = "SELECT ca.mobile, ca.customer_id FROM client_access ca 
                     WHERE ca.session_token = ? AND ca.token_expiry > NOW()";
            
            $stmt = $mysqli->prepare($query);
            $stmt->bind_param("s", $token);
            $stmt->execute();
            $result = $stmt->get_result();
            
            if ($result->num_rows > 0) {
                $access = $result->fetch_assoc();
                $customer_id = $access['customer_id'];
                
                // Validate booking data
                if (!isset($json_body['vehicle_id']) || empty($json_body['vehicle_id']) ||
                    !isset($json_body['service_type_id']) || empty($json_body['service_type_id']) ||
                    !isset($json_body['scheduled_date']) || empty($json_body['scheduled_date']) ||
                    !isset($json_body['scheduled_time']) || empty($json_body['scheduled_time'])) {
                    
                    echo api_response(false, null, 'Vehicle ID, service type, date, and time are required');
                    exit;
                }
                
                $vehicle_id = (int) $json_body['vehicle_id'];
                $service_type_id = (int) $json_body['service_type_id'];
                $scheduled_date = sanitize_input($json_body['scheduled_date']);
                $scheduled_time = sanitize_input($json_body['scheduled_time']);
                $notes = isset($json_body['notes']) ? sanitize_input($json_body['notes']) : '';
                $branch_id = isset($json_body['branch_id']) ? (int) $json_body['branch_id'] : DEFAULT_BRANCH_ID;
                
                // Verify vehicle belongs to customer
                $query = "SELECT * FROM vehicles WHERE id = ? AND customer_id = ?";
                $stmt = $mysqli->prepare($query);
                $stmt->bind_param("ii", $vehicle_id, $customer_id);
                $stmt->execute();
                $result = $stmt->get_result();
                
                if ($result->num_rows === 0) {
                    echo api_response(false, null, 'Vehicle not found or does not belong to customer');
                    exit;
                }
                
                // Verify service type exists
                $query = "SELECT * FROM bookings_service_types WHERE id = ? AND is_active = 1";
                $stmt = $mysqli->prepare($query);
                $stmt->bind_param("i", $service_type_id);
                $stmt->execute();
                $result = $stmt->get_result();
                
                if ($result->num_rows === 0) {
                    echo api_response(false, null, 'Service type not found or inactive');
                    exit;
                }
                
                // Verify slot is available
                $query = "SELECT * FROM bookings 
                         WHERE scheduled_date = ? AND scheduled_time = ? AND branch_id = ? 
                         AND status IN ('pending', 'confirmed')";
                
                $stmt = $mysqli->prepare($query);
                $stmt->bind_param("ssi", $scheduled_date, $scheduled_time, $branch_id);
                $stmt->execute();
                $result = $stmt->get_result();
                
                if ($result->num_rows > 0) {
                    echo api_response(false, null, 'Selected time slot is not available');
                    exit;
                }
                
                // Create booking
                $query = "INSERT INTO bookings 
                         (customer_id, vehicle_id, service_type_id, branch_id, 
                         scheduled_date, scheduled_time, notes, status, created_at) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW())";
                
                $stmt = $mysqli->prepare($query);
                $stmt->bind_param("iiiisss", $customer_id, $vehicle_id, $service_type_id, 
                                 $branch_id, $scheduled_date, $scheduled_time, $notes);
                $result = $stmt->execute();
                
                if ($result) {
                    $booking_id = $mysqli->insert_id;
                    
                    // Get booking details
                    $booking = get_booking_by_id($booking_id);
                    
                    echo api_response(true, [
                        'booking' => $booking
                    ], 'Booking created successfully');
                } else {
                    echo api_response(false, null, 'Failed to create booking');
                }
            } else {
                echo api_response(false, null, 'Invalid or expired session token');
            }
        } else {
            echo api_response(false, null, 'Method not allowed');
        }
        break;
    
    // Cancel booking endpoint
    case 'cancel_booking':
        if ($method === 'POST') {
            // Validate session token
            if (!isset($json_body['token']) || empty($json_body['token']) ||
                !isset($json_body['booking_id']) || empty($json_body['booking_id'])) {
                echo api_response(false, null, 'Session token and booking ID are required');
                exit;
            }
            
            $token = sanitize_input($json_body['token']);
            $booking_id = (int) $json_body['booking_id'];
            
            // Check token in client_access table
            $query = "SELECT ca.mobile, ca.customer_id FROM client_access ca 
                     WHERE ca.session_token = ? AND ca.token_expiry > NOW()";
            
            $stmt = $mysqli->prepare($query);
            $stmt->bind_param("s", $token);
            $stmt->execute();
            $result = $stmt->get_result();
            
            if ($result->num_rows > 0) {
                $access = $result->fetch_assoc();
                $customer_id = $access['customer_id'];
                
                // Verify booking belongs to customer and is not already completed or cancelled
                $query = "SELECT * FROM bookings 
                         WHERE id = ? AND customer_id = ? AND status IN ('pending', 'confirmed')";
                
                $stmt = $mysqli->prepare($query);
                $stmt->bind_param("ii", $booking_id, $customer_id);
                $stmt->execute();
                $result = $stmt->get_result();
                
                if ($result->num_rows === 0) {
                    echo api_response(false, null, 'Booking not found, does not belong to customer, or cannot be cancelled');
                    exit;
                }
                
                // Cancel booking
                $query = "UPDATE bookings SET status = 'cancelled', updated_at = NOW() WHERE id = ?";
                $stmt = $mysqli->prepare($query);
                $stmt->bind_param("i", $booking_id);
                $result = $stmt->execute();
                
                if ($result) {
                    echo api_response(true, null, 'Booking cancelled successfully');
                } else {
                    echo api_response(false, null, 'Failed to cancel booking');
                }
            } else {
                echo api_response(false, null, 'Invalid or expired session token');
            }
        } else {
            echo api_response(false, null, 'Method not allowed');
        }
        break;
    
    // Add vehicle endpoint
    case 'add_vehicle':
        if ($method === 'POST') {
            // Validate session token
            if (!isset($json_body['token']) || empty($json_body['token'])) {
                echo api_response(false, null, 'Session token is required');
                exit;
            }
            
            $token = sanitize_input($json_body['token']);
            
            // Check token in client_access table
            $query = "SELECT ca.mobile, ca.customer_id FROM client_access ca 
                     WHERE ca.session_token = ? AND ca.token_expiry > NOW()";
            
            $stmt = $mysqli->prepare($query);
            $stmt->bind_param("s", $token);
            $stmt->execute();
            $result = $stmt->get_result();
            
            if ($result->num_rows > 0) {
                $access = $result->fetch_assoc();
                $customer_id = $access['customer_id'];
                
                // Validate vehicle data
                if (!isset($json_body['make']) || empty($json_body['make']) ||
                    !isset($json_body['model']) || empty($json_body['model']) ||
                    !isset($json_body['year']) || empty($json_body['year']) ||
                    !isset($json_body['plate_number']) || empty($json_body['plate_number'])) {
                    
                    echo api_response(false, null, 'Make, model, year, and plate number are required');
                    exit;
                }
                
                $make = sanitize_input($json_body['make']);
                $model = sanitize_input($json_body['model']);
                $year = (int) $json_body['year'];
                $plate_number = sanitize_input($json_body['plate_number']);
                $color = isset($json_body['color']) ? sanitize_input($json_body['color']) : '';
                $vin = isset($json_body['vin']) ? sanitize_input($json_body['vin']) : '';
                
                // Check if plate number already exists
                $query = "SELECT * FROM vehicles WHERE plate_number = ? AND customer_id != ?";
                $stmt = $mysqli->prepare($query);
                $stmt->bind_param("si", $plate_number, $customer_id);
                $stmt->execute();
                $result = $stmt->get_result();
                
                if ($result->num_rows > 0) {
                    echo api_response(false, null, 'Plate number already exists');
                    exit;
                }
                
                // Add vehicle
                $query = "INSERT INTO vehicles 
                         (customer_id, make, model, year, plate_number, color, vin, created_at) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())";
                
                $stmt = $mysqli->prepare($query);
                $stmt->bind_param("ississs", $customer_id, $make, $model, $year, $plate_number, $color, $vin);
                $result = $stmt->execute();
                
                if ($result) {
                    $vehicle_id = $mysqli->insert_id;
                    
                    // Get vehicle details
                    $vehicle = get_vehicle_by_id($vehicle_id);
                    
                    echo api_response(true, [
                        'vehicle' => $vehicle
                    ], 'Vehicle added successfully');
                } else {
                    echo api_response(false, null, 'Failed to add vehicle');
                }
            } else {
                echo api_response(false, null, 'Invalid or expired session token');
            }
        } else {
            echo api_response(false, null, 'Method not allowed');
        }
        break;
    
    // Update vehicle endpoint
    case 'update_vehicle':
        if ($method === 'POST') {
            // Validate session token
            if (!isset($json_body['token']) || empty($json_body['token']) ||
                !isset($json_body['vehicle_id']) || empty($json_body['vehicle_id'])) {
                echo api_response(false, null, 'Session token and vehicle ID are required');
                exit;
            }
            
            $token = sanitize_input($json_body['token']);
            $vehicle_id = (int) $json_body['vehicle_id'];
            
            // Check token in client_access table
            $query = "SELECT ca.mobile, ca.customer_id FROM client_access ca 
                     WHERE ca.session_token = ? AND ca.token_expiry > NOW()";
            
            $stmt = $mysqli->prepare($query);
            $stmt->bind_param("s", $token);
            $stmt->execute();
            $result = $stmt->get_result();
            
            if ($result->num_rows > 0) {
                $access = $result->fetch_assoc();
                $customer_id = $access['customer_id'];
                
                // Verify vehicle belongs to customer
                $query = "SELECT * FROM vehicles WHERE id = ? AND customer_id = ?";
                $stmt = $mysqli->prepare($query);
                $stmt->bind_param("ii", $vehicle_id, $customer_id);
                $stmt->execute();
                $result = $stmt->get_result();
                
                if ($result->num_rows === 0) {
                    echo api_response(false, null, 'Vehicle not found or does not belong to customer');
                    exit;
                }
                
                $vehicle = $result->fetch_assoc();
                
                // Update vehicle data
                $make = isset($json_body['make']) ? sanitize_input($json_body['make']) : $vehicle['make'];
                $model = isset($json_body['model']) ? sanitize_input($json_body['model']) : $vehicle['model'];
                $year = isset($json_body['year']) ? (int) $json_body['year'] : $vehicle['year'];
                $plate_number = isset($json_body['plate_number']) ? sanitize_input($json_body['plate_number']) : $vehicle['plate_number'];
                $color = isset($json_body['color']) ? sanitize_input($json_body['color']) : $vehicle['color'];
                $vin = isset($json_body['vin']) ? sanitize_input($json_body['vin']) : $vehicle['vin'];
                
                // Check if plate number already exists (if changed)
                if ($plate_number !== $vehicle['plate_number']) {
                    $query = "SELECT * FROM vehicles WHERE plate_number = ? AND id != ?";
                    $stmt = $mysqli->prepare($query);
                    $stmt->bind_param("si", $plate_number, $vehicle_id);
                    $stmt->execute();
                    $result = $stmt->get_result();
                    
                    if ($result->num_rows > 0) {
                        echo api_response(false, null, 'Plate number already exists');
                        exit;
                    }
                }
                
                // Update vehicle
                $query = "UPDATE vehicles SET 
                         make = ?, model = ?, year = ?, plate_number = ?, 
                         color = ?, vin = ?, updated_at = NOW() 
                         WHERE id = ?";
                
                $stmt = $mysqli->prepare($query);
                $stmt->bind_param("ssisssi", $make, $model, $year, $plate_number, $color, $vin, $vehicle_id);
                $result = $stmt->execute();
                
                if ($result) {
                    // Get updated vehicle details
                    $vehicle = get_vehicle_by_id($vehicle_id);
                    
                    echo api_response(true, [
                        'vehicle' => $vehicle
                    ], 'Vehicle updated successfully');
                } else {
                    echo api_response(false, null, 'Failed to update vehicle');
                }
            } else {
                echo api_response(false, null, 'Invalid or expired session token');
            }
        } else {
            echo api_response(false, null, 'Method not allowed');
        }
        break;
    
    // Update customer profile endpoint
    case 'update_profile':
        if ($method === 'POST') {
            // Validate session token
            if (!isset($json_body['token']) || empty($json_body['token'])) {
                echo api_response(false, null, 'Session token is required');
                exit;
            }
            
            $token = sanitize_input($json_body['token']);
            
            // Check token in client_access table
            $query = "SELECT ca.mobile, ca.customer_id FROM client_access ca 
                     WHERE ca.session_token = ? AND ca.token_expiry > NOW()";
            
            $stmt = $mysqli->prepare($query);
            $stmt->bind_param("s", $token);
            $stmt->execute();
            $result = $stmt->get_result();
            
            if ($result->num_rows > 0) {
                $access = $result->fetch_assoc();
                $customer_id = $access['customer_id'];
                
                // Get current customer data
                $customer = get_customer_by_id($customer_id);
                
                if (!$customer) {
                    echo api_response(false, null, 'Customer not found');
                    exit;
                }
                
                // Update customer data
                $first_name = isset($json_body['first_name']) ? sanitize_input($json_body['first_name']) : $customer['first_name'];
                $last_name = isset($json_body['last_name']) ? sanitize_input($json_body['last_name']) : $customer['last_name'];
                $email = isset($json_body['email']) ? sanitize_input($json_body['email']) : $customer['email'];
                $address = isset($json_body['address']) ? sanitize_input($json_body['address']) : $customer['address'];
                $city = isset($json_body['city']) ? sanitize_input($json_body['city']) : $customer['city'];
                $state = isset($json_body['state']) ? sanitize_input($json_body['state']) : $customer['state'];
                $zip = isset($json_body['zip']) ? sanitize_input($json_body['zip']) : $customer['zip'];
                
                // Update customer
                $query = "UPDATE customers SET 
                         first_name = ?, last_name = ?, email = ?, 
                         address = ?, city = ?, state = ?, zip = ?, 
                         updated_at = NOW() 
                         WHERE id = ?";
                
                $stmt = $mysqli->prepare($query);
                $stmt->bind_param("sssssssi", $first_name, $last_name, $email, 
                                 $address, $city, $state, $zip, $customer_id);
                $result = $stmt->execute();
                
                if ($result) {
                    // Get updated customer details
                    $customer = get_customer_by_id($customer_id);
                    
                    echo api_response(true, [
                        'customer' => $customer
                    ], 'Profile updated successfully');
                } else {
                    echo api_response(false, null, 'Failed to update profile');
                }
            } else {
                echo api_response(false, null, 'Invalid or expired session token');
            }
        } else {
            echo api_response(false, null, 'Method not allowed');
        }
        break;
    
    // Logout endpoint
    case 'logout':
        if ($method === 'POST') {
            // Validate session token
            if (!isset($json_body['token']) || empty($json_body['token'])) {
                echo api_response(false, null, 'Session token is required');
                exit;
            }
            
            $token = sanitize_input($json_body['token']);
            
            // Update client_access to invalidate token
            $query = "UPDATE client_access SET 
                     session_token = NULL, 
                     token_expiry = NULL, 
                     last_logout = NOW() 
                     WHERE session_token = ?";
            
            $stmt = $mysqli->prepare($query);
            $stmt->bind_param("s", $token);
            $result = $stmt->execute();
            
            if ($result) {
                echo api_response(true, null, 'Logged out successfully');
            } else {
                echo api_response(false, null, 'Failed to logout');
            }
        } else {
            echo api_response(false, null, 'Method not allowed');
        }
        break;
    
    // Default case - endpoint not found
    default:
        echo api_response(false, null, 'Endpoint not found');
        break;
}
?>