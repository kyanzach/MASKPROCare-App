<?php
// Include database configuration
require_once('db_connect.php');
require_once('config.php');

// Session is started in config.php

// Check if user is logged in
if (isset($_SESSION['customer_id'])) {
    $customer_id = $_SESSION['customer_id'];
    
    // Check if client_access table exists
    $tableExistsQuery = "SHOW TABLES LIKE 'client_access'";
    $tableExistsResult = $conn->query($tableExistsQuery);
    
    if ($tableExistsResult->num_rows > 0) {
        // Update last_logout in client_access table
        $updateQuery = "UPDATE client_access SET last_logout = NOW(), session_token = NULL WHERE customer_id = ?";
        $updateStmt = $conn->prepare($updateQuery);
        $updateStmt->bind_param("i", $customer_id);
        $updateStmt->execute();
        $updateStmt->close();
    }
}

// Unset all session variables
$_SESSION = array();

// Destroy the session cookie
if (ini_get("session.use_cookies")) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000,
        $params["path"], $params["domain"],
        $params["secure"], $params["httponly"]
    );
}

// Destroy the session
session_destroy();

// Redirect to login page
header("Location: login.php");
exit;