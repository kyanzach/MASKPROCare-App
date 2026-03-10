<?php
/**
 * GET /api/v2/dashboard/stats
 * 
 * Get dashboard statistics for the authenticated customer.
 * Uses the REAL database schema (bookings.customer_vehicle_id, not vehicle_id).
 * 
 * Response: { success: true, data: { stats: {...}, upcoming: [...], recent: [...] } }
 */

require_once __DIR__ . '/../middleware/auth.php';
require_method('GET');

try {
    // Get vehicles
    $vehicles = get_customer_vehicles($authCustomerId);
    $totalVehicles = count($vehicles);

    // Calculate vehicles needing service (last service > 6 months ago)
    $sixMonthsAgo = date('Y-m-d', strtotime('-6 months'));
    $vehiclesNeedingService = 0;

    foreach ($vehicles as &$vehicle) {
        try {
            $vehicle['service_status'] = get_vehicle_service_status($vehicle);
        } catch (\Throwable $e) {
            $vehicle['service_status'] = 'Unknown';
        }

        // Check last service date using correct column name
        try {
            $stmt = $conn->prepare("SELECT MAX(booking_date) as last_service FROM bookings WHERE customer_vehicle_id = ? AND customer_id = ? AND (notes IS NULL OR notes NOT LIKE '%CANCELLED:%')");
            $stmt->bind_param("ii", $vehicle['id'], $authCustomerId);
            $stmt->execute();
            $lastService = $stmt->get_result()->fetch_assoc();
            $stmt->close();

            if (!$lastService['last_service'] || $lastService['last_service'] < $sixMonthsAgo) {
                $vehiclesNeedingService++;
            }
        } catch (\Throwable $e) {
            $vehiclesNeedingService++;
        }
    }

    // Get upcoming bookings
    $upcoming = [];
    try {
        $stmt = $conn->prepare("
            SELECT b.booking_id, b.booking_date, b.latest_service, b.notes,
                   v.make, v.model, v.plate_no
            FROM bookings b
            LEFT JOIN vehicles v ON b.customer_vehicle_id = v.id
            WHERE b.customer_id = ? AND b.booking_date >= NOW() 
            AND (b.notes IS NULL OR b.notes NOT LIKE '%CANCELLED:%')
            ORDER BY b.booking_date ASC
            LIMIT 5
        ");
        $stmt->bind_param("i", $authCustomerId);
        $stmt->execute();
        $result = $stmt->get_result();
        while ($row = $result->fetch_assoc()) {
            $upcoming[] = $row;
        }
        $stmt->close();
    } catch (\Throwable $e) {
        // Silently continue with empty upcoming
    }

    // Get recent completed bookings
    $recent = [];
    try {
        $stmt = $conn->prepare("
            SELECT b.booking_id, b.booking_date, b.latest_service, b.notes,
                   v.make, v.model, v.plate_no
            FROM bookings b
            LEFT JOIN vehicles v ON b.customer_vehicle_id = v.id
            WHERE b.customer_id = ? AND b.booking_date < NOW()
            AND (b.notes IS NULL OR b.notes NOT LIKE '%CANCELLED:%')
            ORDER BY b.booking_date DESC
            LIMIT 5
        ");
        $stmt->bind_param("i", $authCustomerId);
        $stmt->execute();
        $result = $stmt->get_result();
        while ($row = $result->fetch_assoc()) {
            $recent[] = $row;
        }
        $stmt->close();
    } catch (\Throwable $e) {
        // Silently continue with empty recent
    }

    // Get pending requests count
    $pendingCount = 0;
    try {
        $stmt = $conn->prepare("SELECT COUNT(*) as cnt FROM booking_requests WHERE customer_id = ? AND status = 'pending'");
        $stmt->bind_param("i", $authCustomerId);
        $stmt->execute();
        $pendingCount = (int) ($stmt->get_result()->fetch_assoc()['cnt'] ?? 0);
        $stmt->close();
    } catch (\Throwable $e) {
        // Table may not exist
    }

    // Get total completed services
    $completedCount = 0;
    try {
        $stmt = $conn->prepare("SELECT COUNT(*) as cnt FROM bookings WHERE customer_id = ? AND booking_date < NOW() AND (notes IS NULL OR notes NOT LIKE '%CANCELLED:%')");
        $stmt->bind_param("i", $authCustomerId);
        $stmt->execute();
        $completedCount = (int) ($stmt->get_result()->fetch_assoc()['cnt'] ?? 0);
        $stmt->close();
    } catch (\Throwable $e) {
        // Silently continue
    }

    api_success([
        'stats' => [
            'total_vehicles' => $totalVehicles,
            'vehicles_needing_service' => $vehiclesNeedingService,
            'upcoming_bookings' => count($upcoming),
            'pending_requests' => $pendingCount,
            'completed_services' => $completedCount
        ],
        'vehicles' => $vehicles,
        'upcoming_bookings' => $upcoming,
        'recent_bookings' => $recent
    ], 'Dashboard data retrieved');

} catch (\Throwable $e) {
    api_error('Failed to load dashboard data: ' . $e->getMessage(), 500);
}
