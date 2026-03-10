<?php
// Include database configuration
require_once('db_connect.php');
require_once('config.php');

// Session is started in config.php

// Check if user is logged in
$isLoggedIn = isset($_SESSION['customer_id']) && !empty($_SESSION['customer_id']);

// Redirect to login page if not logged in
if (!$isLoggedIn) {
    header('Location: login.php');
    exit;
}

// Function to get vehicle icon based on make/model
function getVehicleIcon($make, $model = '') {
    $make = strtolower(trim($make));
    $model = strtolower(trim($model));
    
    // Define icon mappings
    $iconMap = [
        'toyota' => ['icon' => 'fas fa-car', 'color' => '#e53e3e', 'bg' => 'linear-gradient(135deg, #e53e3e 0%, #c53030 100%)'],
        'honda' => ['icon' => 'fas fa-car', 'color' => '#3182ce', 'bg' => 'linear-gradient(135deg, #3182ce 0%, #2c5aa0 100%)'],
        'nissan' => ['icon' => 'fas fa-car', 'color' => '#d69e2e', 'bg' => 'linear-gradient(135deg, #d69e2e 0%, #b7791f 100%)'],
        'mitsubishi' => ['icon' => 'fas fa-car', 'color' => '#38a169', 'bg' => 'linear-gradient(135deg, #38a169 0%, #2f855a 100%)'],
        'hyundai' => ['icon' => 'fas fa-car', 'color' => '#805ad5', 'bg' => 'linear-gradient(135deg, #805ad5 0%, #6b46c1 100%)'],
        'kia' => ['icon' => 'fas fa-car', 'color' => '#e53e3e', 'bg' => 'linear-gradient(135deg, #e53e3e 0%, #c53030 100%)'],
        'mazda' => ['icon' => 'fas fa-car', 'color' => '#dd6b20', 'bg' => 'linear-gradient(135deg, #dd6b20 0%, #c05621 100%)'],
        'subaru' => ['icon' => 'fas fa-car', 'color' => '#3182ce', 'bg' => 'linear-gradient(135deg, #3182ce 0%, #2c5aa0 100%)'],
        'suzuki' => ['icon' => 'fas fa-car', 'color' => '#38a169', 'bg' => 'linear-gradient(135deg, #38a169 0%, #2f855a 100%)'],
        'isuzu' => ['icon' => 'fas fa-truck', 'color' => '#d69e2e', 'bg' => 'linear-gradient(135deg, #d69e2e 0%, #b7791f 100%)'],
        'ford' => ['icon' => 'fas fa-car', 'color' => '#3182ce', 'bg' => 'linear-gradient(135deg, #3182ce 0%, #2c5aa0 100%)'],
        'chevrolet' => ['icon' => 'fas fa-car', 'color' => '#d69e2e', 'bg' => 'linear-gradient(135deg, #d69e2e 0%, #b7791f 100%)'],
        'bmw' => ['icon' => 'fas fa-car', 'color' => '#4a5568', 'bg' => 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)'],
        'mercedes' => ['icon' => 'fas fa-car', 'color' => '#4a5568', 'bg' => 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)'],
        'audi' => ['icon' => 'fas fa-car', 'color' => '#4a5568', 'bg' => 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)'],
        'volkswagen' => ['icon' => 'fas fa-car', 'color' => '#3182ce', 'bg' => 'linear-gradient(135deg, #3182ce 0%, #2c5aa0 100%)'],
        'tesla' => ['icon' => 'fas fa-bolt', 'color' => '#e53e3e', 'bg' => 'linear-gradient(135deg, #e53e3e 0%, #c53030 100%)'],
        'lexus' => ['icon' => 'fas fa-car', 'color' => '#4a5568', 'bg' => 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)'],
        'infiniti' => ['icon' => 'fas fa-car', 'color' => '#4a5568', 'bg' => 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)'],
        'acura' => ['icon' => 'fas fa-car', 'color' => '#4a5568', 'bg' => 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)'],
    ];
    
    // Check for specific models that might need different icons
    if (strpos($model, 'truck') !== false || strpos($model, 'pickup') !== false) {
        return ['icon' => 'fas fa-truck', 'color' => '#d69e2e', 'bg' => 'linear-gradient(135deg, #d69e2e 0%, #b7791f 100%)'];
    }
    
    if (strpos($model, 'suv') !== false || strpos($model, 'innova') !== false || strpos($model, 'fortuner') !== false) {
        return ['icon' => 'fas fa-car-side', 'color' => '#38a169', 'bg' => 'linear-gradient(135deg, #38a169 0%, #2f855a 100%)'];
    }
    
    if (strpos($model, 'van') !== false || strpos($model, 'hiace') !== false) {
        return ['icon' => 'fas fa-shuttle-van', 'color' => '#805ad5', 'bg' => 'linear-gradient(135deg, #805ad5 0%, #6b46c1 100%)'];
    }
    
    // Return brand-specific icon or default
    return $iconMap[$make] ?? ['icon' => 'fas fa-car', 'color' => '#0ea5e9', 'bg' => 'linear-gradient(135deg, #0ea5e9 0%, #1e40af 100%)'];
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

// Get customer vehicles
$vehiclesQuery = "SELECT * FROM vehicles WHERE customer_id = ?";
$stmt = $conn->prepare($vehiclesQuery);
$stmt->bind_param("i", $customerId);
$stmt->execute();
$vehiclesResult = $stmt->get_result();
$vehicles = [];
while ($vehicle = $vehiclesResult->fetch_assoc()) {
    $vehicles[] = $vehicle;
}
$stmt->close();

// Get customer bookings with service details
$bookingsQuery = "SELECT b.*, v.make, v.model, v.plate_no,
                         GROUP_CONCAT(
                             CASE 
                                 WHEN bstp.package_name IS NOT NULL AND bstp.package_name != '' 
                                 THEN CONCAT(bst.service_name, ' (', bstp.package_name, ')')
                                 ELSE bst.service_name
                             END
                             SEPARATOR ', '
                         ) as formatted_services
                 FROM bookings b 
                 JOIN vehicles v ON b.customer_vehicle_id = v.id 
                 LEFT JOIN bookings_service_types bst ON b.booking_id = bst.booking_id
                 LEFT JOIN bookings_service_type_packages bstp ON bst.service_id = bstp.service_id
                 WHERE b.customer_id = ? 
                 GROUP BY b.booking_id, b.branch_id, b.booking_date, b.customer_id, b.customer_vehicle_id, b.latest_service, b.referred_by, b.service_order, b.created_by, b.notes, b.time_added, v.make, v.model, v.plate_no
                 ORDER BY b.booking_date DESC";
$stmt = $conn->prepare($bookingsQuery);
$stmt->bind_param("i", $customerId);
$stmt->execute();
$bookingsResult = $stmt->get_result();
$bookings = [];
while ($booking = $bookingsResult->fetch_assoc()) {
    $bookings[] = $booking;
}
$stmt->close();

// Calculate stats
$totalVehicles = count($vehicles);

// Calculate vehicles needing service (last service > 6 months ago)
$sixMonthsAgo = date('Y-m-d', strtotime('-6 months'));
$vehiclesNeedingService = 0;
foreach ($vehicles as $vehicle) {
    // Check if vehicle has a booking in the last 6 months
    $lastServiceQuery = "SELECT MAX(booking_date) as last_service 
                         FROM bookings 
                         WHERE customer_vehicle_id = ?";
    $stmt = $conn->prepare($lastServiceQuery);
    $stmt->bind_param("i", $vehicle['id']);
    $stmt->execute();
    $lastServiceResult = $stmt->get_result();
    $lastService = $lastServiceResult->fetch_assoc();
    $stmt->close();
    
    if (!$lastService['last_service'] || $lastService['last_service'] < $sixMonthsAgo) {
        $vehiclesNeedingService++;
    }
}

// Get upcoming bookings with service details
$upcomingBookingsQuery = "SELECT b.*, v.make, v.model, v.plate_no,
                                 GROUP_CONCAT(
                                     CASE 
                                         WHEN bstp.package_name IS NOT NULL AND bstp.package_name != '' 
                                         THEN CONCAT(bst.service_name, ' (', bstp.package_name, ')')
                                         ELSE bst.service_name
                                     END
                                     SEPARATOR ', '
                                 ) as formatted_services
                         FROM bookings b 
                         JOIN vehicles v ON b.customer_vehicle_id = v.id 
                         LEFT JOIN bookings_service_types bst ON b.booking_id = bst.booking_id
                         LEFT JOIN bookings_service_type_packages bstp ON bst.service_id = bstp.service_id
                         WHERE b.customer_id = ? AND b.booking_date >= CURDATE() 
                         GROUP BY b.booking_id, b.branch_id, b.booking_date, b.customer_id, b.customer_vehicle_id, b.latest_service, b.referred_by, b.service_order, b.created_by, b.notes, b.time_added, v.make, v.model, v.plate_no
                         ORDER BY b.booking_date ASC";
$stmt = $conn->prepare($upcomingBookingsQuery);
$stmt->bind_param("i", $customerId);
$stmt->execute();
$upcomingBookingsResult = $stmt->get_result();
$upcomingBookings = [];
while ($booking = $upcomingBookingsResult->fetch_assoc()) {
    $upcomingBookings[] = $booking;
}
$stmt->close();

// Get completed bookings with service details
$completedBookingsQuery = "SELECT b.*, v.make, v.model, v.plate_no,
                                  GROUP_CONCAT(
                                      CASE 
                                          WHEN bstp.package_name IS NOT NULL AND bstp.package_name != '' 
                                          THEN CONCAT(bst.service_name, ' (', bstp.package_name, ')')
                                          ELSE bst.service_name
                                      END
                                      SEPARATOR ', '
                                  ) as formatted_services
                          FROM bookings b 
                          JOIN vehicles v ON b.customer_vehicle_id = v.id 
                          LEFT JOIN bookings_service_types bst ON b.booking_id = bst.booking_id
                          LEFT JOIN bookings_service_type_packages bstp ON bst.service_id = bstp.service_id
                          WHERE b.customer_id = ? AND b.booking_date < CURDATE() 
                          GROUP BY b.booking_id, b.branch_id, b.booking_date, b.customer_id, b.customer_vehicle_id, b.latest_service, b.referred_by, b.service_order, b.created_by, b.notes, b.time_added, v.make, v.model, v.plate_no
                          ORDER BY b.booking_date DESC 
                          LIMIT 5";
$stmt = $conn->prepare($completedBookingsQuery);
$stmt->bind_param("i", $customerId);
$stmt->execute();
$completedBookingsResult = $stmt->get_result();
$completedBookings = [];
while ($booking = $completedBookingsResult->fetch_assoc()) {
    $completedBookings[] = $booking;
}
$stmt->close();

// Get pending booking requests count
$pendingRequestsQuery = "SELECT COUNT(*) as pending_count 
                         FROM booking_requests 
                         WHERE customer_id = ? AND status = 'pending'";
$stmt = $conn->prepare($pendingRequestsQuery);
$stmt->bind_param("i", $customerId);
$stmt->execute();
$pendingResult = $stmt->get_result();
$pendingData = $pendingResult->fetch_assoc();
$pendingRequestsCount = $pendingData['pending_count'] ?? 0;
$stmt->close();

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
    transform: translateY(-12px) scale(1.02) !important;
    box-shadow: 0 25px 60px rgba(59, 130, 246, 0.25), 0 8px 32px rgba(59, 130, 246, 0.15) !important;
    border: 2px solid rgba(59, 130, 246, 0.3) !important;
}

/* Colorful Icons for Each Card */
.stats-card:nth-child(1) .stats-icon {
    background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%) !important;
    box-shadow: 0 8px 25px rgba(59, 130, 246, 0.4) !important;
}

.stats-card:nth-child(2) .stats-icon {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%) !important;
    box-shadow: 0 8px 25px rgba(245, 158, 11, 0.4) !important;
}

.stats-card:nth-child(3) .stats-icon {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
    box-shadow: 0 8px 25px rgba(16, 185, 129, 0.4) !important;
}

.stats-card:nth-child(4) .stats-icon {
    background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%) !important;
    box-shadow: 0 8px 25px rgba(139, 92, 246, 0.4) !important;
}

.stats-icon {
    width: 65px !important;
    height: 65px !important;
    border-radius: 20px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    transition: all 0.3s ease !important;
}

.stats-card:hover .stats-icon {
    transform: rotate(5deg) scale(1.1) !important;
}

.modern-card {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.95) 100%) !important;
    backdrop-filter: blur(25px) !important;
    border: 2px solid rgba(59, 130, 246, 0.1) !important;
    border-radius: 24px !important;
    box-shadow: 0 15px 45px rgba(59, 130, 246, 0.12), 0 5px 20px rgba(59, 130, 246, 0.08) !important;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1) !important;
    position: relative !important;
    overflow: hidden !important;
}

.modern-card::before {
    content: '' !important;
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    height: 3px !important;
    background: linear-gradient(90deg, #3b82f6 0%, #06b6d4 50%, #10b981 100%) !important;
}

.modern-card:hover {
    transform: translateY(-8px) !important;
    box-shadow: 0 25px 60px rgba(59, 130, 246, 0.18), 0 10px 35px rgba(59, 130, 246, 0.12) !important;
    border: 2px solid rgba(59, 130, 246, 0.2) !important;
}

/* Enhanced Button Styling */
.btn-gradient-primary {
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%) !important;
    border: none !important;
    color: white !important;
    font-weight: 600 !important;
    padding: 12px 24px !important;
    border-radius: 16px !important;
    box-shadow: 0 8px 25px rgba(59, 130, 246, 0.3) !important;
    transition: all 0.3s ease !important;
}

.btn-gradient-primary:hover {
    background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%) !important;
    transform: translateY(-2px) !important;
    box-shadow: 0 12px 35px rgba(59, 130, 246, 0.4) !important;
    color: white !important;
}

/* Enhanced Typography */
.h1, h1 {
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 50%, #0ea5e9 100%) !important;
    -webkit-background-clip: text !important;
    -webkit-text-fill-color: transparent !important;
    background-clip: text !important;
}

/* Table Enhancements */
.table-hover tbody tr:hover {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(14, 165, 233, 0.05) 100%) !important;
}

.badge {
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%) !important;
    color: white !important;
    font-weight: 600 !important;
    padding: 8px 16px !important;
    border-radius: 12px !important;
}

/* Ensure sidebar stays white */
.sidebar {
    background: white !important;
}

/* Fix any container backgrounds */
.container-fluid {
    background: transparent !important;
}
</style>

<!-- Main Content -->
<div class="main-content">
    <!-- Animated Background Elements -->
    <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden; z-index: 0;">
        <div style="position: absolute; top: 10%; left: 10%; width: 200px; height: 200px; background: radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%); border-radius: 50%; animation: float 6s ease-in-out infinite;"></div>
        <div style="position: absolute; top: 60%; right: 15%; width: 150px; height: 150px; background: radial-gradient(circle, rgba(14, 165, 233, 0.08) 0%, transparent 70%); border-radius: 50%; animation: float 8s ease-in-out infinite reverse;"></div>
        <div style="position: absolute; bottom: 20%; left: 20%; width: 100px; height: 100px; background: radial-gradient(circle, rgba(16, 185, 129, 0.06) 0%, transparent 70%); border-radius: 50%; animation: float 10s ease-in-out infinite;"></div>
    </div>
    
    <div class="container-fluid" style="position: relative; z-index: 1;">
        <!-- Welcome Section -->
        <div class="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-3 mb-5">
            <div>
                <h1 class="h1 fw-bold mb-2" style="background: linear-gradient(135deg, #0ea5e9 0%, #1e40af 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                    Welcome back, <?php echo htmlspecialchars($customer['full_name']); ?>! 👋
                </h1>
                <p class="text-muted mb-0 fs-5">Manage your vehicles and appointments with ease</p>
            </div>
            <a href="bookings.php" class="btn btn-gradient-primary d-flex align-items-center">
                <i class="fas fa-calendar-plus me-2"></i>
                Book Now
            </a>
        </div>
    
        <!-- Stats Cards -->
        <div class="row g-4 mb-5">
            <div class="col-12 col-sm-6 col-lg-3">
                <div class="stats-card h-100 p-4">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <h6 class="text-muted small mb-2 fw-medium">Total Vehicles</h6>
                            <h2 class="h2 fw-bold text-dark mb-0"><?php echo $totalVehicles; ?></h2>
                        </div>
                        <div class="stats-icon">
                            <i class="fas fa-car text-white fs-4"></i>
                        </div>
                    </div>
                    <div class="mt-3 d-flex align-items-center text-success small">
                        <i class="fas fa-arrow-up me-1"></i>
                        <span class="fw-medium">Active fleet</span>
                    </div>
                </div>
            </div>
            
            <div class="col-12 col-sm-6 col-lg-3">
                <div class="stats-card h-100 p-4">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <h6 class="text-muted small mb-2 fw-medium">Needs Service</h6>
                            <h2 class="h2 fw-bold text-dark mb-0"><?php echo $vehiclesNeedingService; ?></h2>
                        </div>
                        <div class="stats-icon" style="background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%); box-shadow: 0 4px 20px rgba(255, 183, 77, 0.3);">
                            <i class="fas fa-spray-can text-white fs-4"></i>
                        </div>
                    </div>
                    <div class="mt-3 d-flex align-items-center text-warning small">
                        <i class="fas fa-exclamation-triangle me-1"></i>
                        <span class="fw-medium">Attention</span>
                    </div>
                </div>
            </div>
            
            <div class="col-12 col-sm-6 col-lg-3">
                <div class="stats-card h-100 p-4">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <h6 class="text-muted small mb-2 fw-medium">Upcoming</h6>
                            <h2 class="h2 fw-bold text-dark mb-0"><?php echo count($upcomingBookings); ?></h2>
                        </div>
                        <div class="stats-icon" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); box-shadow: 0 4px 20px rgba(79, 172, 254, 0.3);">
                            <i class="fas fa-calendar-check text-white fs-4"></i>
                        </div>
                    </div>
                    <div class="mt-3 d-flex align-items-center text-info small">
                        <i class="fas fa-clock me-1"></i>
                        <span class="fw-medium">Scheduled</span>
                    </div>
                </div>
            </div>
            
            <div class="col-12 col-sm-6 col-lg-3">
                <div class="stats-card h-100 p-4">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <h6 class="text-muted small mb-2 fw-medium">Pending Requests</h6>
                            <h2 class="h2 fw-bold text-dark mb-0"><?php echo $pendingRequestsCount; ?></h2>
                        </div>
                        <div class="stats-icon" style="background: linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%); box-shadow: 0 4px 20px rgba(253, 203, 110, 0.3);">
                            <i class="fas fa-hourglass-half text-white fs-4"></i>
                        </div>
                    </div>
                    <div class="mt-3 d-flex align-items-center text-warning small">
                        <i class="fas fa-clock me-1"></i>
                        <span class="fw-medium">Awaiting Approval</span>
                    </div>
                </div>
            </div>
        </div>
    
        <!-- Upcoming Bookings -->
        <div class="modern-card mb-5">
            <div class="p-4">
                <div class="d-flex align-items-center justify-content-between mb-4">
                    <h5 class="h4 fw-bold text-dark d-flex align-items-center mb-0">
                        <div class="stats-icon me-3" style="width: 40px; height: 40px; border-radius: 12px;">
                            <i class="fas fa-calendar-alt text-white fs-6"></i>
                        </div>
                        <span class="d-none d-sm-inline">Upcoming Appointments</span>
                        <span class="d-sm-none">Upcoming</span>
                    </h5>
                    <span class="badge rounded-pill px-3 py-2" style="background: var(--primary-gradient); font-size: 0.875rem;"><?php echo count($upcomingBookings); ?> scheduled</span>
                </div>
            
            <?php if (count($upcomingBookings) > 0): ?>
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead class="table-light">
                            <tr>
                                <th class="fw-medium text-muted small">Date & Time</th>
                                <th class="fw-medium text-muted small">Vehicle</th>
                                <th class="fw-medium text-muted small d-none d-md-table-cell">Service</th>
                                <th class="fw-medium text-muted small d-none d-md-table-cell">Status</th>
                                <th class="fw-medium text-muted small">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($upcomingBookings as $booking): 
                                $vehicleIcon = getVehicleIcon($booking['make'], $booking['model']);
                            ?>
                                <tr>
                                    <td>
                                        <div class="d-flex flex-column">
                                            <span class="fw-medium text-dark small"><?php echo date('M d, Y', strtotime($booking['booking_date'])); ?></span>
                                            <span class="text-muted" style="font-size: 0.75rem;"><?php echo date('h:i A', strtotime($booking['booking_date'])); ?></span>
                                        </div>
                                    </td>
                                    <td>
                                        <div class="d-flex align-items-center">
                                            <div class="rounded-2 d-flex align-items-center justify-content-center me-2" style="width: 32px; height: 32px; background: <?php echo $vehicleIcon['bg']; ?>;">
                                                <i class="<?php echo $vehicleIcon['icon']; ?> text-white" style="font-size: 0.75rem;"></i>
                                            </div>
                                            <div>
                                                <div class="fw-medium text-dark small"><?php echo htmlspecialchars($booking['make'] . ' ' . $booking['model']); ?></div>
                                                <div class="text-muted" style="font-size: 0.75rem;"><?php echo htmlspecialchars($booking['plate_no']); ?></div>
                                            </div>
                                        </div>
                                    </td>
                                    <td class="d-none d-md-table-cell">
                                        <span class="text-dark small fw-medium"><?php echo htmlspecialchars($booking['formatted_services'] ?? 'No service specified'); ?></span>
                                    </td>
                                    <td class="d-none d-md-table-cell">
                                        <span class="badge bg-success">Confirmed</span>
                                    </td>
                                    <td>
                                        <a href="booking_details.php?id=<?php echo $booking['booking_id']; ?>" class="btn btn-outline-secondary btn-sm d-flex align-items-center">
                                            <i class="fas fa-eye me-1"></i>
                                            <span class="d-none d-sm-inline">View</span>
                                        </a>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            <?php else: ?>
                <div class="text-center py-5">
                    <i class="fas fa-calendar-times display-1 text-muted mb-3"></i>
                    <h3 class="h5 fw-medium text-dark mb-2">No upcoming appointments</h3>
                    <p class="text-muted mb-4">Schedule your next service appointment to keep your vehicles in top condition.</p>
                    <a href="bookings.php" class="btn btn-primary">
                        <i class="fas fa-plus me-2"></i>
                        Schedule Appointment
                    </a>
                </div>
            <?php endif; ?>
            </div>
        </div>
    
        <!-- My Vehicles -->
        <div class="modern-card mb-5">
            <div class="p-4">
                <div class="d-flex align-items-center justify-content-start mb-4">
                    <h5 class="h4 fw-bold text-dark d-flex align-items-center mb-0">
                        <div class="stats-icon me-3" style="width: 40px; height: 40px; border-radius: 12px; background: linear-gradient(135deg, #0ea5e9 0%, #1e40af 100%);">
                            <i class="fas fa-car text-white fs-6"></i>
                        </div>
                        <span class="d-none d-sm-inline">My Vehicles</span>
                        <span class="d-sm-none">Vehicles</span>
                    </h5>
                </div>
            
            <?php if (count($vehicles) > 0): ?>
                <div class="row g-4">
                    <?php foreach (array_slice($vehicles, 0, 3) as $vehicle): 
                        $vehicleIcon = getVehicleIcon($vehicle['make'], $vehicle['model']);
                    ?>
                        <div class="col-12 col-sm-6 col-lg-4">
                            <div class="vehicle-card h-100">
                                <div class="p-4">
                                    <div class="d-flex align-items-center mb-3">
                                        <div class="vehicle-icon me-3" style="background: <?php echo $vehicleIcon['bg']; ?>;">
                                            <i class="<?php echo $vehicleIcon['icon']; ?> text-white"></i>
                                        </div>
                                        <div class="flex-grow-1">
                                            <h6 class="fw-bold mb-1 text-dark"><?php echo htmlspecialchars($vehicle['make'] . ' ' . $vehicle['model']); ?></h6>
                                            <p class="text-muted small mb-0 fw-medium"><?php echo htmlspecialchars($vehicle['plate_no']); ?></p>
                                        </div>
                                        <?php if (!empty($vehicle['color'])): ?>
                                        <span class="badge rounded-pill px-2 py-1" style="background: var(--primary-gradient); font-size: 0.75rem;"><?php echo htmlspecialchars($vehicle['color']); ?></span>
                                        <?php endif; ?>
                                    </div>
                                    
                                    <div class="mb-4">
                                        <div class="row g-3 text-center">
                                            <?php if (!empty($vehicle['year'])): ?>
                                            <div class="col-6">
                                                <div class="vehicle-stat">
                                                    <div class="small text-muted fw-medium">Year</div>
                                                    <div class="fw-bold text-dark"><?php echo htmlspecialchars($vehicle['year']); ?></div>
                                                </div>
                                            </div>
                                            <?php endif; ?>
                                            <?php if (!empty($vehicle['mileage'])): ?>
                                            <div class="col-6">
                                                <div class="vehicle-stat">
                                                    <div class="small text-muted fw-medium">Mileage</div>
                                                    <div class="fw-bold text-dark"><?php echo number_format($vehicle['mileage']); ?> km</div>
                                                </div>
                                            </div>
                                            <?php endif; ?>
                                        </div>
                                    </div>
                                    
                                    <div class="d-flex gap-2 justify-content-center align-items-center">
                                        <a href="vehicle_details.php?id=<?php echo $vehicle['id']; ?>" class="btn btn-outline-primary btn-sm flex-fill fw-medium d-flex align-items-center justify-content-center">
                                            <i class="fas fa-eye me-1"></i>
                                            Details
                                        </a>
                                        <a href="bookings.php?vehicle_id=<?php echo $vehicle['id']; ?>" class="btn btn-gradient-primary btn-sm flex-fill fw-medium d-flex align-items-center justify-content-center">
                                            <i class="bi bi-shield-check me-1"></i>
                                            Service
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    <?php endforeach; ?>
                </div>
            <?php else: ?>
                <div class="text-center py-5">
                    <div class="mb-4">
                        <div class="d-inline-flex align-items-center justify-content-center rounded-circle" style="width: 80px; height: 80px; background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);">
                            <i class="fas fa-car text-muted" style="font-size: 2rem;"></i>
                        </div>
                    </div>
                    <h3 class="h5 fw-bold text-dark mb-2">No vehicles registered</h3>
                    <p class="text-muted mb-4">Add your first vehicle to start managing maintenance schedules.</p>
                    <a href="vehicles.php" class="btn btn-gradient-primary px-4 py-2">
                        <i class="fas fa-plus me-2"></i>
                        Add Vehicle
                    </a>
                </div>
            <?php endif; ?>
            </div>
        </div>
    </div>
</div>

<?php include('includes/footer.php'); ?>