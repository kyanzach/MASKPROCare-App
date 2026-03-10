<?php
// Application-wide configuration settings for nanofix-maintenance app

// Application name
define('APP_NAME', 'NanoFix Maintenance');

// Application version
define('APP_VERSION', '1.0.0');

// Environment detection
$isProduction = (
    isset($_SERVER['HTTP_HOST']) && 
    ($_SERVER['HTTP_HOST'] === 'app.maskpro.ph' || strpos($_SERVER['HTTP_HOST'], 'maskpro.ph') !== false)
) || (isset($_ENV['APP_ENV']) && $_ENV['APP_ENV'] === 'production');

define('IS_PRODUCTION', $isProduction);

// Base URL
if (IS_PRODUCTION) {
    define('BASE_URL', 'https://app.maskpro.ph/nanofix-maintenance/');
} else {
    define('BASE_URL', 'http://localhost/unify.maskpro.ph/nanofix-maintenance/');
}

// Session configuration
define('SESSION_NAME', 'nanofix_session');
define('SESSION_LIFETIME', 86400); // 24 hours

// Default branch ID
define('DEFAULT_BRANCH_ID', 1);

// Pagination settings
define('ITEMS_PER_PAGE', 10);

// Date and time formats
define('DATE_FORMAT', 'F j, Y'); // January 1, 2023
define('TIME_FORMAT', 'g:i A'); // 9:00 AM
define('DATETIME_FORMAT', 'F j, Y g:i A'); // January 1, 2023 9:00 AM

// Service reminder settings (in days)
define('SERVICE_DUE_SOON_DAYS', 60); // 2 months
define('SERVICE_OVERDUE_DAYS', 90); // 3 months

// OTP settings
define('OTP_LENGTH', 6);
define('OTP_EXPIRY', 300); // 5 minutes

// Error reporting
if (IS_PRODUCTION) {
    error_reporting(0);
    ini_set('display_errors', 0);
    ini_set('log_errors', 1);
} else {
    // Even in development, don't display errors to users - log them instead
    error_reporting(E_ALL);
    ini_set('display_errors', 0);
    ini_set('log_errors', 1);
    ini_set('error_log', '/Applications/XAMPP/xamppfiles/logs/php_error_log');
}

// Start session if not already started
if (session_status() === PHP_SESSION_NONE) {
    session_name(SESSION_NAME);
    session_set_cookie_params(SESSION_LIFETIME);
    session_start();
}
?>