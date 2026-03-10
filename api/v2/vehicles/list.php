<?php
/**
 * GET /api/v2/vehicles/list
 * 
 * Get all vehicles for the authenticated customer.
 * 
 * Request: Authorization: Bearer <token>
 * Response: { success: true, data: { vehicles: [...] } }
 */

require_once __DIR__ . '/../middleware/auth.php';
require_method('GET');

// Get customer vehicles
$vehicles = get_customer_vehicles($authCustomerId);

// Add service status to each vehicle (with error handling for schema differences)
foreach ($vehicles as &$vehicle) {
    try {
        $vehicle['service_status'] = get_vehicle_service_status($vehicle);
    } catch (\Throwable $e) {
        $vehicle['service_status'] = 'Unknown';
    }
}

api_success(['vehicles' => $vehicles], 'Vehicles retrieved successfully');
