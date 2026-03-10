<?php
// Set HTTP response code
http_response_code(500);

// Include configuration
require_once 'config.php';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta content="width=device-width, initial-scale=1.0" name="viewport">
    <title>Server Error - MaskPro Care</title>
    <meta content="" name="description">
    <meta content="" name="keywords">

    <!-- Favicons -->
    <link href="assets/img/favicon.png" rel="icon">
    <link href="assets/img/apple-touch-icon.png" rel="apple-touch-icon">

    <!-- Google Fonts -->
    <link href="https://fonts.gstatic.com" rel="preconnect">
    <link href="https://fonts.googleapis.com/css?family=Open+Sans:300,300i,400,400i,600,600i,700,700i|Nunito:300,300i,400,400i,600,600i,700,700i|Poppins:300,300i,400,400i,500,500i,600,600i,700,700i" rel="stylesheet">

    <!-- Vendor CSS Files -->
    <link href="assets/vendor/bootstrap/css/bootstrap.min.css" rel="stylesheet">
    <link href="assets/vendor/bootstrap-icons/bootstrap-icons.css" rel="stylesheet">
    <link href="assets/vendor/boxicons/css/boxicons.min.css" rel="stylesheet">
    <link href="assets/vendor/quill/quill.snow.css" rel="stylesheet">
    <link href="assets/vendor/quill/quill.bubble.css" rel="stylesheet">
    <link href="assets/vendor/remixicon/remixicon.css" rel="stylesheet">
    <link href="assets/vendor/simple-datatables/style.css" rel="stylesheet">

    <!-- Template Main CSS File -->
    <link href="assets/css/style.css" rel="stylesheet">

    <style>
        .error-500 h1 {
            font-size: 180px;
            font-weight: 700;
            color: #4154f1;
            margin-bottom: 0;
            line-height: 150px;
        }
        .error-500 h2 {
            font-size: 24px;
            font-weight: 700;
            color: #012970;
            margin-bottom: 30px;
        }
        .error-500 .btn {
            background: #4154f1;
            color: #fff;
            padding: 10px 30px;
            border-radius: 4px;
            text-decoration: none;
            transition: 0.3s;
        }
        .error-500 .btn:hover {
            background: #3145d9;
        }
    </style>
</head>

<body>
    <main>
        <div class="container">
            <section class="section error-500 min-vh-100 d-flex flex-column align-items-center justify-content-center">
                <h1>500</h1>
                <h2>Internal Server Error</h2>
                <p class="mb-4">Sorry, something went wrong on our servers. We're working to fix the issue as soon as possible.</p>
                <div class="d-flex gap-3 mb-4">
                    <a class="btn" href="dashboard-nice.php">
                        <i class="bi bi-house-door me-2"></i>Back to Dashboard
                    </a>
                    <a class="btn btn-outline-primary" href="javascript:location.reload()">
                        <i class="bi bi-arrow-clockwise me-2"></i>Try Again
                    </a>
                </div>
                <img src="assets/img/not-found.svg" class="img-fluid py-5" alt="Server Error" style="max-width: 400px;">
                <div class="mt-4">
                    <p class="text-muted small">If this problem persists, please contact support.</p>
                </div>
                <div class="credits">
                    <!-- All the links in the footer should remain intact. -->
                    <!-- You can delete the links only if you purchased the pro version. -->
                    <!-- Licensing information: https://bootstrapmade.com/license/ -->
                    <!-- Purchase the pro version with working PHP/AJAX contact form: https://bootstrapmade.com/nice-admin-bootstrap-admin-html-template/ -->
                    Designed by <a href="https://bootstrapmade.com/">BootstrapMade</a>
                </div>
            </section>
        </div>
    </main><!-- End #main -->

    <a href="#" class="back-to-top d-flex align-items-center justify-content-center"><i class="bi bi-arrow-up-short"></i></a>

    <!-- Vendor JS Files -->
    <script src="assets/vendor/apexcharts/apexcharts.min.js"></script>
    <script src="assets/vendor/bootstrap/js/bootstrap.bundle.min.js"></script>
    <script src="assets/vendor/chart.js/chart.umd.js"></script>
    <script src="assets/vendor/echarts/echarts.min.js"></script>
    <script src="assets/vendor/quill/quill.min.js"></script>
    <script src="assets/vendor/simple-datatables/simple-datatables.js"></script>
    <script src="assets/vendor/tinymce/tinymce.min.js"></script>
    <script src="assets/vendor/php-email-form/validate.js"></script>

    <!-- Template Main JS File -->
    <script src="assets/js/main.js"></script>
</body>
</html>