<?php
require_once 'db_connect.php';
require_once 'config.php';

// Ensure customer is logged in
if (!isset($_SESSION['customer_id'])) {
    header('Location: login.php');
    exit;
}

$customer_id = (int)$_SESSION['customer_id'];
$success_msg = '';
$error_msg = '';

// Handle form submissions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    if ($action === 'add') {
        $make = $conn->real_escape_string(trim($_POST['make'] ?? ''));
        $model = $conn->real_escape_string(trim($_POST['model'] ?? ''));
        $size = $conn->real_escape_string(trim($_POST['size'] ?? ''));
        $plate_no = $conn->real_escape_string(trim($_POST['plate_no'] ?? ''));
        $color = $conn->real_escape_string(trim($_POST['color'] ?? ''));
        $notes = $conn->real_escape_string(trim($_POST['notes'] ?? ''));

        if (empty($make) || empty($model)) {
            $error_msg = 'Make and Model are required fields.';
        } else {
            $stmt = $conn->prepare("INSERT INTO vehicles (customer_id, make, model, size, plate_no, color, notes) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->bind_param("issssss", $customer_id, $make, $model, $size, $plate_no, $color, $notes);
            if ($stmt->execute()) {
                $success_msg = 'Vehicle added successfully!';
            } else {
                $error_msg = 'Failed to add vehicle. Please try again.';
            }
            $stmt->close();
        }
    } elseif ($action === 'edit') {
        $vehicle_id = (int)($_POST['vehicle_id'] ?? 0);
        $make = $conn->real_escape_string(trim($_POST['make'] ?? ''));
        $model = $conn->real_escape_string(trim($_POST['model'] ?? ''));
        $size = $conn->real_escape_string(trim($_POST['size'] ?? ''));
        $plate_no = $conn->real_escape_string(trim($_POST['plate_no'] ?? ''));
        $color = $conn->real_escape_string(trim($_POST['color'] ?? ''));
        $notes = $conn->real_escape_string(trim($_POST['notes'] ?? ''));

        if (empty($make) || empty($model)) {
            $error_msg = 'Make and Model are required fields.';
        } else {
            $stmt = $conn->prepare("UPDATE vehicles SET make=?, model=?, size=?, plate_no=?, color=?, notes=? WHERE id=? AND customer_id=?");
            $stmt->bind_param("ssssssii", $make, $model, $size, $plate_no, $color, $notes, $vehicle_id, $customer_id);
            if ($stmt->execute()) {
                $success_msg = 'Vehicle updated successfully!';
            } else {
                $error_msg = 'Failed to update vehicle. Please try again.';
            }
            $stmt->close();
        }
    } elseif ($action === 'delete') {
        $vehicle_id = (int)($_POST['vehicle_id'] ?? 0);
        $stmt = $conn->prepare("DELETE FROM vehicles WHERE id=? AND customer_id=?");
        $stmt->bind_param("ii", $vehicle_id, $customer_id);
        if ($stmt->execute()) {
            $success_msg = 'Vehicle deleted successfully!';
        } else {
            $error_msg = 'Failed to delete vehicle.';
        }
        $stmt->close();
    }
}

// Fetch all vehicles for this customer
$stmt = $conn->prepare("SELECT * FROM vehicles WHERE customer_id = ? ORDER BY created_at DESC");
$stmt->bind_param("i", $customer_id);
$stmt->execute();
$result = $stmt->get_result();
$vehicles = [];
while ($row = $result->fetch_assoc()) {
    $vehicles[] = $row;
}
$stmt->close();
?>

<?php include 'includes/header.php'; ?>

<!-- Page Content -->
<main id="main" class="main">
  <div class="pagetitle">
    <h1><i class="fas fa-car me-2"></i>My Vehicles</h1>
    <nav>
      <ol class="breadcrumb">
        <li class="breadcrumb-item"><a href="index.php">Home</a></li>
        <li class="breadcrumb-item active">Vehicles</li>
      </ol>
    </nav>
  </div>

  <section class="section">

    <?php if ($success_msg): ?>
    <div class="alert alert-success alert-dismissible fade show" role="alert">
      <i class="fas fa-check-circle me-2"></i><?php echo htmlspecialchars($success_msg); ?>
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
    <?php endif; ?>

    <?php if ($error_msg): ?>
    <div class="alert alert-danger alert-dismissible fade show" role="alert">
      <i class="fas fa-exclamation-circle me-2"></i><?php echo htmlspecialchars($error_msg); ?>
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
    <?php endif; ?>

    <!-- Add Vehicle Button -->
    <div class="d-flex justify-content-end mb-3">
      <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#vehicleModal" onclick="resetForm()">
        <i class="fas fa-plus me-2"></i>Add Vehicle
      </button>
    </div>

    <!-- Vehicle Cards Grid -->
    <div class="row">
      <?php if (empty($vehicles)): ?>
      <div class="col-12">
        <div class="card">
          <div class="card-body text-center py-5">
            <i class="fas fa-car" style="font-size: 3rem; color: #ccc;"></i>
            <h5 class="mt-3 text-muted">No vehicles yet</h5>
            <p class="text-muted">Add your first vehicle to get started</p>
            <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#vehicleModal" onclick="resetForm()">
              <i class="fas fa-plus me-2"></i>Add Vehicle
            </button>
          </div>
        </div>
      </div>
      <?php else: ?>
        <?php foreach ($vehicles as $vehicle): ?>
        <div class="col-lg-4 col-md-6 col-sm-12 mb-3">
          <div class="card h-100 shadow-sm border-0" style="border-radius: 16px; overflow: hidden;">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start mb-3">
                <div>
                  <h5 class="card-title fw-bold mb-1"><?php echo htmlspecialchars($vehicle['make'] . ' ' . $vehicle['model']); ?></h5>
                  <?php if ($vehicle['plate_no']): ?>
                  <span class="badge bg-light text-dark px-3 py-2" style="border-radius: 8px; font-size: 0.85rem; letter-spacing: 1px;">
                    <?php echo htmlspecialchars($vehicle['plate_no']); ?>
                  </span>
                  <?php endif; ?>
                </div>
                <div class="dropdown">
                  <button class="btn btn-light btn-sm" data-bs-toggle="dropdown" style="border-radius: 10px;">
                    <i class="fas fa-ellipsis-v"></i>
                  </button>
                  <ul class="dropdown-menu dropdown-menu-end">
                    <li>
                      <a class="dropdown-item" href="#" onclick="editVehicle(<?php echo htmlspecialchars(json_encode($vehicle)); ?>)">
                        <i class="fas fa-edit me-2 text-primary"></i>Edit
                      </a>
                    </li>
                    <li>
                      <a class="dropdown-item text-danger" href="#" onclick="deleteVehicle(<?php echo $vehicle['id']; ?>, '<?php echo htmlspecialchars($vehicle['make'] . ' ' . $vehicle['model']); ?>')">
                        <i class="fas fa-trash me-2"></i>Delete
                      </a>
                    </li>
                  </ul>
                </div>
              </div>

              <div class="vehicle-details">
                <?php if ($vehicle['size']): ?>
                <div class="d-flex align-items-center mb-2">
                  <i class="fas fa-expand-arrows-alt text-muted me-2" style="width: 20px;"></i>
                  <span class="text-muted">Size:</span>
                  <span class="ms-auto fw-semibold"><?php echo htmlspecialchars($vehicle['size']); ?></span>
                </div>
                <?php endif; ?>

                <?php if ($vehicle['color']): ?>
                <div class="d-flex align-items-center mb-2">
                  <i class="fas fa-palette text-muted me-2" style="width: 20px;"></i>
                  <span class="text-muted">Color:</span>
                  <span class="ms-auto fw-semibold"><?php echo htmlspecialchars($vehicle['color']); ?></span>
                </div>
                <?php endif; ?>

                <?php if ($vehicle['notes']): ?>
                <div class="mt-3 p-2 rounded" style="background: #f8f9fa; font-size: 0.85rem;">
                  <i class="fas fa-sticky-note text-muted me-1"></i>
                  <?php echo htmlspecialchars($vehicle['notes']); ?>
                </div>
                <?php endif; ?>
              </div>
            </div>
            <div class="card-footer bg-transparent border-0 pt-0 pb-3 px-3">
              <small class="text-muted">
                <i class="fas fa-clock me-1"></i>Added <?php echo date('M j, Y', strtotime($vehicle['created_at'])); ?>
              </small>
            </div>
          </div>
        </div>
        <?php endforeach; ?>
      <?php endif; ?>
    </div>

  </section>
</main>

<!-- Vehicle Modal -->
<div class="modal fade" id="vehicleModal" tabindex="-1">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content" style="border-radius: 16px; border: none;">
      <form method="POST" id="vehicleForm">
        <input type="hidden" name="action" id="formAction" value="add">
        <input type="hidden" name="vehicle_id" id="vehicleId">
        
        <div class="modal-header border-0 pb-0">
          <h5 class="modal-title fw-bold" id="modalTitle">
            <i class="fas fa-car me-2 text-primary"></i>Add Vehicle
          </h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        
        <div class="modal-body">
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label fw-semibold">Make <span class="text-danger">*</span></label>
              <input type="text" class="form-control" name="make" id="inputMake" placeholder="e.g. Toyota" required>
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">Model <span class="text-danger">*</span></label>
              <input type="text" class="form-control" name="model" id="inputModel" placeholder="e.g. Fortuner" required>
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">Size</label>
              <select class="form-select" name="size" id="inputSize">
                <option value="">Select size</option>
                <option value="Sedan">Sedan</option>
                <option value="Small SUV / Compact">Small SUV / Compact</option>
                <option value="Medium SUV / Crossover">Medium SUV / Crossover</option>
                <option value="Large SUV">Large SUV</option>
                <option value="Pickup Truck">Pickup Truck</option>
                <option value="Van">Van</option>
                <option value="Motorcycle">Motorcycle</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">Plate No.</label>
              <input type="text" class="form-control" name="plate_no" id="inputPlateNo" placeholder="e.g. ABC 1234">
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">Color</label>
              <input type="text" class="form-control" name="color" id="inputColor" placeholder="e.g. Pearl White">
            </div>
            <div class="col-12">
              <label class="form-label fw-semibold">Notes</label>
              <textarea class="form-control" name="notes" id="inputNotes" rows="2" placeholder="Any additional notes..."></textarea>
            </div>
          </div>
        </div>
        
        <div class="modal-footer border-0 pt-0">
          <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
          <button type="submit" class="btn btn-primary px-4" id="submitBtn">
            <i class="fas fa-save me-2"></i>Save
          </button>
        </div>
      </form>
    </div>
  </div>
</div>

<!-- Delete Confirmation Modal -->
<div class="modal fade" id="deleteModal" tabindex="-1">
  <div class="modal-dialog modal-dialog-centered modal-sm">
    <div class="modal-content" style="border-radius: 16px; border: none;">
      <form method="POST">
        <input type="hidden" name="action" value="delete">
        <input type="hidden" name="vehicle_id" id="deleteVehicleId">
        <div class="modal-body text-center py-4">
          <i class="fas fa-exclamation-triangle text-warning" style="font-size: 2.5rem;"></i>
          <h5 class="mt-3 fw-bold">Delete Vehicle?</h5>
          <p class="text-muted" id="deleteVehicleName">This action cannot be undone.</p>
        </div>
        <div class="modal-footer border-0 pt-0 justify-content-center">
          <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
          <button type="submit" class="btn btn-danger px-4">
            <i class="fas fa-trash me-2"></i>Delete
          </button>
        </div>
      </form>
    </div>
  </div>
</div>

<?php include 'includes/footer.php'; ?>

<script>
function resetForm() {
    document.getElementById('formAction').value = 'add';
    document.getElementById('vehicleId').value = '';
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-car me-2 text-primary"></i>Add Vehicle';
    document.getElementById('submitBtn').innerHTML = '<i class="fas fa-save me-2"></i>Save';
    document.getElementById('vehicleForm').reset();
}

function editVehicle(vehicle) {
    document.getElementById('formAction').value = 'edit';
    document.getElementById('vehicleId').value = vehicle.id;
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit me-2 text-primary"></i>Edit Vehicle';
    document.getElementById('submitBtn').innerHTML = '<i class="fas fa-save me-2"></i>Update';
    document.getElementById('inputMake').value = vehicle.make || '';
    document.getElementById('inputModel').value = vehicle.model || '';
    document.getElementById('inputSize').value = vehicle.size || '';
    document.getElementById('inputPlateNo').value = vehicle.plate_no || '';
    document.getElementById('inputColor').value = vehicle.color || '';
    document.getElementById('inputNotes').value = vehicle.notes || '';
    
    var modal = new bootstrap.Modal(document.getElementById('vehicleModal'));
    modal.show();
}

function deleteVehicle(id, name) {
    document.getElementById('deleteVehicleId').value = id;
    document.getElementById('deleteVehicleName').textContent = 'Delete "' + name + '"? This cannot be undone.';
    var modal = new bootstrap.Modal(document.getElementById('deleteModal'));
    modal.show();
}
</script>