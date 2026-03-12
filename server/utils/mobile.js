/**
 * Philippine Mobile Number Helpers
 * Port of functions.php standardize_mobile_number() and get_last_10_digits()
 */

/**
 * Standardize mobile number to +639XXXXXXXXX format
 * @param {string} mobile - Raw mobile number
 * @returns {string} Standardized +63 number
 */
function standardizeMobile(mobile) {
  const digits = String(mobile).replace(/[^0-9]/g, '');

  // 63 prefix, 12 digits (e.g., 639171234567)
  if (digits.startsWith('63') && digits.length === 12) {
    return '+' + digits;
  }
  // 0 prefix, 11 digits (e.g., 09171234567)
  if (digits.startsWith('0') && digits.length === 11) {
    return '+63' + digits.slice(1);
  }
  // No prefix, 10 digits (e.g., 9171234567)
  if (digits.startsWith('9') && digits.length === 10) {
    return '+63' + digits;
  }
  // Return original if no pattern matches
  return mobile;
}

/**
 * Get last 10 digits of a mobile number for DB lookup
 * @param {string} mobile - Mobile number
 * @returns {string} Last 10 digits
 */
function getLast10(mobile) {
  const digits = String(mobile).replace(/[^0-9]/g, '');
  return digits.slice(-10);
}

/**
 * Validate Philippine mobile number format
 * Accepts: 09XX, +639XX, 639XX, 9XX patterns
 * @param {string} mobile - Mobile number
 * @returns {boolean}
 */
function isValidPhMobile(mobile) {
  return /^(\+63|63|0)?9\d{9}$/.test(String(mobile).replace(/\s/g, ''));
}

module.exports = { standardizeMobile, getLast10, isValidPhMobile };
