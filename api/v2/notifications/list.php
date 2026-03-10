<?php
/**
 * GET /api/v2/notifications/list
 * 
 * List notifications for the authenticated customer.
 * Returns paginated, newest first, with unread_count.
 */

require_once __DIR__ . '/../middleware/auth.php';
require_method('GET');

$page = max(1, (int)($_GET['page'] ?? 1));
$limit = min(50, max(5, (int)($_GET['limit'] ?? 20)));
$offset = ($page - 1) * $limit;

// Get total + unread counts
$countStmt = $conn->prepare("SELECT COUNT(*) as total, SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread FROM customer_notifications WHERE customer_id = ?");
$countStmt->bind_param("i", $authCustomerId);
$countStmt->execute();
$counts = $countStmt->get_result()->fetch_assoc();
$countStmt->close();

// Get notifications
$stmt = $conn->prepare("SELECT id, type, title, message, is_read, link, created_at FROM customer_notifications WHERE customer_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?");
$stmt->bind_param("iii", $authCustomerId, $limit, $offset);
$stmt->execute();
$result = $stmt->get_result();

$notifications = [];
while ($row = $result->fetch_assoc()) {
    $row['is_read'] = (bool)$row['is_read'];
    $notifications[] = $row;
}
$stmt->close();

api_success([
    'notifications' => $notifications,
    'total' => (int)$counts['total'],
    'unread_count' => (int)($counts['unread'] ?? 0),
    'page' => $page,
    'limit' => $limit,
], 'Notifications loaded');
