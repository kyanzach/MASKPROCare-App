<?php
/**
 * Customer Branch Assignment Helper
 * 
 * This file contains the logic to assign branch_id to customers at login time
 * if they don't already have one assigned.
 * 
 * Include this file after successful customer login/OTP verification.
 */

/**
 * Assign branch to customer based on their booking history
 * Call this function after customer login if branch_id is not set
 * 
 * @param mysqli $conn Database connection
 * @param int $customer_id Customer ID
 * @return int|null The assigned branch_id or null if assignment failed
 */
function assign_customer_branch($conn, $customer_id) {
    // First, check if customer already has a branch assigned
    $check_stmt = $conn->prepare("SELECT branch_id FROM customers WHERE id = ?");
    $check_stmt->bind_param("i", $customer_id);
    $check_stmt->execute();
    $check_result = $check_stmt->get_result();
    $customer = $check_result->fetch_assoc();
    $check_stmt->close();
    
    // If branch already assigned, return it
    if ($customer && $customer['branch_id'] !== null) {
        return (int)$customer['branch_id'];
    }
    
    // Try to get branch from customer's earliest booking
    $booking_stmt = $conn->prepare("
        SELECT branch_id 
        FROM bookings 
        WHERE customer_id = ? 
        AND branch_id IS NOT NULL 
        ORDER BY time_added ASC 
        LIMIT 1
    ");
    $booking_stmt->bind_param("i", $customer_id);
    $booking_stmt->execute();
    $booking_result = $booking_stmt->get_result();
    $booking = $booking_result->fetch_assoc();
    $booking_stmt->close();
    
    $branch_id = null;
    
    if ($booking && $booking['branch_id']) {
        // Customer has booking history - use that branch
        $branch_id = (int)$booking['branch_id'];
    } else {
        // No booking history - assign default branch (Davao = 1)
        $branch_id = 1;
    }
    
    // Update customer record with branch_id
    $update_stmt = $conn->prepare("UPDATE customers SET branch_id = ? WHERE id = ?");
    $update_stmt->bind_param("ii", $branch_id, $customer_id);
    $update_stmt->execute();
    $update_stmt->close();
    
    return $branch_id;
}

/**
 * Get customer's branch_id and store in session
 * Call this after successful login
 * 
 * @param mysqli $conn Database connection
 * @param int $customer_id Customer ID
 * @return void
 */
function initialize_customer_branch_session($conn, $customer_id) {
    // Assign branch if not already assigned
    $branch_id = assign_customer_branch($conn, $customer_id);
    
    // Store in session for easy access
    $_SESSION['customer_branch_id'] = $branch_id;
}
?>
