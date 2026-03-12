/**
 * SMS Service — iTexMo (Primary) + SMS-it (Fallback)
 * 
 * Port of SMS_API_settings.php to Node.js.
 * Uses axios for HTTP requests instead of cURL.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- GSM 7-bit Character Sanitizer ---
// iTexMo error 50 = "Message encoding format is invalid"
// Must strip emojis, accented chars, smart quotes, etc.
const TRANSLIT_MAP = {
  'À':'A','Á':'A','Â':'A','Ã':'A','Ä':'A','Å':'A',
  'Æ':'AE','Ç':'C','È':'E','É':'E','Ê':'E','Ë':'E',
  'Ì':'I','Í':'I','Î':'I','Ï':'I','Ð':'D','Ñ':'N',
  'Ò':'O','Ó':'O','Ô':'O','Õ':'O','Ö':'O','Ø':'O',
  'Ù':'U','Ú':'U','Û':'U','Ü':'U','Ý':'Y','Þ':'TH','ß':'ss',
  'à':'a','á':'a','â':'a','ã':'a','ä':'a','å':'a',
  'æ':'ae','ç':'c','è':'e','é':'e','ê':'e','ë':'e',
  'ì':'i','í':'i','î':'i','ï':'i','ð':'d','ñ':'n',
  'ò':'o','ó':'o','ô':'o','õ':'o','ö':'o','ø':'o',
  'ù':'u','ú':'u','û':'u','ü':'u','ý':'y','þ':'th','ÿ':'y',
  '\u2018':"'", '\u2019':"'", '\u201C':'"', '\u201D':'"',
  '\u2013':'-', '\u2014':'-', '\u2026':'...', '\u00A0':' ',
  '\u2022':'-', '±':'+/-', '×':'x', '÷':'/',
  '©':'(c)', '®':'(R)', '™':'(TM)', '°':' degrees',
  '½':'1/2', '¼':'1/4', '¾':'3/4',
  '¡':'!', '¿':'?', '«':'"', '»':'"',
  '\u20B1':'PHP '
};

function stripNonGsmCharacters(text) {
  // Transliterate accented characters
  for (const [from, to] of Object.entries(TRANSLIT_MAP)) {
    text = text.split(from).join(to);
  }
  // Remove 4-byte UTF-8 (emojis)
  text = text.replace(/[\u{10000}-\u{10FFFF}]/gu, '');
  // Strip non-GSM 7-bit characters
  text = text.replace(/[^\x20-\x7E\n\r]/g, '');
  // Clean multiple spaces
  text = text.replace(/  +/g, ' ');
  return text.trim();
}

// --- Logging ---
function writeToLog(message) {
  try {
    const logDir = path.join(__dirname, '..', '..', 'logfiles-new');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).replace(/ /g, '-').replace(',', '');
    const timestamp = now.toLocaleString('en-US', { timeZone: 'Asia/Manila' });
    const logFile = path.join(logDir, `${dateStr}-logfile_SMS_API.log`);
    fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
  } catch (err) {
    console.error('SMS log error:', err.message);
  }
}

// --- Format PH number to 63XXXXXXXXXX ---
function formatPhoneForSms(number) {
  number = String(number).replace(/[^0-9]/g, '');
  if (number.length === 11 && number.startsWith('0')) {
    return '63' + number.slice(1);
  } else if (number.length === 10 && number.startsWith('9')) {
    return '63' + number;
  } else if (number.length === 12 && number.startsWith('63')) {
    return number;
  }
  return number;
}

/**
 * Send SMS via iTexMo (Primary Provider)
 * @param {string} number - Mobile number
 * @param {string} message - SMS body
 * @param {number|null} customerId - For logging
 * @returns {{ status: string, error: string }}
 */
async function sendSms(number, message, customerId = null) {
  const formattedNumber = formatPhoneForSms(number);
  const cleanMessage = stripNonGsmCharacters(message.trim());

  const data = {
    Email: process.env.ITEXMO_EMAIL || 'ryan@maskpro.ph',
    Password: process.env.ITEXMO_PASSWORD || 'Godisgood21!',
    Recipients: [formattedNumber],
    Message: cleanMessage,
    ApiCode: process.env.ITEXMO_API_CODE || 'PR-RYANP221047_30CYC',
    SenderId: process.env.ITEXMO_SENDER_ID || 'MASKPRO'
  };

  try {
    const response = await axios.post(
      process.env.ITEXMO_URL || 'https://api.itexmo.com/api/broadcast',
      data,
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );

    const result = response.data;
    if (result && result.Error === false && result.Failed === 0) {
      writeToLog(`ITEXMO - SMS successfully sent to: ${formattedNumber}. Response: ${JSON.stringify(result)}`);
      return { status: 'Sent', error: '' };
    }

    const apiError = typeof result.Message === 'object' ? JSON.stringify(result.Message) : (result.Message || 'Unknown error');
    writeToLog(`ITEXMO - Cannot send to customer ID: ${customerId} with mobile #: ${formattedNumber}. API Error: ${apiError}`);
    return { status: 'Failed', error: apiError };
  } catch (err) {
    const error = `ITEXMO - Cannot send to customer ID: ${customerId} with mobile #: ${formattedNumber}. ${err.message}`;
    writeToLog(error);
    return { status: 'Failed', error };
  }
}

/**
 * Send SMS via SMS-it (Fallback Provider)
 * @param {string} number - Mobile number
 * @param {string} message - SMS body
 * @param {number|null} customerId - For logging
 * @param {boolean} appendDisclaimer - Whether to append fallback notice
 * @returns {{ status: string, error: string }}
 */
async function retrySms(number, message, customerId = null, appendDisclaimer = true) {
  if (appendDisclaimer) {
    message += "\n\nPlease note: DO NOT REPLY OR CALL HERE. This mobile number is used for automated notifications temporarily. Our official SMS Sender 'MaskPro' & 'MASKPROCare' is experiencing a brief network service interruption. We appreciate your patience and understanding.";
  }

  const formattedNumber = formatPhoneForSms(number);
  const encodedMessage = encodeURIComponent(message);
  const apiKey = process.env.SMSIT_API_KEY || 'SMSIT_eedd3ff7f99d05260861705be7650a4b439feae08f8e06bf818ea478179af4fa';
  const fromNumber = process.env.SMSIT_FROM_NUMBER || '639511047777';

  const url = `${process.env.SMSIT_URL || 'https://aicpanel.smsit.ai/api/v2/smscontact'}?apikey=${apiKey}&from=${fromNumber}&to=${formattedNumber}&message=${encodedMessage}`;

  try {
    const response = await axios.post(url, '', {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    const result = response.data;
    if (response.status === 200 && result && result.success === true) {
      const logDetails = {
        Message: result.msg || 'N/A',
        MessageStatus: result.json_arr?.message || 'N/A',
        ContactID: result.json_arr?.contact?.id || 'N/A',
        LogID: result.json_arr?.log_id || 'N/A'
      };
      writeToLog(`SMS-it - SMS successfully sent to: ${formattedNumber}. Important Details: ${JSON.stringify(logDetails)}`);
      return { status: 'Sent', error: '' };
    }

    const errorMsg = result?.json_arr?.message
      ? (typeof result.json_arr.message === 'object' ? JSON.stringify(result.json_arr.message) : result.json_arr.message)
      : 'Unknown error';
    writeToLog(`retrySms - Failed to send to customer ID: ${customerId} with mobile #: ${formattedNumber}. SMS-it Error: ${errorMsg}`);
    return { status: 'Failed', error: errorMsg };
  } catch (err) {
    writeToLog(`retrySms - cURL Error for number ${formattedNumber}: ${err.message}`);
    return { status: 'Failed', error: err.message };
  }
}

/**
 * Send OTP SMS — tries iTexMo first, falls back to SMS-it
 * @param {string} mobile - Customer mobile number
 * @param {string} otp - 6-digit OTP code
 * @param {number} expiryMinutes - OTP validity
 * @param {number|null} customerId - For logging
 * @returns {boolean} Whether SMS was delivered
 */
async function sendOtpSms(mobile, otp, expiryMinutes = 5, customerId = null) {
  const message = `Your MaskPro Care OTP is: ${otp}. Valid for ${expiryMinutes} minutes. Do not share this code.`;

  const primary = await sendSms(mobile, message, customerId);
  if (primary.status === 'Sent') return true;

  // Fallback
  writeToLog(`Primary SMS failed for ${mobile}, trying fallback SMS-it`);
  const fallback = await retrySms(mobile, message, customerId, false);
  return fallback.status === 'Sent';
}

module.exports = { sendSms, retrySms, sendOtpSms, stripNonGsmCharacters, writeToLog };
