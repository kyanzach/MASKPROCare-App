<?php
/**
 * POST /api/v2/bookings/availability
 * 
 * Check booking availability for a given service and date.
 * Ported from api/check_availability.php with JWT auth.
 * 
 * Request body: 
 *   { "action": "get_available_dates", "service": "Nano Ceramic Coating" }
 *   { "action": "get_available_times", "service": "Nano Ceramic Coating", "date": "2026-03-15" }
 */

require_once __DIR__ . '/../middleware/auth.php';
require_method('POST');

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
function loadServiceCapacity($conn, $branchId, $defaults) {
    $capacity = $defaults;
    if ($branchId > 0) {
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
    }
    return $capacity;
}

$serviceCapacity = loadServiceCapacity($conn, $authBranchId, $defaultCapacity);

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

        while ($startDate <= $endDate) {
            $dateStr = $startDate->format('Y-m-d');

            // Skip Sundays (day 7)
            if ($startDate->format('N') == 7) {
                $startDate->add(new DateInterval('P1D'));
                continue;
            }

            $isAvailable = checkDateAvail($conn, $service, $dateStr, $serviceCapacity);

            $availableDates[] = [
                'date' => $dateStr,
                'formatted' => $startDate->format('M j, Y'),
                'day' => $startDate->format('l'),
                'available' => $isAvailable
            ];

            $startDate->add(new DateInterval('P1D'));
        }

        api_success([
            'dates' => $availableDates,
            'capacity' => $serviceCapacity[$service] ?? 0
        ], 'Available dates retrieved');

    } elseif ($action === 'get_available_times') {
        $date = trim($body['date'] ?? '');
        if (empty($date)) {
            api_error('Date is required', 422);
        }

        $availableTimes = [];
        foreach ($timeSlots as $time => $label) {
            $isAvailable = checkTimeAvail($conn, $service, $date, $time, $serviceCapacity);
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

// --- Helper functions (ported from api/check_availability.php) ---

function checkDateAvail($conn, $service, $date, $serviceCapacity) {
    try {
        // Count confirmed bookings
        $stmt = $conn->prepare("
            SELECT COUNT(*) as cnt FROM bookings b 
            LEFT JOIN bookings_service_types bst ON b.booking_id = bst.booking_id 
            WHERE DATE(b.booking_date) = ? 
            AND (b.latest_service = ? OR bst.service_name = ?)
            AND NOT (b.notes LIKE '%CANCELLED:%' OR bst.status = 'Cancelled')
        ");
        $stmt->bind_param("sss", $date, $service, $service);
        $stmt->execute();
        $confirmed = $stmt->get_result()->fetch_assoc()['cnt'] ?? 0;
        $stmt->close();

        // Count pending requests
        $stmt = $conn->prepare("
            SELECT COUNT(*) as cnt FROM booking_requests br
            LEFT JOIN booking_request_services brs ON br.request_id = brs.request_id
            WHERE DATE(br.booking_date) = ? 
            AND (br.latest_service = ? OR brs.service_name = ?)
            AND br.status = 'pending'
        ");
        $stmt->bind_param("sss", $date, $service, $service);
        $stmt->execute();
        $pending = $stmt->get_result()->fetch_assoc()['cnt'] ?? 0;
        $stmt->close();

        $max = $serviceCapacity[$service] ?? 0;
        return ($confirmed + $pending) < $max;
    } catch (Exception $e) {
        return false;
    }
}

function checkTimeAvail($conn, $service, $date, $time, $serviceCapacity) {
    try {
        $datetime = $date . ' ' . $time . ':00';
        $stmt = $conn->prepare("
            SELECT COUNT(*) as cnt FROM bookings b 
            LEFT JOIN bookings_service_types bst ON b.booking_id = bst.booking_id 
            WHERE b.booking_date = ? 
            AND (b.latest_service = ? OR bst.service_name = ?)
            AND NOT (b.notes LIKE '%CANCELLED:%' OR bst.status = 'Cancelled')
        ");
        $stmt->bind_param("sss", $datetime, $service, $service);
        $stmt->execute();
        $count = $stmt->get_result()->fetch_assoc()['cnt'] ?? 0;
        $stmt->close();

        return $count < 1;
    } catch (Exception $e) {
        return false;
    }
}
