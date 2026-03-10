<?php
/**
 * POST /api/v2/auth/logout
 * 
 * Logout — JWT is stateless so this is mostly a client-side operation.
 * The client simply discards the token. This endpoint exists for completeness
 * and could be extended to add token blacklisting if needed.
 * 
 * Request: Authorization: Bearer <token>
 * Response: { success: true, message: "Logged out successfully" }
 */

require_method('POST');

// Optionally validate the token (so we know who's logging out)
require_once __DIR__ . '/../middleware/auth.php';

// With JWT, logout is client-side. The server doesn't need to do anything.
// If you need server-side logout, implement a token blacklist table.

api_success(null, 'Logged out successfully');
