/**
 * Care Magic Link Service — Device-Bound (TOFU) Smart Short Links via JotURL (maskpro.link)
 *
 * Node.js port of unify.maskpro.ph/includes/care_magic_link_helper.php & joturl_helper.php
 * Used by Admin Panel Retry Reminder endpoint to mint magic links & format maintenance SMS
 * identically to the 7AM daily cron.
 */

const crypto = require('crypto');
const axios = require('axios');

const JOTURL_PROJECT_ID = process.env.JOTURL_PROJECT_ID || '61454b5430314c6277746479494277434a5877556c773d3d';
const JOTURL_DOMAIN_ID = process.env.JOTURL_DOMAIN_ID || '633336477679316335575471786d6f326a32685a52673d3d';

let cachedJotUrlSid = null;

/**
 * Sanitize and validate a Philippine mobile number BEFORE creating a magic link or sending SMS.
 * Matches sanitizeAndValidatePhMobile() in unify.maskpro.ph/includes/care_magic_link_helper.php.
 */
function sanitizeAndValidatePhMobile(rawMobile) {
  const trimmed = String(rawMobile || '').trim();
  if (!trimmed || /no\s*mobile|none|n\/a|tba|tbd|find\s+and\s+update/i.test(trimmed)) {
    return { valid: false, mobile: '', reason: 'No mobile number on file' };
  }

  let digits = trimmed.replace(/\D+/g, '');

  if (digits.length === 12 && digits.startsWith('639')) {
    digits = '0' + digits.slice(2);
  } else if (digits.length === 10 && digits.startsWith('9')) {
    digits = '0' + digits;
  }

  if (!/^09\d{9}$/.test(digits)) {
    return { valid: false, mobile: '', reason: 'Invalid mobile number format' };
  }

  if (/^09(\d)\1{8}$/.test(digits) || digits === '09123456789') {
    return { valid: false, mobile: '', reason: 'Placeholder mobile number' };
  }

  return { valid: true, mobile: digits, reason: '' };
}

/**
 * Build readable base slug from customer name + vehicle make/model.
 * Example: ("Ryan Paco", "BYD", "Tang") -> "ryanp-bydtang"
 */
function buildCareMagicBaseSlug(fullName, make, model) {
  const cleanName = String(fullName || '').trim().replace(/[^a-zA-Z0-9\s]/g, '');
  const parts = cleanName.toLowerCase().split(/\s+/).filter(Boolean);

  let namePart;
  if (parts.length === 0) {
    namePart = 'client';
  } else if (parts.length === 1) {
    namePart = parts[0].slice(0, 8);
  } else {
    const first = parts[0].slice(0, 8);
    const lastInitial = parts[parts.length - 1].slice(0, 1);
    namePart = first + lastInitial;
  }

  const vehRaw = `${make || ''}${model || ''}`.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const vehPart = vehRaw ? vehRaw.slice(0, 12) : 'car';

  return `${namePart}-${vehPart}`;
}

function getJotUrlGmtTime() {
  // Format: YYYY-MM-DDTHH:MMZ
  return new Date().toISOString().slice(0, 16) + 'Z';
}

function jotUrlHmac(payload, privateKey) {
  return crypto.createHmac('sha256', privateKey).update(payload).digest('hex');
}

async function jotUrlLogin(username, publicKey, privateKey) {
  try {
    const gmtTime = getJotUrlGmtTime();
    const password = jotUrlHmac(`${publicKey}:${gmtTime}`, privateKey);
    const url = `https://joturl.com/a/i1/users/login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    const res = await axios.get(url, { timeout: 10000 });
    const data = res.data;
    if (data && Number(data?.status?.code) === 200 && data?.result?.sid) {
      return data.result.sid;
    }
  } catch (err) {
    console.error('[JotURL] login error:', err.message);
  }
  return null;
}

async function jotUrlCallShorten(sid, h, longUrl, projectId, customAlias, domainId) {
  try {
    let apiUrl = `https://joturl.com/a/i1/urls/shorten?_sid=${encodeURIComponent(sid)}&_h=${encodeURIComponent(h)}&project_id=${encodeURIComponent(projectId)}&long_url=${encodeURIComponent(longUrl)}`;
    if (customAlias) {
      apiUrl += `&domain_id=${encodeURIComponent(domainId)}&alias=${encodeURIComponent(customAlias)}`;
    }
    const res = await axios.get(apiUrl, { timeout: 10000 });
    const data = res.data;
    if (data && Number(data?.status?.code) === 200 && data?.result?.short_url) {
      return data.result.short_url;
    }
  } catch (err) {
    console.error('[JotURL] shorten error:', err.message);
  }
  return null;
}

async function jotUrlShorten(longUrl, customAlias = null) {
  const publicKey = process.env.JOTURL_PUBLIC_KEY;
  const privateKey = process.env.JOTURL_PRIVATE_KEY;
  const username = process.env.JOTURL_USERNAME;

  if (!publicKey || !privateKey || !username) {
    console.warn('[JotURL] Missing JOTURL_PUBLIC_KEY / JOTURL_PRIVATE_KEY / JOTURL_USERNAME in .env');
    return longUrl.replace(/^https?:\/\/(www\.)?/, '');
  }

  // 1. Try cached SID first
  if (cachedJotUrlSid) {
    const h = jotUrlHmac(`${cachedJotUrlSid}:${getJotUrlGmtTime()}`, privateKey);
    const result = await jotUrlCallShorten(cachedJotUrlSid, h, longUrl, JOTURL_PROJECT_ID, customAlias, JOTURL_DOMAIN_ID);
    if (result) {
      return result.replace(/^https?:\/\/(www\.)?/, '');
    }
    cachedJotUrlSid = null;
  }

  // 2. Fresh login
  const sid = await jotUrlLogin(username, publicKey, privateKey);
  if (!sid) {
    return longUrl.replace(/^https?:\/\/(www\.)?/, '');
  }
  cachedJotUrlSid = sid;

  // 3. Shorten with custom alias
  const h = jotUrlHmac(`${sid}:${getJotUrlGmtTime()}`, privateKey);
  let result = await jotUrlCallShorten(sid, h, longUrl, JOTURL_PROJECT_ID, customAlias, JOTURL_DOMAIN_ID);

  // 4. If custom alias collided on JotURL, retry without customAlias
  if (!result && customAlias) {
    result = await jotUrlCallShorten(sid, h, longUrl, JOTURL_PROJECT_ID, null, JOTURL_DOMAIN_ID);
  }

  const finalUrl = result || longUrl;
  return finalUrl.replace(/^https?:\/\/(www\.)?/, '');
}

/**
 * Get existing active care_magic_links record or mint a new one via JotURL.
 */
async function getOrCreateCareMagicLink(pool, { customerId, vehicleId, bookingId, reminderId, fullName, make, model }) {
  let existingLink = null;

  if (reminderId && reminderId > 0) {
    const [rows] = await pool.query(
      "SELECT id, slug, short_url, long_url, raw_token FROM care_magic_links WHERE reminder_id = ? AND status = 'active' LIMIT 1",
      [reminderId]
    );
    if (rows.length > 0) existingLink = rows[0];
  }

  if (!existingLink && bookingId && bookingId > 0) {
    const [rows] = await pool.query(
      "SELECT id, slug, short_url, long_url, raw_token FROM care_magic_links WHERE booking_id = ? AND status = 'active' ORDER BY id ASC LIMIT 1",
      [bookingId]
    );
    if (rows.length > 0) existingLink = rows[0];
  }

  if (!existingLink && vehicleId && vehicleId > 0) {
    const [rows] = await pool.query(
      "SELECT id, slug, short_url, long_url, raw_token FROM care_magic_links WHERE customer_id = ? AND vehicle_id = ? AND status = 'active' ORDER BY id ASC LIMIT 1",
      [customerId, vehicleId]
    );
    if (rows.length > 0) existingLink = rows[0];
  }

  if (existingLink) {
    if (reminderId && reminderId > 0 && existingLink.short_url) {
      await pool.query(
        "UPDATE sms_periodic_reminders SET short_link = ? WHERE sms_periodic_reminders_id = ? AND (short_link IS NULL OR short_link = '')",
        [existingLink.short_url, reminderId]
      );
    }
    return existingLink;
  }

  // Mint new slug + token
  const baseSlug = buildCareMagicBaseSlug(fullName, make, model);
  const [slugRows] = await pool.query('SELECT slug FROM care_magic_links WHERE slug LIKE ?', [`${baseSlug}-%`]);
  const existingSlugs = new Set(slugRows.map((r) => r.slug));

  let seq = 1;
  let candidateSlug = '';
  do {
    candidateSlug = `${baseSlug}-${String(seq).padStart(2, '0')}`;
    seq += 1;
  } while (existingSlugs.has(candidateSlug) && seq < 999);

  const rawToken = crypto.randomBytes(12).toString('hex'); // 24-char hex key
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const longUrl = `https://care.maskpro.ph/m/${candidateSlug}?k=${rawToken}`;

  let shortUrl = await jotUrlShorten(longUrl, candidateSlug);
  if (shortUrl.includes('care.maskpro.ph')) {
    // Fallback if JotURL was unreachable
    shortUrl = `maskpro.link/${candidateSlug}`;
  }

  const [insertRes] = await pool.query(
    `INSERT INTO care_magic_links
      (slug, token_hash, raw_token, customer_id, vehicle_id, booking_id, reminder_id, short_url, long_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [candidateSlug, tokenHash, rawToken, customerId, vehicleId || null, bookingId || null, reminderId || null, shortUrl, longUrl]
  );

  if (reminderId && reminderId > 0) {
    await pool.query(
      'UPDATE sms_periodic_reminders SET short_link = ? WHERE sms_periodic_reminders_id = ?',
      [shortUrl, reminderId]
    );
  }

  return {
    id: insertRes.insertId,
    slug: candidateSlug,
    short_url: shortUrl,
    long_url: longUrl,
    raw_token: rawToken,
  };
}

/**
 * Format a 6-Month Maintenance Reminder SMS identically to buildSmartMaintenanceSmsText() in Unify.
 */
function buildSmartMaintenanceSmsText({ templateText, title, fullName, make, model, bookingDate, bookingId, shortUrl }) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0]
    ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase()
    : 'Valued Client';
  const vmm = `${make || ''} ${model || ''}`.trim() || 'Vehicle';

  let formattedDate = '';
  if (bookingDate) {
    const dt = new Date(bookingDate);
    if (!Number.isNaN(dt.getTime())) {
      formattedDate = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }

  const signatureDefault =
    'To: {title} {name}\n\n' +
    'Dear Valued Customer,\n\n' +
    'Greetings!\n\n' +
    'Your {vmm} is due for 6-Month NanoFix Maintenance.\n\n' +
    "Now it's even easier and faster to book! 1 click to this link will log you in, hassle-free!\n\n" +
    'Book via our MASKPROCare App:\n\n' +
    '{care_link}\n\n' +
    'MaskPro\n' +
    'Always Brand New';

  let tpl = String(templateText || '');
  if (
    !tpl.trim() ||
    /maskpro\.link\/maintenance/i.test(tpl) ||
    !/Always Brand New/i.test(tpl) ||
    tpl.length > 420
  ) {
    tpl = signatureDefault;
  }

  // Strip non-breaking spaces and trailing spaces on lines
  tpl = tpl.replace(/\u00A0/g, ' ').replace(/[ \t]+$/gm, '');

  const cleanTitle = String(title || '').trim();
  const cleanName = String(fullName || '').trim();

  let msg = tpl
    .split('{first_name}').join(firstName)
    .split('{title}').join(cleanTitle)
    .split('{name}').join(cleanName)
    .split('{vmm}').join(vmm)
    .split('{date}').join(formattedDate)
    .split('{booking_id}').join(String(bookingId || ''))
    .split('{care_link}').join(shortUrl);

  msg = msg.replace(/^To:\s+/gm, 'To: ');

  if (shortUrl && !msg.toLowerCase().includes(shortUrl.toLowerCase())) {
    msg = `${msg.trimEnd()}\n${shortUrl}`;
  }

  return msg.trim();
}

module.exports = {
  sanitizeAndValidatePhMobile,
  buildCareMagicBaseSlug,
  getOrCreateCareMagicLink,
  buildSmartMaintenanceSmsText,
};
