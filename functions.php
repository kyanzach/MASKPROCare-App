<?php
// Common utility functions for nanofix-maintenance app

// Include database configuration
require_once 'db_connect.php';

/**
 * Get customer data by ID
 * 
 * @param int $customer_id The customer ID
 * @return array|null Customer data or null if not found
 */
function get_customer_by_id($customer_id) {
    global $mysqli;
    
    $customer_id = (int) $customer_id;
    $query = "SELECT * FROM customers WHERE id = ?";
    
    $stmt = $mysqli->prepare($query);
    $stmt->bind_param("i", $customer_id);
    $stmt->execute();
    
    $result = $stmt->get_result();
    
    if ($result->num_rows > 0) {
        return $result->fetch_assoc();
    }
    
    return null;
}

/**
 * Get customer vehicles
 * 
 * @param int $customer_id The customer ID
 * @return array Array of vehicles
 */
function get_customer_vehicles($customer_id) {
    global $mysqli;
    
    $customer_id = (int) $customer_id;
    $query = "SELECT * FROM vehicles WHERE customer_id = ? ORDER BY created_at DESC";
    
    $stmt = $mysqli->prepare($query);
    $stmt->bind_param("i", $customer_id);
    $stmt->execute();
    
    $result = $stmt->get_result();
    $vehicles = [];
    
    while ($row = $result->fetch_assoc()) {
        $vehicles[] = $row;
    }
    
    return $vehicles;
}

/**
 * Get customer bookings
 * 
 * @param int $customer_id The customer ID
 * @param string $status Optional status filter
 * @return array Array of bookings
 */
function get_customer_bookings($customer_id, $status = null) {
    global $mysqli;
    
    $customer_id = (int) $customer_id;
    
    if ($status) {
        $query = "SELECT b.*, v.make, v.model, v.plate_number, v.color, 
                 bst.name as service_type_name 
                 FROM bookings b 
                 JOIN vehicles v ON b.vehicle_id = v.id 
                 JOIN bookings_service_types bst ON b.service_type_id = bst.id 
                 WHERE b.customer_id = ? AND b.status = ? 
                 ORDER BY b.scheduled_date DESC, b.scheduled_time DESC";
        
        $stmt = $mysqli->prepare($query);
        $stmt->bind_param("is", $customer_id, $status);
    } else {
        $query = "SELECT b.*, v.make, v.model, v.plate_number, v.color, 
                 bst.name as service_type_name 
                 FROM bookings b 
                 JOIN vehicles v ON b.vehicle_id = v.id 
                 JOIN bookings_service_types bst ON b.service_type_id = bst.id 
                 WHERE b.customer_id = ? 
                 ORDER BY b.scheduled_date DESC, b.scheduled_time DESC";
        
        $stmt = $mysqli->prepare($query);
        $stmt->bind_param("i", $customer_id);
    }
    
    $stmt->execute();
    
    $result = $stmt->get_result();
    $bookings = [];
    
    while ($row = $result->fetch_assoc()) {
        $bookings[] = $row;
    }
    
    return $bookings;
}

/**
 * Get booking by ID
 * 
 * @param int $booking_id The booking ID
 * @return array|null Booking data or null if not found
 */
function get_booking_by_id($booking_id) {
    global $mysqli;
    
    $booking_id = (int) $booking_id;
    $query = "SELECT b.*, v.make, v.model, v.plate_number, v.color, v.year, 
             bst.name as service_type_name, bst.description as service_type_description 
             FROM bookings b 
             JOIN vehicles v ON b.vehicle_id = v.id 
             JOIN bookings_service_types bst ON b.service_type_id = bst.id 
             WHERE b.id = ?";
    
    $stmt = $mysqli->prepare($query);
    $stmt->bind_param("i", $booking_id);
    $stmt->execute();
    
    $result = $stmt->get_result();
    
    if ($result->num_rows > 0) {
        return $result->fetch_assoc();
    }
    
    return null;
}

/**
 * Get vehicle by ID
 * 
 * @param int $vehicle_id The vehicle ID
 * @return array|null Vehicle data or null if not found
 */
function get_vehicle_by_id($vehicle_id) {
    global $mysqli;
    
    $vehicle_id = (int) $vehicle_id;
    $query = "SELECT * FROM vehicles WHERE id = ?";
    
    $stmt = $mysqli->prepare($query);
    $stmt->bind_param("i", $vehicle_id);
    $stmt->execute();
    
    $result = $stmt->get_result();
    
    if ($result->num_rows > 0) {
        return $result->fetch_assoc();
    }
    
    return null;
}

/**
 * Get vehicle service history
 * 
 * @param int $vehicle_id The vehicle ID
 * @return array Array of service bookings
 */
function get_vehicle_service_history($vehicle_id) {
    global $mysqli;
    
    $vehicle_id = (int) $vehicle_id;
    $query = "SELECT b.*, bst.name as service_type_name 
             FROM bookings b 
             JOIN bookings_service_types bst ON b.service_type_id = bst.id 
             WHERE b.vehicle_id = ? 
             ORDER BY b.scheduled_date DESC, b.scheduled_time DESC";
    
    $stmt = $mysqli->prepare($query);
    $stmt->bind_param("i", $vehicle_id);
    $stmt->execute();
    
    $result = $stmt->get_result();
    $history = [];
    
    while ($row = $result->fetch_assoc()) {
        $history[] = $row;
    }
    
    return $history;
}

/**
 * Get all service types
 * 
 * @return array Array of service types
 */
function get_service_types() {
    global $mysqli;
    
    $query = "SELECT * FROM bookings_service_types WHERE is_active = 1 ORDER BY name";
    $result = $mysqli->query($query);
    
    $service_types = [];
    
    while ($row = $result->fetch_assoc()) {
        $service_types[] = $row;
    }
    
    return $service_types;
}

/**
 * Get available booking slots for a date
 * 
 * @param string $date Date in Y-m-d format
 * @param int $branch_id Branch ID
 * @return array Available time slots
 */
function get_available_booking_slots($date, $branch_id = 1) {
    global $mysqli;
    
    // Default time slots (9 AM to 5 PM, hourly)
    $default_slots = [
        '09:00:00' => true,
        '10:00:00' => true,
        '11:00:00' => true,
        '13:00:00' => true, // Skip 12 PM for lunch
        '14:00:00' => true,
        '15:00:00' => true,
        '16:00:00' => true
    ];
    
    // Get booked slots for the date
    $query = "SELECT scheduled_time FROM bookings 
             WHERE scheduled_date = ? AND branch_id = ? 
             AND status IN ('pending', 'confirmed')";
    
    $stmt = $mysqli->prepare($query);
    $stmt->bind_param("si", $date, $branch_id);
    $stmt->execute();
    
    $result = $stmt->get_result();
    
    // Mark booked slots as unavailable
    while ($row = $result->fetch_assoc()) {
        if (isset($default_slots[$row['scheduled_time']])) {
            $default_slots[$row['scheduled_time']] = false;
        }
    }
    
    // Filter to only available slots
    $available_slots = [];
    foreach ($default_slots as $time => $available) {
        if ($available) {
            $available_slots[] = $time;
        }
    }
    
    return $available_slots;
}

/**
 * Format date for display
 * 
 * @param string $date Date in Y-m-d format
 * @return string Formatted date (e.g., January 1, 2023)
 */
function format_date($date) {
    return date('F j, Y', strtotime($date));
}

/**
 * Format time for display
 * 
 * @param string $time Time in H:i:s format
 * @return string Formatted time (e.g., 9:00 AM)
 */
function format_time($time) {
    return date('g:i A', strtotime($time));
}

/**
 * Check if a vehicle is due for service
 * 
 * @param array $vehicle Vehicle data
 * @return bool True if vehicle is due for service
 */
function is_vehicle_due_for_service($vehicle) {
    global $mysqli;
    
    // Get last service date
    $query = "SELECT scheduled_date FROM bookings 
             WHERE vehicle_id = ? AND status = 'completed' 
             ORDER BY scheduled_date DESC LIMIT 1";
    
    $stmt = $mysqli->prepare($query);
    $stmt->bind_param("i", $vehicle['id']);
    $stmt->execute();
    
    $result = $stmt->get_result();
    
    if ($result->num_rows > 0) {
        $last_service = $result->fetch_assoc()['scheduled_date'];
        $last_service_time = strtotime($last_service);
        
        // If last service was more than 3 months ago, vehicle is due for service
        $three_months_ago = strtotime('-3 months');
        
        return $last_service_time < $three_months_ago;
    } else {
        // If no service record, check vehicle creation date
        $created_at = strtotime($vehicle['created_at']);
        $three_months_ago = strtotime('-3 months');
        
        return $created_at < $three_months_ago;
    }
}

/**
 * Get vehicle service status
 * 
 * @param array $vehicle Vehicle data
 * @return string Status (Overdue, Due Soon, Up to Date)
 */
function get_vehicle_service_status($vehicle) {
    global $mysqli;
    
    // Get last service date
    $query = "SELECT scheduled_date FROM bookings 
             WHERE vehicle_id = ? AND status = 'completed' 
             ORDER BY scheduled_date DESC LIMIT 1";
    
    $stmt = $mysqli->prepare($query);
    $stmt->bind_param("i", $vehicle['id']);
    $stmt->execute();
    
    $result = $stmt->get_result();
    
    if ($result->num_rows > 0) {
        $last_service = $result->fetch_assoc()['scheduled_date'];
        $last_service_time = strtotime($last_service);
        
        $three_months_ago = strtotime('-3 months');
        $two_months_ago = strtotime('-2 months');
        
        if ($last_service_time < $three_months_ago) {
            return 'Overdue';
        } elseif ($last_service_time < $two_months_ago) {
            return 'Due Soon';
        } else {
            return 'Up to Date';
        }
    } else {
        // If no service record, check vehicle creation date
        $created_at = strtotime($vehicle['created_at']);
        $three_months_ago = strtotime('-3 months');
        $two_months_ago = strtotime('-2 months');
        
        if ($created_at < $three_months_ago) {
            return 'Overdue';
        } elseif ($created_at < $two_months_ago) {
            return 'Due Soon';
        } else {
            return 'Up to Date';
        }
    }
}

/**
 * Get customer statistics
 * 
 * @param int $customer_id The customer ID
 * @return array Statistics data
 */
function get_customer_stats($customer_id) {
    global $mysqli;
    
    $customer_id = (int) $customer_id;
    
    // Total vehicles
    $query = "SELECT COUNT(*) as total FROM vehicles WHERE customer_id = ?";
    $stmt = $mysqli->prepare($query);
    $stmt->bind_param("i", $customer_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $total_vehicles = $result->fetch_assoc()['total'];
    
    // Total bookings
    $query = "SELECT COUNT(*) as total FROM bookings WHERE customer_id = ?";
    $stmt = $mysqli->prepare($query);
    $stmt->bind_param("i", $customer_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $total_bookings = $result->fetch_assoc()['total'];
    
    // Completed services
    $query = "SELECT COUNT(*) as total FROM bookings WHERE customer_id = ? AND status = 'completed'";
    $stmt = $mysqli->prepare($query);
    $stmt->bind_param("i", $customer_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $completed_services = $result->fetch_assoc()['total'];
    
    // Vehicles needing service
    $vehicles_needing_service = 0;
    $vehicles = get_customer_vehicles($customer_id);
    
    foreach ($vehicles as $vehicle) {
        if (is_vehicle_due_for_service($vehicle)) {
            $vehicles_needing_service++;
        }
    }
    
    return [
        'total_vehicles' => $total_vehicles,
        'total_bookings' => $total_bookings,
        'completed_services' => $completed_services,
        'vehicles_needing_service' => $vehicles_needing_service
    ];
}

/**
 * Check if user is logged in
 * 
 * @return bool True if user is logged in
 */
function is_logged_in() {
    return isset($_SESSION['customer_id']) && !empty($_SESSION['customer_id']);
}

/**
 * Redirect to login page if not logged in
 */
function redirect_if_not_logged_in() {
    if (!is_logged_in()) {
        header('Location: login.php');
        exit;
    }
}

/**
 * Redirect to dashboard if already logged in
 */
function redirect_if_logged_in() {
    if (is_logged_in()) {
        header('Location: index.php');
        exit;
    }
}

/**
 * Get active page for navigation highlighting
 * 
 * @return string Current page name
 */
function get_active_page() {
    $current_file = basename($_SERVER['PHP_SELF']);
    
    switch ($current_file) {
        case 'index.php':
            return 'dashboard';
        case 'vehicles.php':
        case 'vehicle_details.php':
            return 'vehicles';
        case 'bookings.php':
        case 'booking_details.php':
            return 'bookings';
        case 'profile.php':
            return 'profile';
        default:
            return '';
    }
}

/**
 * Standardize mobile number format
 * 
 * @param string $mobile The mobile number to standardize
 * @return string Standardized mobile number with +63 prefix
 */
function standardize_mobile_number($mobile) {
    // Remove any non-digit characters
    $mobile = preg_replace('/[^0-9]/', '', $mobile);
    
    // Check if it starts with 63 (12 digits)
    if (substr($mobile, 0, 2) === '63' && strlen($mobile) === 12) {
        return '+' . $mobile;
    }
    // Check if it starts with 0 (11 digits)
    else if (substr($mobile, 0, 1) === '0' && strlen($mobile) === 11) {
        return '+63' . substr($mobile, 1);
    }
    // Check if it starts with 9 (10 digits)
    else if (substr($mobile, 0, 1) === '9' && strlen($mobile) === 10) {
        return '+63' . $mobile;
    }
    // Return original if no pattern matches
    return $mobile;
}

/**
 * Get the last 10 digits of a mobile number for comparison
 * 
 * @param string $mobile The mobile number
 * @return string Last 10 digits of the mobile number
 */
function get_last_10_digits($mobile) {
    $mobile = preg_replace('/[^0-9]/', '', $mobile);
    return substr($mobile, -10);
}
?>