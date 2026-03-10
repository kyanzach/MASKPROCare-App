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

// Handle profile update
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'update_profile') {
    $full_name = $conn->real_escape_string(trim($_POST['full_name'] ?? ''));
    $email = $conn->real_escape_string(trim($_POST['email'] ?? ''));
    $address = $conn->real_escape_string(trim($_POST['address'] ?? ''));
    $birth_date = $_POST['birth_date'] ?? '';

    if (empty($full_name)) {
        $error_msg = 'Full name is required.';
    } else {
        $stmt = $conn->prepare("UPDATE customers SET full_name=?, email=?, address=?, birth_date=? WHERE id=?");
        $birth_date_val = !empty($birth_date) ? $birth_date : null;
        $stmt->bind_param("ssssi", $full_name, $email, $address, $birth_date_val, $customer_id);
        if ($stmt->execute()) {
            $success_msg = 'Profile updated successfully!';
            $_SESSION['customer_name'] = $full_name;
        } else {
            $error_msg = 'Failed to update profile. Please try again.';
        }
        $stmt->close();
    }
}

// Fetch customer data
$stmt = $conn->prepare("SELECT * FROM customers WHERE id = ?");
$stmt->bind_param("i", $customer_id);
$stmt->execute();
$customer = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$customer) {
    header('Location: login.php');
    exit;
}

// Fetch stats
// Total vehicles
$stmt = $conn->prepare("SELECT COUNT(*) as count FROM vehicles WHERE customer_id = ?");
$stmt->bind_param("i", $customer_id);
$stmt->execute();
$total_vehicles = $stmt->get_result()->fetch_assoc()['count'];
$stmt->close();

// Total bookings
$stmt = $conn->prepare("SELECT COUNT(*) as count FROM bookings WHERE customer_id = ?");
$stmt->bind_param("i", $customer_id);
$stmt->execute();
$total_bookings = $stmt->get_result()->fetch_assoc()['count'];
$stmt->close();

// Completed services
$stmt = $conn->prepare("SELECT COUNT(*) as count FROM bookings WHERE customer_id = ? AND notes NOT LIKE '%CANCELLED:%' AND booking_date < NOW()");
$stmt->bind_param("i", $customer_id);
$stmt->execute();
$completed_services = $stmt->get_result()->fetch_assoc()['count'];
$stmt->close();

// Get branch name
$branch_name = 'Not assigned';
if ($customer['branch_id']) {
    $stmt = $conn->prepare("SELECT branch_name FROM branches WHERE id = ?");
    $stmt->bind_param("i", $customer['branch_id']);
    $stmt->execute();
    $branch_row = $stmt->get_result()->fetch_assoc();
    if ($branch_row) $branch_name = $branch_row['branch_name'];
    $stmt->close();
}
?>

<?php include 'includes/header.php'; ?>

<!-- Page Content -->
<main id="main" class="main">
  <div class="pagetitle">
    <h1><i class="fas fa-user-circle me-2"></i>My Profile</h1>
    <nav>
      <ol class="breadcrumb">
        <li class="breadcrumb-item"><a href="index.php">Home</a></li>
        <li class="breadcrumb-item active">Profile</li>
      </ol>
    </nav>
  </div>

  <section class="section profile">

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

    <div class="row">

      <!-- Profile Card -->
      <div class="col-xl-4 col-lg-5">
        <div class="card shadow-sm border-0" style="border-radius: 16px; overflow: hidden;">
          <div class="card-body profile-card pt-4 d-flex flex-column align-items-center text-center">
            <div class="profile-avatar mb-3" style="width: 100px; height: 100px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center;">
              <span style="font-size: 2.5rem; color: white; font-weight: 700;">
                <?php echo strtoupper(substr($customer['full_name'] ?? 'U', 0, 1)); ?>
              </span>
            </div>
            <h3 class="fw-bold"><?php echo htmlspecialchars($customer['full_name'] ?? 'Customer'); ?></h3>
            <p class="text-muted"><?php echo htmlspecialchars($customer['mobile_number'] ?? ''); ?></p>
            
            <div class="w-100 mt-3">
              <div class="d-flex justify-content-around text-center">
                <div>
                  <h4 class="fw-bold mb-0" style="color: #667eea;"><?php echo $total_vehicles; ?></h4>
                  <small class="text-muted">Vehicles</small>
                </div>
                <div>
                  <h4 class="fw-bold mb-0" style="color: #667eea;"><?php echo $total_bookings; ?></h4>
                  <small class="text-muted">Bookings</small>
                </div>
                <div>
                  <h4 class="fw-bold mb-0" style="color: #667eea;"><?php echo $completed_services; ?></h4>
                  <small class="text-muted">Completed</small>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Quick Info -->
        <div class="card shadow-sm border-0 mt-3" style="border-radius: 16px;">
          <div class="card-body">
            <h5 class="card-title fw-bold"><i class="fas fa-info-circle me-2 text-primary"></i>Quick Info</h5>
            
            <div class="d-flex align-items-center mb-3 pb-3 border-bottom">
              <i class="fas fa-map-marker-alt text-muted me-3" style="width: 20px;"></i>
              <div>
                <small class="text-muted d-block">Branch</small>
                <span class="fw-semibold"><?php echo htmlspecialchars($branch_name); ?></span>
              </div>
            </div>
            
            <?php if ($customer['email']): ?>
            <div class="d-flex align-items-center mb-3 pb-3 border-bottom">
              <i class="fas fa-envelope text-muted me-3" style="width: 20px;"></i>
              <div>
                <small class="text-muted d-block">Email</small>
                <span class="fw-semibold"><?php echo htmlspecialchars($customer['email']); ?></span>
              </div>
            </div>
            <?php endif; ?>
            
            <?php if ($customer['birth_date']): ?>
            <div class="d-flex align-items-center mb-3 pb-3 border-bottom">
              <i class="fas fa-birthday-cake text-muted me-3" style="width: 20px;"></i>
              <div>
                <small class="text-muted d-block">Birthday</small>
                <span class="fw-semibold"><?php echo date('F j, Y', strtotime($customer['birth_date'])); ?></span>
              </div>
            </div>
            <?php endif; ?>
            
            <?php if ($customer['address']): ?>
            <div class="d-flex align-items-center">
              <i class="fas fa-home text-muted me-3" style="width: 20px;"></i>
              <div>
                <small class="text-muted d-block">Address</small>
                <span class="fw-semibold"><?php echo htmlspecialchars($customer['address']); ?></span>
              </div>
            </div>
            <?php endif; ?>
          </div>
        </div>

        <!-- Logout -->
        <div class="card shadow-sm border-0 mt-3" style="border-radius: 16px;">
          <div class="card-body">
            <a href="logout.php" class="btn btn-outline-danger w-100">
              <i class="fas fa-sign-out-alt me-2"></i>Logout
            </a>
          </div>
        </div>
      </div>

      <!-- Edit Profile Form -->
      <div class="col-xl-8 col-lg-7">
        <div class="card shadow-sm border-0" style="border-radius: 16px;">
          <div class="card-body pt-3">
            <h5 class="card-title fw-bold"><i class="fas fa-user-edit me-2 text-primary"></i>Edit Profile</h5>
            
            <form method="POST">
              <input type="hidden" name="action" value="update_profile">
              
              <div class="row g-3 mb-3">
                <div class="col-md-12">
                  <label class="form-label fw-semibold">Full Name <span class="text-danger">*</span></label>
                  <input type="text" class="form-control" name="full_name" value="<?php echo htmlspecialchars($customer['full_name'] ?? ''); ?>" required>
                </div>
                
                <div class="col-md-6">
                  <label class="form-label fw-semibold">Mobile Number</label>
                  <input type="text" class="form-control bg-light" value="<?php echo htmlspecialchars($customer['mobile_number'] ?? ''); ?>" disabled>
                  <small class="text-muted">Contact support to change your mobile number</small>
                </div>
                
                <div class="col-md-6">
                  <label class="form-label fw-semibold">Email</label>
                  <input type="email" class="form-control" name="email" value="<?php echo htmlspecialchars($customer['email'] ?? ''); ?>" placeholder="your@email.com">
                </div>
                
                <div class="col-md-6">
                  <label class="form-label fw-semibold">Birthday</label>
                  <input type="date" class="form-control" name="birth_date" value="<?php echo $customer['birth_date'] ?? ''; ?>">
                </div>
                
                <div class="col-md-6">
                  <label class="form-label fw-semibold">Branch</label>
                  <input type="text" class="form-control bg-light" value="<?php echo htmlspecialchars($branch_name); ?>" disabled>
                </div>
                
                <div class="col-12">
                  <label class="form-label fw-semibold">Address</label>
                  <textarea class="form-control" name="address" rows="2" placeholder="Your address..."><?php echo htmlspecialchars($customer['address'] ?? ''); ?></textarea>
                </div>
              </div>
              
              <div class="text-end">
                <button type="submit" class="btn btn-primary px-4" style="border-radius: 10px;">
                  <i class="fas fa-save me-2"></i>Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
        
        <?php if ($customer['company_name']): ?>
        <!-- Company Info (read-only) -->
        <div class="card shadow-sm border-0 mt-3" style="border-radius: 16px;">
          <div class="card-body pt-3">
            <h5 class="card-title fw-bold"><i class="fas fa-building me-2 text-primary"></i>Company Information</h5>
            <div class="row">
              <div class="col-md-6 mb-2">
                <small class="text-muted d-block">Company Name</small>
                <span class="fw-semibold"><?php echo htmlspecialchars($customer['company_name']); ?></span>
              </div>
              <?php if ($customer['company_email']): ?>
              <div class="col-md-6 mb-2">
                <small class="text-muted d-block">Company Email</small>
                <span class="fw-semibold"><?php echo htmlspecialchars($customer['company_email']); ?></span>
              </div>
              <?php endif; ?>
              <?php if ($customer['company_contact_number']): ?>
              <div class="col-md-6 mb-2">
                <small class="text-muted d-block">Contact Number</small>
                <span class="fw-semibold"><?php echo htmlspecialchars($customer['company_contact_number']); ?></span>
              </div>
              <?php endif; ?>
              <?php if ($customer['company_address']): ?>
              <div class="col-md-12 mb-2">
                <small class="text-muted d-block">Company Address</small>
                <span class="fw-semibold"><?php echo htmlspecialchars($customer['company_address']); ?></span>
              </div>
              <?php endif; ?>
            </div>
          </div>
        </div>
        <?php endif; ?>
      </div>
    </div>
  </section>
</main>

<?php include 'includes/footer.php'; ?>