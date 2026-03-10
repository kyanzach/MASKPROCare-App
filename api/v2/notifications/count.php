<?php
/**
 * GET /api/v2/notifications/count
 * 
 * Lightweight endpoint — returns only unread notification count.
 * Used for bell badge polling.
 */

require_once __DIR__ . '/../middleware/auth.php';
require_method('GET');

$stmt = $conn->prepare("SELECT COUNT(*) as unread_count FROM customer_notifications WHERE customer_id = ? AND is_read = 0");
$stmt->bind_param("i", $authCustomerId);
$stmt->execute();
$row = $stmt->get_result()->fetch_assoc();
$stmt->close();

api_success(['unread_count' => (int)$row['unread_count']], 'OK');
