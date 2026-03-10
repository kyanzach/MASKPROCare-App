<?php
require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';
require_once 'SMS_API_settings.php';

// Check if mobile number is provided
if (!isset($_GET['mobile']) || empty($_GET['mobile'])) {
    header('Location: login.php');
    exit;
}

$mobile = $_GET['mobile'];
$error = '';
$success = '';

// Process OTP verification
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['otp_submit'])) {
        $otp = trim($_POST['otp']);
        $formattedMobile = standardize_mobile_number($mobile);
        
        // Validate OTP
        if (strlen($otp) !== 6 || !ctype_digit($otp)) {
            $error = 'Please enter a valid 6-digit OTP';
        } else {
            // Verify OTP from login_otp table
            $verifyQuery = "SELECT *, NOW() as server_time FROM login_otp WHERE mobile_number = ? AND otp_code = ?";
            $verifyStmt = $conn->prepare($verifyQuery);
            $verifyStmt->bind_param("ss", $formattedMobile, $otp);
            $verifyStmt->execute();
            $verifyResult = $verifyStmt->get_result();
            
            if ($verifyResult->num_rows > 0) {
                $otpData = $verifyResult->fetch_assoc();
                $customerId = $otpData['customer_id'];
                
                // Check if OTP is expired
                $currentTime = new DateTime($otpData['server_time']);
                $expiryTime = new DateTime($otpData['otp_expires']);
                
                if ($currentTime > $expiryTime) {
                    $error = 'OTP has expired. Please request a new one.';
                } else {
                    // OTP is valid, create session
                    $_SESSION['customer_id'] = $customerId;
                    
                    // Assign customer branch if not already assigned
                    require_once 'includes/customer_branch_helper.php';
                    initialize_customer_branch_session($conn, $customerId);
                    
                    // Update login_otp table
                    $sessionToken = bin2hex(random_bytes(32));
                    $tokenExpiry = date('Y-m-d H:i:s', strtotime('+30 days'));
                    $updateQuery = "UPDATE login_otp SET last_login = NOW(), session_token = ?, token_expiry = ? WHERE mobile_number = ?";
                    $updateStmt = $conn->prepare($updateQuery);
                    $updateStmt->bind_param("sss", $sessionToken, $tokenExpiry, $formattedMobile);
                    $updateStmt->execute();
                    $updateStmt->close();
                    
                    // Redirect to dashboard
                    header('Location: index.php');
                    exit;
                }
            } else {
                $error = 'Invalid or expired OTP';
            }
            
            $verifyStmt->close();
        }
    }
    
    // Handle resend OTP request
    if (isset($_POST['resend_otp'])) {
        $formattedMobile = standardize_mobile_number($mobile);
        $last10Digits = get_last_10_digits($formattedMobile);
        
        // Check if mobile number exists in database
        $query = "SELECT id, mobile_number FROM customers WHERE RIGHT(REPLACE(REPLACE(mobile_number, '+', ''), ' ', ''), 10) = ?";
        $stmt = $conn->prepare($query);
        $stmt->bind_param("s", $last10Digits);
        $stmt->execute();
        $result = $stmt->get_result();
        
        if ($result->num_rows > 0) {
            // Generate new OTP
            $otp_code = sprintf("%06d", mt_rand(1, 999999));
            $otp_expires = date('Y-m-d H:i:s', strtotime('+5 minutes'));
            
            $customer = $result->fetch_assoc();
            $customerId = $customer['id'];
            
            // Update OTP in database
            $updateQuery = "UPDATE login_otp SET otp_code = ?, otp_expires = ? WHERE mobile_number = ?";
            $updateStmt = $conn->prepare($updateQuery);
            $updateStmt->bind_param("sss", $otp_code, $otp_expires, $formattedMobile);
            $updateStmt->execute();
            $updateStmt->close();
            
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
            
            if ($sms_sent) {
                $success = 'New OTP has been sent to your mobile number';
            } else {
                $error = 'Failed to send OTP. Please try again.';
            }
        }
        
        $stmt->close();
    }
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify OTP - <?php echo APP_NAME; ?></title>
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
                <h1 class="login-title-modern">Verify OTP</h1>
                <p class="login-subtitle-modern">Enter the verification code sent to your mobile</p>
            </div>
            
            <div class="login-body-modern">
                <!-- Display Messages -->
                <?php if (!empty($error)): ?>
                    <div class="login-alert login-alert-error">
                        <i class="fas fa-exclamation-circle"></i>
                        <?php echo htmlspecialchars($error); ?>
                    </div>
                <?php endif; ?>
                
                <?php if (!empty($success)): ?>
                    <div class="login-alert login-alert-success">
                        <i class="fas fa-check-circle"></i>
                        <?php echo htmlspecialchars($success); ?>
                    </div>
                <?php endif; ?>
                
                <!-- OTP Verification Form -->
                <form method="POST" action="" onsubmit="return validateOTPForm();">
                    <div class="login-form-group">
                        <label for="otp" class="login-form-label">OTP Code</label>
                        <input 
                            type="text" 
                            id="otp" 
                            name="otp" 
                            class="login-form-input otp-input hover-lift" 
                            placeholder="000000" 
                            maxlength="6"
                            pattern="[0-9]{6}"
                            autocomplete="one-time-code"
                            required
                        >
                        <p class="login-form-help">
                            Enter the 6-digit OTP sent to <?php echo htmlspecialchars($mobile); ?>
                        </p>
                    </div>
                    
                    <div class="login-form-group">
                        <button type="submit" name="otp_submit" class="login-btn-primary hover-lift">
                            Verify & Continue
                        </button>
                    </div>
                </form>
                
                <!-- Resend OTP Form (separate form to avoid validation) -->
                <form method="POST" action="" style="margin-top: 15px;">
                    <div class="login-form-group">
                        <button type="submit" name="resend_otp" class="login-btn-secondary hover-lift">
                            Resend OTP
                        </button>
                        
                        <a href="login.php" class="login-btn-secondary hover-lift">
                            Use Different Number
                        </a>
                    </div>
                </form>
            </div>
            
            <!-- Footer -->
            <div class="login-footer-modern">
                <p class="login-footer-text">
                    By continuing, you agree to our 
                    <a href="#" class="login-footer-link">Terms of Service</a> and 
                    <a href="#" class="login-footer-link">Privacy Policy</a>
                </p>
                <div class="login-security-badge">
                    <i class="fas fa-lock"></i>
                    <span>Secured with 256-bit SSL encryption</span>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        // Auto-focus on OTP input
        document.addEventListener('DOMContentLoaded', function() {
            const otpInput = document.getElementById('otp');
            if (otpInput) {
                otpInput.focus();
                
                // Format OTP input (numeric only)
                otpInput.addEventListener('input', function(e) {
                    // Remove non-numeric characters
                    this.value = this.value.replace(/[^0-9]/g, '');
                    
                    // Limit to 6 digits
                    if (this.value.length > 6) {
                        this.value = this.value.slice(0, 6);
                    }
                    
                    // Add visual feedback when 6 digits are entered
                    if (this.value.length === 6) {
                        this.classList.add('complete');
                    } else {
                        this.classList.remove('complete');
                    }
                });
            }
        });
        
        // Validation function
        function validateOTPForm() {
            const otp = document.getElementById('otp').value.trim();
            
            if (otp === '') {
                alert('Please enter the OTP code');
                return false;
            }
            
            if (otp.length !== 6) {
                alert('OTP must be 6 digits');
                return false;
            }
            
            if (!/^[0-9]{6}$/.test(otp)) {
                alert('OTP must contain only numbers');
                return false;
            }
            
            return true;
        }
    </script>
    
</body>
</html>