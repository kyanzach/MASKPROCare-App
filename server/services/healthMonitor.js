/**
 * MaskPro Care — Production Health Monitor, Instant 500 Alerting & Daily 6:55 AM Pre-Batch Canary
 *
 * Features:
 * 1. Express middleware (`monitorApiErrorsMiddleware`) that intercepts ANY HTTP 500+ response on /api/*,
 *    logs it into `care_api_error_logs`, and fires throttled Email + SMS alerts (max 1 per 30m per path).
 * 2. Daily 6:55 AM PHT Pre-Batch Canary (`runPreBatchCanary` / `startPreBatchCanaryScheduler`)
 *    running 5 minutes before the 7:00 AM SMS reminder batch:
 *      - Creates a disposable test magic link for verified admin (#1924)
 *      - Calls live POST /api/auth/magic-verify + GET /api/profile/get
 *      - Verifies HTTP 200 + success: true on both, then deletes all disposable probe rows
 *      - Silent on PASS; immediate Email + SMS alert on FAIL
 */

const crypto = require('crypto');
const axios = require('axios');
const nodemailer = require('nodemailer');
const pool = require('../db/connection');
const { sendSms, retrySms } = require('./sms');
const { getTrustedClientIp } = require('../utils/security');

const DEFAULT_ALERT_EMAILS = ['i.ryanpaco@gmail.com', 'ryan@maskpro.ph'];
const DEFAULT_ALERT_SMS = '09852779777';
const ALERT_THROTTLE_MS = 30 * 60 * 1000; // 30 minutes per error path
const CANARY_CUSTOMER_ID = 1924; // Verified admin test account (Ryan Paco)

const alertThrottleMap = new Map();
let tablesEnsured = false;
let mailTransporter = null;

function getAlertEmails() {
  const raw = process.env.ALERT_EMAILS || DEFAULT_ALERT_EMAILS.join(',');
  return raw.split(',').map((e) => e.trim()).filter(Boolean);
}

function getAlertSmsNumber() {
  return String(process.env.ALERT_SMS_MOBILE || DEFAULT_ALERT_SMS).trim();
}

function getMailTransporter() {
  if (mailTransporter) return mailTransporter;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    return null;
  }
  mailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
  return mailTransporter;
}

async function ensureMonitorTables() {
  if (tablesEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS care_api_error_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      method VARCHAR(10) NOT NULL,
      path VARCHAR(255) NOT NULL,
      status_code SMALLINT NOT NULL,
      error_code VARCHAR(80) DEFAULT NULL,
      error_message TEXT DEFAULT NULL,
      customer_id INT DEFAULT NULL,
      ip_address VARCHAR(64) DEFAULT NULL,
      alert_sent TINYINT(1) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_created_at (created_at),
      INDEX idx_status_created (status_code, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS care_canary_runs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      trigger_type VARCHAR(32) NOT NULL DEFAULT 'scheduled_655am',
      status VARCHAR(16) NOT NULL,
      magic_verify_ms INT DEFAULT NULL,
      profile_get_ms INT DEFAULT NULL,
      detail TEXT DEFAULT NULL,
      alert_sent TINYINT(1) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  tablesEnsured = true;
}

function formatManilaNow() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }) + ' PHT';
}

function getManilaClock() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    ymd: `${map.year}-${map.month}-${map.day}`,
    hour: parseInt(map.hour, 10),
    minute: parseInt(map.minute, 10),
  };
}

/**
 * Send alert to BOTH Email (i.ryanpaco@gmail.com, ryan@maskpro.ph) and SMS (09852779777).
 */
async function dispatchAdminAlert({ subject, smsText, htmlBody, textBody }) {
  const results = { emailSent: false, smsSent: false, errors: [] };

  // 1. Email alert
  const transporter = getMailTransporter();
  const recipients = getAlertEmails();
  if (transporter && recipients.length > 0) {
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || `"MASKPROCare Monitor" <${process.env.SMTP_USER}>`,
        to: recipients.join(', '),
        subject,
        text: textBody,
        html: htmlBody,
      });
      results.emailSent = true;
    } catch (err) {
      results.errors.push(`Email failed: ${err.message}`);
      console.error('[HealthMonitor] Email alert failed:', err.message);
    }
  } else {
    results.errors.push('SMTP not configured');
  }

  // 2. SMS alert (iTexMo primary + SMS-it fallback)
  const smsMobile = getAlertSmsNumber();
  if (smsMobile) {
    try {
      let res = await sendSms(smsMobile, smsText, CANARY_CUSTOMER_ID);
      if (res.status !== 'Sent') {
        res = await retrySms(smsMobile, smsText, CANARY_CUSTOMER_ID, false);
      }
      results.smsSent = res.status === 'Sent';
      if (!results.smsSent) results.errors.push(`SMS failed: ${res.error}`);
    } catch (err) {
      results.errors.push(`SMS error: ${err.message}`);
      console.error('[HealthMonitor] SMS alert failed:', err.message);
    }
  }

  return results;
}

/**
 * Express middleware — captures ANY HTTP 500+ response across all /api/* routes.
 */
function monitorApiErrorsMiddleware(req, res, next) {
  if (!req.originalUrl || !req.originalUrl.startsWith('/api')) {
    return next();
  }

  let capturedBody = null;
  const origJson = res.json.bind(res);
  res.json = (body) => {
    capturedBody = body;
    return origJson(body);
  };

  res.on('finish', () => {
    if (res.statusCode < 500) return;

    const cleanPath = String(req.originalUrl || req.url || '').split('?')[0].slice(0, 255);
    const method = String(req.method || 'GET').slice(0, 10);
    const errCode = capturedBody?.code ? String(capturedBody.code).slice(0, 80) : `HTTP_${res.statusCode}`;
    const errMsg = capturedBody?.message
      ? String(capturedBody.message).slice(0, 500)
      : `Server returned HTTP ${res.statusCode}`;
    const customerId = req.user?.customer_id || null;
    const clientIp = getTrustedClientIp(req);

    // Non-blocking DB log + throttled alert
    (async () => {
      try {
        await ensureMonitorTables();

        const throttleKey = `${method}:${cleanPath}`;
        const now = Date.now();
        const lastAlertAt = alertThrottleMap.get(throttleKey) || 0;
        const shouldAlert = (now - lastAlertAt) >= ALERT_THROTTLE_MS;

        let alertSentFlag = 0;
        if (shouldAlert) {
          alertThrottleMap.set(throttleKey, now);
          const timestamp = formatManilaNow();
          const smsText = `MASKPROCare ALERT: HTTP ${res.statusCode} on ${method} ${cleanPath} (${errMsg}). Check Admin Health Pill or PM2 logs immediately. - ${timestamp}`;
          const textBody = [
            `MASKPROCare API Error Alert`,
            ``,
            `Time: ${timestamp}`,
            `Endpoint: ${method} ${cleanPath}`,
            `Status: HTTP ${res.statusCode} (${errCode})`,
            `Message: ${errMsg}`,
            `Customer ID: ${customerId || 'Unauthenticated'}`,
            `Client IP: ${clientIp || 'Unknown'}`,
            ``,
            `Admin Dashboard: https://care.maskpro.ph/admin`,
          ].join('\n');
          const htmlBody = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; border: 1px solid #fecaca; border-radius: 12px; overflow: hidden;">
              <div style="background: #dc2626; color: #ffffff; padding: 16px 20px;">
                <h2 style="margin: 0; font-size: 16px;">MASKPROCare API Alert — HTTP ${res.statusCode}</h2>
                <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">${timestamp}</div>
              </div>
              <div style="padding: 18px 20px; background: #ffffff; color: #0f172a; font-size: 14px; line-height: 1.55;">
                <p style="margin: 0 0 12px;">A production API endpoint returned <strong>HTTP ${res.statusCode}</strong>:</p>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                  <tr><td style="padding: 6px 0; color: #64748b; width: 120px;">Endpoint</td><td style="padding: 6px 0; font-weight: 700;"><code>${method} ${cleanPath}</code></td></tr>
                  <tr><td style="padding: 6px 0; color: #64748b;">Code</td><td style="padding: 6px 0;">${errCode}</td></tr>
                  <tr><td style="padding: 6px 0; color: #64748b;">Message</td><td style="padding: 6px 0;">${errMsg}</td></tr>
                  <tr><td style="padding: 6px 0; color: #64748b;">Customer ID</td><td style="padding: 6px 0;">${customerId || 'Unauthenticated'}</td></tr>
                  <tr><td style="padding: 6px 0; color: #64748b;">Client IP</td><td style="padding: 6px 0;">${clientIp || 'Unknown'}</td></tr>
                </table>
                <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
                  Alerts for this endpoint are throttled to once every 30 minutes. View full details in <a href="https://care.maskpro.ph/admin" style="color: #2563eb;">MASKPROCare Admin</a>.
                </div>
              </div>
            </div>
          `;

          const alertResult = await dispatchAdminAlert({
            subject: `[MASKPROCare ALERT] HTTP ${res.statusCode} on ${method} ${cleanPath}`,
            smsText,
            textBody,
            htmlBody,
          });
          if (alertResult.emailSent || alertResult.smsSent) alertSentFlag = 1;
        }

        await pool.query(
          `INSERT INTO care_api_error_logs
            (method, path, status_code, error_code, error_message, customer_id, ip_address, alert_sent, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [method, cleanPath, res.statusCode, errCode, errMsg, customerId, clientIp, alertSentFlag]
        );
      } catch (e) {
        console.error('[HealthMonitor] Failed to log 500 error:', e.message);
      }
    })();
  });

  next();
}

/**
 * Daily 6:55 AM Pre-Batch Canary (or manual trigger from Admin Panel).
 * Probes live POST /api/auth/magic-verify + GET /api/profile/get using a disposable test link.
 */
async function runPreBatchCanary(triggerType = 'scheduled_655am') {
  await ensureMonitorTables();
  const port = process.env.PORT || 3004;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  const probeSlug = `canary-probe-${Date.now()}`;
  const probeKey = crypto.randomBytes(12).toString('hex');
  const probeHash = crypto.createHash('sha256').update(probeKey).digest('hex');
  const probeLongUrl = `https://care.maskpro.ph/m/${probeSlug}?k=${probeKey}`;

  let probeLinkId = null;
  let magicMs = null;
  let profileMs = null;

  try {
    const [vehs] = await pool.query(
      'SELECT id FROM vehicles WHERE customer_id = ? ORDER BY id DESC LIMIT 1',
      [CANARY_CUSTOMER_ID]
    );
    const vehicleId = vehs[0]?.id || null;

    const [ins] = await pool.query(
      `INSERT INTO care_magic_links (customer_id, vehicle_id, slug, short_url, long_url, token_hash, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', NOW())`,
      [CANARY_CUSTOMER_ID, vehicleId, probeSlug, `https://maskpro.link/${probeSlug}`, probeLongUrl, probeHash]
    );
    probeLinkId = ins.insertId;

    // Step 1: Test POST /api/auth/magic-verify
    const t0 = Date.now();
    const magicRes = await axios.post(
      `${baseUrl}/auth/magic-verify`,
      {
        slug: probeSlug,
        k: probeKey,
        device_token: crypto.randomBytes(24).toString('hex'),
        platform_label: 'Pre-Batch Canary Probe',
      },
      { timeout: 10000 }
    );
    magicMs = Date.now() - t0;

    const jwtToken = magicRes.data?.data?.token;
    if (magicRes.status !== 200 || !magicRes.data?.success || !jwtToken || !magicRes.data?.data?.customer?.id) {
      throw new Error(`magic-verify invalid payload (HTTP ${magicRes.status})`);
    }

    // Step 2: Test GET /api/profile/get with returned JWT
    const t1 = Date.now();
    const profileRes = await axios.get(`${baseUrl}/profile/get`, {
      headers: { Authorization: `Bearer ${jwtToken}` },
      timeout: 10000,
    });
    profileMs = Date.now() - t1;

    if (profileRes.status !== 200 || !profileRes.data?.success || !profileRes.data?.data?.customer?.id) {
      throw new Error(`profile/get invalid payload (HTTP ${profileRes.status})`);
    }

    const detail = `OK — magic-verify ${magicMs}ms, profile/get ${profileMs}ms`;
    await pool.query(
      `INSERT INTO care_canary_runs (trigger_type, status, magic_verify_ms, profile_get_ms, detail, alert_sent, created_at)
       VALUES (?, 'pass', ?, ?, ?, 0, NOW())`,
      [triggerType, magicMs, profileMs, detail]
    );

    return { status: 'pass', magic_verify_ms: magicMs, profile_get_ms: profileMs, detail, alert_sent: false };
  } catch (err) {
    const errDetail = err.response?.data?.message
      ? `HTTP ${err.response.status}: ${err.response.data.message}`
      : err.message;

    let alertSent = false;
    const timestamp = formatManilaNow();
    const smsText = `MASKPROCare PRE-BATCH CANARY FAILED (${timestamp}): ${errDetail}. Check before 7AM SMS batch goes out!`;
    const textBody = [
      `MASKPROCare Pre-Batch Canary FAILED`,
      ``,
      `Time: ${timestamp}`,
      `Trigger: ${triggerType}`,
      `Failure: ${errDetail}`,
      ``,
      `Action: Inspect PM2 logs (pm2 logs maskpro-care --err) before the 7:00 AM SMS reminder batch runs.`,
      `Admin Dashboard: https://care.maskpro.ph/admin`,
    ].join('\n');
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; border: 1px solid #fecaca; border-radius: 12px; overflow: hidden;">
        <div style="background: #b91c1c; color: #ffffff; padding: 16px 20px;">
          <h2 style="margin: 0; font-size: 16px;">MASKPROCare 6:55 AM Pre-Batch Canary FAILED</h2>
          <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">${timestamp}</div>
        </div>
        <div style="padding: 18px 20px; background: #ffffff; color: #0f172a; font-size: 14px; line-height: 1.55;">
          <p style="margin: 0 0 12px;">The automated login &amp; profile canary check failed before the 7:00 AM SMS reminder blast:</p>
          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; color: #991b1b; font-family: monospace; font-size: 13px;">${errDetail}</div>
          <p style="margin: 14px 0 0; font-size: 13px; color: #475569;">Please check <code>pm2 logs maskpro-care --err</code> or open <a href="https://care.maskpro.ph/admin" style="color: #2563eb;">MASKPROCare Admin</a>.</p>
        </div>
      </div>
    `;

    const alertRes = await dispatchAdminAlert({
      subject: `[URGENT] MASKPROCare Pre-Batch Canary FAILED — ${timestamp}`,
      smsText,
      textBody,
      htmlBody,
    });
    alertSent = alertRes.emailSent || alertRes.smsSent;

    await pool.query(
      `INSERT INTO care_canary_runs (trigger_type, status, magic_verify_ms, profile_get_ms, detail, alert_sent, created_at)
       VALUES (?, 'fail', ?, ?, ?, ?, NOW())`,
      [triggerType, magicMs, profileMs, String(errDetail).slice(0, 500), alertSent ? 1 : 0]
    ).catch(() => {});

    return { status: 'fail', magic_verify_ms: magicMs, profile_get_ms: profileMs, detail: errDetail, alert_sent: alertSent };
  } finally {
    // Always clean up disposable probe rows so customer telemetry/logs stay spotless
    if (probeLinkId) {
      await pool.query('DELETE FROM care_magic_link_security_logs WHERE magic_link_id = ?', [probeLinkId]).catch(() => {});
      await pool.query('DELETE FROM care_app_activity_logs WHERE page_path = ?', [`/m/${probeSlug}`]).catch(() => {});
      await pool.query('DELETE FROM care_magic_links WHERE id = ?', [probeLinkId]).catch(() => {});
    }
  }
}

let lastScheduledCanaryYmd = null;

function startPreBatchCanaryScheduler() {
  // Check every 60 seconds for 06:55 Asia/Manila (5 mins before 7:00 AM SMS batch)
  setInterval(async () => {
    try {
      const { ymd, hour, minute } = getManilaClock();
      if (hour === 6 && minute === 55 && lastScheduledCanaryYmd !== ymd) {
        lastScheduledCanaryYmd = ymd;
        console.log(`[HealthMonitor] Running scheduled 6:55 AM Pre-Batch Canary (${ymd})...`);
        const result = await runPreBatchCanary('scheduled_655am');
        console.log(`[HealthMonitor] 6:55 AM Canary result: ${result.status.toUpperCase()} (${result.detail})`);
      }
    } catch (err) {
      console.error('[HealthMonitor] Scheduler tick error:', err.message);
    }
  }, 60 * 1000);
  console.log('✅ Health Monitor & Daily 6:55 AM Pre-Batch Canary scheduled (Asia/Manila)');
}

async function getAdminHealthStatus() {
  await ensureMonitorTables();
  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM care_api_error_logs WHERE status_code >= 500 AND created_at >= NOW() - INTERVAL 24 HOUR`
  );
  const [recentErrors] = await pool.query(
    `SELECT id, method, path, status_code, error_code, error_message, customer_id, ip_address, alert_sent, created_at
     FROM care_api_error_logs
     ORDER BY id DESC
     LIMIT 15`
  );
  const [recentCanaries] = await pool.query(
    `SELECT id, trigger_type, status, magic_verify_ms, profile_get_ms, detail, alert_sent, created_at
     FROM care_canary_runs
     ORDER BY id DESC
     LIMIT 7`
  );
  return {
    errors24h: Number(countRow?.total || 0),
    recentErrors,
    lastCanary: recentCanaries[0] || null,
    recentCanaries,
    alertChannels: {
      emails: getAlertEmails(),
      sms: getAlertSmsNumber(),
      smtpConfigured: Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD),
      canarySchedule: 'Daily 6:55 AM PHT (5m before 7AM SMS batch)',
    },
  };
}

module.exports = {
  monitorApiErrorsMiddleware,
  runPreBatchCanary,
  startPreBatchCanaryScheduler,
  getAdminHealthStatus,
  dispatchAdminAlert,
};
