<?php
session_start();
require_once 'config/database.php';

// Check if user is logged in
if (!isset($_SESSION['user_id'])) {
    header('Location: login.php');
    exit();
}

$user_id = $_SESSION['user_id'];

// Get user information
$stmt = $pdo->prepare("SELECT * FROM customers WHERE customer_id = ?");
$stmt->execute([$user_id]);
$user = $stmt->fetch();

if (!$user) {
    session_destroy();
    header('Location: login.php');
    exit();
}

// Get customer vehicles
$stmt = $pdo->prepare("SELECT * FROM vehicles WHERE customer_id = ? ORDER BY created_at DESC");
$stmt->execute([$user_id]);
$vehicles = $stmt->fetchAll();

// Get total vehicles count
$total_vehicles = count($vehicles);

// Get vehicles needing service (example: vehicles with last service > 6 months ago)
$stmt = $pdo->prepare("
    SELECT COUNT(*) as needs_service 
    FROM vehicles v 
    LEFT JOIN bookings b ON v.vehicle_id = b.vehicle_id 
    WHERE v.customer_id = ? 
    AND (b.service_date IS NULL OR b.service_date < DATE_SUB(NOW(), INTERVAL 6 MONTH))
");
$stmt->execute([$user_id]);
$vehicles_needing_service = $stmt->fetchColumn();

// Get upcoming bookings
$stmt = $pdo->prepare("
    SELECT b.*, v.make, v.model, v.year, v.license_plate 
    FROM bookings b 
    JOIN vehicles v ON b.vehicle_id = v.vehicle_id 
    WHERE b.customer_id = ? AND b.service_date >= CURDATE() 
    ORDER BY b.service_date ASC 
    LIMIT 5
");
$stmt->execute([$user_id]);
$upcoming_bookings = $stmt->fetchAll();

// Get completed bookings
$stmt = $pdo->prepare("
    SELECT b.*, v.make, v.model, v.year, v.license_plate 
    FROM bookings b 
    JOIN vehicles v ON b.vehicle_id = v.vehicle_id 
    WHERE b.customer_id = ? AND b.service_date < CURDATE() 
    ORDER BY b.service_date DESC 
    LIMIT 5
");
$stmt->execute([$user_id]);
$completed_bookings = $stmt->fetchAll();

// Get completed services count
$completed_services_count = count($completed_bookings);

// Get recent activity count
$stmt = $pdo->prepare("
    SELECT COUNT(*) as recent_bookings 
    FROM bookings 
    WHERE customer_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
");
$stmt->execute([$user_id]);
$recent_bookings_count = $stmt->fetchColumn();

include 'includes/header-nice.php';
?>

<main id="main" class="main">

  <div class="pagetitle">
    <h1>Dashboard</h1>
    <nav>
      <ol class="breadcrumb">
        <li class="breadcrumb-item"><a href="dashboard-nice.php">Home</a></li>
        <li class="breadcrumb-item active">Dashboard</li>
      </ol>
    </nav>
  </div><!-- End Page Title -->

  <section class="section dashboard">
    <div class="row">

      <!-- Left side columns -->
      <div class="col-lg-8">
        <div class="row">

          <!-- Total Vehicles Card -->
          <div class="col-xxl-3 col-md-6">
            <div class="card info-card sales-card">

              <div class="filter">
                <a class="icon" href="#" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></a>
                <ul class="dropdown-menu dropdown-menu-end dropdown-menu-arrow">
                  <li class="dropdown-header text-start">
                    <h6>Filter</h6>
                  </li>
                  <li><a class="dropdown-item" href="#">Today</a></li>
                  <li><a class="dropdown-item" href="#">This Month</a></li>
                  <li><a class="dropdown-item" href="#">This Year</a></li>
                </ul>
              </div>

              <div class="card-body">
                <h5 class="card-title">Total Vehicles <span>| All Time</span></h5>

                <div class="d-flex align-items-center">
                  <div class="card-icon rounded-circle d-flex align-items-center justify-content-center">
                    <i class="bi bi-car-front"></i>
                  </div>
                  <div class="ps-3">
                    <h6><?php echo $total_vehicles; ?></h6>
                    <span class="text-success small pt-1 fw-bold">Registered</span> <span class="text-muted small pt-2 ps-1">vehicles</span>

                  </div>
                </div>
              </div>

            </div>
          </div><!-- End Total Vehicles Card -->

          <!-- Needs Service Card -->
          <div class="col-xxl-3 col-md-6">
            <div class="card info-card revenue-card">

              <div class="filter">
                <a class="icon" href="#" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></a>
                <ul class="dropdown-menu dropdown-menu-end dropdown-menu-arrow">
                  <li class="dropdown-header text-start">
                    <h6>Filter</h6>
                  </li>
                  <li><a class="dropdown-item" href="#">Today</a></li>
                  <li><a class="dropdown-item" href="#">This Month</a></li>
                  <li><a class="dropdown-item" href="#">This Year</a></li>
                </ul>
              </div>

              <div class="card-body">
                <h5 class="card-title">Needs Service <span>| This Month</span></h5>

                <div class="d-flex align-items-center">
                  <div class="card-icon rounded-circle d-flex align-items-center justify-content-center">
                    <i class="bi bi-tools"></i>
                  </div>
                  <div class="ps-3">
                    <h6><?php echo $vehicles_needing_service; ?></h6>
                    <span class="text-danger small pt-1 fw-bold">Vehicles</span> <span class="text-muted small pt-2 ps-1">need attention</span>

                  </div>
                </div>
              </div>

            </div>
          </div><!-- End Needs Service Card -->

          <!-- Upcoming Bookings Card -->
          <div class="col-xxl-3 col-md-6">
            <div class="card info-card customers-card">

              <div class="filter">
                <a class="icon" href="#" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></a>
                <ul class="dropdown-menu dropdown-menu-end dropdown-menu-arrow">
                  <li class="dropdown-header text-start">
                    <h6>Filter</h6>
                  </li>
                  <li><a class="dropdown-item" href="#">Today</a></li>
                  <li><a class="dropdown-item" href="#">This Month</a></li>
                  <li><a class="dropdown-item" href="#">This Year</a></li>
                </ul>
              </div>

              <div class="card-body">
                <h5 class="card-title">Upcoming <span>| Scheduled</span></h5>

                <div class="d-flex align-items-center">
                  <div class="card-icon rounded-circle d-flex align-items-center justify-content-center">
                    <i class="bi bi-calendar-check"></i>
                  </div>
                  <div class="ps-3">
                    <h6><?php echo count($upcoming_bookings); ?></h6>
                    <span class="text-primary small pt-1 fw-bold">Scheduled</span> <span class="text-muted small pt-2 ps-1">soon</span>

                  </div>
                </div>
              </div>

            </div>
          </div><!-- End Upcoming Bookings Card -->

          <!-- Completed Services Card -->
          <div class="col-xxl-3 col-md-6">
            <div class="card info-card reports-card">

              <div class="filter">
                <a class="icon" href="#" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></a>
                <ul class="dropdown-menu dropdown-menu-end dropdown-menu-arrow">
                  <li class="dropdown-header text-start">
                    <h6>Filter</h6>
                  </li>
                  <li><a class="dropdown-item" href="#">Today</a></li>
                  <li><a class="dropdown-item" href="#">This Month</a></li>
                  <li><a class="dropdown-item" href="#">This Year</a></li>
                </ul>
              </div>

              <div class="card-body">
                <h5 class="card-title">Completed <span>| Service History</span></h5>

                <div class="d-flex align-items-center">
                  <div class="card-icon rounded-circle d-flex align-items-center justify-content-center">
                    <i class="bi bi-check-circle"></i>
                  </div>
                  <div class="ps-3">
                    <h6><?php echo $completed_services_count; ?></h6>
                    <span class="text-success small pt-1 fw-bold">Services</span> <span class="text-muted small pt-2 ps-1">completed</span>

                  </div>
                </div>
              </div>

            </div>
          </div><!-- End Completed Services Card -->

          <!-- Recent Sales -->
          <div class="col-12">
            <div class="card recent-sales overflow-auto">

              <div class="filter">
                <a class="icon" href="#" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></a>
                <ul class="dropdown-menu dropdown-menu-end dropdown-menu-arrow">
                  <li class="dropdown-header text-start">
                    <h6>Filter</h6>
                  </li>
                  <li><a class="dropdown-item" href="#">Today</a></li>
                  <li><a class="dropdown-item" href="#">This Month</a></li>
                  <li><a class="dropdown-item" href="#">This Year</a></li>
                </ul>
              </div>

              <div class="card-body">
                <h5 class="card-title">Upcoming Bookings <span>| Next 30 Days</span></h5>

                <table class="table table-borderless datatable">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Vehicle</th>
                      <th scope="col">Service Type</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <?php if (empty($upcoming_bookings)): ?>
                      <tr>
                        <td colspan="4" class="text-center text-muted">No upcoming bookings</td>
                      </tr>
                    <?php else: ?>
                      <?php foreach ($upcoming_bookings as $booking): ?>
                        <tr>
                          <td><?php echo date('M d, Y', strtotime($booking['service_date'])); ?></td>
                          <td><?php echo htmlspecialchars($booking['make'] . ' ' . $booking['model'] . ' (' . $booking['year'] . ')'); ?></td>
                          <td><?php echo htmlspecialchars($booking['service_type']); ?></td>
                          <td><span class="badge bg-warning"><?php echo ucfirst($booking['status']); ?></span></td>
                        </tr>
                      <?php endforeach; ?>
                    <?php endif; ?>
                  </tbody>
                </table>

              </div>

            </div>
          </div><!-- End Recent Sales -->

          <!-- Top Selling -->
          <div class="col-12">
            <div class="card top-selling overflow-auto">

              <div class="filter">
                <a class="icon" href="#" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></a>
                <ul class="dropdown-menu dropdown-menu-end dropdown-menu-arrow">
                  <li class="dropdown-header text-start">
                    <h6>Filter</h6>
                  </li>
                  <li><a class="dropdown-item" href="#">Today</a></li>
                  <li><a class="dropdown-item" href="#">This Month</a></li>
                  <li><a class="dropdown-item" href="#">This Year</a></li>
                </ul>
              </div>

              <div class="card-body pb-0">
                <h5 class="card-title">My Vehicles <span>| Registered</span></h5>

                <table class="table table-borderless">
                  <thead>
                    <tr>
                      <th scope="col">Vehicle</th>
                      <th scope="col">License Plate</th>
                      <th scope="col">Year</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <?php if (empty($vehicles)): ?>
                      <tr>
                        <td colspan="4" class="text-center text-muted">No vehicles registered</td>
                      </tr>
                    <?php else: ?>
                      <?php foreach (array_slice($vehicles, 0, 5) as $vehicle): ?>
                        <tr>
                          <td>
                            <img src="assets/img/car-placeholder.png" alt="" style="width: 40px; height: 40px; object-fit: cover; border-radius: 5px;">
                            <span class="ms-2"><?php echo htmlspecialchars($vehicle['make'] . ' ' . $vehicle['model']); ?></span>
                          </td>
                          <td><?php echo htmlspecialchars($vehicle['license_plate']); ?></td>
                          <td><?php echo htmlspecialchars($vehicle['year']); ?></td>
                          <td>
                            <a href="vehicle-details.php?id=<?php echo $vehicle['vehicle_id']; ?>" class="btn btn-sm btn-outline-primary">
                              <i class="bi bi-eye"></i> View
                            </a>
                            <a href="book-service.php?vehicle_id=<?php echo $vehicle['vehicle_id']; ?>" class="btn btn-sm btn-primary">
                              <i class="bi bi-calendar-plus"></i> Book
                            </a>
                          </td>
                        </tr>
                      <?php endforeach; ?>
                    <?php endif; ?>
                  </tbody>
                </table>

              </div>

            </div>
          </div><!-- End Top Selling -->

        </div>
      </div><!-- End Left side columns -->

      <!-- Right side columns -->
      <div class="col-lg-4">

        <!-- Recent Activity -->
        <div class="card">
          <div class="filter">
            <a class="icon" href="#" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></a>
            <ul class="dropdown-menu dropdown-menu-end dropdown-menu-arrow">
              <li class="dropdown-header text-start">
                <h6>Filter</h6>
              </li>
              <li><a class="dropdown-item" href="#">Today</a></li>
              <li><a class="dropdown-item" href="#">This Month</a></li>
              <li><a class="dropdown-item" href="#">This Year</a></li>
            </ul>
          </div>

          <div class="card-body">
            <h5 class="card-title">Recent Activity <span>| Today</span></h5>

            <div class="activity">

              <?php if (empty($completed_bookings)): ?>
                <div class="activity-item d-flex">
                  <div class="activite-label text-muted">No recent activity</div>
                </div>
              <?php else: ?>
                <?php foreach (array_slice($completed_bookings, 0, 3) as $index => $booking): ?>
                  <div class="activity-item d-flex">
                    <div class="activite-label"><?php echo date('M d', strtotime($booking['service_date'])); ?></div>
                    <i class='bi bi-circle-fill activity-badge text-success align-self-start'></i>
                    <div class="activity-content">
                      Service completed for <strong><?php echo htmlspecialchars($booking['make'] . ' ' . $booking['model']); ?></strong>
                      <br><small class="text-muted"><?php echo htmlspecialchars($booking['service_type']); ?></small>
                    </div>
                  </div><!-- End activity item-->
                <?php endforeach; ?>
              <?php endif; ?>

            </div>

          </div>
        </div><!-- End Recent Activity -->

        <!-- Budget Report -->
        <div class="card">
          <div class="filter">
            <a class="icon" href="#" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></a>
            <ul class="dropdown-menu dropdown-menu-end dropdown-menu-arrow">
              <li class="dropdown-header text-start">
                <h6>Filter</h6>
              </li>
              <li><a class="dropdown-item" href="#">Today</a></li>
              <li><a class="dropdown-item" href="#">This Month</a></li>
              <li><a class="dropdown-item" href="#">This Year</a></li>
            </ul>
          </div>

          <div class="card-body pb-0">
            <h5 class="card-title">Quick Actions <span>| Shortcuts</span></h5>

            <div class="d-grid gap-2">
              <a href="vehicles.php" class="btn btn-outline-primary">
                <i class="bi bi-car-front"></i> Manage Vehicles
              </a>
              <a href="book-service.php" class="btn btn-primary">
                <i class="bi bi-calendar-plus"></i> Schedule Service
              </a>
              <a href="bookings.php" class="btn btn-outline-secondary">
                <i class="bi bi-list-check"></i> View All Bookings
              </a>
              <a href="profile.php" class="btn btn-outline-info">
                <i class="bi bi-person-gear"></i> Update Profile
              </a>
            </div>

          </div>
        </div><!-- End Budget Report -->

        <!-- Website Traffic -->
        <div class="card">
          <div class="filter">
            <a class="icon" href="#" data-bs-toggle="dropdown"><i class="bi bi-three-dots"></i></a>
            <ul class="dropdown-menu dropdown-menu-end dropdown-menu-arrow">
              <li class="dropdown-header text-start">
                <h6>Filter</h6>
              </li>
              <li><a class="dropdown-item" href="#">Today</a></li>
              <li><a class="dropdown-item" href="#">This Month</a></li>
              <li><a class="dropdown-item" href="#">This Year</a></li>
            </ul>
          </div>

          <div class="card-body pb-0">
            <h5 class="card-title">Service Statistics <span>| This Year</span></h5>

            <div class="row">
              <div class="col-6">
                <div class="text-center">
                  <h4 class="text-primary"><?php echo count($completed_bookings); ?></h4>
                  <small class="text-muted">Completed Services</small>
                </div>
              </div>
              <div class="col-6">
                <div class="text-center">
                  <h4 class="text-warning"><?php echo count($upcoming_bookings); ?></h4>
                  <small class="text-muted">Upcoming Services</small>
                </div>
              </div>
            </div>

            <div class="mt-3">
              <div class="progress" style="height: 10px;">
                <?php 
                $total_services = count($completed_bookings) + count($upcoming_bookings);
                $completed_percentage = $total_services > 0 ? (count($completed_bookings) / $total_services) * 100 : 0;
                ?>
                <div class="progress-bar bg-primary" role="progressbar" style="width: <?php echo $completed_percentage; ?>%" aria-valuenow="<?php echo $completed_percentage; ?>" aria-valuemin="0" aria-valuemax="100"></div>
              </div>
              <small class="text-muted mt-1 d-block"><?php echo round($completed_percentage, 1); ?>% services completed</small>
            </div>

          </div>
        </div><!-- End Website Traffic -->

      </div><!-- End Right side columns -->

    </div>
  </section>

</main><!-- End #main -->

<!-- ======= Footer ======= -->
<footer id="footer" class="footer">
  <div class="copyright">
    &copy; Copyright <strong><span>MASKPROCare</span></strong>. All Rights Reserved
  </div>
  <div class="credits">
    Designed by <a href="#">MASKPROCare Team</a>
  </div>
</footer><!-- End Footer -->

<a href="#" class="back-to-top d-flex align-items-center justify-content-center"><i class="bi bi-arrow-up-short"></i></a>

<!-- Vendor JS Files -->
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>

<!-- Template Main JS File -->
<script>
// Toggle sidebar
document.addEventListener('DOMContentLoaded', function() {
  const sidebarToggle = document.querySelector('.toggle-sidebar-btn');
  const body = document.body;
  
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', function() {
      body.classList.toggle('toggle-sidebar');
    });
  }
  
  // Search bar toggle for mobile
  const searchToggle = document.querySelector('.search-toggle');
  const searchBar = document.querySelector('.search-bar');
  
  if (searchToggle && searchBar) {
    searchToggle.addEventListener('click', function() {
      searchBar.classList.toggle('search-bar-show');
    });
  }
  
  // Back to top button
  const backToTop = document.querySelector('.back-to-top');
  
  if (backToTop) {
    const toggleBackToTop = () => {
      if (window.scrollY > 100) {
        backToTop.classList.add('active');
      } else {
        backToTop.classList.remove('active');
      }
    };
    
    window.addEventListener('scroll', toggleBackToTop);
    
    backToTop.addEventListener('click', function(e) {
      e.preventDefault();
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }
});
</script>

</body>
</html>