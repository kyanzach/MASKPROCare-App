<?php
/**
 * CORS Configuration
 * Handles Cross-Origin Resource Sharing headers for the API.
 */

// Allowed origins — add your production domain(s) here
$allowedOrigins = [
    'http://localhost:5173',        // Vite dev server
    'http://localhost:3000',        // Alternate dev server
    'https://care.maskpro.ph',     // Production web app
    'http://localhost',             // XAMPP local
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if (in_array($origin, $allowedOrigins)) {
    header("Access-Control-Allow-Origin: $origin");
} elseif (!IS_PRODUCTION) {
    // In development, be more permissive
    header("Access-Control-Allow-Origin: *");
}

header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Max-Age: 86400"); // Cache preflight for 24 hours

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
