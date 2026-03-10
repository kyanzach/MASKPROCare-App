<?php
// Include database configuration
require_once('db_connect.php');
require_once('config.php');
require_once('includes/booking_capacity_helper.php');

// Session is started in config.php

// Check if user is logged in
$isLoggedIn = isset($_SESSION['customer_id']) && !empty($_SESSION['customer_id']);

// Redirect to login page if not logged in
if (!$isLoggedIn) {
    header('Location: login.php');
    exit;
}

// Get customer data
$customerId = $_SESSION['customer_id'];
$customerQuery = "SELECT * FROM customers WHERE id = ?";
$stmt = $conn->prepare($customerQuery);
$stmt->bind_param("i", $customerId);
$stmt->execute();
$customerResult = $stmt->get_result();
$customer = $customerResult->fetch_assoc();
$stmt->close();

$success_message = '';
$error_message = '';

// Get messages from session (Flash Messages)
if (isset($_SESSION['success_message'])) {
    $success_message = $_SESSION['success_message'];
    unset($_SESSION['success_message']);
}

if (isset($_SESSION['error_message'])) {
    $error_message = $_SESSION['error_message'];
    unset($_SESSION['error_message']);
}
$is_new_booking = isset($_GET['action']) && $_GET['action'] === 'new';
$selected_vehicle_id = isset($_GET['vehicle_id']) ? (int)$_GET['vehicle_id'] : null;

// Service types array - Auto Detailing Services
$service_types = [
    'Nano Ceramic Coating',
    'Nano Ceramic Tint',
    'Paint Protection Film (PPF)',
    'Auto Paint',
    'Full Detailing',
    'Interior Detailing',
    'Exterior Detailing',
    'Paint Correction',
    'Headlight Restoration',
    'Other'
];

// Handle form submissions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['add_booking'])) {
        // Add new booking REQUEST (not direct booking)
        $vehicle_id = (int)$_POST['vehicle_id'];
        $service_type = trim($_POST['service_type']);
        $booking_date = $_POST['booking_date'];
        $booking_time = $_POST['booking_time'];
        $notes = trim($_POST['notes']);
        
        // Validation
        if (empty($vehicle_id) || empty($service_type) || empty($booking_date) || empty($booking_time)) {
            $error_message = 'Please fill in all required fields.';
        } else {
            // Combine date and time
            $booking_datetime = $booking_date . ' ' . $booking_time;
            
            // Check if the selected date/time is in the future
            if (strtotime($booking_datetime) <= time()) {
                $error_message = 'Please select a future date and time for your booking.';
            } else {
                // Check capacity for this service on this date
                $availableSlots = getAvailableSlots($conn, $booking_date, $service_type);
                
                if ($availableSlots <= 0) {
                    $error_message = 'Sorry, ' . htmlspecialchars($service_type) . ' is fully booked on ' . date('M d, Y', strtotime($booking_date)) . '. Please select another date.';
                } else {
                    // Verify that the vehicle belongs to the customer
                    $verify_stmt = $conn->prepare("SELECT id FROM vehicles WHERE id = ? AND customer_id = ?");
                    $verify_stmt->bind_param("ii", $vehicle_id, $customerId);
                    $verify_stmt->execute();
                    $verify_result = $verify_stmt->get_result();
                    
                    if ($verify_result->num_rows > 0) {
                        try {
                            // Get customer's branch_id from database
                            $branch_stmt = $conn->prepare("SELECT branch_id FROM customers WHERE id = ?");
                            $branch_stmt->bind_param("i", $customerId);
                            $branch_stmt->execute();
                            $branch_result = $branch_stmt->get_result();
                            $customer_data = $branch_result->fetch_assoc();
                            $branch_id = $customer_data['branch_id'];
                            $branch_stmt->close();
                            
                            // If customer doesn't have branch_id, assign it now based on booking history
                            if ($branch_id === null) {
                                require_once 'includes/customer_branch_helper.php';
                                $branch_id = assign_customer_branch($conn, $customerId);
                            }
                            
                            
                            $stmt = $conn->prepare("INSERT INTO booking_requests (customer_id, customer_vehicle_id, booking_date, latest_service, notes, branch_id, status, time_added) VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW())");
                            $stmt->bind_param("iisssi", $customerId, $vehicle_id, $booking_datetime, $service_type, $notes, $branch_id);
                            $stmt->execute();
                            $request_id = $conn->insert_id;
                            
                            // Insert service type into booking_request_services
                            $service_stmt = $conn->prepare("INSERT INTO booking_request_services (request_id, service_name) VALUES (?, ?)");
                            $service_stmt->bind_param("is", $request_id, $service_type);
                            $service_stmt->execute();
                            $service_stmt->close();
                            
                            $_SESSION['success_message'] = 'Booking request submitted successfully! Your request is pending approval. You will be notified once it has been reviewed by our team.';
                            $stmt->close();
                        } catch (Exception $e) {
                            $_SESSION['error_message'] = 'Error submitting booking request. Please try again.';
                        }
                    } else {
                        $_SESSION['error_message'] = 'Invalid vehicle selected.';
                    }
                    $verify_stmt->close();
                }
            }
        }
        
        // Redirect to clear POST data
        header("Location: " . $_SERVER['PHP_SELF']);
        exit;
    } elseif (isset($_POST['cancel_booking'])) {
        // Cancel booking
        $booking_id = (int)$_POST['booking_id'];
        
        // Verify that the booking belongs to the customer
        $verify_stmt = $conn->prepare("SELECT booking_id, notes FROM bookings WHERE booking_id = ? AND customer_id = ?");
        $verify_stmt->bind_param("ii", $booking_id, $customerId);
        $verify_stmt->execute();
        $verify_result = $verify_stmt->get_result();
        
        if ($verify_result->num_rows > 0) {
            $booking = $verify_result->fetch_assoc();
            
            // Check if already cancelled
            if ($booking['booking_status'] !== 'Cancelled') {
                try {
                    // Update the booking service type status to Cancelled
                    $stmt = $conn->prepare("UPDATE bookings_service_types SET status = 'Cancelled' WHERE booking_id = ?");
                    $stmt->bind_param("i", $booking_id);
                    $stmt->execute();
                    
                    // Also update the notes for backward compatibility
                    $cancellation_note = 'CANCELLED: ' . date('Y-m-d H:i:s') . ' - Cancelled by customer';
                    $updated_notes = $booking['notes'] ? $booking['notes'] . '\n' . $cancellation_note : $cancellation_note;
                    
                    $stmt2 = $conn->prepare("UPDATE bookings SET notes = ? WHERE booking_id = ?");
                    $stmt2->bind_param("si", $updated_notes, $booking_id);
                    $stmt2->execute();
                    
                    $_SESSION['success_message'] = 'Booking cancelled successfully.';
                    $stmt->close();
                    $stmt2->close();
                } catch (Exception $e) {
                    $_SESSION['error_message'] = 'Error cancelling booking. Please try again.';
                }
            } else {
                $_SESSION['error_message'] = 'This booking is already cancelled.';
            }
        } else {
            $_SESSION['error_message'] = 'Invalid booking selected.';
        }
        $verify_stmt->close();
        
        // Redirect to clear POST data
        header("Location: " . $_SERVER['PHP_SELF']);
        exit;
    }
}

// Get customer vehicles for the dropdown
$vehicles = []; // Initialize as empty array
try {
    $vehiclesQuery = "SELECT * FROM vehicles WHERE customer_id = ? ORDER BY make, model";
    $stmt = $conn->prepare($vehiclesQuery);
    if ($stmt) {
        $stmt->bind_param("i", $customerId);
        $stmt->execute();
        $vehiclesResult = $stmt->get_result();
        while ($vehicle = $vehiclesResult->fetch_assoc()) {
            $vehicles[] = $vehicle;
        }
        $stmt->close();
    }
} catch (Exception $e) {
    // Log error but don't display to user
    error_log("Error fetching vehicles: " . $e->getMessage());
    $vehicles = []; // Ensure it's still an empty array
}

// Get customer bookings with vehicle information and service details
$bookings = []; // Initialize as empty array
try {
    $bookingsQuery = "SELECT b.*, v.make, v.model, v.plate_no,
                             GROUP_CONCAT(
                                 CASE 
                                     WHEN bstp.package_name IS NOT NULL AND bstp.package_name != '' 
                                     THEN CONCAT(bst.service_name, ' (', bstp.package_name, ')')
                                     ELSE bst.service_name
                                 END
                                 SEPARATOR ', '
                             ) as formatted_services,
                             COALESCE(
                                 (SELECT bst_status.status 
                                  FROM bookings_service_types bst_status 
                                  WHERE bst_status.booking_id = b.booking_id 
                                  AND bst_status.status IS NOT NULL 
                                  AND bst_status.status != '' 
                                  LIMIT 1), 
                                 CASE 
                                     WHEN b.notes LIKE '%CANCELLED:%' THEN 'Cancelled'
                                     WHEN b.booking_date < NOW() THEN 'Done'
                                     ELSE 'Scheduled'
                                 END
                             ) as booking_status
                     FROM bookings b 
                     JOIN vehicles v ON b.customer_vehicle_id = v.id 
                     LEFT JOIN bookings_service_types bst ON b.booking_id = bst.booking_id
                     LEFT JOIN bookings_service_type_packages bstp ON bst.service_id = bstp.service_id
                     WHERE b.customer_id = ? 
                     GROUP BY b.booking_id, b.branch_id, b.booking_date, b.customer_id, b.customer_vehicle_id, b.latest_service, b.referred_by, b.service_order, b.created_by, b.notes, b.time_added, v.make, v.model, v.plate_no
                     ORDER BY b.booking_date DESC";
    $stmt = $conn->prepare($bookingsQuery);
    if ($stmt) {
        $stmt->bind_param("i", $customerId);
        $stmt->execute();
        $bookingsResult = $stmt->get_result();
        while ($booking = $bookingsResult->fetch_assoc()) {
            // If no service types found, use latest_service field
            if (empty($booking['formatted_services'])) {
                $booking['formatted_services'] = $booking['latest_service'] ?: 'No service specified';
            }
            $bookings[] = $booking;
        }
        $stmt->close();
    }
} catch (Exception $e) {
    // Log error but don't display to user
    error_log("Error fetching bookings: " . $e->getMessage());
    $bookings = []; // Ensure it's still an empty array
}

// Fetch pending booking requests for this customer
$pendingRequests = [];
try {
    $requestsQuery = "SELECT br.*, 
                             v.make, v.model, v.plate_no,
                             GROUP_CONCAT(brs.service_name SEPARATOR ', ') as formatted_services
                      FROM booking_requests br
                      LEFT JOIN vehicles v ON br.customer_vehicle_id = v.id
                      LEFT JOIN booking_request_services brs ON br.request_id = brs.request_id
                      WHERE br.customer_id = ? AND br.status = 'pending'
                      GROUP BY br.request_id
                      ORDER BY br.time_added DESC";
    $stmt = $conn->prepare($requestsQuery);
    if ($stmt) {
        $stmt->bind_param("i", $customerId);
        $stmt->execute();
        $requestsResult = $stmt->get_result();
        while ($request = $requestsResult->fetch_assoc()) {
            $pendingRequests[] = $request;
        }
        $stmt->close();
    }
} catch (Exception $e) {
    error_log("Error fetching pending requests: " . $e->getMessage());
    $pendingRequests = [];
}

// Include header
include('includes/header.php');
?>

<style>
/* Vibrant Blue Gradient Theme */
@keyframes float {
    0%, 100% { transform: translateY(0px) rotate(0deg); }
    50% { transform: translateY(-20px) rotate(180deg); }
}

/* Ensure full background coverage */
body {
    background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 25%, #bfdbfe 50%, #93c5fd 100%) !important;
    min-height: 100vh !important;
    margin: 0 !important;
    padding: 0 !important;
}

.main-content {
    background: transparent !important;
    min-height: 100vh !important;
    position: relative !important;
}

/* Background overlay for main content area */
.main-content::before {
    content: '' !important;
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 25%, #bfdbfe 50%, #93c5fd 100%) !important;
    z-index: -2 !important;
}

/* Sidebar styling */
.sidebar {
    background: rgba(255, 255, 255, 0.95) !important;
    backdrop-filter: blur(20px) !important;
    border-right: 1px solid rgba(59, 130, 246, 0.1) !important;
}

/* Container styling */
.container-fluid {
    background: transparent !important;
}

.stats-card {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(240, 248, 255, 0.95) 100%) !important;
    backdrop-filter: blur(20px) !important;
    border: 2px solid transparent !important;
    background-clip: padding-box !important;
    border-radius: 24px !important;
    box-shadow: 0 12px 40px rgba(59, 130, 246, 0.15), 0 4px 16px rgba(59, 130, 246, 0.1) !important;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1) !important;
    position: relative !important;
    overflow: hidden !important;
}

.stats-card::before {
    content: '' !important;
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    height: 4px !important;
    background: linear-gradient(90deg, #3b82f6 0%, #1d4ed8 50%, #0ea5e9 100%) !important;
}

.stats-card:hover {
    transform: translateY(-8px) !important;
    box-shadow: 0 20px 60px rgba(59, 130, 246, 0.25), 0 8px 24px rgba(59, 130, 246, 0.15) !important;
}

.booking-card {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(240, 248, 255, 0.95) 100%) !important;
    backdrop-filter: blur(20px) !important;
    border: 1px solid rgba(59, 130, 246, 0.1) !important;
    border-radius: 20px !important;
    box-shadow: 0 8px 32px rgba(59, 130, 246, 0.1) !important;
    transition: all 0.3s ease !important;
}

.booking-card:hover {
    transform: translateY(-4px) !important;
    box-shadow: 0 12px 48px rgba(59, 130, 246, 0.15) !important;
}

.icon-circle {
    width: 50px !important;
    height: 50px !important;
    border-radius: 50% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-size: 20px !important;
}

.btn-primary {
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%) !important;
    border: none !important;
    border-radius: 12px !important;
    padding: 12px 24px !important;
    font-weight: 600 !important;
    transition: all 0.3s ease !important;
}

.btn-primary:hover {
    background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%) !important;
    transform: translateY(-2px) !important;
    box-shadow: 0 8px 24px rgba(59, 130, 246, 0.3) !important;
}

.welcome-section {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(240, 248, 255, 0.95) 100%) !important;
    backdrop-filter: blur(20px) !important;
    border: 1px solid rgba(59, 130, 246, 0.1) !important;
    border-radius: 24px !important;
    box-shadow: 0 12px 40px rgba(59, 130, 246, 0.15) !important;
    padding: 2rem !important;
    margin-bottom: 2rem !important;
}

.section-card {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(240, 248, 255, 0.95) 100%) !important;
    backdrop-filter: blur(20px) !important;
    border: 1px solid rgba(59, 130, 246, 0.1) !important;
    border-radius: 20px !important;
    box-shadow: 0 8px 32px rgba(59, 130, 246, 0.1) !important;
    margin-bottom: 2rem !important;
}

.nav-tabs {
    border: none !important;
    justify-content: center !important;
    margin-bottom: 2rem !important;
}

.nav-tabs .nav-link {
    border: 2px solid rgba(59, 130, 246, 0.2) !important;
    border-radius: 12px !important;
    margin: 0 8px !important;
    padding: 12px 24px !important;
    font-weight: 600 !important;
    color: #3b82f6 !important;
    background: rgba(255, 255, 255, 0.9) !important;
    transition: all 0.3s ease !important;
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.1) !important;
    min-width: 180px !important;
    text-align: center !important;
}

.nav-tabs .nav-link:hover {
    background: rgba(59, 130, 246, 0.1) !important;
    border-color: rgba(59, 130, 246, 0.4) !important;
    color: #1d4ed8 !important;
    transform: translateY(-2px) !important;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2) !important;
}

.nav-tabs .nav-link.active {
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%) !important;
    color: white !important;
    border-color: #3b82f6 !important;
    box-shadow: 0 4px 16px rgba(59, 130, 246, 0.3) !important;
    transform: translateY(-2px) !important;
}

.alert {
    border: none !important;
    border-radius: 16px !important;
    backdrop-filter: blur(20px) !important;
}

.alert-success {
    background: linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(22, 163, 74, 0.1) 100%) !important;
    border: 1px solid rgba(34, 197, 94, 0.2) !important;
    color: #166534 !important;
}

.alert-danger {
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.1) 100%) !important;
    border: 1px solid rgba(239, 68, 68, 0.2) !important;
    color: #991b1b !important;
}

.table {
    background: rgba(255, 255, 255, 0.8) !important;
    backdrop-filter: blur(10px) !important;
    border-radius: 16px !important;
    overflow: hidden !important;
}

.table th {
    background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%) !important;
    border: none !important;
    font-weight: 600 !important;
    color: #374151 !important;
}

.table td {
    border: none !important;
    border-bottom: 1px solid rgba(59, 130, 246, 0.1) !important;
}

.modal-content {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(240, 248, 255, 0.95) 100%) !important;
    backdrop-filter: blur(20px) !important;
    border: 1px solid rgba(59, 130, 246, 0.1) !important;
    border-radius: 20px !important;
    box-shadow: 0 20px 60px rgba(59, 130, 246, 0.2) !important;
}

.form-control, .form-select {
    border: 1px solid rgba(59, 130, 246, 0.2) !important;
    border-radius: 12px !important;
    padding: 12px 16px !important;
    background: rgba(255, 255, 255, 0.8) !important;
    backdrop-filter: blur(10px) !important;
    transition: all 0.3s ease !important;
}

.form-control:focus, .form-select:focus {
    border-color: #3b82f6 !important;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1) !important;
    background: rgba(255, 255, 255, 0.95) !important;
}

.badge {
    border-radius: 8px !important;
    padding: 6px 12px !important;
    font-weight: 600 !important;
}

.badge.bg-success {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
}

.badge.bg-danger {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%) !important;
}

.badge.bg-warning {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%) !important;
}

/* Desktop Styles - Ensure text is visible */
@media (min-width: 769px) {
    .nav-tabs .nav-link {
        font-size: 1rem !important;
        padding: 12px 24px !important;
        min-width: 180px !important;
        text-align: center !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        white-space: nowrap !important;
    }
    
    .nav-tabs .nav-link i {
        font-size: 1rem !important;
        margin-right: 8px !important;
    }
    
    .nav-tabs .nav-link span,
    .nav-tabs .nav-link {
        color: #3b82f6 !important;
        font-weight: 600 !important;
    }
    
    .nav-tabs .nav-link.active {
        color: white !important;
    }
}

/* Custom Calendar Styles */
.custom-calendar {
    background: rgba(255, 255, 255, 0.95) !important;
    border: 1px solid rgba(59, 130, 246, 0.2) !important;
    border-radius: 12px !important;
    padding: 1rem !important;
    box-shadow: 0 4px 16px rgba(59, 130, 246, 0.1) !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 100% !important;
    box-sizing: border-box !important;
}

/* Force calendar container to full width */
#customCalendar {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 100% !important;
    box-sizing: border-box !important;
}

/* Force the column containing the calendar to full width */
#dateTimeFields .col-md-8 {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 100% !important;
    flex: 0 0 66.666667% !important;
    box-sizing: border-box !important;
}

/* Force modal body to use full width */
.modal-body {
    width: 100% !important;
    max-width: 100% !important;
    padding: 1.5rem !important;
    box-sizing: border-box !important;
}

.calendar-header {
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    margin-bottom: 1rem !important;
    padding: 0.5rem !important;
}

.calendar-nav-btn {
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%) !important;
    color: white !important;
    border: none !important;
    border-radius: 8px !important;
    width: 35px !important;
    height: 35px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: pointer !important;
    transition: all 0.3s ease !important;
}

.calendar-nav-btn:hover {
    background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%) !important;
    transform: translateY(-2px) !important;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3) !important;
}

.calendar-nav-btn:disabled {
    background: #e5e7eb !important;
    color: #9ca3af !important;
    cursor: not-allowed !important;
    transform: none !important;
    box-shadow: none !important;
}

.calendar-month-year {
    font-weight: 600 !important;
    color: #374151 !important;
    font-size: 1.1rem !important;
}

.calendar-grid {
    display: grid !important;
    grid-template-columns: repeat(7, 1fr) !important;
    gap: 4px !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 100% !important;
    box-sizing: border-box !important;
}

.calendar-day {
    aspect-ratio: 1 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 8px !important;
    cursor: pointer !important;
    transition: all 0.2s ease !important;
    font-weight: 500 !important;
    position: relative !important;
    min-height: 35px !important;
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
}

.calendar-day-header {
    text-align: center !important;
    font-weight: 600 !important;
    color: #6b7280 !important;
    padding: 8px 4px !important;
    font-size: 0.85rem !important;
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
}

.calendar-day.other-month {
    color: #d1d5db !important;
    cursor: not-allowed !important;
}

.calendar-day.past-date {
    color: #9ca3af !important;
    background: #f3f4f6 !important;
    cursor: not-allowed !important;
}

.calendar-day.available {
    color: #059669 !important;
    background: rgba(16, 185, 129, 0.1) !important;
    border: 1px solid rgba(16, 185, 129, 0.2) !important;
}

.calendar-day.available:hover {
    background: rgba(16, 185, 129, 0.2) !important;
    transform: scale(1.05) !important;
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3) !important;
}

.calendar-day.unavailable {
    color: #dc2626 !important;
    background: rgba(239, 68, 68, 0.1) !important;
    border: 1px solid rgba(239, 68, 68, 0.2) !important;
    cursor: not-allowed !important;
    position: relative !important;
}

.calendar-day.unavailable::after {
    content: '' !important;
    position: absolute !important;
    top: 50% !important;
    left: 10% !important;
    right: 10% !important;
    height: 2px !important;
    background: #dc2626 !important;
    transform: translateY(-50%) !important;
}

.calendar-day.selected {
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%) !important;
    color: white !important;
    border: 2px solid #1d4ed8 !important;
    font-weight: 600 !important;
    transform: scale(1.1) !important;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4) !important;
}

.calendar-day.today {
    border: 2px solid #f59e0b !important;
    font-weight: 600 !important;
}

.calendar-day.today.available {
    border-color: #f59e0b !important;
    box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2) !important;
}

/* Mobile responsive */
.calendar-day.closed {
            background-color: #4b5563;
            color: #9ca3af;
            cursor: not-allowed;
        }
        
        .calendar-day.closed:hover {
            background-color: #4b5563;
            transform: none;
        }
        
        .calendar-legend .legend-color {
            width: 16px;
            height: 16px;
            border-radius: 3px;
            display: inline-block;
        }
        
        .calendar-legend .legend-color.available {
            background-color: #d1fae5;
            border: 1px solid #10b981;
        }
        
        .calendar-legend .legend-color.unavailable {
            background-color: #fee2e2;
            border: 1px solid #ef4444;
        }
        
        .calendar-legend .legend-color.past-date {
            background-color: #f3f4f6;
            border: 1px solid #9ca3af;
        }
        
        .calendar-legend .legend-color.closed {
            background-color: #4b5563;
            border: 1px solid #374151;
        }
        
        @media (max-width: 768px) {
    .custom-calendar {
        padding: 0.75rem !important;
    }
    
    .calendar-day {
        min-height: 30px !important;
        font-size: 0.85rem !important;
    }
    
    .calendar-month-year {
        font-size: 1rem !important;
    }
    
    .calendar-nav-btn {
        width: 30px !important;
        height: 30px !important;
    }
}
@media (max-width: 768px) {
    .nav-tabs .nav-link {
        min-width: 140px !important;
        padding: 10px 16px !important;
        font-size: 0.9rem !important;
        margin: 0 4px !important;
    }
    
    .nav-tabs .nav-link i {
        font-size: 0.8rem !important;
    }
    
    .table {
        font-size: 0.85rem !important;
    }
    
    .table th {
        padding: 0.75rem 0.5rem !important;
        font-size: 0.8rem !important;
    }
    
    .table td {
        padding: 0.75rem 0.5rem !important;
    }
    
    .badge {
        font-size: 0.7rem !important;
        padding: 4px 8px !important;
    }
    
    .welcome-section h1 {
        font-size: 1.5rem !important;
    }
    
    .welcome-section p {
        font-size: 0.9rem !important;
    }
    
    .section-card {
        margin-bottom: 1rem !important;
    }
    
    .card-body {
        padding: 1.5rem !important;
    }
}

@media (max-width: 576px) {
    .nav-tabs {
        flex-direction: column !important;
        align-items: center !important;
    }
    
    .nav-tabs .nav-link {
        min-width: 200px !important;
        margin: 4px 0 !important;
    }
    
    .table th, .table td {
        padding: 0.5rem 0.25rem !important;
        font-size: 0.8rem !important;
    }
    
    .welcome-section {
        text-align: center !important;
    }
    
    .welcome-section .col-md-4 {
        margin-top: 1rem !important;
        text-align: center !important;
    }
}
</style>

<div class="main-content">
    <div class="container-fluid px-4 py-4">
        <!-- Welcome Section -->
        <div class="welcome-section">
            <div class="row align-items-center">
                <div class="col-md-8">
                    <h1 class="h2 mb-2 fw-bold text-primary">My Bookings</h1>
                    <p class="text-muted mb-0">Manage your vehicle service appointments and view booking history</p>
                </div>
                <div class="col-md-4 text-end">
                    <button type="button" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#addBookingModal">
                        <i class="fas fa-plus-circle me-2"></i>Book Now
                    </button>
                </div>
            </div>
        </div>

        <!-- Alert Messages -->
        <?php if (!empty($success_message)): ?>
            <div class="alert alert-success alert-dismissible fade show" role="alert">
                <i class="fas fa-check-circle me-2"></i>
                <?php echo $success_message; ?>
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
        <?php endif; ?>
        
        <?php if (!empty($error_message)): ?>
            <div class="alert alert-danger alert-dismissible fade show" role="alert">
                <i class="fas fa-exclamation-triangle me-2"></i>
                <?php echo $error_message; ?>
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
        <?php endif; ?>

        <!-- Bookings Section -->
        <div class="section-card">
            <div class="card-body p-4">
                <!-- Custom Tabs -->
                <ul class="nav nav-tabs border-0 mb-4" id="bookingTabs" role="tablist">
                    <li class="nav-item" role="presentation">
                        <button class="nav-link active" id="upcoming-tab" data-bs-toggle="tab" data-bs-target="#upcoming" type="button" role="tab" aria-controls="upcoming" aria-selected="true">
                            <i class="fas fa-calendar-check me-2"></i>Upcoming Bookings
                        </button>
                    </li>
                    <li class="nav-item" role="presentation">
                        <button class="nav-link" id="pending-tab" data-bs-toggle="tab" data-bs-target="#pending" type="button" role="tab" aria-controls="pending" aria-selected="false">
                            <i class="fas fa-clock me-2"></i>Pending Requests
                            <?php if (count($pendingRequests) > 0): ?>
                                <span class="badge bg-warning text-dark ms-2"><?php echo count($pendingRequests); ?></span>
                            <?php endif; ?>
                        </button>
                    </li>
                    <li class="nav-item" role="presentation">
                        <button class="nav-link" id="history-tab" data-bs-toggle="tab" data-bs-target="#history" type="button" role="tab" aria-controls="history" aria-selected="false">
                            <i class="fas fa-history me-2"></i>Booking History
                        </button>
                    </li>
                </ul>

                <div class="tab-content" id="bookingTabContent">
                    <!-- Upcoming Bookings -->
                    <div class="tab-pane fade show active" id="upcoming" role="tabpanel" aria-labelledby="upcoming-tab">
                        <?php 
                        $upcoming_bookings = array_filter($bookings, function($booking) {
                            return in_array($booking['booking_status'], ['Scheduled', 'Rescheduled']) && 
                                   strtotime($booking['booking_date']) >= strtotime(date('Y-m-d'));
                        });
                        ?>
                        
                        <?php if (count($upcoming_bookings) > 0): ?>
                            <div class="row">
                                <?php foreach ($upcoming_bookings as $booking): ?>
                                    <div class="col-md-6 col-lg-4 mb-4">
                                        <div class="booking-card h-100">
                                            <div class="card-body p-4">
                                                <div class="d-flex align-items-center mb-3">
                                                    <div class="icon-circle bg-primary text-white me-3">
                                                        <i class="fas fa-car"></i>
                                                    </div>
                                                    <div>
                                                        <h6 class="card-title mb-0 fw-bold"><?php echo htmlspecialchars(($booking['make'] ?? '') . ' ' . ($booking['model'] ?? '')); ?></h6>
                                                        <small class="text-muted"><?php echo htmlspecialchars($booking['plate_no'] ?? ''); ?></small>
                                                    </div>
                                                </div>
                                                
                                                <div class="mb-3">
                                                    <div class="d-flex justify-content-between align-items-center mb-2">
                                                        <span class="text-muted">Date:</span>
                                                        <span class="fw-bold"><?php echo date('M d, Y', strtotime($booking['booking_date'])); ?></span>
                                                    </div>
                                                    <div class="d-flex justify-content-between align-items-center mb-2">
                                                        <span class="text-muted">Time:</span>
                                                        <span class="fw-bold"><?php echo date('h:i A', strtotime($booking['booking_date'])); ?></span>
                                                    </div>
                                                    <div class="d-flex justify-content-between align-items-center mb-2">
                                                        <span class="text-muted">Service:</span>
                                                        <span class="fw-bold"><?php echo htmlspecialchars($booking['formatted_services']); ?></span>
                                                    </div>
                                                    <div class="d-flex justify-content-between align-items-center">
                                                        <span class="text-muted">Status:</span>
                                                        <?php 
                                                        $status_class = match($booking['booking_status']) {
                                                            'Scheduled' => 'bg-success',
                                                            'Rescheduled' => 'bg-warning',
                                                            default => 'bg-primary'
                                                        };
                                                        ?>
                                                        <span class="badge <?php echo $status_class; ?>"><?php echo $booking['booking_status']; ?></span>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div class="card-footer bg-transparent border-0 p-4 pt-0">
                                                <form method="POST" onsubmit="return confirm('Are you sure you want to cancel this booking?');">
                                                    <input type="hidden" name="cancel_booking" value="1">
                                                    <input type="hidden" name="booking_id" value="<?php echo $booking['booking_id']; ?>">
                                                    <button type="submit" class="btn btn-outline-danger btn-sm w-100">
                                                        <i class="fas fa-times-circle me-2"></i>Cancel Booking
                                                    </button>
                                                </form>
                                            </div>
                                        </div>
                                    </div>
                                <?php endforeach; ?>
                            </div>
                        <?php else: ?>
                            <div class="text-center py-5">
                                <div class="mb-3">
                                    <i class="fas fa-calendar-times" style="font-size: 4rem; color: #9ca3af;"></i>
                                </div>
                                <h5 class="text-muted mb-3">No Upcoming Bookings</h5>
                                <p class="text-muted mb-4">You don't have any upcoming bookings. Schedule your next service appointment.</p>
                                <button type="button" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#addBookingModal">
                                    <i class="fas fa-plus-circle me-2"></i>Book Now
                                </button>
                            </div>
                        <?php endif; ?>
                    </div>

                    <!-- Pending Requests Tab -->
                    <div class="tab-pane fade" id="pending" role="tabpanel" aria-labelledby="pending-tab">
                        <?php if (count($pendingRequests) > 0): ?>
                            <div class="row">
                                <?php foreach ($pendingRequests as $request): ?>
                                    <div class="col-md-6 col-lg-4 mb-4">
                                        <div class="booking-card h-100" style="border-left: 4px solid #f59e0b;">
                                            <div class="card-body p-4">
                                                <div class="d-flex align-items-center justify-content-between mb-3">
                                                    <div class="d-flex align-items-center">
                                                        <div class="icon-circle bg-warning text-white me-3">
                                                            <i class="fas fa-clock"></i>
                                                        </div>
                                                        <div>
                                                            <h6 class="card-title mb-0 fw-bold"><?php echo htmlspecialchars(($request['make'] ?? '') . ' ' . ($request['model'] ?? '')); ?></h6>
                                                            <small class="text-muted"><?php echo htmlspecialchars($request['plate_no'] ?? ''); ?></small>
                                                        </div>
                                                    </div>
                                                    <span class="badge bg-warning text-dark">Pending</span>
                                                </div>
                                                
                                                <div class="mb-3">
                                                    <div class="d-flex justify-content-between align-items-center mb-2">
                                                        <span class="text-muted">Date:</span>
                                                        <span class="fw-bold"><?php echo date('M d, Y', strtotime($request['booking_date'])); ?></span>
                                                    </div>
                                                    <div class="d-flex justify-content-between align-items-center mb-2">
                                                        <span class="text-muted">Time:</span>
                                                        <span class="fw-bold"><?php echo date('h:i A', strtotime($request['booking_date'])); ?></span>
                                                    </div>
                                                    <div class="d-flex justify-content-between align-items-center mb-2">
                                                        <span class="text-muted">Service:</span>
                                                        <span class="fw-bold"><?php echo htmlspecialchars($request['formatted_services']); ?></span>
                                                    </div>
                                                    <div class="d-flex justify-content-between align-items-center">
                                                        <span class="text-muted">Submitted:</span>
                                                        <span class="fw-bold"><?php echo date('M d, Y', strtotime($request['time_added'])); ?></span>
                                                    </div>
                                                </div>
                                                
                                                <?php if (!empty($request['notes'])): ?>
                                                    <div class="alert alert-info mb-0">
                                                        <small><strong>Notes:</strong> <?php echo nl2br(htmlspecialchars($request['notes'])); ?></small>
                                                    </div>
                                                <?php endif; ?>
                                                
                                                <div class="mt-3">
                                                    <small class="text-muted">
                                                        <i class="fas fa-info-circle me-1"></i>
                                                        Your request is being reviewed by our team. You will be notified once it's approved.
                                                    </small>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                <?php endforeach; ?>
                            </div>
                        <?php else: ?>
                            <div class="text-center py-5">
                                <div class="empty-state-icon mb-3">
                                    <i class="fas fa-check-circle"></i>
                                </div>
                                <h5 class="text-muted mb-3">No Pending Requests</h5>
                                <p class="text-muted">All your booking requests have been processed.</p>
                                <button type="button" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#bookingModal">
                                    <i class="fas fa-plus-circle me-2"></i>Book Now
                                </button>
                            </div>
                        <?php endif; ?>
                    </div>

                    <!-- Booking History -->
                    <div class="tab-pane fade" id="history" role="tabpanel" aria-labelledby="history-tab">
                        <?php 
                        $past_bookings = array_filter($bookings, function($booking) {
                            return strtotime($booking['booking_date']) < strtotime(date('Y-m-d')) ||
                                   in_array($booking['booking_status'], ['Done', 'Cancelled']);
                        });
                        ?>
                        
                        <?php if (count($past_bookings) > 0): ?>
                            <!-- Desktop Table -->
                            <div class="d-none d-md-block">
                                <div class="table-responsive">
                                    <table class="table table-hover">
                                        <thead>
                                            <tr>
                                                <th>#</th>
                                                <th>Date & Time</th>
                                                <th>Vehicle</th>
                                                <th>Service</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <?php 
                                            $counter = 1;
                                            foreach ($past_bookings as $booking): ?>
                                                <?php 
                                                $status_text = $booking['booking_status'];
                                                $status_class = match($booking['booking_status']) {
                                                    'Cancelled' => 'bg-danger',
                                                    'Done' => 'bg-success',
                                                    'Scheduled' => 'bg-primary',
                                                    'Rescheduled' => 'bg-warning',
                                                    default => 'bg-secondary'
                                                };
                                                ?>
                                                <tr>
                                                    <td>
                                                        <span class="badge bg-light text-dark"><?php echo $counter++; ?></span>
                                                    </td>
                                                    <td>
                                                        <div class="fw-bold"><?php echo date('M d, Y', strtotime($booking['booking_date'])); ?></div>
                                                        <small class="text-muted"><?php echo date('h:i A', strtotime($booking['booking_date'])); ?></small>
                                                    </td>
                                                    <td>
                                                        <div class="fw-bold"><?php echo htmlspecialchars(($booking['make'] ?? '') . ' ' . ($booking['model'] ?? '')); ?></div>
                                                        <small class="text-muted"><?php echo htmlspecialchars($booking['plate_no'] ?? ''); ?></small>
                                                    </td>
                                                    <td><?php echo htmlspecialchars($booking['formatted_services']); ?></td>
                                                    <td>
                                                        <span class="badge <?php echo $status_class; ?>">
                                                            <?php echo $status_text; ?>
                                                        </span>
                                                    </td>
                                                </tr>
                                            <?php endforeach; ?>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <!-- Mobile Cards -->
                            <div class="d-md-none">
                                <?php 
                                $counter = 1;
                                foreach ($past_bookings as $booking): ?>
                                    <?php 
                                    $status_text = $booking['booking_status'];
                                    $status_class = match($booking['booking_status']) {
                                        'Cancelled' => 'bg-danger',
                                        'Done' => 'bg-success',
                                        'Scheduled' => 'bg-primary',
                                        'Rescheduled' => 'bg-warning',
                                        default => 'bg-secondary'
                                    };
                                    ?>
                                    <div class="card mb-3">
                                        <div class="card-body">
                                            <div class="d-flex justify-content-between align-items-start mb-2">
                                                <div class="d-flex align-items-center">
                                                    <span class="badge bg-light text-dark me-2"><?php echo $counter++; ?></span>
                                                    <div>
                                                        <div class="fw-bold"><?php echo date('M d, Y', strtotime($booking['booking_date'])); ?></div>
                                                        <small class="text-muted"><?php echo date('h:i A', strtotime($booking['booking_date'])); ?></small>
                                                    </div>
                                                </div>
                                                <span class="badge <?php echo $status_class; ?>">
                                                    <?php echo $status_text; ?>
                                                </span>
                                            </div>
                                            <div class="mb-2">
                                                <strong>Vehicle:</strong> <?php echo htmlspecialchars(($booking['make'] ?? '') . ' ' . ($booking['model'] ?? '')); ?>
                                                <br><small class="text-muted"><?php echo htmlspecialchars($booking['plate_no'] ?? ''); ?></small>
                                            </div>
                                            <div>
                                                <strong>Service:</strong> <?php echo htmlspecialchars($booking['formatted_services']); ?>
                                            </div>
                                        </div>
                                    </div>
                                <?php endforeach; ?>
                            </div>
                        <?php else: ?>
                            <div class="text-center py-5">
                                <div class="mb-3">
                                    <i class="fas fa-history" style="font-size: 4rem; color: #9ca3af;"></i>
                                </div>
                                <h5 class="text-muted mb-3">No Booking History</h5>
                                <p class="text-muted">You don't have any past bookings yet.</p>
                            </div>
                        <?php endif; ?>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Add Booking Modal -->
<div class="modal fade" id="addBookingModal" tabindex="-1" aria-labelledby="addBookingModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header border-0 pb-0">
                <h5 class="modal-title fw-bold text-primary" id="addBookingModalLabel">
                    <i class="fas fa-calendar-plus me-2"></i>Schedule Service Appointment
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body p-4">
                <form method="POST" id="bookingForm">
                    <input type="hidden" name="add_booking" value="1">
                    
                    <?php if (isset($vehicles) && is_array($vehicles) && count($vehicles) > 0): ?>
                        <div class="row">
                            <div class="col-md-6 mb-3">
                                <label for="vehicle_id" class="form-label fw-bold">
                                    <i class="fas fa-car me-2 text-primary"></i>Select Vehicle
                                </label>
                                <select class="form-select" id="vehicle_id" name="vehicle_id" required>
                                     <option value="">Choose your vehicle...</option>
                                     <?php foreach ($vehicles as $vehicle): ?>
                                         <?php $vehicleId = $vehicle['vehicle_id'] ?? $vehicle['id'] ?? ''; ?>
                                         <option value="<?php echo htmlspecialchars($vehicleId); ?>" 
                                                 <?php echo ($selected_vehicle_id && $vehicleId == $selected_vehicle_id) ? 'selected' : ''; ?>>
                                             <?php 
                                             $year = htmlspecialchars($vehicle['year'] ?? '');
                                             $make = htmlspecialchars($vehicle['make'] ?? '');
                                             $model = htmlspecialchars($vehicle['model'] ?? '');
                                             $plate = htmlspecialchars($vehicle['plate_no'] ?? '');
                                             echo trim($year . ' ' . $make . ' ' . $model . ' (' . $plate . ')');
                                             ?>
                                         </option>
                                     <?php endforeach; ?>
                                 </select>
                            </div>
                            
                            <div class="col-md-6 mb-3">
                                <label for="service_type" class="form-label fw-bold">
                                    <i class="fas fa-spray-can me-2 text-primary"></i>Service Type
                                </label>
                                <select class="form-select" id="service_type" name="service_type" required>
                                     <option value="">Select service...</option>
                                     <option value="Nano Ceramic Coating">Nano Ceramic Coating (MNCC)</option>
                                     <option value="Nano Ceramic Tint">Nano Ceramic Tint (MCT)</option>
                                     <option value="Auto Paint & Repair">Auto Paint & Repair (MAP)</option>
                                     <option value="Nano Fix (Maintenance)">Nano Fix Maintenance (MNF)</option>
                                     <option value="Go & Clean">Go & Clean (GCS)</option>
                                     <option value="PPF">PPF</option>
                                 </select>
                            </div>
                        </div>
                        
                        <!-- Date and Time Selection (Initially Hidden) -->
                        <div id="dateTimeSection" class="row" style="display: none;">
                            <div class="col-12 mb-3">
                                <div class="alert alert-info border-0">
                                    <i class="fas fa-info-circle me-2"></i>
                                    <strong>Checking availability...</strong> Please wait while we load available dates for your selected service.
                                </div>
                            </div>
                        </div>
                        
                        <div id="dateTimeFields" class="row" style="display: none;">
                            <div class="col-md-8 mb-3">
                                <label for="booking_date" class="form-label fw-bold">
                                    <i class="fas fa-calendar me-2 text-primary"></i>Available Dates
                                </label>
                                <input type="hidden" id="booking_date" name="booking_date" required>
                                <div id="customCalendar" class="custom-calendar">
                                    <!-- Custom calendar will be generated here -->
                                </div>
                                <small class="text-muted">
                                    <span class="text-success">●</span> Available &nbsp;&nbsp;
                                    <span class="text-danger">●</span> Fully Booked &nbsp;&nbsp;
                                    <span class="text-muted">●</span> Past Date
                                </small>
                            </div>
                            
                            <div class="col-md-4 mb-3">
                                <label for="booking_time" class="form-label fw-bold">
                                    <i class="fas fa-clock me-2 text-primary"></i>Available Times
                                </label>
                                <select class="form-select" id="booking_time" name="booking_time" required>
                                     <option value="">Select date first...</option>
                                 </select>
                            </div>
                        </div>
                        
                        <div class="mb-3">
                            <label for="notes" class="form-label fw-bold">
                                <i class="fas fa-sticky-note me-2 text-primary"></i>Additional Notes (Optional)
                            </label>
                            <textarea class="form-control" id="notes" name="notes" rows="3" placeholder="Any specific requirements or issues you'd like us to know about..."></textarea>
                        </div>
                        
                        <div class="alert alert-info border-0">
                            <i class="fas fa-info-circle me-2"></i>
                            <strong>Note:</strong> This is a booking request. We'll confirm your appointment within 24 hours.
                        </div>
                        
                    <?php else: ?>
                        <div class="text-center py-4">
                            <div class="mb-3">
                                <i class="fas fa-car-side" style="font-size: 3rem; color: #6b7280;"></i>
                            </div>
                            <h5 class="text-muted mb-3">No Vehicles Found</h5>
                            <p class="text-muted mb-4">You need to add a vehicle before you can book a service appointment.</p>
                            <a href="vehicles.php" class="btn btn-primary">
                                 <i class="fas fa-plus-circle me-2"></i>Add Vehicle
                             </a>
                        </div>
                    <?php endif; ?>
                </form>
            </div>
            
            <?php if (isset($vehicles) && is_array($vehicles) && count($vehicles) > 0): ?>
                <div class="modal-footer border-0 pt-0">
                    <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">
                        <i class="fas fa-times me-2"></i>Cancel
                    </button>
                    <button type="submit" form="bookingForm" class="btn btn-primary">
                        <i class="fas fa-calendar-check me-2"></i>Book Appointment
                    </button>
                </div>
            <?php endif; ?>
        </div>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    <?php if ($is_new_booking || !empty($selected_vehicle_id)): ?>
    // Auto-open booking modal if in new booking mode or vehicle_id is specified
    var bookingModal = new bootstrap.Modal(document.getElementById('addBookingModal'));
    bookingModal.show();
    <?php endif; ?>
    
    // Service availability checking
    const serviceSelect = document.getElementById('service_type');
    const dateTimeSection = document.getElementById('dateTimeSection');
    const dateTimeFields = document.getElementById('dateTimeFields');
    const dateInput = document.getElementById('booking_date');
    const timeSelect = document.getElementById('booking_time');
    
    let availableDates = [];
    let currentService = '';
    let currentMonth = new Date().getMonth();
    let currentYear = new Date().getFullYear();
    let selectedDate = null;
    
    // Handle service type selection
    serviceSelect.addEventListener('change', function() {
        const selectedService = this.value;
        
        if (selectedService) {
            currentService = selectedService;
            showLoadingState();
            loadAvailableDates(selectedService);
        } else {
            hideDateTime();
        }
    });
    
    function showLoadingState() {
        dateTimeSection.style.display = 'block';
        dateTimeFields.style.display = 'none';
        document.getElementById('booking_date').value = '';
        timeSelect.innerHTML = '<option value="">Select date first...</option>';
        selectedDate = null;
    }
    
    function hideDateTime() {
        dateTimeSection.style.display = 'none';
        dateTimeFields.style.display = 'none';
        document.getElementById('booking_date').value = '';
        timeSelect.innerHTML = '<option value="">Select date first...</option>';
        currentService = '';
        selectedDate = null;
    }
    
    function loadAvailableDates(service) {
        fetch('api/check_availability.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'get_available_dates',
                service: service
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                availableDates = data.dates;
                showDateTimeFields();
                generateCalendar();
            } else {
                console.error('Error loading dates:', data.error);
                showError('Failed to load available dates. Please try again.');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showError('Failed to load available dates. Please try again.');
        });
    }
    
    function showDateTimeFields() {
        dateTimeSection.innerHTML = `
            <div class="col-12 mb-3">
                <div class="alert alert-success border-0">
                    <i class="fas fa-check-circle me-2"></i>
                    <strong>Availability loaded!</strong> Please select your preferred date and time.
                </div>
            </div>
        `;
        dateTimeFields.style.display = 'block';
    }
    
    function generateCalendar() {
        const calendar = document.getElementById('customCalendar');
        
        // Create dates in Manila timezone to match server
        const today = new Date();
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - firstDay.getDay());
        
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        
        let calendarHTML = `
            <div class="calendar-header">
                <button type="button" class="calendar-nav-btn" onclick="changeMonth(-1)">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <div class="calendar-month-year">
                    ${monthNames[currentMonth]} ${currentYear}
                </div>
                <button type="button" class="calendar-nav-btn" onclick="changeMonth(1)">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
            <div class="calendar-grid">
        `;
        
        // Add day headers
        dayNames.forEach(day => {
            calendarHTML += `<div class="calendar-day-header">${day}</div>`;
        });
        
        // Add calendar days
        const currentDate = new Date(startDate);
        for (let i = 0; i < 42; i++) {
            // Format date to match server format (YYYY-MM-DD)
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const day = String(currentDate.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            
            const isCurrentMonth = currentDate.getMonth() === currentMonth;
            const isPastDate = currentDate < today.setHours(0, 0, 0, 0);
            const isToday = currentDate.toDateString() === new Date().toDateString();
            const isSunday = currentDate.getDay() === 0; // Sunday = 0
            
            let dayClass = 'calendar-day';
            let clickable = false;
            
            if (!isCurrentMonth) {
                dayClass += ' other-month';
            } else if (isPastDate) {
                dayClass += ' past-date';
            } else if (isSunday) {
                dayClass += ' closed'; // Sundays are closed (different from unavailable/booked)
            } else {
                // Check availability for business days (Monday-Saturday)
                const dateInfo = availableDates.find(d => d.date === dateStr);
                if (dateInfo) {
                    if (dateInfo.available) {
                        dayClass += ' available';
                        clickable = true;
                    } else {
                        dayClass += ' unavailable';
                    }
                } else {
                    // If no data found, assume available for business days
                    dayClass += ' available';
                    clickable = true;
                }
            }
            
            if (isToday) {
                dayClass += ' today';
            }
            
            if (selectedDate === dateStr) {
                dayClass += ' selected';
            }
            
            const clickHandler = clickable ? `onclick="selectDate('${dateStr}')"` : '';
            
            calendarHTML += `
                <div class="${dayClass}" ${clickHandler}>
                    ${currentDate.getDate()}
                </div>
            `;
            
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        calendarHTML += `
            </div>
            <div class="calendar-legend mt-3">
                 <div class="d-flex flex-wrap gap-3 justify-content-center">
                     <div class="d-flex align-items-center">
                         <div class="legend-color available me-2"></div>
                         <small>Available</small>
                     </div>
                     <div class="d-flex align-items-center">
                         <div class="legend-color unavailable me-2"></div>
                         <small>Fully Booked</small>
                     </div>
                     <div class="d-flex align-items-center">
                         <div class="legend-color closed me-2"></div>
                         <small>Closed</small>
                     </div>
                     <div class="d-flex align-items-center">
                         <div class="legend-color past-date me-2"></div>
                         <small>Past Date</small>
                     </div>
                 </div>
                <div class="text-center mt-2">
                    <small class="text-muted">
                        <i class="fas fa-clock me-1"></i>
                        Business Hours: Monday - Saturday, 8:00 AM - 8:00 PM<br>
                        <i class="fas fa-calendar-check me-1"></i>
                        Booking Times: 8:00 AM - 3:00 PM
                    </small>
                </div>
            </div>
        `;
        calendar.innerHTML = calendarHTML;
    }
    
    // Make functions global so they can be called from onclick handlers
    window.changeMonth = function(direction) {
        const today = new Date();
        let newMonth = currentMonth + direction;
        let newYear = currentYear;
        
        // Handle year transitions
        if (newMonth < 0) {
            newMonth = 11;
            newYear--;
        } else if (newMonth > 11) {
            newMonth = 0;
            newYear++;
        }
        
        // Prevent going to past months
        if (newYear < today.getFullYear() || 
            (newYear === today.getFullYear() && newMonth < today.getMonth())) {
            return; // Don't allow navigation to past months
        }
        
        currentMonth = newMonth;
        currentYear = newYear;
        generateCalendar();
    };
    
    window.selectDate = function(dateStr) {
        const dateInfo = availableDates.find(d => d.date === dateStr);
        if (dateInfo && dateInfo.available) {
            selectedDate = dateStr;
            document.getElementById('booking_date').value = dateStr;
            generateCalendar(); // Refresh to show selection
            loadAvailableTimes(currentService, dateStr);
        }
    };
    
    function loadAvailableTimes(service, date) {
        // Check if the selected date is available
        const dateInfo = availableDates.find(d => d.date === date);
        if (!dateInfo || !dateInfo.available) {
            timeSelect.innerHTML = '<option value="">Date not available</option>';
            return;
        }
        
        timeSelect.innerHTML = '<option value="">Loading times...</option>';
        
        fetch('api/check_availability.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'get_available_times',
                service: service,
                date: date
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                populateTimeSlots(data.times);
            } else {
                console.error('Error loading times:', data.error);
                timeSelect.innerHTML = '<option value="">Error loading times</option>';
            }
        })
        .catch(error => {
            console.error('Error:', error);
            timeSelect.innerHTML = '<option value="">Error loading times</option>';
        });
    }
    
    function populateTimeSlots(times) {
        timeSelect.innerHTML = '<option value="">Select time...</option>';
        
        times.forEach(timeSlot => {
            const option = document.createElement('option');
            option.value = timeSlot.time;
            option.textContent = timeSlot.label;
            
            if (!timeSlot.available) {
                option.disabled = true;
                option.textContent += ' (Fully Booked)';
                option.style.color = '#6b7280';
            }
            
            timeSelect.appendChild(option);
        });
        
        // If no times are available
        if (times.every(t => !t.available)) {
            timeSelect.innerHTML = '<option value="">No times available for this date</option>';
        }
    }
    
    function showError(message) {
        dateTimeSection.innerHTML = `
            <div class="col-12 mb-3">
                <div class="alert alert-danger border-0">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    <strong>Error:</strong> ${message}
                </div>
            </div>
        `;
        dateTimeFields.style.display = 'none';
    }
    
    // Form validation
    document.getElementById('bookingForm').addEventListener('submit', function(e) {
        const selectedDateValue = document.getElementById('booking_date').value;
        const selectedTime = timeSelect.value;
        
        if (currentService && selectedDateValue) {
            const dateInfo = availableDates.find(d => d.date === selectedDateValue);
            if (dateInfo && !dateInfo.available) {
                e.preventDefault();
                alert('The selected date is not available for this service. Please choose another date.');
                return false;
            }
        }
        
        if (!selectedTime && currentService) {
            e.preventDefault();
            alert('Please select an available time slot.');
            return false;
        }
    });
});
</script>

<?php include('includes/footer.php'); ?>