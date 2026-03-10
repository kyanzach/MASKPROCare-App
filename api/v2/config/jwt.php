<?php
/**
 * JWT Configuration & Helpers
 * Uses firebase/php-jwt for token encoding/decoding.
 */

require_once __DIR__ . '/../../../vendor/autoload.php';

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\SignatureInvalidException;

// JWT Secret — in production, move this to an environment variable
// For now, using a strong random string
define('JWT_SECRET', getenv('JWT_SECRET') ?: 'mpc_jwt_s3cr3t_k3y_2026_xK9pLm2nQ7rT');
define('JWT_ALGORITHM', 'HS256');
define('JWT_EXPIRY_SECONDS', 86400); // 24 hours
define('JWT_REFRESH_THRESHOLD', 3600); // Refresh if less than 1 hour remaining

/**
 * Generate a JWT token for a customer
 * 
 * @param int $customerId
 * @param string $mobile
 * @param int $branchId
 * @return string JWT token
 */
function jwt_encode_token($customerId, $mobile, $branchId = 1) {
    $issuedAt = time();
    $expiry = $issuedAt + JWT_EXPIRY_SECONDS;

    $payload = [
        'iss' => 'maskpro-care-api',       // Issuer
        'sub' => $customerId,               // Subject (customer_id)
        'mobile' => $mobile,
        'branch_id' => $branchId,
        'iat' => $issuedAt,                 // Issued at
        'exp' => $expiry,                   // Expiry
    ];

    return JWT::encode($payload, JWT_SECRET, JWT_ALGORITHM);
}

/**
 * Decode and validate a JWT token
 * 
 * @param string $token
 * @return object|null Decoded payload or null on failure
 */
function jwt_decode_token($token) {
    try {
        $decoded = JWT::decode($token, new Key(JWT_SECRET, JWT_ALGORITHM));
        return $decoded;
    } catch (ExpiredException $e) {
        return null;
    } catch (SignatureInvalidException $e) {
        return null;
    } catch (\Exception $e) {
        return null;
    }
}

/**
 * Extract JWT token from Authorization header
 * 
 * @return string|null Token string or null
 */
function jwt_get_bearer_token() {
    $headers = null;

    // Try Apache header
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $headers = trim($_SERVER['HTTP_AUTHORIZATION']);
    } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        // Apache mod_rewrite sometimes puts it here
        $headers = trim($_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
    } elseif (function_exists('apache_request_headers')) {
        $requestHeaders = apache_request_headers();
        if (isset($requestHeaders['Authorization'])) {
            $headers = trim($requestHeaders['Authorization']);
        }
    }

    if ($headers && preg_match('/Bearer\s(\S+)/', $headers, $matches)) {
        return $matches[1];
    }

    return null;
}
