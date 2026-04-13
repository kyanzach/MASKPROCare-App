<?php
/**
 * POST /api/v2/bookings/edit-request
 * 
 * Edit a pending booking request (change date + reason).
 * Only works for requests with status = 'pending'.
 * 
 * Request body: { "request_id": 6, "new_date": "2026-03-20", "reason": "Schedule conflict" }
 * Response: { success: true, data: { request: {...} }, message: "Updated" }
 */

require_once __DIR__ . '/../middleware/auth.php';
require_method('POST');

date_default_timezone_set('Asia/Manila');

$body = get_json_body();
$requestId = (int) ($body['request_id'] ?? 0);
$newDate = trim($body['new_date'] ?? '');
$reason = trim($body['reason'] ?? '');

if ($requestId <= 0) {
    api_error('Request ID is required', 422);
}
if (empty($newDate)) {
    api_error('New date is required', 422);
}
if (empty($reason)) {
    api_error('Reason for change is required', 422);
}

// Validate date format
$dateObj = DateTime::createFromFormat('Y-m-d', $newDate);
if (!$dateObj || $dateObj->format('Y-m-d') !== $newDate) {
    api_error('Invalid date format. Use YYYY-MM-DD.', 422);
}

// Must be a future date
if ($newDate <= date('Y-m-d')) {
    api_error('New date must be in the future', 422);
}

// Verify request belongs to customer and is still pending
$stmt = $conn->prepare("SELECT request_id, booking_date, status, edit_history FROM booking_requests WHERE request_id = ? AND customer_id = ?");
$stmt->bind_param("ii", $requestId, $authCustomerId);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    $stmt->close();
    api_error('Booking request not found', 404);
}

$request = $result->fetch_assoc();
$stmt->close();

if ($request['status'] !== 'pending') {
    api_error('This request has already been ' . $request['status'] . ' and cannot be edited', 409);
}

// Build edit history entry
$oldDate = date('Y-m-d', strtotime($request['booking_date']));
$editEntry = [
    'from' => $oldDate,
    'to' => $newDate,
    'reason' => $reason,
    'date' => date('Y-m-d H:i:s'),
];

// Parse existing edit history or start fresh
$editHistory = [];
if (!empty($request['edit_history'])) {
    $editHistory = json_decode($request['edit_history'], true) ?: [];
}
$editHistory[] = $editEntry;

// Update the request — change date + store edit history + append to notes
$newBookingDate = $newDate . ' 08:00:00'; // Default time 8 AM
$editHistoryJson = json_encode($editHistory);
$noteAppend = "Edited on " . date('M d, Y g:i A') . ": Changed date from $oldDate to $newDate. Reason: $reason";
$existingNotes = $request['notes'] ?? '';
$updatedNotes = $existingNotes ? $existingNotes . "\n" . $noteAppend : $noteAppend;

try {
    $stmt = $conn->prepare("UPDATE booking_requests SET booking_date = ?, edit_history = ?, notes = ? WHERE request_id = ? AND status = 'pending'");
    $stmt->bind_param("sssi", $newBookingDate, $editHistoryJson, $updatedNotes, $requestId);
    $stmt->execute();
    
    if ($stmt->affected_rows === 0) {
        $stmt->close();
        api_error('Request was already processed by another action', 409);
    }
    $stmt->close();

    // Return updated request
    $stmt = $conn->prepare("
        SELECT br.*, v.make, v.model, v.plate_no,
               GROUP_CONCAT(brs.service_name SEPARATOR ', ') as service_names
        FROM booking_requests br
        LEFT JOIN vehicles v ON br.customer_vehicle_id = v.id
        LEFT JOIN booking_request_services brs ON br.request_id = brs.request_id
        WHERE br.request_id = ?
        GROUP BY br.request_id
    ");
    $stmt->bind_param("i", $requestId);
    $stmt->execute();
    $updated = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!empty($updated['edit_history'])) {
        $updated['edit_history'] = json_decode($updated['edit_history'], true);
    }
    $updated['type'] = 'request';

    api_success(['request' => $updated], 'Booking request updated successfully');

} catch (Exception $e) {
    api_error('Failed to update request. Please try again.', 500);
}
