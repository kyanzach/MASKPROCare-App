<?php
/**
 * POST /api/v2/notifications/mark_read
 * 
 * Mark notification(s) as read.
 * Body: { "id": 123 }        — mark single
 * Body: { "all": true }      — mark all as read
 */

require_once __DIR__ . '/../middleware/auth.php';
require_method('POST');

$body = get_json_body();

if (!empty($body['all'])) {
    // Mark all as read
    $stmt = $conn->prepare("UPDATE customer_notifications SET is_read = 1 WHERE customer_id = ? AND is_read = 0");
    $stmt->bind_param("i", $authCustomerId);
    $stmt->execute();
    $affected = $stmt->affected_rows;
    $stmt->close();
    api_success(['marked' => $affected], "Marked $affected notifications as read");
}

$notifId = (int)($body['id'] ?? 0);
if ($notifId <= 0) {
    api_error('Notification ID is required', 422);
}

// Verify ownership + mark read
$stmt = $conn->prepare("UPDATE customer_notifications SET is_read = 1 WHERE id = ? AND customer_id = ?");
$stmt->bind_param("ii", $notifId, $authCustomerId);
$stmt->execute();

if ($stmt->affected_rows === 0) {
    $stmt->close();
    api_error('Notification not found', 404);
}
$stmt->close();

api_success(['id' => $notifId], 'Notification marked as read');
