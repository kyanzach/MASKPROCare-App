<?php
// Include database configuration
require_once('db_connect.php');
require_once('config.php');
require_once('SMS_API_settings.php');

// Session is started in config.php

// Check if user is already logged in
if (isset($_SESSION['customer_id']) && !empty($_SESSION['customer_id'])) {
    header('Location: index.php');
    exit;
}

// Initialize variables
$error = '';
$info = '';
$mobile = '';

// Function to standardize mobile number format
function standardize_mobile_number($mobile) {
    // Remove any non-digit characters
    $mobile = preg_replace('/[^0-9]/', '', $mobile);
    
    // Check if it starts with 63 (12 digits)
    if (substr($mobile, 0, 2) === '63' && strlen($mobile) === 12) {
        return '+' . $mobile;
    }
    // Check if it starts with 0 (11 digits)
    else if (substr($mobile, 0, 1) === '0' && strlen($mobile) === 11) {
        return '+63' . substr($mobile, 1);
    }
    // Check if it starts with 9 (10 digits)
    else if (substr($mobile, 0, 1) === '9' && strlen($mobile) === 10) {
        return '+63' . $mobile;
    }
    // Return original if no pattern matches
    return $mobile;
}

// Function to get the last 10 digits of a mobile number for comparison
function get_last_10_digits($mobile) {
    $mobile = preg_replace('/[^0-9]/', '', $mobile);
    return substr($mobile, -10);
}

// Process form submission
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Mobile number validation and OTP sending
    if (isset($_POST['mobile_submit'])) {
        $mobile = trim($_POST['mobile']);
        
        // Validate mobile number (Philippine format)
        if (!preg_match('/^(\+63|63|0)?9\d{9}$/', $mobile)) {
            $error = 'Please enter a valid Philippine mobile number (e.g., 09XX XXX XXXX)';
        } else {
            // Format mobile number to standard format
            $formattedMobile = standardize_mobile_number($mobile);
            $last10Digits = get_last_10_digits($formattedMobile);
            
            // Check if mobile number exists in database (using last 10 digits for comparison)
            $query = "SELECT id, mobile_number FROM customers WHERE RIGHT(REPLACE(REPLACE(mobile_number, '+', ''), ' ', ''), 10) = ?";
            $stmt = $conn->prepare($query);
            
            if (!$stmt) {
                $error = 'Database error occurred. Please try again.';
            } else {
                $stmt->bind_param("s", $last10Digits);
                $stmt->execute();
                $result = $stmt->get_result();
            
                if ($result->num_rows === 0) {
                    $error = 'Mobile number not registered. Please make sure this is the number you used for your service registration.';
                } else {
                    // Generate OTP
                    $otp_code = sprintf("%06d", mt_rand(1, 999999));
                    $otp_expires = date('Y-m-d H:i:s', strtotime('+5 minutes'));
                    
                    // Get customer ID
                    $customer = $result->fetch_assoc();
                    $customerId = $customer['id'];
                    
                    // Store OTP in login_otp table
                    $checkQuery = "SELECT * FROM login_otp WHERE mobile_number = ?";
                    $checkStmt = $conn->prepare($checkQuery);
                    $checkStmt->bind_param("s", $formattedMobile);
                    $checkStmt->execute();
                    $checkResult = $checkStmt->get_result();
                    
                    if ($checkResult->num_rows > 0) {
                        // Update existing entry
                        $updateQuery = "UPDATE login_otp SET otp_code = ?, otp_expires = ?, customer_id = ? WHERE mobile_number = ?";
                        $updateStmt = $conn->prepare($updateQuery);
                        $updateStmt->bind_param("ssis", $otp_code, $otp_expires, $customerId, $formattedMobile);
                        $updateStmt->execute();
                        $updateStmt->close();
                    } else {
                        // Insert new entry
                        $insertQuery = "INSERT INTO login_otp (mobile_number, customer_id, otp_code, otp_expires, created_at) VALUES (?, ?, ?, ?, NOW())";
                        $insertStmt = $conn->prepare($insertQuery);
                        $insertStmt->bind_param("siss", $formattedMobile, $customerId, $otp_code, $otp_expires);
                        $insertStmt->execute();
                        $insertStmt->close();
                    }
                    
                    $checkStmt->close();
                    
                    // Send OTP via SMS
                    $sms_message = "Your NanoFix OTP code is: $otp_code. Valid for " . (OTP_EXPIRY/60) . " minutes. Do not share this code.";
                    
                    // Try primary SMS API (ITEXMO)
                    $baseURL = "https://api.itexmo.com/api/broadcast";
                    $sms_sent = sendSms($baseURL, "MASKPRO", $formattedMobile, $sms_message, $customer['id']);
                    
                    // If primary fails, try fallback SMS API (SMS-it)
                    if (!$sms_sent) {
                        writeToLog("Primary SMS failed for $formattedMobile, trying fallback SMS-it");
                        $retry_result = retrySms($formattedMobile, $sms_message, $customer['id']);
                        $sms_sent = ($retry_result['status'] === 'Sent');
                    }
                    
                    $stmt->close();
                    
                    // Redirect to OTP verification page with mobile number
                    header('Location: login-verify.php?mobile=' . urlencode($formattedMobile));
                    exit;
                }
            }
        }
    }
}

?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - <?php echo APP_NAME; ?></title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <link href="assets/css/login.css" rel="stylesheet">
</head>
<body class="login-body">
    <div class="login-container">
        <div class="login-card-modern">
            <div class="login-header-modern">
                <div class="login-logo-modern">
                    <i class="fas fa-shield-alt"></i>
                </div>
                <h1 class="login-title-modern">Welcome Back</h1>
                <p class="login-subtitle-modern">Enter your mobile number to access your account</p>
            </div>
            
        <!-- Body -->
        <div class="login-body-modern">
            <!-- Error/Info Messages -->
            <?php if (!empty($error)): ?>
                <div class="login-alert login-alert-error">
                    <div>
                        <i class="fas fa-exclamation-triangle mr-2"></i>
                        <?php echo htmlspecialchars($error); ?>
                    </div>
                </div>
            <?php endif; ?>
            
            <?php if (isset($testOtpMessage)): ?>
                <div class="login-alert login-alert-info">
                    <div>
                        <i class="fas fa-info-circle mr-2"></i>
                        <?php echo htmlspecialchars($testOtpMessage); ?>
                    </div>
                </div>
            <?php endif; ?>
                
                <!-- Mobile Number Form -->
                <form method="POST" action="" class="animate-slide-up" onsubmit="return validateMobileForm();">
                    <div class="login-form-group">
                        <label for="mobile" class="login-form-label">Mobile Number</label>
                        <input 
                            type="tel" 
                            id="mobile" 
                            name="mobile" 
                            class="login-form-input hover-lift" 
                            placeholder="09XX XXX XXXX" 
                            value="<?php echo htmlspecialchars($mobile); ?>"
                            maxlength="13"
                            required
                        >
                        <p class="login-form-help">
                            Please use the mobile number registered for the service or from where you receive maintenance reminders
                        </p>
                    </div>
                    
                    <div class="login-form-group">
                        <button type="submit" name="mobile_submit" class="login-btn-primary hover-lift">
                            Continue with Mobile
                        </button>
                    </div>
                </form>
                
                <!-- Footer -->
                <div class="login-footer">
                    <p class="login-footer-text">
                        By continuing, you agree to our 
                        <a href="#" class="login-footer-link">Terms of Service</a> and 
                        <a href="#" class="login-footer-link">Privacy Policy</a>
                    </p>
                    
                    <div class="login-security-badge">
                        <i class="fas fa-shield-alt"></i>
                        <span>Secured by MaskPro</span>
                        <i class="fas fa-lock"></i>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Additional Info -->
        <div class="login-help-section">
            <p class="login-help-text">
                Need help? Contact our support team at 
                <a href="tel:++63-1800-1-550-0037" class="login-help-link">
                    <i class="fas fa-phone mr-1"></i>
                    +63-1800-1-550-0037
                </a>
            </p>
        </div>
    </div>
</div>

<!-- Scripts -->
<script>
    // Form validation function
    function validateMobileForm() {
        const mobileInput = document.getElementById('mobile');
        const mobile = mobileInput.value.trim();
        
        if (!mobile) {
            alert('Please enter your mobile number');
            return false;
        }
        
        // Basic Philippine mobile number validation
        const mobilePattern = /^(\+63|63|0)?9\d{9}$/;
        if (!mobilePattern.test(mobile.replace(/[\s\-()]/g, ''))) {
            alert('Please enter a valid Philippine mobile number (e.g., 09XX XXX XXXX)');
            return false;
        }
        
        return true;
    }
    
    // Auto-focus and formatting
    document.addEventListener('DOMContentLoaded', function() {
        const mobileInput = document.getElementById('mobile');
        
        // Mobile number input formatting
        if (mobileInput) {
            mobileInput.focus();
            
            mobileInput.addEventListener('input', function(e) {
                // Allow only numeric input
                this.value = this.value.replace(/[^0-9]/g, '');
                
                // Limit to 12 digits
                if (this.value.length > 12) {
                    this.value = this.value.slice(0, 12);
                }
            });
        }
    });
</script>

</body>
</html>