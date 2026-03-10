<?php
/**
 * Standardized API Response Helpers
 * All API endpoints use these functions for consistent JSON responses.
 */

/**
 * Send a successful JSON response
 * 
 * @param mixed $data Response data
 * @param string $message Human-readable message
 * @param int $statusCode HTTP status code (default 200)
 */
function api_success($data = null, $message = 'Success', $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode([
        'success' => true,
        'data' => $data,
        'message' => $message,
        'errors' => []
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Send an error JSON response
 * 
 * @param string $message Error message
 * @param int $statusCode HTTP status code (default 400)
 * @param array $errors Validation errors array
 */
function api_error($message = 'An error occurred', $statusCode = 400, $errors = []) {
    http_response_code($statusCode);
    echo json_encode([
        'success' => false,
        'data' => null,
        'message' => $message,
        'errors' => $errors
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Validate that the request method matches
 * 
 * @param string|array $allowed Allowed method(s)
 */
function require_method($allowed) {
    if (is_string($allowed)) {
        $allowed = [$allowed];
    }
    if (!in_array($_SERVER['REQUEST_METHOD'], $allowed)) {
        api_error('Method not allowed', 405);
    }
}

/**
 * Get the JSON request body (for POST/PUT requests)
 * 
 * @return array Parsed JSON body
 */
function get_json_body() {
    $body = json_decode(file_get_contents('php://input'), true);
    if ($body === null && $_SERVER['REQUEST_METHOD'] !== 'GET') {
        // Allow empty body for GET requests, but not for POST/PUT
        if (in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PUT'])) {
            api_error('Invalid JSON body', 400);
        }
    }
    return $body ?? [];
}

/**
 * Validate required fields exist in data
 * 
 * @param array $data Input data
 * @param array $requiredFields List of required field names
 * @return array Validation errors (empty if valid)
 */
function validate_required($data, $requiredFields) {
    $errors = [];
    foreach ($requiredFields as $field) {
        if (!isset($data[$field]) || (is_string($data[$field]) && trim($data[$field]) === '')) {
            $errors[] = "$field is required";
        }
    }
    return $errors;
}
