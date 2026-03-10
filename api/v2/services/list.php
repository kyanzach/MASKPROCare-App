<?php
/**
 * GET /api/v2/services/list
 * 
 * Get available service types. Public endpoint — no JWT required.
 * 
 * Response: { success: true, data: { service_types: [...] } }
 */

require_method('GET');

// Service types — matches bookings.php array
$serviceTypes = [
    ['name' => 'Nano Ceramic Coating', 'category' => 'Protection'],
    ['name' => 'Nano Ceramic Tint', 'category' => 'Protection'],
    ['name' => 'Paint Protection Film (PPF)', 'category' => 'Protection'],
    ['name' => 'Auto Paint', 'category' => 'Repair'],
    ['name' => 'Full Detailing', 'category' => 'Detailing'],
    ['name' => 'Interior Detailing', 'category' => 'Detailing'],
    ['name' => 'Exterior Detailing', 'category' => 'Detailing'],
    ['name' => 'Paint Correction', 'category' => 'Detailing'],
    ['name' => 'Headlight Restoration', 'category' => 'Repair'],
    ['name' => 'Other', 'category' => 'Other'],
];

api_success([
    'service_types' => $serviceTypes
], 'Service types retrieved');
