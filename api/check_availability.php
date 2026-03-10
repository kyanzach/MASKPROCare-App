<?php
// Set timezone to Asia/Manila
date_default_timezone_set('Asia/Manila');

// Include database configuration
require_once('../db_connect.php');
require_once('../config.php');

// Set content type to JSON
header('Content-Type: application/json');

// Check if user is logged in
$isLoggedIn = isset($_SESSION['customer_id']) && !empty($_SESSION['customer_id']);
if (!$isLoggedIn) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

// Default service capacity limits (fallback if no DB record)
$defaultCapacity = [
    'Nano Ceramic Coating' => 4,
    'Nano Ceramic Tint' => 4,
    'Nano Fix (Maintenance)' => 5,
    'Go & Clean' => 2,
    'PPF' => 1,
    'Auto Paint & Repair' => 1
];

// Load branch-specific capacity from database
function getServiceCapacity($conn, $branch_id, $defaults) {
    $capacity = $defaults;
    
    if ($branch_id > 0) {
        $stmt = $conn->prepare("SELECT service_name, max_capacity FROM branch_booking_capacity WHERE branch_id = ?");
        if ($stmt) {
            $stmt->bind_param("i", $branch_id);
            $stmt->execute();
            $result = $stmt->get_result();
            while ($row = $result->fetch_assoc()) {
                $capacity[$row['service_name']] = (int)$row['max_capacity'];
            }
            $stmt->close();
        }
    }
    
    return $capacity;
}

// Get customer's branch_id from session
$customerBranchId = $_SESSION['customer_branch_id'] ?? DEFAULT_BRANCH_ID;
$serviceCapacity = getServiceCapacity($conn, $customerBranchId, $defaultCapacity);

// Time slots available (8 AM to 3 PM only)
$timeSlots = [
    '08:00' => '8:00 AM',
    '09:00' => '9:00 AM',
    '10:00' => '10:00 AM',
    '11:00' => '11:00 AM',
    '13:00' => '1:00 PM',
    '14:00' => '2:00 PM',
    '15:00' => '3:00 PM'
];

try {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        $service = $input['service'] ?? '';
        $action = $input['action'] ?? '';
        
        if ($action === 'get_available_dates') {
            // Get available dates for the next 365 days (1 year)
            $availableDates = [];
            $startDate = new DateTime();
            $endDate = new DateTime('+365 days');
            
            while ($startDate <= $endDate) {
                $dateStr = $startDate->format('Y-m-d');
                
                // Skip Sundays only (day 7) - business operates Monday to Saturday
                if ($startDate->format('N') == 7) {
                    $startDate->add(new DateInterval('P1D'));
                    continue;
                }
                
                // Check if this date is available for the service
                $isAvailable = checkDateAvailability($conn, $service, $dateStr, $serviceCapacity);
                
                $availableDates[] = [
                    'date' => $dateStr,
                    'formatted' => $startDate->format('M j, Y'),
                    'available' => $isAvailable
                ];
                
                $startDate->add(new DateInterval('P1D'));
            }
            
            echo json_encode([
                'success' => true,
                'dates' => $availableDates,
                'capacity' => $serviceCapacity[$service] ?? 0
            ]);
            
        } elseif ($action === 'get_available_times') {
            $date = $input['date'] ?? '';
            
            if (empty($date)) {
                echo json_encode(['error' => 'Date is required']);
                exit;
            }
            
            // Get available time slots for the specific date and service
            $availableTimes = [];
            foreach ($timeSlots as $time => $label) {
                $isAvailable = checkTimeAvailability($conn, $service, $date, $time, $serviceCapacity);
                $availableTimes[] = [
                    'time' => $time,
                    'label' => $label,
                    'available' => $isAvailable
                ];
            }
            
            echo json_encode([
                'success' => true,
                'times' => $availableTimes
            ]);
        } else {
            echo json_encode(['error' => 'Invalid action']);
        }
    } else {
        echo json_encode(['error' => 'Invalid request method']);
    }
} catch (Exception $e) {
    error_log("Availability check error: " . $e->getMessage());
    echo json_encode(['error' => 'Server error occurred']);
}

function checkDateAvailability($conn, $service, $date, $serviceCapacity) {
    try {
        // Count confirmed bookings for this service on this date
        $stmt = $conn->prepare("
            SELECT COUNT(*) as booking_count 
            FROM bookings b 
            LEFT JOIN bookings_service_types bst ON b.booking_id = bst.booking_id 
            WHERE DATE(b.booking_date) = ? 
            AND (b.latest_service = ? OR bst.service_name = ?)
            AND NOT (b.notes LIKE '%CANCELLED:%' OR bst.status = 'Cancelled')
        ");
        $stmt->bind_param("sss", $date, $service, $service);
        $stmt->execute();
        $result = $stmt->get_result();
        $row = $result->fetch_assoc();
        $stmt->close();
        
        $confirmedBookings = $row['booking_count'] ?? 0;
        
        // Count pending booking requests for this service on this date
        $stmt = $conn->prepare("
            SELECT COUNT(*) as request_count 
            FROM booking_requests br
            LEFT JOIN booking_request_services brs ON br.request_id = brs.request_id
            WHERE DATE(br.booking_date) = ? 
            AND (br.latest_service = ? OR brs.service_name = ?)
            AND br.status = 'pending'
        ");
        $stmt->bind_param("sss", $date, $service, $service);
        $stmt->execute();
        $result = $stmt->get_result();
        $row = $result->fetch_assoc();
        $stmt->close();
        
        $pendingRequests = $row['request_count'] ?? 0;
        
        // Total bookings = confirmed + pending
        $totalBookings = $confirmedBookings + $pendingRequests;
        $maxCapacity = $serviceCapacity[$service] ?? 0;
        
        return $totalBookings < $maxCapacity;
    } catch (Exception $e) {
        error_log("Error checking date availability: " . $e->getMessage());
        return false;
    }
}

function checkTimeAvailability($conn, $service, $date, $time, $serviceCapacity) {
    try {
        // Count bookings for this service on this specific date and time
        $datetime = $date . ' ' . $time . ':00';
        
        $stmt = $conn->prepare("
            SELECT COUNT(*) as booking_count 
            FROM bookings b 
            LEFT JOIN bookings_service_types bst ON b.booking_id = bst.booking_id 
            WHERE b.booking_date = ? 
            AND (b.latest_service = ? OR bst.service_name = ?)
            AND NOT (b.notes LIKE '%CANCELLED:%' OR bst.status = 'Cancelled')
        ");
        $stmt->bind_param("sss", $datetime, $service, $service);
        $stmt->execute();
        $result = $stmt->get_result();
        $row = $result->fetch_assoc();
        $stmt->close();
        
        $currentBookings = $row['booking_count'] ?? 0;
        
        // For time slots, we can allow multiple bookings up to capacity
        // But you might want to limit to 1 per time slot depending on your business model
        return $currentBookings < 1; // Change this if you allow multiple bookings per time slot
    } catch (Exception $e) {
        error_log("Error checking time availability: " . $e->getMessage());
        return false;
    }
}
?>