/**
 * Automated LTO Registration Renewal Reminder Scheduler
 *
 * Checks all vehicles with a `registration_date` daily.
 * Philippine LTO rule:
 *   - First 3 years from initial registration date are covered.
 *   - Annual renewal on the same month/day every year thereafter.
 *
 * Milestones notified (once per vehicle per renewal year + milestone):
 *   - '30d' : 28 to 30 days before renewal date
 *   - '7d'  : 5 to 7 days before renewal date
 *
 * Delivers both:
 *   1. Automated SMS (via iTexMo primary + SMS-it fallback)
 *   2. In-app / Mobile Push Notification (`customer_notifications`)
 */

const pool = require('../db/connection');
const { sendSms, retrySms, writeToLog } = require('./sms');

async function ensureReminderLogTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehicle_lto_reminder_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vehicle_id INT NOT NULL,
      customer_id INT NOT NULL,
      renewal_date DATE NOT NULL,
      milestone VARCHAR(16) NOT NULL,
      sms_status VARCHAR(32) DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_vehicle_renewal_milestone (vehicle_id, renewal_date, milestone),
      INDEX idx_customer (customer_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

function computeNextLtoRenewal(registrationDateStr) {
  if (!registrationDateStr) return null;
  const cleanStr = typeof registrationDateStr === 'string'
    ? registrationDateStr.slice(0, 10)
    : new Date(registrationDateStr).toISOString().slice(0, 10);

  const regDate = new Date(`${cleanStr}T00:00:00+08:00`);
  if (isNaN(regDate.getTime())) return null;

  const now = new Date();
  const firstRenewal = new Date(regDate);
  firstRenewal.setFullYear(firstRenewal.getFullYear() + 3);

  if (now < firstRenewal) {
    return firstRenewal;
  }

  const yearsPastFirst = Math.floor((now.getTime() - firstRenewal.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  const nextRenewal = new Date(firstRenewal);
  nextRenewal.setFullYear(nextRenewal.getFullYear() + yearsPastFirst + 1);
  return nextRenewal;
}

function toManilaYMD(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function deliverLtoSms(mobile, message, customerId) {
  if (!mobile) return 'NoMobile';
  const primary = await sendSms(mobile, message, customerId);
  if (primary.status === 'Sent') return 'Sent (iTexMo)';
  const fallback = await retrySms(mobile, message, customerId, false);
  return fallback.status === 'Sent' ? 'Sent (SMS-it)' : 'Failed';
}

async function runLtoRenewalCheck() {
  try {
    await ensureReminderLogTable();

    const [rows] = await pool.query(`
      SELECT
        v.id AS vehicle_id,
        v.customer_id,
        v.make,
        v.model,
        v.plate_no,
        DATE_FORMAT(v.registration_date, '%Y-%m-%d') AS reg_date,
        c.full_name,
        c.mobile_number
      FROM vehicles v
      INNER JOIN customers c ON c.id = v.customer_id
      WHERE v.registration_date IS NOT NULL
        AND v.registration_date != ''
    `);

    const now = new Date();

    for (const row of rows) {
      const nextRenewal = computeNextLtoRenewal(row.reg_date);
      if (!nextRenewal) continue;

      const diffDays = Math.ceil((nextRenewal.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      let milestone = null;
      if (diffDays >= 28 && diffDays <= 30) {
        milestone = '30d';
      } else if (diffDays >= 5 && diffDays <= 7) {
        milestone = '7d';
      }

      if (!milestone) continue;

      const renewalYMD = toManilaYMD(nextRenewal);

      // Check if already sent for this vehicle + renewal_date + milestone
      const [existing] = await pool.query(
        'SELECT id FROM vehicle_lto_reminder_logs WHERE vehicle_id = ? AND renewal_date = ? AND milestone = ? LIMIT 1',
        [row.vehicle_id, renewalYMD, milestone]
      );
      if (existing.length > 0) continue;

      const firstName = (row.full_name || 'Valued Client').trim().split(/\s+/)[0];
      const vehicleName = `${row.make || ''} ${row.model || ''}`.trim() || 'vehicle';
      const plateLabel = row.plate_no ? ` (${row.plate_no})` : '';
      const formattedDue = nextRenewal.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      const smsBody = milestone === '30d'
        ? `Hi ${firstName}, friendly reminder from MaskPro Care: Your LTO registration renewal for your ${vehicleName}${plateLabel} is due in ${diffDays} days (${formattedDue}). We've got your back! - MaskPro Care`
        : `Hi ${firstName}, heads up from MaskPro Care: Your LTO registration renewal for your ${vehicleName}${plateLabel} is due in ${diffDays} days on ${formattedDue}. Drive safe! - MaskPro Care`;

      const notifTitle = milestone === '30d'
        ? `LTO Renewal Due in ${diffDays} Days`
        : `LTO Renewal Due Next Week (${diffDays}d left)`;

      const notifMessage = `Your ${vehicleName}${plateLabel} LTO registration renewal is due on ${formattedDue}.`;

      const smsStatus = await deliverLtoSms(row.mobile_number, smsBody, row.customer_id);

      // Insert in-app notification
      await pool.query(
        `INSERT INTO customer_notifications (customer_id, type, title, message, is_read, link, created_at)
         VALUES (?, 'vehicle', ?, ?, 0, ?, NOW())`,
        [row.customer_id, notifTitle, notifMessage, `/vehicles?vehicle_id=${row.vehicle_id}`]
      );

      // Record in dedup log
      await pool.query(
        `INSERT IGNORE INTO vehicle_lto_reminder_logs (vehicle_id, customer_id, renewal_date, milestone, sms_status, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [row.vehicle_id, row.customer_id, renewalYMD, milestone, smsStatus]
      );

      writeToLog(`LTO_REMINDER (${milestone}) - Vehicle #${row.vehicle_id} (${vehicleName}${plateLabel}) for Customer #${row.customer_id}: SMS=${smsStatus}`);
    }
  } catch (err) {
    console.error('[LTO Reminder Cron] Error:', err.message);
  }
}

function startLtoReminderScheduler() {
  // Run once 30 seconds after server start (only during 8 AM – 8 PM Manila time)
  setTimeout(() => {
    const manilaHour = parseInt(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', hour12: false }),
      10
    );
    if (manilaHour >= 8 && manilaHour <= 20) {
      runLtoRenewalCheck();
    }
  }, 30 * 1000);

  // Check every 6 hours (runs daily during daytime hours; deduplicated by vehicle_lto_reminder_logs)
  setInterval(() => {
    const manilaHour = parseInt(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', hour12: false }),
      10
    );
    if (manilaHour >= 8 && manilaHour <= 20) {
      runLtoRenewalCheck();
    }
  }, 6 * 60 * 60 * 1000);
}

module.exports = { startLtoReminderScheduler, runLtoRenewalCheck };
