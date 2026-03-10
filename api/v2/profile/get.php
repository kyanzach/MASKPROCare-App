<?php
/**
 * GET /api/v2/profile/get
 * 
 * Get the authenticated customer's profile.
 * 
 * Response: { success: true, data: { customer: {...}, stats: {...} } }
 */

require_once __DIR__ . '/../middleware/auth.php';
require_method('GET');

$customer = get_customer_by_id($authCustomerId);

if (!$customer) {
    api_error('Customer not found', 404);
}

// Get stats (with error handling for schema differences)
try {
    $stats = get_customer_stats($authCustomerId);
} catch (\Throwable $e) {
    $stats = [
        'total_vehicles' => 0,
        'total_bookings' => 0,
        'completed_services' => 0,
        'vehicles_needing_service' => 0
    ];
}

api_success([
    'customer' => $customer,
    'stats' => $stats
], 'Profile retrieved');
