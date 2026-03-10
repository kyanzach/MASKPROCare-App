<?php
session_start();
require_once 'config/database.php';

// Check if user is logged in
if (!isset($_SESSION['customer_id'])) {
    header('Location: login.php');
    exit();
}

$customer_id = $_SESSION['customer_id'];

// Check if booking ID is provided
if (!isset($_GET['id']) || !is_numeric($_GET['id'])) {
    header('Location: bookings-nice.php');
    exit();
}

$booking_id = $_GET['id'];

// Get booking details with vehicle information
$stmt = $pdo->prepare("
    SELECT b.*, cv.make, cv.model, cv.year, cv.plate_no, cv.color, cv.vin,
           CASE 
               WHEN b.service_type IS NOT NULL THEN b.service_type
               ELSE 'No service specified'
           END as formatted_services
    FROM bookings b
    LEFT JOIN customer_vehicles cv ON b.vehicle_id = cv.id
    WHERE b.booking_id = ? AND b.customer_id = ?
");
$stmt->execute([$booking_id, $customer_id]);

// Check if booking exists and belongs to the customer
if ($stmt->rowCount() !== 1) {
    header('Location: bookings-nice.php');
    exit();
}

$booking = $stmt->fetch();

// Process form submission for cancelling booking
$success_message = '';
$error_message = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['cancel_booking'])) {
    // Check if already cancelled
    if (strpos($booking['notes'], 'CANCELLED:') === false) {
        $cancellation_note = 'CANCELLED: ' . date('Y-m-d H:i:s') . ' - Cancelled by customer';
        $updated_notes = $booking['notes'] ? $booking['notes'] . "\n" . $cancellation_note : $cancellation_note;
        
        try {
            $update_stmt = $pdo->prepare("UPDATE bookings SET notes = ? WHERE booking_id = ? AND customer_id = ?");
            $update_stmt->execute([$updated_notes, $booking_id, $customer_id]);
            $success_message = 'Booking cancelled successfully';
            $booking['notes'] = $updated_notes;
        } catch (PDOException $e) {
            $error_message = 'Error cancelling booking. Please try again.';
        }
    } else {
        $error_message = 'This booking is already cancelled.';
    }
}

// Check if booking is cancelled
$is_cancelled = strpos($booking['notes'], 'CANCELLED:') !== false;
$is_future_booking = strtotime($booking['booking_date']) > time();

include('includes/header-nice.php');
?>

<main id="main" class="main">
    <div class="pagetitle">
        <h1>Booking Details</h1>
        <nav>
            <ol class="breadcrumb">
                <li class="breadcrumb-item"><a href="dashboard-nice.php">Home</a></li>
                <li class="breadcrumb-item"><a href="bookings-nice.php">My Bookings</a></li>
                <li class="breadcrumb-item active">Booking Details</li>
            </ol>
        </nav>
    </div>

    <section class="section">
        <div class="row">
            <div class="col-lg-12">
                <!-- Back Button -->
                <div class="mb-3">
                    <a href="bookings-nice.php" class="btn btn-secondary">
                        <i class="bi bi-arrow-left"></i> Back to Bookings
                    </a>
                </div>

                <!-- Alert Messages -->
                <?php if (!empty($success_message)): ?>
                    <div class="alert alert-success alert-dismissible fade show" role="alert">
                        <i class="bi bi-check-circle me-1"></i>
                        <?php echo $success_message; ?>
                        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                    </div>
                <?php endif; ?>
                
                <?php if (!empty($error_message)): ?>
                    <div class="alert alert-danger alert-dismissible fade show" role="alert">
                        <i class="bi bi-exclamation-triangle me-1"></i>
                        <?php echo $error_message; ?>
                        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                    </div>
                <?php endif; ?>
            </div>
        </div>

        <div class="row">
            <div class="col-lg-8">
                <!-- Booking Information Card -->
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-4">
                            <h5 class="card-title">Booking Information</h5>
                            <?php if ($is_cancelled): ?>
                                <span class="badge bg-danger">Cancelled</span>
                            <?php elseif ($is_future_booking): ?>
                                <span class="badge bg-success">Confirmed</span>
                            <?php else: ?>
                                <span class="badge bg-info">Completed</span>
                            <?php endif; ?>
                        </div>

                        <div class="row">
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label class="form-label fw-bold">Booking ID</label>
                                    <p class="mb-0">#<?php echo $booking['booking_id']; ?></p>
                                </div>
                                
                                <div class="mb-3">
                                    <label class="form-label fw-bold">Service Type</label>
                                    <p class="mb-0"><?php echo htmlspecialchars($booking['formatted_services']); ?></p>
                                </div>
                                
                                <div class="mb-3">
                                    <label class="form-label fw-bold">Scheduled Date</label>
                                    <p class="mb-0"><?php echo date('F d, Y', strtotime($booking['booking_date'])); ?></p>
                                </div>
                                
                                <div class="mb-3">
                                    <label class="form-label fw-bold">Scheduled Time</label>
                                    <p class="mb-0"><?php echo date('h:i A', strtotime($booking['booking_date'])); ?></p>
                                </div>
                            </div>
                            
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label class="form-label fw-bold">Created</label>
                                    <p class="mb-0"><?php echo date('M d, Y h:i A', strtotime($booking['created_at'])); ?></p>
                                </div>
                                
                                <?php if (!empty($booking['notes'])): ?>
                                <div class="mb-3">
                                    <label class="form-label fw-bold">Notes</label>
                                    <p class="mb-0"><?php echo nl2br(htmlspecialchars($booking['notes'])); ?></p>
                                </div>
                                <?php endif; ?>
                            </div>
                        </div>

                        <?php if (!$is_cancelled && $is_future_booking): ?>
                            <hr>
                            <div class="d-flex justify-content-end">
                                <button type="button" class="btn btn-danger" data-bs-toggle="modal" data-bs-target="#cancelBookingModal">
                                    <i class="bi bi-x-circle"></i> Cancel Booking
                                </button>
                            </div>
                        <?php endif; ?>
                    </div>
                </div>
            </div>

            <div class="col-lg-4">
                <!-- Vehicle Information Card -->
                <div class="card mb-4">
                    <div class="card-body">
                        <h5 class="card-title">Vehicle Information</h5>
                        
                        <div class="d-flex align-items-center mb-3">
                            <div class="icon-circle bg-primary text-white me-3">
                                <i class="bi bi-car-front"></i>
                            </div>
                            <div>
                                <h6 class="mb-0"><?php echo htmlspecialchars($booking['year'] . ' ' . $booking['make'] . ' ' . $booking['model']); ?></h6>
                                <small class="text-muted"><?php echo htmlspecialchars($booking['plate_no']); ?></small>
                            </div>
                        </div>
                        
                        <div class="mb-2">
                            <strong>Plate Number:</strong> <?php echo htmlspecialchars($booking['plate_no']); ?>
                        </div>
                        
                        <?php if (!empty($booking['color'])): ?>
                        <div class="mb-2">
                            <strong>Color:</strong> <?php echo htmlspecialchars($booking['color']); ?>
                        </div>
                        <?php endif; ?>
                        
                        <?php if (!empty($booking['vin'])): ?>
                        <div class="mb-3">
                            <strong>VIN:</strong> <?php echo htmlspecialchars($booking['vin']); ?>
                        </div>
                        <?php endif; ?>
                        
                        <a href="vehicles-nice.php" class="btn btn-outline-primary btn-sm">
                            <i class="bi bi-car-front"></i> View All Vehicles
                        </a>
                    </div>
                </div>

                <!-- Service Status Card -->
                <div class="card">
                    <div class="card-body">
                        <h5 class="card-title">Service Status</h5>
                        
                        <?php if ($is_cancelled): ?>
                            <div class="alert alert-danger">
                                <i class="bi bi-x-circle"></i> This booking has been cancelled.
                            </div>
                            <p class="text-muted">If you need to reschedule, please create a new booking.</p>
                        <?php elseif ($is_future_booking): ?>
                            <div class="alert alert-success">
                                <i class="bi bi-check-circle"></i> Your booking has been confirmed.
                            </div>
                            <p class="text-muted">Please arrive 15 minutes before your scheduled time. Our service team will be ready to assist you.</p>
                        <?php else: ?>
                            <div class="alert alert-info">
                                <i class="bi bi-check-circle"></i> Service completed.
                            </div>
                            <p class="text-muted">Thank you for choosing our service. We hope you were satisfied with our work.</p>
                        <?php endif; ?>
                        
                        <div class="mt-3">
                            <a href="bookings-nice.php?action=new" class="btn btn-primary btn-sm">
                                <i class="bi bi-plus-circle"></i> Schedule New Service
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>
</main>

<!-- Cancel Booking Modal -->
<?php if (!$is_cancelled && $is_future_booking): ?>
<div class="modal fade" id="cancelBookingModal" tabindex="-1" aria-labelledby="cancelBookingModalLabel" aria-hidden="true">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="cancelBookingModalLabel">
                    <i class="bi bi-exclamation-triangle text-warning"></i> Confirm Cancellation
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <p>Are you sure you want to cancel this booking?</p>
                
                <div class="card bg-light">
                    <div class="card-body">
                        <h6 class="card-title">Booking Details</h6>
                        <p class="mb-1"><strong>Date:</strong> <?php echo date('M d, Y', strtotime($booking['booking_date'])); ?></p>
                        <p class="mb-1"><strong>Time:</strong> <?php echo date('h:i A', strtotime($booking['booking_date'])); ?></p>
                        <p class="mb-1"><strong>Vehicle:</strong> <?php echo htmlspecialchars($booking['year'] . ' ' . $booking['make'] . ' ' . $booking['model']); ?></p>
                        <p class="mb-0"><strong>Service:</strong> <?php echo htmlspecialchars($booking['formatted_services']); ?></p>
                    </div>
                </div>
                
                <div class="alert alert-warning mt-3">
                    <i class="bi bi-exclamation-triangle"></i> This action cannot be undone.
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Keep Booking</button>
                <form method="post" action="" class="d-inline">
                    <button type="submit" name="cancel_booking" class="btn btn-danger">
                        <i class="bi bi-x-circle"></i> Cancel Booking
                    </button>
                </form>
            </div>
        </div>
    </div>
</div>
<?php endif; ?>

<?php include('includes/footer.php'); ?>