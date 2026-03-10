<?php
/**
 * JWT Authentication Middleware
 * 
 * Include this file in any endpoint that requires authentication.
 * After inclusion, $authCustomerId and $authCustomer are available.
 */

require_once __DIR__ . '/../config/jwt.php';

/**
 * Authenticate the request via JWT Bearer token.
 * Returns the decoded customer_id or sends a 401 response.
 * 
 * @return object Decoded JWT payload with ->sub (customer_id), ->mobile, ->branch_id
 */
function authenticate() {
    $token = jwt_get_bearer_token();

    if (!$token) {
        api_error('Authentication required. Please provide a Bearer token.', 401);
    }

    $payload = jwt_decode_token($token);

    if (!$payload) {
        api_error('Invalid or expired token. Please log in again.', 401);
    }

    return $payload;
}

// Auto-authenticate when this file is included
$authPayload = authenticate();
$authCustomerId = (int) $authPayload->sub;
$authBranchId = (int) ($authPayload->branch_id ?? DEFAULT_BRANCH_ID);
$authMobile = $authPayload->mobile ?? '';
