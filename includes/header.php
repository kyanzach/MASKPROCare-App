<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="utf-8">
  <meta content="width=device-width, initial-scale=1.0" name="viewport">

  <title>MASKPROCare App - Vehicle Maintenance Scheduler</title>
  <meta content="" name="description">
  <meta content="" name="keywords">

  <!-- Favicons -->
  <link href="assets/img/MaskPro_NanoFix_Icon.png" rel="icon">
  <link href="assets/img/MaskPro_NanoFix_Icon.png" rel="apple-touch-icon">

  <!-- Google Fonts -->
  <link href="https://fonts.gstatic.com" rel="preconnect">
  <link href="https://fonts.googleapis.com/css?family=Open+Sans:300,300i,400,400i,600,600i,700,700i|Nunito:300,300i,400,400i,600,600i,700,700i|Poppins:300,300i,400,400i,500,500i,600,600i,700,700i" rel="stylesheet">

  <!-- Vendor CSS Files -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">

  <!-- Template Main CSS File -->
  <link href="assets/css/nice-admin-style.css?v=<?php echo time(); ?>" rel="stylesheet">
  <link href="assets/css/style.css?v=<?php echo time(); ?>" rel="stylesheet">

</head>

<body>

<?php
// Check if user is logged in (except for login page)
$current_page = basename($_SERVER['PHP_SELF']);
$public_pages = ['login.php', 'login-verify.php'];

if (!isset($_SESSION['customer_id']) && !in_array($current_page, $public_pages)) {
    header('Location: login.php');
    exit;
}

// Only show layout if user is logged in and not on login page
if (isset($_SESSION['customer_id']) && !in_array($current_page, $public_pages)) {
    // Get customer information
    $customer_id = $_SESSION['customer_id'];
    $customer = null;
    
    // Check if database connection exists
    if (isset($conn)) {
        $customer_query = "SELECT * FROM customers WHERE id = ?";
        $customer_stmt = $conn->prepare($customer_query);
        if ($customer_stmt) {
            $customer_stmt->bind_param("i", $customer_id);
            $customer_stmt->execute();
            $customer_result = $customer_stmt->get_result();
            $customer = $customer_result->fetch_assoc();
            $customer_stmt->close();
        }
    }
    
    // Set default values if customer data is not available
    if (!$customer) {
        $customer = [
            'first_name' => 'User',
            'last_name' => '',
            'full_name' => 'User'
        ];
    }
?>

  <!-- ======= Header ======= -->
  <header id="header" class="header fixed-top d-flex align-items-center">

    <div class="d-flex align-items-center justify-content-between">
      <a href="dashboard.php" class="logo d-flex align-items-center">
        <img src="../assets/img/logo.png" alt="">
        <span class="d-none d-lg-block">MaskPro Care</span>
      </a>
      <i class="bi bi-list toggle-sidebar-btn"></i>
    </div><!-- End Logo -->

    <div class="search-bar">
      <form class="search-form d-flex align-items-center" method="POST" action="#">
        <input type="text" name="query" placeholder="Search vehicles, bookings..." title="Enter search keyword">
        <button type="submit" title="Search"><i class="bi bi-search"></i></button>
      </form>
    </div><!-- End Search Bar -->

    <nav class="header-nav ms-auto">
      <ul class="d-flex align-items-center">

        <li class="nav-item d-block d-lg-none">
          <a class="nav-link nav-icon search-bar-toggle " href="#">
            <i class="bi bi-search"></i>
          </a>
        </li><!-- End Search Icon-->

        <li class="nav-item dropdown">

          <a class="nav-link nav-icon" href="#" data-bs-toggle="dropdown">
            <i class="bi bi-bell"></i>
            <span class="badge bg-primary badge-number">4</span>
          </a><!-- End Notification Icon -->

          <ul class="dropdown-menu dropdown-menu-end dropdown-menu-arrow notifications">
            <li class="dropdown-header">
              You have 4 new notifications
              <a href="#"><span class="badge rounded-pill bg-primary p-2 ms-2">View all</span></a>
            </li>
            <li>
              <hr class="dropdown-divider">
            </li>

            <li class="notification-item">
              <i class="bi bi-exclamation-circle text-warning"></i>
              <div>
                <h4>Service Reminder</h4>
                <p>Your Toyota Camry is due for maintenance</p>
                <p>30 min. ago</p>
              </div>
            </li>

            <li>
              <hr class="dropdown-divider">
            </li>

            <li class="notification-item">
              <i class="bi bi-x-circle text-danger"></i>
              <div>
                <h4>Booking Cancelled</h4>
                <p>Your appointment for July 15 has been cancelled</p>
                <p>1 hr. ago</p>
              </div>
            </li>

            <li>
              <hr class="dropdown-divider">
            </li>

            <li class="notification-item">
              <i class="bi bi-check-circle text-success"></i>
              <div>
                <h4>Service Completed</h4>
                <p>Oil change for Honda Civic completed successfully</p>
                <p>2 hrs. ago</p>
              </div>
            </li>

            <li>
              <hr class="dropdown-divider">
            </li>

            <li class="notification-item">
              <i class="bi bi-info-circle text-primary"></i>
              <div>
                <h4>New Feature</h4>
                <p>Vehicle tracking is now available</p>
                <p>4 hrs. ago</p>
              </div>
            </li>

            <li>
              <hr class="dropdown-divider">
            </li>
            <li class="dropdown-footer">
              <a href="#">Show all notifications</a>
            </li>

          </ul><!-- End Notification Dropdown Items -->

        </li><!-- End Notification Nav -->

        <li class="nav-item dropdown pe-3">

          <a class="nav-link nav-profile d-flex align-items-center pe-0" href="#" data-bs-toggle="dropdown">
            <img src="https://ui-avatars.com/api/?name=<?php echo urlencode(($customer['first_name'] ?? 'User') . '+' . ($customer['last_name'] ?? '')); ?>&background=4154f1&color=fff" alt="Profile" class="rounded-circle">
            <span class="d-none d-md-block dropdown-toggle ps-2"><?php echo htmlspecialchars($customer['first_name'] ?? 'User'); ?></span>
          </a><!-- End Profile Iamge Icon -->

          <ul class="dropdown-menu dropdown-menu-end dropdown-menu-arrow profile">
            <li class="dropdown-header">
              <h6><?php echo htmlspecialchars(($customer['first_name'] ?? 'User') . ' ' . ($customer['last_name'] ?? '')); ?></h6>
              <span>Customer</span>
            </li>
            <li>
              <hr class="dropdown-divider">
            </li>

            <li>
              <a class="dropdown-item d-flex align-items-center" href="profile.php">
                <i class="bi bi-person"></i>
                <span>My Profile</span>
              </a>
            </li>
            <li>
              <hr class="dropdown-divider">
            </li>

            <li>
              <a class="dropdown-item d-flex align-items-center" href="profile.php">
                <i class="bi bi-gear"></i>
                <span>Account Settings</span>
              </a>
            </li>
            <li>
              <hr class="dropdown-divider">
            </li>

            <li>
              <a class="dropdown-item d-flex align-items-center" href="#">
                <i class="bi bi-question-circle"></i>
                <span>Need Help?</span>
              </a>
            </li>
            <li>
              <hr class="dropdown-divider">
            </li>

            <li>
              <a class="dropdown-item d-flex align-items-center" href="logout.php">
                <i class="bi bi-box-arrow-right"></i>
                <span>Sign Out</span>
              </a>
            </li>

          </ul><!-- End Profile Dropdown Items -->
        </li><!-- End Profile Nav -->

      </ul>
    </nav><!-- End Icons Navigation -->

  </header><!-- End Header -->

  <!-- ======= Sidebar ======= -->
  <aside id="sidebar" class="sidebar">

    <ul class="sidebar-nav" id="sidebar-nav">

      <li class="nav-item">
        <a class="nav-link <?php echo basename($_SERVER['PHP_SELF']) == 'index.php' ? '' : 'collapsed'; ?>" href="index.php">
          <i class="bi bi-grid"></i>
          <span>Dashboard</span>
        </a>
      </li><!-- End Dashboard Nav -->

      <li class="nav-item">
        <a class="nav-link <?php echo basename($_SERVER['PHP_SELF']) == 'bookings.php' ? '' : 'collapsed'; ?>" href="bookings.php">
          <i class="bi bi-calendar-check"></i>
          <span>My Bookings</span>
        </a>
      </li><!-- End Bookings Nav -->

      <li class="nav-item">
        <a class="nav-link <?php echo basename($_SERVER['PHP_SELF']) == 'vehicles.php' ? '' : 'collapsed'; ?>" href="vehicles.php">
          <i class="bi bi-car-front"></i>
          <span>My Vehicles</span>
        </a>
      </li><!-- End Vehicles Nav -->

      <li class="nav-item">
        <a class="nav-link collapsed" data-bs-target="#components-nav" data-bs-toggle="collapse" href="#">
          <i class="bi bi-palette"></i><span>Services</span><i class="bi bi-chevron-down ms-auto"></i>
        </a>
        <ul id="components-nav" class="nav-content collapse " data-bs-parent="#sidebar-nav">
          <li>
            <a href="#">
              <i class="bi bi-shield-check"></i><span>Nano Ceramic Coating</span>
            </a>
          </li>
          <li>
            <a href="#">
              <i class="bi bi-window"></i><span>Nano Ceramic Tint</span>
            </a>
          </li>
          <li>
            <a href="#">
              <i class="bi bi-shield-fill-plus"></i><span>Paint Protection Film</span>
            </a>
          </li>
          <li>
            <a href="#">
              <i class="bi bi-brush"></i><span>Auto Paint</span>
            </a>
          </li>
          <li>
            <a href="#">
              <i class="bi bi-stars"></i><span>Full Detailing</span>
            </a>
          </li>
        </ul>
      </li><!-- End Services Nav -->

      <li class="nav-heading">Account</li>

      <li class="nav-item">
        <a class="nav-link <?php echo basename($_SERVER['PHP_SELF']) == 'profile.php' ? '' : 'collapsed'; ?>" href="profile.php">
          <i class="bi bi-person"></i>
          <span>Profile</span>
        </a>
      </li><!-- End Profile Page Nav -->

      <li class="nav-item">
        <a class="nav-link collapsed" href="#">
          <i class="bi bi-question-circle"></i>
          <span>F.A.Q</span>
        </a>
      </li><!-- End F.A.Q Page Nav -->

      <li class="nav-item">
        <a class="nav-link collapsed" href="#">
          <i class="bi bi-envelope"></i>
          <span>Contact</span>
        </a>
      </li><!-- End Contact Page Nav -->

    </ul>

  </aside><!-- End Sidebar-->

  <main id="main" class="main">

<?php } else { ?>
    <!-- Content for non-logged in pages -->
    <div class="login-container">
<?php } ?>