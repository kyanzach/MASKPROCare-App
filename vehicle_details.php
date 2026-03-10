<?php
// Include database configuration
require_once('db_connect.php');
require_once('config.php');

// Check if user is logged in
$isLoggedIn = isset($_SESSION['customer_id']) && !empty($_SESSION['customer_id']);

if (!$isLoggedIn) {
    header('Location: login.php');
    exit;
}

$customer_id = $_SESSION['customer_id'];

// Check if vehicle ID is provided
if (!isset($_GET['id']) || !is_numeric($_GET['id'])) {
    header('Location: index.php');
    exit;
}

$vehicle_id = $_GET['id'];

// Get vehicle details
$vehicleQuery = "SELECT * FROM vehicles WHERE id = ? AND customer_id = ?";
$stmt = $conn->prepare($vehicleQuery);
$stmt->bind_param("ii", $vehicle_id, $customer_id);
$stmt->execute();
$vehicleResult = $stmt->get_result();

// Check if vehicle exists and belongs to the customer
if ($vehicleResult->num_rows !== 1) {
    header('Location: index.php');
    exit;
}

$vehicle = $vehicleResult->fetch_assoc();
$stmt->close();

// Get service history for this vehicle
$serviceQuery = "SELECT b.*, 
                       GROUP_CONCAT(
                           CASE 
                               WHEN bstp.package_name IS NOT NULL AND bstp.package_name != '' 
                               THEN CONCAT(bst.service_name, ' (', bstp.package_name, ')')
                               ELSE bst.service_name
                           END
                           SEPARATOR ', '
                       ) as formatted_services
                FROM bookings b
                LEFT JOIN bookings_service_types bst ON b.booking_id = bst.booking_id
                LEFT JOIN bookings_service_type_packages bstp ON bst.service_id = bstp.service_id
                WHERE b.customer_vehicle_id = ?
                GROUP BY b.booking_id
                ORDER BY b.booking_date DESC";
$stmt = $conn->prepare($serviceQuery);
$stmt->bind_param("i", $vehicle_id);
$stmt->execute();
$serviceResult = $stmt->get_result();
$service_history = [];
while ($service = $serviceResult->fetch_assoc()) {
    $service_history[] = $service;
}
$stmt->close();

// Calculate next service date (6 months from last service or 6 months from vehicle creation if no service)
$next_service_date = null;
$last_service_date = null;

if (count($service_history) > 0) {
    foreach ($service_history as $service) {
        // Check if booking is not cancelled
        if (strpos($service['notes'], 'CANCELLED:') === false) {
            $last_service_date = $service['booking_date'];
            break;
        }
    }
}

if ($last_service_date) {
    $next_service_date = date('Y-m-d', strtotime($last_service_date . ' + 6 months'));
} else {
    $next_service_date = date('Y-m-d', strtotime($vehicle['created_at'] . ' + 6 months'));
}

$days_until_service = (strtotime($next_service_date) - time()) / (60 * 60 * 24);
$service_status = '';
$service_class = '';

if ($days_until_service < 0) {
    $service_status = 'Overdue';
    $service_class = 'text-danger';
} elseif ($days_until_service <= 30) {
    $service_status = 'Due Soon';
    $service_class = 'text-warning';
} else {
    $service_status = 'Up to Date';
    $service_class = 'text-success';
}

// Process form submission for editing vehicle
$success_message = '';
$error_message = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['edit_vehicle'])) {
    // Get form data
    $make = trim($_POST['make']);
    $model = trim($_POST['model']);
    $plate_no = trim($_POST['plate_no']);
    $color = trim($_POST['color']);
    $notes = trim($_POST['notes']);
    
    // Validate form data
    $errors = [];
    
    if (empty($make)) {
        $errors[] = 'Make is required';
    }
    
    if (empty($model)) {
        $errors[] = 'Model is required';
    }
    
    if (empty($plate_no)) {
        $errors[] = 'Plate number is required';
    }
    
    // Check if plate number already exists for another vehicle
    if ($plate_no !== $vehicle['plate_no']) {
        $checkQuery = "SELECT id FROM vehicles WHERE plate_no = ? AND id != ? AND customer_id = ?";
        $checkStmt = $conn->prepare($checkQuery);
        $checkStmt->bind_param("sii", $plate_no, $vehicle_id, $customer_id);
        $checkStmt->execute();
        $checkResult = $checkStmt->get_result();
        
        if ($checkResult->num_rows > 0) {
            $errors[] = 'Plate number already exists for another vehicle';
        }
        $checkStmt->close();
    }
    
    // If no errors, proceed with database operation
    if (empty($errors)) {
        try {
            // Update vehicle
            $updateQuery = "UPDATE vehicles SET make = ?, model = ?, plate_no = ?, color = ?, notes = ?, updated_at = NOW() WHERE id = ? AND customer_id = ?";
            $updateStmt = $conn->prepare($updateQuery);
            $updateStmt->bind_param("sssssii", $make, $model, $plate_no, $color, $notes, $vehicle_id, $customer_id);
            $updateStmt->execute();
            
            $success_message = 'Vehicle updated successfully';
            
            // Update local vehicle data
            $vehicle['make'] = $make;
            $vehicle['model'] = $model;
            $vehicle['plate_no'] = $plate_no;
            $vehicle['color'] = $color;
            $vehicle['notes'] = $notes;
            $vehicle['updated_at'] = date('Y-m-d H:i:s');
            
            $updateStmt->close();
        } catch (Exception $e) {
            $error_message = 'Error updating vehicle. Please try again.';
        }
    } else {
        $error_message = implode('<br>', $errors);
    }
}

include('includes/header.php');
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vehicle Details - <?php echo htmlspecialchars($vehicle['make'] . ' ' . $vehicle['model']); ?></title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css">
    <style>
        body {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .container {
            padding-top: 2rem;
            padding-bottom: 2rem;
        }
        .card {
            border: none;
            border-radius: 20px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }
        .card-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 20px 20px 0 0 !important;
            padding: 1.5rem;
        }
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border: none;
            border-radius: 10px;
            padding: 0.75rem 1.5rem;
            font-weight: 600;
        }
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }
        .badge {
            padding: 0.5rem 1rem;
            border-radius: 10px;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="row mb-4">
            <div class="col-12">
                <a href="index.php" class="btn btn-light">
                    <i class="bi bi-arrow-left"></i> Back to Dashboard
                </a>
            </div>
        </div>

        <?php if (!empty($success_message)): ?>
            <div class="alert alert-success alert-dismissible fade show" role="alert">
                <i class="bi bi-check-circle me-2"></i><?php echo $success_message; ?>
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        <?php endif; ?>

        <?php if (!empty($error_message)): ?>
            <div class="alert alert-danger alert-dismissible fade show" role="alert">
                <i class="bi bi-exclamation-triangle me-2"></i><?php echo $error_message; ?>
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        <?php endif; ?>

        <div class="row">
            <div class="col-lg-8">
                <div class="card mb-4">
                    <div class="card-header">
                        <h4 class="mb-0">
                            <i class="bi bi-car-front me-2"></i>
                            <?php echo htmlspecialchars($vehicle['make'] . ' ' . $vehicle['model']); ?>
                        </h4>
                        <small><?php echo htmlspecialchars($vehicle['plate_no']); ?></small>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-6 mb-3">
                                <label class="form-label fw-bold">Make</label>
                                <p class="mb-0"><?php echo htmlspecialchars($vehicle['make']); ?></p>
                            </div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label fw-bold">Model</label>
                                <p class="mb-0"><?php echo htmlspecialchars($vehicle['model']); ?></p>
                            </div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label fw-bold">Plate Number</label>
                                <p class="mb-0"><?php echo htmlspecialchars($vehicle['plate_no']); ?></p>
                            </div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label fw-bold">Color</label>
                                <p class="mb-0"><?php echo htmlspecialchars($vehicle['color']); ?></p>
                            </div>
                            <?php if (!empty($vehicle['notes'])): ?>
                            <div class="col-12 mb-3">
                                <label class="form-label fw-bold">Notes</label>
                                <p class="mb-0"><?php echo nl2br(htmlspecialchars($vehicle['notes'])); ?></p>
                            </div>
                            <?php endif; ?>
                        </div>
                        <button type="button" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#editVehicleModal">
                            <i class="bi bi-pencil"></i> Edit Vehicle
                        </button>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <h5 class="mb-0"><i class="bi bi-clock-history me-2"></i>Service History</h5>
                    </div>
                    <div class="card-body">
                        <?php if (count($service_history) > 0): ?>
                            <div class="table-responsive">
                                <table class="table table-hover">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Service</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <?php foreach ($service_history as $service): ?>
                                            <?php 
                                            $is_cancelled = strpos($service['notes'], 'CANCELLED:') !== false;
                                            $status_class = '';
                                            $status_text = '';
                                            
                                            if ($is_cancelled) {
                                                $status_class = 'bg-danger';
                                                $status_text = 'Cancelled';
                                            } elseif (strtotime($service['booking_date']) > time()) {
                                                $status_class = 'bg-success';
                                                $status_text = 'Confirmed';
                                            } else {
                                                $status_class = 'bg-info';
                                                $status_text = 'Completed';
                                            }
                                            ?>
                                            <tr>
                                                <td>
                                                    <div><?php echo date('M d, Y', strtotime($service['booking_date'])); ?></div>
                                                    <small class="text-muted"><?php echo date('h:i A', strtotime($service['booking_date'])); ?></small>
                                                </td>
                                                <td><?php echo htmlspecialchars($service['formatted_services'] ?? 'No service specified'); ?></td>
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
                        <?php else: ?>
                            <div class="alert alert-info">
                                <i class="bi bi-info-circle"></i> No service history found for this vehicle.
                            </div>
                        <?php endif; ?>
                    </div>
                </div>
            </div>

            <div class="col-lg-4">
                <div class="card mb-4">
                    <div class="card-header">
                        <h5 class="mb-0"><i class="bi bi-wrench me-2"></i>Service Status</h5>
                    </div>
                    <div class="card-body">
                        <div class="mb-3">
                            <label class="form-label fw-bold">Current Status</label>
                            <p class="mb-0">
                                <span class="<?php echo $service_class; ?> fw-bold"><?php echo $service_status; ?></span>
                            </p>
                        </div>
                        <div class="mb-3">
                            <label class="form-label fw-bold">Next Service Due</label>
                            <p class="mb-0"><?php echo date('M d, Y', strtotime($next_service_date)); ?></p>
                        </div>
                        <div class="mb-3">
                            <label class="form-label fw-bold">Last Service</label>
                            <?php if ($last_service_date): ?>
                                <p class="mb-0"><?php echo date('M d, Y', strtotime($last_service_date)); ?></p>
                            <?php else: ?>
                                <p class="mb-0 text-muted">No previous service</p>
                            <?php endif; ?>
                        </div>
                        <div class="d-grid">
                            <a href="bookings.php?vehicle_id=<?php echo $vehicle_id; ?>" class="btn btn-primary">
                                <i class="bi bi-calendar-plus"></i> Schedule Service
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Edit Vehicle Modal -->
    <div class="modal fade" id="editVehicleModal" tabindex="-1">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title"><i class="bi bi-pencil"></i> Edit Vehicle Information</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <form method="post" action="">
                    <div class="modal-body">
                        <div class="mb-3">
                            <label for="make" class="form-label">Make <span class="text-danger">*</span></label>
                            <input type="text" class="form-control" id="make" name="make" value="<?php echo htmlspecialchars($vehicle['make']); ?>" required>
                        </div>
                        <div class="mb-3">
                            <label for="model" class="form-label">Model <span class="text-danger">*</span></label>
                            <input type="text" class="form-control" id="model" name="model" value="<?php echo htmlspecialchars($vehicle['model']); ?>" required>
                        </div>
                        <div class="mb-3">
                            <label for="plate_no" class="form-label">Plate Number <span class="text-danger">*</span></label>
                            <input type="text" class="form-control" id="plate_no" name="plate_no" value="<?php echo htmlspecialchars($vehicle['plate_no']); ?>" required>
                        </div>
                        <div class="mb-3">
                            <label for="color" class="form-label">Color</label>
                            <input type="text" class="form-control" id="color" name="color" value="<?php echo htmlspecialchars($vehicle['color']); ?>">
                        </div>
                        <div class="mb-3">
                            <label for="notes" class="form-label">Notes</label>
                            <textarea class="form-control" id="notes" name="notes" rows="3"><?php echo htmlspecialchars($vehicle['notes']); ?></textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="submit" name="edit_vehicle" class="btn btn-primary">
                            <i class="bi bi-check-circle"></i> Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>