<?php
/**
 * API v2 Router
 * 
 * Routes all /api/v2/* requests to the appropriate endpoint handler.
 * 
 * URL pattern: /api/v2/{resource}/{action}
 * Examples:
 *   POST /api/v2/auth/login
 *   GET  /api/v2/vehicles/list
 *   PUT  /api/v2/profile/update
 */

// Core dependencies
require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../db_connect.php';
require_once __DIR__ . '/../../functions.php';

// API infrastructure
require_once __DIR__ . '/helpers/response.php';
require_once __DIR__ . '/config/cors.php';

// Set JSON content type
header('Content-Type: application/json; charset=utf-8');

// Parse the route from REQUEST_URI (works regardless of RewriteBase)
$requestUri = $_SERVER['REQUEST_URI'] ?? '';
$route = '';
if (preg_match('#/api/v2/(.*)$#', $requestUri, $matches)) {
    $route = trim($matches[1], '/');
    // Strip query string if present
    if (($qPos = strpos($route, '?')) !== false) {
        $route = substr($route, 0, $qPos);
    }
}
$segments = $route ? explode('/', $route) : [];

$resource = $segments[0] ?? '';
$action = $segments[1] ?? '';
$id = $segments[2] ?? null; // Optional ID parameter (e.g., /vehicles/detail/42)

// Route map: resource/action → file
$routes = [
    // Auth (no JWT required)
    'auth/login'    => __DIR__ . '/auth/login.php',
    'auth/verify'   => __DIR__ . '/auth/verify.php',
    'auth/logout'   => __DIR__ . '/auth/logout.php',

    // Vehicles (JWT required)
    'vehicles/list'    => __DIR__ . '/vehicles/list.php',
    'vehicles/detail'  => __DIR__ . '/vehicles/detail.php',
    'vehicles/create'  => __DIR__ . '/vehicles/create.php',
    'vehicles/update'  => __DIR__ . '/vehicles/update.php',
    'vehicles/delete'  => __DIR__ . '/vehicles/delete.php',

    // Bookings (JWT required)
    'bookings/list'         => __DIR__ . '/bookings/list.php',
    'bookings/detail'       => __DIR__ . '/bookings/detail.php',
    'bookings/create'       => __DIR__ . '/bookings/create.php',
    'bookings/cancel'       => __DIR__ . '/bookings/cancel.php',
    'bookings/availability' => __DIR__ . '/bookings/availability.php',

    // Services (no JWT required — public info)
    'services/list' => __DIR__ . '/services/list.php',

    // Profile (JWT required)
    'profile/get'    => __DIR__ . '/profile/get.php',
    'profile/update' => __DIR__ . '/profile/update.php',

    // Dashboard (JWT required)
    'dashboard/stats' => __DIR__ . '/dashboard/stats.php',

    // Notifications (JWT required)
    'notifications/list'      => __DIR__ . '/notifications/list.php',
    'notifications/count'     => __DIR__ . '/notifications/count.php',
    'notifications/mark_read' => __DIR__ . '/notifications/mark_read.php',
];

// Build the route key
$routeKey = $resource . '/' . $action;

if (isset($routes[$routeKey])) {
    $endpointFile = $routes[$routeKey];
    if (file_exists($endpointFile)) {
        // Make $id available to the endpoint
        $routeId = $id;
        require $endpointFile;
    } else {
        api_error("Endpoint not implemented yet: $routeKey", 501);
    }
} elseif (empty($resource)) {
    // Root /api/v2/ — return API info
    api_success([
        'name' => 'MaskPro Care API',
        'version' => 'v2',
        'endpoints' => array_keys($routes)
    ], 'MaskPro Care API v2 is running');
} else {
    api_error("Unknown endpoint: $routeKey", 404);
}
