<?php
/**
 * GET /api/v2/services/list
 * 
 * Get available service types for the booking dropdown.
 * JWT-protected — needs customer ID to check MNCC history.
 * 
 * Logic:
 *   - Always show 5 core services
 *   - Show "Maintenance (NanoFix)" only if customer has an existing
 *     Nano Ceramic Coating booking (availed MNCC)
 * 
 * Response: { success: true, data: { service_types: [...], has_mncc: bool } }
 */

require_once __DIR__ . '/../middleware/auth.php';
require_method('GET');

// Core services — always shown
// api_name = exact DB column value used in branch_booking_capacity + bookings
// label = customer-facing display name
$coreServices = [
    ['api_name' => 'Nano Ceramic Coating',   'label' => 'Nano Ceramic Coating',       'category' => 'Protection'],
    ['api_name' => 'Nano Ceramic Tint',      'label' => 'Nano Ceramic Tint',          'category' => 'Protection'],
    ['api_name' => 'PPF',                    'label' => 'Paint Protection Film (PPF)', 'category' => 'Protection'],
    ['api_name' => 'Auto Paint & Repair',    'label' => 'Auto Paint & Repair',        'category' => 'Repair'],
    ['api_name' => 'Go & Clean',             'label' => 'Detailing',                  'category' => 'Detailing'],
];

// Check if customer has existing MNCC (Nano Ceramic Coating) booking
$hasMncc = false;
try {
    $stmt = $conn->prepare("
        SELECT COUNT(*) as cnt FROM bookings 
        WHERE customer_id = ? 
        AND (latest_service = 'Nano Ceramic Coating' OR latest_service = 'MNCC')
        AND (notes IS NULL OR notes NOT LIKE '%CANCELLED:%')
    ");
    $stmt->bind_param("i", $authCustomerId);
    $stmt->execute();
    $hasMncc = ((int)($stmt->get_result()->fetch_assoc()['cnt'] ?? 0)) > 0;
    $stmt->close();
} catch (\Throwable $e) {
    // Also check bookings_service_types table
}

// If first query found nothing, try bookings_service_types
if (!$hasMncc) {
    try {
        $stmt = $conn->prepare("
            SELECT COUNT(*) as cnt FROM bookings b
            JOIN bookings_service_types bst ON b.booking_id = bst.booking_id
            WHERE b.customer_id = ? 
            AND bst.service_name = 'Nano Ceramic Coating'
            AND (b.notes IS NULL OR b.notes NOT LIKE '%CANCELLED:%')
        ");
        $stmt->bind_param("i", $authCustomerId);
        $stmt->execute();
        $hasMncc = ((int)($stmt->get_result()->fetch_assoc()['cnt'] ?? 0)) > 0;
        $stmt->close();
    } catch (\Throwable $e) {
        // Silently continue
    }
}

// Build final service list
$services = $coreServices;

// Add Maintenance (NanoFix) only if customer has MNCC
if ($hasMncc) {
    // Insert at the top — it's the most relevant for MNCC customers
    array_unshift($services, [
        'api_name' => 'Nano Fix (Maintenance)',
        'label'    => 'Maintenance (NanoFix)',
        'category' => 'Maintenance',
    ]);
}

api_success([
    'service_types' => $services,
    'has_mncc'      => $hasMncc,
], 'Service types retrieved');
