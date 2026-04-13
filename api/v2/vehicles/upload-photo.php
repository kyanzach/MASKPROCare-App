<?php
/**
 * POST /api/v2/vehicles/upload-photo
 * 
 * Upload a vehicle photo. Accepts JPEG, PNG, WebP, HEIC.
 * Auto-converts to WebP for optimal file size.
 * Compresses to max ~200KB.
 * 
 * Request: multipart/form-data with:
 *   - photo: file (image)
 *   - vehicle_id: int
 * 
 * Response: { success: true, data: { photo_url: "..." } }
 */

require_once __DIR__ . '/../middleware/auth.php';
require_method('POST');

// Validate vehicle_id
$vehicleId = (int) ($_POST['vehicle_id'] ?? 0);
if ($vehicleId <= 0) {
    api_error('Vehicle ID is required', 422);
}

// Verify ownership
$stmt = $conn->prepare("SELECT id, photo FROM vehicles WHERE id = ? AND customer_id = ?");
$stmt->bind_param("ii", $vehicleId, $authCustomerId);
$stmt->execute();
$result = $stmt->get_result();
if ($result->num_rows === 0) {
    $stmt->close();
    api_error('Vehicle not found', 404);
}
$existingVehicle = $result->fetch_assoc();
$stmt->close();

// Validate file upload
if (!isset($_FILES['photo']) || $_FILES['photo']['error'] !== UPLOAD_ERR_OK) {
    $errorMsg = 'No file uploaded';
    if (isset($_FILES['photo'])) {
        switch ($_FILES['photo']['error']) {
            case UPLOAD_ERR_INI_SIZE:
            case UPLOAD_ERR_FORM_SIZE:
                $errorMsg = 'File is too large. Maximum size is 10MB.';
                break;
            case UPLOAD_ERR_NO_FILE:
                $errorMsg = 'No file was selected';
                break;
            default:
                $errorMsg = 'Upload error occurred';
        }
    }
    api_error($errorMsg, 422);
}

$file = $_FILES['photo'];
$maxSize = 10 * 1024 * 1024; // 10MB max upload
if ($file['size'] > $maxSize) {
    api_error('File is too large. Maximum size is 10MB.', 422);
}

// Validate MIME type
$allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$actualMime = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

if (!in_array($actualMime, $allowedMimes)) {
    api_error('Invalid file type. Allowed: JPEG, PNG, WebP, HEIC.', 422);
}

// Upload directory
$uploadDir = realpath(__DIR__ . '/../../../uploads/vehicles');
if (!$uploadDir) {
    // Create if doesn't exist
    $uploadDir = __DIR__ . '/../../../uploads/vehicles';
    if (!mkdir($uploadDir, 0755, true)) {
        api_error('Failed to create upload directory', 500);
    }
    $uploadDir = realpath($uploadDir);
}

// Generate unique filename
$filename = 'vehicle_' . $vehicleId . '_' . time() . '.webp';
$outputPath = $uploadDir . '/' . $filename;

try {
    // Load the source image
    $sourceImage = null;
    
    switch ($actualMime) {
        case 'image/jpeg':
            $sourceImage = imagecreatefromjpeg($file['tmp_name']);
            break;
        case 'image/png':
            $sourceImage = imagecreatefrompng($file['tmp_name']);
            break;
        case 'image/webp':
            $sourceImage = imagecreatefromwebp($file['tmp_name']);
            break;
        case 'image/heic':
        case 'image/heif':
            // HEIC requires ImageMagick — try convert command
            $tmpJpeg = tempnam(sys_get_temp_dir(), 'heic_') . '.jpg';
            $cmd = "convert " . escapeshellarg($file['tmp_name']) . " " . escapeshellarg($tmpJpeg) . " 2>&1";
            exec($cmd, $output, $returnCode);
            if ($returnCode === 0 && file_exists($tmpJpeg)) {
                $sourceImage = imagecreatefromjpeg($tmpJpeg);
                unlink($tmpJpeg);
            } else {
                api_error('HEIC conversion not supported on this server. Please upload JPEG, PNG, or WebP.', 422);
            }
            break;
    }
    
    if (!$sourceImage) {
        api_error('Failed to process image', 500);
    }

    // Get original dimensions
    $origWidth = imagesx($sourceImage);
    $origHeight = imagesy($sourceImage);
    
    // Resize if too large (max 1200px on longest side for vehicle photos)
    $maxDim = 1200;
    if ($origWidth > $maxDim || $origHeight > $maxDim) {
        if ($origWidth > $origHeight) {
            $newWidth = $maxDim;
            $newHeight = (int) round($origHeight * ($maxDim / $origWidth));
        } else {
            $newHeight = $maxDim;
            $newWidth = (int) round($origWidth * ($maxDim / $origHeight));
        }
        
        $resized = imagecreatetruecolor($newWidth, $newHeight);
        // Preserve transparency
        imagealphablending($resized, false);
        imagesavealpha($resized, true);
        imagecopyresampled($resized, $sourceImage, 0, 0, 0, 0, $newWidth, $newHeight, $origWidth, $origHeight);
        imagedestroy($sourceImage);
        $sourceImage = $resized;
    }
    
    // Convert to WebP with quality optimization
    // Start at quality 80, reduce if file is too large
    $quality = 80;
    imagewebp($sourceImage, $outputPath, $quality);
    
    // If still too large (>200KB), reduce quality
    $maxFileSize = 200 * 1024; // 200KB target
    while (filesize($outputPath) > $maxFileSize && $quality > 30) {
        $quality -= 10;
        imagewebp($sourceImage, $outputPath, $quality);
    }
    
    imagedestroy($sourceImage);
    
    // Delete old photo if exists
    if (!empty($existingVehicle['photo'])) {
        $oldPath = $uploadDir . '/' . basename($existingVehicle['photo']);
        if (file_exists($oldPath)) {
            unlink($oldPath);
        }
    }
    
    // Update database with relative path
    $relativePath = 'uploads/vehicles/' . $filename;
    $stmt = $conn->prepare("UPDATE vehicles SET photo = ? WHERE id = ? AND customer_id = ?");
    $stmt->bind_param("sii", $relativePath, $vehicleId, $authCustomerId);
    $stmt->execute();
    $stmt->close();
    
    // Build full URL for response
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $baseUrl = $protocol . '://' . $_SERVER['HTTP_HOST'];
    // Detect app base path
    $scriptDir = dirname(dirname(dirname(dirname($_SERVER['SCRIPT_NAME']))));
    $photoUrl = $baseUrl . rtrim($scriptDir, '/') . '/' . $relativePath;
    
    api_success([
        'photo_url' => $photoUrl,
        'photo_path' => $relativePath,
        'file_size' => filesize($outputPath),
        'quality' => $quality,
    ], 'Vehicle photo uploaded successfully');
    
} catch (Exception $e) {
    error_log("Vehicle photo upload error: " . $e->getMessage());
    api_error('Failed to process image. Please try again.', 500);
}
