<?php
/**
 * Bulk Update Script for Customer Branch Assignment
 * 
 * This script safely assigns branch_id to all customers based on their booking history.
 * It checks each customer's earliest booking and assigns that branch to the customer.
 * 
 * IMPORTANT: Run this script ONCE to initialize branch_id for existing customers.
 * After this, branch assignment happens automatically at login time.
 */

require_once __DIR__ . '/../db_connect.php';

// Set execution time limit for large datasets
set_time_limit(300); // 5 minutes

echo "=== Customer Branch Assignment Bulk Update ===\n\n";

// Step 1: Get statistics before update
$stats_query = "SELECT 
    COUNT(*) as total_customers,
    SUM(CASE WHEN branch_id IS NULL THEN 1 ELSE 0 END) as customers_without_branch,
    SUM(CASE WHEN branch_id IS NOT NULL THEN 1 ELSE 0 END) as customers_with_branch
FROM customers";

$stats_result = $conn->query($stats_query);
$stats = $stats_result->fetch_assoc();

echo "Current Statistics:\n";
echo "- Total Customers: {$stats['total_customers']}\n";
echo "- Customers WITH branch: {$stats['customers_with_branch']}\n";
echo "- Customers WITHOUT branch: {$stats['customers_without_branch']}\n\n";

if ($stats['customers_without_branch'] == 0) {
    echo "✓ All customers already have branch_id assigned. No update needed.\n";
    exit(0);
}

// Step 2: Update customers based on their booking history
echo "Step 1: Assigning branch_id based on booking history...\n";

$update_query = "
UPDATE customers c
SET c.branch_id = (
    SELECT b.branch_id 
    FROM bookings b 
    WHERE b.customer_id = c.id 
    AND b.branch_id IS NOT NULL
    ORDER BY b.time_added ASC 
    LIMIT 1
)
WHERE c.branch_id IS NULL
AND EXISTS (
    SELECT 1 FROM bookings b2 
    WHERE b2.customer_id = c.id 
    AND b2.branch_id IS NOT NULL
)";

$result = $conn->query($update_query);
$updated_from_bookings = $conn->affected_rows;

echo "✓ Updated {$updated_from_bookings} customers from booking history\n\n";

// Step 3: For customers with no bookings, assign default branch (Davao = 1)
echo "Step 2: Assigning default branch to customers without booking history...\n";

$default_update_query = "
UPDATE customers 
SET branch_id = 1  -- Default to Davao
WHERE branch_id IS NULL";

$result2 = $conn->query($default_update_query);
$updated_default = $conn->affected_rows;

echo "✓ Assigned default branch to {$updated_default} customers\n\n";

// Step 4: Verify results
echo "Step 3: Verifying results...\n";

$verify_query = "SELECT 
    COUNT(*) as total_customers,
    SUM(CASE WHEN branch_id IS NULL THEN 1 ELSE 0 END) as customers_without_branch,
    SUM(CASE WHEN branch_id IS NOT NULL THEN 1 ELSE 0 END) as customers_with_branch
FROM customers";

$verify_result = $conn->query($verify_query);
$verify_stats = $verify_result->fetch_assoc();

echo "\nFinal Statistics:\n";
echo "- Total Customers: {$verify_stats['total_customers']}\n";
echo "- Customers WITH branch: {$verify_stats['customers_with_branch']}\n";
echo "- Customers WITHOUT branch: {$verify_stats['customers_without_branch']}\n\n";

// Step 5: Show branch distribution
echo "Branch Distribution:\n";

$distribution_query = "
SELECT 
    b.id,
    b.branch_name,
    COUNT(c.id) as customer_count
FROM branches b
LEFT JOIN customers c ON b.id = c.branch_id
GROUP BY b.id, b.branch_name
ORDER BY b.id";

$dist_result = $conn->query($distribution_query);

while ($row = $dist_result->fetch_assoc()) {
    echo "- {$row['branch_name']}: {$row['customer_count']} customers\n";
}

echo "\n=== Update Complete ===\n";
echo "Total customers updated: " . ($updated_from_bookings + $updated_default) . "\n";

$conn->close();
?>
