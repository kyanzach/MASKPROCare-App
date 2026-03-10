<?php
/**
 * POST /api/v2/bookings/availability
 * 
 * Check booking availability for a given service and date.
 * Mirrors Unify app's bookings_create.php logic:
 *   - Capacity from branch_booking_capacity WHERE branch_id = ?
 *   - Booking counts from bookings WHERE branch_id = ?
 * 
 * Request body: 
 *   { "action": "get_available_dates", "service": "Nano Ceramic Coating" }
 *   { "action": "get_available_times", "service": "Nano Ceramic Coating", "date": "2026-03-15" }
 */

require_once __DIR__ . '/../middleware/auth.php';
require_method('POST');

// Get the customer's branch_id from their profile (not just JWT — confirm from DB)
$customerBranchId = $authBranchId; // from JWT
try {
    $stmt = $conn->prepare("SELECT branch_id FROM customers WHERE id = ?");
    $stmt->bind_param("i", $authCustomerId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if ($row && $row['branch_id']) {
        $customerBranchId = (int) $row['branch_id'];
    }
} catch (\Throwable $e) {
    // Fall through to JWT branch_id
}

// Load branch-specific capacity from database (same as Unify app)
function loadBranchCapacity($conn, $branchId) {
    $capacity = [];
    $stmt = $conn->prepare("SELECT service_name, max_capacity FROM branch_booking_capacity WHERE branch_id = ?");
    if ($stmt) {
        $stmt->bind_param("i", $branchId);
        $stmt->execute();
        $result = $stmt->get_result();
        while ($row = $result->fetch_assoc()) {
            $capacity[$row['service_name']] = (int) $row['max_capacity'];
        }
        $stmt->close();
    }
    return $capacity;
}

$serviceCapacity = loadBranchCapacity($conn, $customerBranchId);

// Time slots (8 AM to 3 PM)
$timeSlots = [
    '08:00' => '8:00 AM',
    '09:00' => '9:00 AM',
    '10:00' => '10:00 AM',
    '11:00' => '11:00 AM',
    '13:00' => '1:00 PM',
    '14:00' => '2:00 PM',
    '15:00' => '3:00 PM'
];

$body = get_json_body();
$service = trim($body['service'] ?? '');
$action = trim($body['action'] ?? '');

if (empty($service) || empty($action)) {
    api_error('Service and action are required', 422);
}

try {
    if ($action === 'get_available_dates') {
        $days = min(365, max(30, (int) ($body['days'] ?? 90)));
        $availableDates = [];
        $startDate = new DateTime();
        $endDate = new DateTime("+{$days} days");

        // Get all booking counts for this branch/service in the date range (bulk query like Unify)
        $monthStart = $startDate->format('Y-m-d');
        $monthEnd = $endDate->format('Y-m-d');
        
        $bookingCounts = getBookingCountsByDate($conn, $service, $monthStart, $monthEnd, $customerBranchId);
        $pendingCounts = getPendingCountsByDate($conn, $service, $monthStart, $monthEnd, $customerBranchId);

        while ($startDate <= $endDate) {
            $dateStr = $startDate->format('Y-m-d');

            // Skip Sundays (day 7 in ISO, 0 in PHP)
            if ($startDate->format('N') == 7) {
                $startDate->add(new DateInterval('P1D'));
                continue;
            }

            $booked = ($bookingCounts[$dateStr] ?? 0) + ($pendingCounts[$dateStr] ?? 0);
            $max = $serviceCapacity[$service] ?? 0;
            $isAvailable = $max > 0 ? ($booked < $max) : true;

            $availableDates[] = [
                'date' => $dateStr,
                'formatted' => $startDate->format('M j, Y'),
                'day' => $startDate->format('l'),
                'available' => $isAvailable,
                'booked' => $booked,
                'capacity' => $max,
            ];

            $startDate->add(new DateInterval('P1D'));
        }

        api_success([
            'dates' => $availableDates,
            'capacity' => $serviceCapacity[$service] ?? 0,
            'branch_id' => $customerBranchId,
        ], 'Available dates retrieved');

    } elseif ($action === 'get_available_times') {
        $date = trim($body['date'] ?? '');
        if (empty($date)) {
            api_error('Date is required', 422);
        }

        $availableTimes = [];
        foreach ($timeSlots as $time => $label) {
            $isAvailable = checkTimeAvail($conn, $service, $date, $time, $serviceCapacity, $customerBranchId);
            $availableTimes[] = [
                'time' => $time,
                'label' => $label,
                'available' => $isAvailable
            ];
        }

        api_success([
            'times' => $availableTimes
        ], 'Available times retrieved');

    } else {
        api_error('Invalid action. Use get_available_dates or get_available_times.', 422);
    }
} catch (Exception $e) {
    error_log("Availability check error: " . $e->getMessage());
    api_error('Server error checking availability', 500);
}

// --- Helper functions ---

/**
 * Bulk-fetch booking counts per date for a service + branch
 * Mirrors Unify's bookings_create.php lines 50-67
 */
function getBookingCountsByDate($conn, $service, $startDate, $endDate, $branchId) {
    $counts = [];
    try {
        $stmt = $conn->prepare("
            SELECT DATE(b.booking_date) as dt, COUNT(*) as cnt 
            FROM bookings b
            JOIN bookings_service_types bst ON bst.booking_id = b.booking_id
            WHERE b.branch_id = ? 
            AND b.booking_date >= ? AND b.booking_date < DATE_ADD(?, INTERVAL 1 DAY)
            AND bst.service_name = ?
            AND (b.notes IS NULL OR b.notes NOT LIKE '%CANCELLED:%')
            AND (bst.status IS NULL OR bst.status != 'Cancelled')
            GROUP BY dt
        ");
        $stmt->bind_param("isss", $branchId, $startDate, $endDate, $service);
        $stmt->execute();
        $result = $stmt->get_result();
        while ($row = $result->fetch_assoc()) {
            $counts[$row['dt']] = (int) $row['cnt'];
        }
        $stmt->close();
    } catch (\Throwable $e) {
        error_log("getBookingCountsByDate error: " . $e->getMessage());
    }
    return $counts;
}

/**
 * Bulk-fetch pending request counts per date for a service + branch
 */
function getPendingCountsByDate($conn, $service, $startDate, $endDate, $branchId) {
    $counts = [];
    try {
        $stmt = $conn->prepare("
            SELECT DATE(br.booking_date) as dt, COUNT(*) as cnt 
            FROM booking_requests br
            LEFT JOIN booking_request_services brs ON br.request_id = brs.request_id
            WHERE br.branch_id = ?
            AND br.booking_date >= ? AND br.booking_date < DATE_ADD(?, INTERVAL 1 DAY)
            AND (br.latest_service = ? OR brs.service_name = ?)
            AND br.status = 'pending'
            GROUP BY dt
        ");
        $stmt->bind_param("issss", $branchId, $startDate, $endDate, $service, $service);
        $stmt->execute();
        $result = $stmt->get_result();
        while ($row = $result->fetch_assoc()) {
            $counts[$row['dt']] = (int) $row['cnt'];
        }
        $stmt->close();
    } catch (\Throwable $e) {
        // booking_requests may not have branch_id column — silently continue
    }
    return $counts;
}

/**
 * Check if a specific time slot is available (branch-filtered)
 */
function checkTimeAvail($conn, $service, $date, $time, $serviceCapacity, $branchId) {
    try {
        $datetime = $date . ' ' . $time . ':00';
        $stmt = $conn->prepare("
            SELECT COUNT(*) as cnt FROM bookings b 
            JOIN bookings_service_types bst ON bst.booking_id = b.booking_id
            WHERE b.branch_id = ?
            AND b.booking_date = ? 
            AND bst.service_name = ?
            AND (b.notes IS NULL OR b.notes NOT LIKE '%CANCELLED:%')
            AND (bst.status IS NULL OR bst.status != 'Cancelled')
        ");
        $stmt->bind_param("iss", $branchId, $datetime, $service);
        $stmt->execute();
        $count = $stmt->get_result()->fetch_assoc()['cnt'] ?? 0;
        $stmt->close();

        return $count < 1;
    } catch (Exception $e) {
        return false;
    }
}
