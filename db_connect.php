<?php
// Database configuration for nanofix-maintenance app

// Environment Detection
$isProduction = (
    isset($_SERVER['HTTP_HOST']) && 
    ($_SERVER['HTTP_HOST'] === 'app.maskpro.ph' || strpos($_SERVER['HTTP_HOST'], 'maskpro.ph') !== false)
) || (isset($_ENV['APP_ENV']) && $_ENV['APP_ENV'] === 'production');

if ($isProduction) {
    // Production Database Configuration
    $servername = 'sdb-56.hosting.stackcp.net';
    $dbname = 'appv2_unify-35303133165e';
    $username = 'appv2_unify-admin';
    $password = 'Godisgood777!';
} else {
    // Local Development Database Configuration
    $servername = 'localhost';
    $dbname = 'omnimpdb';
    $username = 'root';
    $password = '';
}

// Create connection
$mysqli = new mysqli($servername, $username, $password, $dbname);
$conn = $mysqli; // Alias for compatibility

// Check connection
if ($mysqli->connect_error) {
    die("Database connection failed: " . $mysqli->connect_error);
}

// Set charset to utf8mb4
$mysqli->set_charset("utf8mb4");

// Set timezone to Asia/Manila for consistent datetime handling
date_default_timezone_set('Asia/Manila');
$mysqli->query("SET time_zone = '+08:00'");

// Function to sanitize input data
function sanitize_input($data) {
    global $mysqli;
    $data = trim($data);
    $data = stripslashes($data);
    $data = htmlspecialchars($data);
    return $mysqli->real_escape_string($data);
}

// Function to generate a random string
function generate_random_string($length = 10) {
    $characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    $charactersLength = strlen($characters);
    $randomString = '';
    for ($i = 0; $i < $length; $i++) {
        $randomString .= $characters[rand(0, $charactersLength - 1)];
    }
    return $randomString;
}
?>