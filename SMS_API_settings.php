<?php

// Add the writeToLog function only if it doesn't exist
if (!function_exists('writeToLog')) {
    function writeToLog($message) {
        $logDirectory = __DIR__ . '/logfiles';
        
        // Create directory if it doesn't exist
        if (!file_exists($logDirectory)) {
            mkdir($logDirectory, 0755, true);
        }

        $dateString = date("M-d-Y");
        $logFilename = "{$dateString}-logfile_SMS_API.log";
        $logFile = $logDirectory . '/' . $logFilename;
        $timestamp = date("Y-m-d g:i:s A");
        $logMessage = "[$timestamp] $message\n";
        
        // Check if we can write to the log file
        if (is_writable($logDirectory)) {
            file_put_contents($logFile, $logMessage, FILE_APPEND | LOCK_EX);
        } else {
            error_log("Cannot write to SMS API log directory: $logDirectory");
        }
    }
}

// ── GSM 7-bit sanitizer for ITEXMO ──
// ITEXMO error 50 = "Message encoding format is invalid"
// Caused by: emojis, accented chars (ñ, ü, é, ±, etc.), smart quotes, dashes
if (!function_exists('stripNonGsmCharacters')) {
    function stripNonGsmCharacters($text) {
        // Step 1: Transliterate accented / special characters to closest ASCII
        $translitMap = [
            // Uppercase accented
            'À'=>'A','Á'=>'A','Â'=>'A','Ã'=>'A','Ä'=>'A','Å'=>'A',
            'Æ'=>'AE','Ç'=>'C','È'=>'E','É'=>'E','Ê'=>'E','Ë'=>'E',
            'Ì'=>'I','Í'=>'I','Î'=>'I','Ï'=>'I','Ð'=>'D','Ñ'=>'N',
            'Ò'=>'O','Ó'=>'O','Ô'=>'O','Õ'=>'O','Ö'=>'O','Ø'=>'O',
            'Ù'=>'U','Ú'=>'U','Û'=>'U','Ü'=>'U','Ý'=>'Y','Þ'=>'TH',
            'ß'=>'ss',
            // Lowercase accented
            'à'=>'a','á'=>'a','â'=>'a','ã'=>'a','ä'=>'a','å'=>'a',
            'æ'=>'ae','ç'=>'c','è'=>'e','é'=>'e','ê'=>'e','ë'=>'e',
            'ì'=>'i','í'=>'i','î'=>'i','ï'=>'i','ð'=>'d','ñ'=>'n',
            'ò'=>'o','ó'=>'o','ô'=>'o','õ'=>'o','ö'=>'o','ø'=>'o',
            'ù'=>'u','ú'=>'u','û'=>'u','ü'=>'u','ý'=>'y','þ'=>'th','ÿ'=>'y',
            // Common extended Latin (Spanish, Filipino names)
            'Ā'=>'A','ā'=>'a','Ē'=>'E','ē'=>'e','Ī'=>'I','ī'=>'i',
            'Ō'=>'O','ō'=>'o','Ū'=>'U','ū'=>'u',
            'Ń'=>'N','ń'=>'n','Ň'=>'N','ň'=>'n',
            'Ś'=>'S','ś'=>'s','Š'=>'S','š'=>'s',
            'Ž'=>'Z','ž'=>'z','Ź'=>'Z','ź'=>'z',
            'Ć'=>'C','ć'=>'c','Č'=>'C','č'=>'c',
            'Ľ'=>'L','ľ'=>'l','Ł'=>'L','ł'=>'l',
            'Ř'=>'R','ř'=>'r',
            // Punctuation / typography
            "\u{2018}"=>"'", "\u{2019}"=>"'",   // smart single quotes
            "\u{201C}"=>'"', "\u{201D}"=>'"',    // smart double quotes
            "\u{2013}"=>'-', "\u{2014}"=>'-',    // en-dash, em-dash
            "\u{2026}"=>'...', "\u{00A0}"=>' ',  // ellipsis, no-break space
            "\u{2022}"=>'-',                     // bullet
            // Special symbols that have near-equivalents
            '±'=>'+/-','×'=>'x','÷'=>'/',
            '©'=>'(c)','®'=>'(R)','™'=>'(TM)',
            '°'=>' degrees','µ'=>'u',
            '½'=>'1/2','¼'=>'1/4','¾'=>'3/4',
            '¡'=>'!','¿'=>'?',
            '«'=>'"','»'=>'"',
            '•'=>'-','…'=>'...',
            "\u{2030}"=>'0/00',    // per mille
            "\u{20B1}"=>'PHP ',    // peso sign
        ];
        $text = strtr($text, $translitMap);

        // Step 2: Remove all 4-byte UTF-8 characters (emojis, symbols outside BMP)
        $text = preg_replace('/[\x{10000}-\x{10FFFF}]/u', '', $text);

        // Step 3: Strip anything that is NOT in the GSM 7-bit basic character set
        // GSM 7-bit: space, !"#$%&'()*+,-./0-9:;<=>?@A-Z[\]^_`a-z{|}~
        // Also allow newline (\n) and carriage return (\r)
        $text = preg_replace('/[^\x20-\x7E\n\r]/u', '', $text);

        // Step 4: Clean up multiple spaces
        $text = preg_replace('/  +/', ' ', $text);

        return trim($text);
    }
}

// START ITEXMO API PROVIDER
$baseURL = "https://api.itexmo.com/api/broadcast";

function sendSms($baseURL, $senderID, $number, $message, $customerID = null) {

  // Trim, ensure correct encoding, and strip non-GSM characters
  $message = trim($message);
  $message = mb_convert_encoding($message, 'UTF-8', 'UTF-8');
  $message = stripNonGsmCharacters($message);
  
  // Determine if this is an OTP message and use appropriate endpoint
  $isOtpMessage = (stripos($message, 'OTP') !== false || stripos($message, 'code') !== false);
  $apiUrl = $isOtpMessage ? "https://api.itexmo.com/api/broadcast-otp" : $baseURL;
  
  writeToLog("ITEXMO API: Using " . ($isOtpMessage ? 'OTP' : 'regular') . " endpoint: $apiUrl for number $number");

  $data = [
    "Email" => "ryan@maskpro.ph",
    "Password" => "Godisgood21!",
    "Recipients" => [$number],
    "Message" => $message,
    "ApiCode" => "PR-RYANP221047_30CYC",
    "SenderId" => $senderID
  ];

  $ch = curl_init();
  curl_setopt($ch, CURLOPT_URL, $apiUrl);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_POST, true);
  curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
  curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
  $response = curl_exec($ch);
  $httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  if (!$response) {
    writeToLog("ITEXMO API Error: No response received for number $number");
    return false;
  }

  $responseData = json_decode($response, true);
  
  if ($httpcode == 200 && isset($responseData['Result']) && $responseData['Result'] == 'OK') {
    writeToLog("ITEXMO SMS sent successfully to $number. Response: " . $response);
    return true;
  } else {
    writeToLog("ITEXMO SMS failed for $number. HTTP Code: $httpcode, Response: " . $response);
    return false;
  }
}

// START SMS-it API PROVIDER for retry SMS 
function retrySms($number, $message, $customerID = null) { 
  // Append the notice to the original message with two newline characters for spacing 
  // $message .= "\n\nNotice: Please refrain from replying or calling this mobile number. Our official SMS Sender ID 'MaskPro' network provider is facing a temporary disruption. Thank you for your understanding."; 
  $message .= "\n\nPlease note: DO NOT REPLY OR CALL HERE. This mobile number is used for automated notifications temporarily. Our official SMS Sender 'MaskPro' & 'MASKPROCare' is experiencing a brief network service interruption. We appreciate your patience and understanding."; 

  // Preprocess and format the $number 
  if (strlen($number) == 11 && strpos($number, '0') === 0) { 
      // Remove the initial '0' and prepend '63' 
      $number = '63' . substr($number, 1); 
  } elseif (strlen($number) == 10) { 
      // Directly prepend '63' if the number is 10 digits (assuming no leading 0 is given) 
      $number = '63' . $number; 
  } 

  $apikey = "SMSIT_eedd3ff7f99d05260861705be7650a4b439feae08f8e06bf818ea478179af4fa"; 
  $fromNumber = "639511047777"; // Your service number (sender) 
  $encodedMessage = urlencode($message); // Ensure the entire message, including the appended notice, is URL encoded 

  $url = "https://aicpanel.smsit.ai/api/v2/smscontact?apikey={$apikey}&from={$fromNumber}&to={$number}&message={$encodedMessage}"; 

  $curl = curl_init(); 
  curl_setopt_array($curl, [ 
      CURLOPT_URL => $url, 
      CURLOPT_RETURNTRANSFER => true, 
      CURLOPT_ENCODING => "", 
      CURLOPT_MAXREDIRS => 10, 
      CURLOPT_TIMEOUT => 30, 
      CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1, 
      CURLOPT_CUSTOMREQUEST => "POST", 
      CURLOPT_POSTFIELDS => "", // Even though you're specifying post fields, you're not sending a body, hence an empty string is used. 
      CURLOPT_HTTPHEADER => ["Content-Type: application/json"], 
  ]); 

  $response = curl_exec($curl); 
  $err = curl_error($curl); 
  $httpcode = curl_getinfo($curl, CURLINFO_HTTP_CODE); 

  curl_close($curl); 

  if ($err) { 
      writeToLog("retrySms - cURL Error for number $number: " . $err); 
      return ['status' => 'Failed', 'error' => $err]; 
  } else { 
      $responseData = json_decode($response, true); 
      if ($httpcode == 200 && isset($responseData) && $responseData['success'] === true) { 
          // Extract and log key details 
          $logDetails = [ 
              'Message' => $responseData['msg'] ?? 'N/A', 
              'MessageStatus' => $responseData['json_arr']['message'] ?? 'N/A', 
              'ContactID' => $responseData['json_arr']['contact']['id'] ?? 'N/A', 
              'LogID' => $responseData['json_arr']['log_id'] ?? 'N/A', 
          ]; 
          writeToLog("SMS-it - SMS successfully sent to: $number. Important Details: " . json_encode($logDetails)); // Log success with selected details 
          return ['status' => 'Sent', 'error' => '']; 
      } else { 
          $errorMsg = isset($responseData['json_arr']['message']) ? $responseData['json_arr']['message'] : "Unknown error"; 
          writeToLog("retrySms - Failed to send to customer ID: $customerID with mobile #: $number. SMS-it Error: " . $errorMsg); 
          return ['status' => 'Failed', 'error' => $errorMsg]; 
      } 
  } 
}

?>