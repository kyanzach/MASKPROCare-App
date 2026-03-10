<?php
/**
 * Booking Capacity Helper Functions
 * Manages booking capacity limits per service type
 * Supports branch-specific capacity from database
 */

// Define default capacity limits per service type (fallback)
define('CAPACITY_LIMITS', [
    'Nano Ceramic Coating' => 4,
    'Nano Ceramic Tint' => 4,
    'Nano Fix (Maintenance)' => 5,
    'Auto Paint & Repair' => 1,
    'PPF' => 1,
    'Paint Protection Film (PPF)' => 1
]);

/**
 * Get capacity limit for a specific service and branch
 * Queries branch_booking_capacity table, falls back to CAPACITY_LIMITS
 */
function getBranchServiceCapacity($conn, $serviceName, $branch_id = null) {
    // Normalize service name for PPF
    if (stripos($serviceName, 'PPF') !== false || stripos($serviceName, 'Paint Protection Film') !== false) {
        $serviceName = 'PPF';
    }
    
    // Try to get from database if branch_id is available
    if ($branch_id && $branch_id > 0) {
        $stmt = $conn->prepare("SELECT max_capacity FROM branch_booking_capacity WHERE branch_id = ? AND service_name = ?");
        if ($stmt) {
            $stmt->bind_param("is", $branch_id, $serviceName);
            $stmt->execute();
            $result = $stmt->get_result();
            $row = $result->fetch_assoc();
            $stmt->close();
            
            if ($row) {
                return (int)$row['max_capacity'];
            }
        }
    }
    
    // Fallback to hardcoded defaults
    $capacityLimits = CAPACITY_LIMITS;
    return $capacityLimits[$serviceName] ?? 10;
}

/**
 * Get available slots for a specific date and service
 * 
 * @param mysqli $conn Database connection
 * @param string $date Date in Y-m-d format
 * @param string $serviceName Service name
 * @param int|null $branch_id Branch ID for branch-specific capacity and booking counts
 * @return int Number of available slots
 */
function getAvailableSlots($conn, $date, $serviceName, $branch_id = null) {
    // Get capacity limit (branch-specific or default)
    $limit = getBranchServiceCapacity($conn, $serviceName, $branch_id);
    
    // Normalize service name for PPF
    $normalizedService = $serviceName;
    if (stripos($serviceName, 'PPF') !== false || stripos($serviceName, 'Paint Protection Film') !== false) {
        $normalizedService = 'PPF';
    }
    
    // Count existing confirmed bookings for this date, service AND branch
    $query = "SELECT COUNT(*) as count 
              FROM bookings b
              JOIN bookings_service_types bst ON b.booking_id = bst.booking_id
              WHERE DATE(b.booking_date) = ? 
              AND (bst.service_name = ? OR bst.service_name LIKE ?)
              AND (b.notes IS NULL OR b.notes NOT LIKE '%CANCELLED:%')
              AND (bst.status IS NULL OR bst.status != 'Cancelled')";
    
    // Add branch filter if available
    if ($branch_id && $branch_id > 0) {
        $query .= " AND b.branch_id = ?";
        $stmt = $conn->prepare($query);
        $likePattern = "%{$normalizedService}%";
        $stmt->bind_param("sssi", $date, $normalizedService, $likePattern, $branch_id);
    } else {
        $stmt = $conn->prepare($query);
        $likePattern = "%{$normalizedService}%";
        $stmt->bind_param("sss", $date, $normalizedService, $likePattern);
    }
    $stmt->execute();
    $result = $stmt->get_result()->fetch_assoc();
    $confirmedCount = $result['count'];
    $stmt->close();
    
    // Count pending booking requests for this date, service AND branch
    $requestQuery = "SELECT COUNT(*) as count 
                     FROM booking_requests br
                     JOIN booking_request_services brs ON br.request_id = brs.request_id
                     WHERE DATE(br.booking_date) = ? 
                     AND (brs.service_name = ? OR brs.service_name LIKE ?)
                     AND br.status = 'pending'";
    
    if ($branch_id && $branch_id > 0) {
        $requestQuery .= " AND br.branch_id = ?";
        $stmt = $conn->prepare($requestQuery);
        $stmt->bind_param("sssi", $date, $normalizedService, $likePattern, $branch_id);
    } else {
        $stmt = $conn->prepare($requestQuery);
        $stmt->bind_param("sss", $date, $normalizedService, $likePattern);
    }
    $stmt->execute();
    $result = $stmt->get_result()->fetch_assoc();
    $pendingCount = $result['count'];
    $stmt->close();
    
    // Calculate available slots
    $totalBooked = $confirmedCount + $pendingCount;
    $available = $limit - $totalBooked;
    
    return max(0, $available); // Return 0 if negative
}

/**
 * Check if a date is fully booked for any of the selected services
 * 
 * @param mysqli $conn Database connection
 * @param string $date Date in Y-m-d format
 * @param array $services Array of service names
 * @return array Array with 'available' (bool) and 'message' (string)
 */
function checkDateAvailability($conn, $date, $services) {
    $unavailableServices = [];
    
    foreach ($services as $service) {
        $available = getAvailableSlots($conn, $date, $service);
        if ($available <= 0) {
            $unavailableServices[] = $service;
        }
    }
    
    if (!empty($unavailableServices)) {
        return [
            'available' => false,
            'message' => 'The following services are fully booked on this date: ' . implode(', ', $unavailableServices)
        ];
    }
    
    return [
        'available' => true,
        'message' => 'Date is available for all selected services'
    ];
}

/**
 * Get capacity status for a specific date
 * Returns array of services with their availability
 * 
 * @param mysqli $conn Database connection
 * @param string $date Date in Y-m-d format
 * @return array Array of services with capacity info
 */
function getDateCapacityStatus($conn, $date) {
    $capacityLimits = CAPACITY_LIMITS;
    $status = [];
    
    foreach ($capacityLimits as $service => $limit) {
        $available = getAvailableSlots($conn, $date, $service);
        $status[$service] = [
            'limit' => $limit,
            'available' => $available,
            'booked' => $limit - $available,
            'is_full' => $available <= 0
        ];
    }
    
    return $status;
}

/**
 * Get all fully booked dates within a date range
 * 
 * @param mysqli $conn Database connection
 * @param string $startDate Start date in Y-m-d format
 * @param string $endDate End date in Y-m-d format
 * @param string $serviceName Service name to check
 * @return array Array of fully booked dates
 */
function getFullyBookedDates($conn, $startDate, $endDate, $serviceName) {
    $fullyBooked = [];
    $current = strtotime($startDate);
    $end = strtotime($endDate);
    
    while ($current <= $end) {
        $date = date('Y-m-d', $current);
        $available = getAvailableSlots($conn, $date, $serviceName);
        
        if ($available <= 0) {
            $fullyBooked[] = $date;
        }
        
        $current = strtotime('+1 day', $current);
    }
    
    return $fullyBooked;
}
?>
