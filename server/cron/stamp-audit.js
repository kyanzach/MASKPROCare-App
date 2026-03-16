#!/usr/bin/env node
/**
 * MaskPro Care — NanoFix Stamp Audit Cron
 * 
 * Runs daily at 1:00 AM via crontab.
 * Checks all "Nano Fix (Maintenance)" bookings against BoomerangMe loyalty card
 * stamp deductions. Auto-deducts missed stamps.
 * 
 * Card lookup flow (HYBRID — two sources):
 *   A. COATING cards → from `loyalty_cards` DB table (2,738+ cards stored locally)
 *      NanoFix booking → vehicle → find coating loyalty_card for same vehicle
 *   B. PPF cards → from BoomerangMe API (PPF cards NOT stored in loyalty_cards)
 *      NanoFix booking → customer → phone → BoomerangMe API → PPF template cards
 * 
 * Usage:
 *   node server/cron/stamp-audit.js
 *   node server/cron/stamp-audit.js --dry-run    (report only, no deductions)
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const mysql = require('mysql2/promise');
const axios = require('axios');

// ─── Configuration ──────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');

const BOOMERANGME_API_BASE = 'https://api.digitalwallet.cards/api/v2';
const BOOMERANGME_API_KEY = process.env.BOOMERANGME_API_KEY || '';

const REQUESTS_PER_SECOND = 8;
const MAX_RETRIES = 3;

const NANOFIX_SERVICE = 'Nano Fix (Maintenance)';
const COATING_SERVICE = 'Nano Ceramic Coating';
const PPF_SERVICE = 'PPF';

// loyalty_cards.card_type values for coating
const COATING_CARD_TYPES = ['Nano Ceramic Coating'];

// BoomerangMe template IDs for PPF cards (not in loyalty_cards table)
const PPF_TEMPLATE_IDS = [318553, 302979];

// ─── Logging ────────────────────────────────────────────────────────────────

const now = () => new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' });

function log(level, msg, data = null) {
  const prefix = { info: 'ℹ️', warn: '⚠️', error: '❌', ok: '✅', skip: '⏭️', stamp: '🎫' }[level] || '•';
  const line = `[${now()}] ${prefix} ${msg}`;
  console.log(data ? `${line} ${JSON.stringify(data)}` : line);
}

// ─── Axios + Rate Limiter ───────────────────────────────────────────────────

const apiClient = axios.create({
  baseURL: BOOMERANGME_API_BASE,
  headers: { 'X-API-Key': BOOMERANGME_API_KEY },
  timeout: 15000,
});

let requestsThisSecond = 0;
let lastResetTime = Date.now();
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function throttledApiCall(fn) {
  const nowMs = Date.now();
  if (nowMs - lastResetTime >= 1000) { requestsThisSecond = 0; lastResetTime = nowMs; }
  if (requestsThisSecond >= REQUESTS_PER_SECOND) {
    const waitMs = 1000 - (nowMs - lastResetTime);
    if (waitMs > 0) await sleep(waitMs);
    requestsThisSecond = 0; lastResetTime = Date.now();
  }
  requestsThisSecond++;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try { return await fn(); }
    catch (err) {
      if (err.response?.status === 429 && attempt < MAX_RETRIES) {
        log('warn', `Rate limited (429), retrying in ${2000 * attempt}ms`);
        await sleep(2000 * attempt);
        requestsThisSecond = 0; lastResetTime = Date.now();
        continue;
      }
      throw err;
    }
  }
}

// ─── BoomerangMe API ────────────────────────────────────────────────────────

async function getCardsByPhone(phone) {
  try {
    const resp = await throttledApiCall(() =>
      apiClient.get('/cards', { params: { customerPhone: phone, itemsPerPage: 100 } })
    );
    return resp.data?.data || [];
  } catch (err) {
    log('error', `API getCardsByPhone failed for ${phone}`, err.response?.data || err.message);
    return null;
  }
}

async function getCardOperations(cardId) {
  try {
    const resp = await throttledApiCall(() =>
      apiClient.get('/operations', { params: { cardId, itemsPerPage: 1000 } })
    );
    return resp.data?.data || [];
  } catch (err) {
    log('error', `API getCardOperations failed for ${cardId}`, err.response?.data || err.message);
    return null;
  }
}

async function subtractStamp(cardId, stamps, comment) {
  try {
    const resp = await throttledApiCall(() =>
      apiClient.post(`/cards/${cardId}/subtract-stamp`, { stamps, comment })
    );
    return resp.data || resp.status === 200;
  } catch (err) {
    log('error', `API subtractStamp failed for ${cardId}`, err.response?.data || err.message);
    return null;
  }
}

// ─── Phone normalization ────────────────────────────────────────────────────

function normalizePhone(phone) {
  if (!phone) return null;
  let p = String(phone).trim().replace(/[^0-9+]/g, '');
  if (p.startsWith('09') && p.length === 11) p = '+63' + p.substring(1);
  if (p.startsWith('63') && !p.startsWith('+63')) p = '+' + p;
  return p || null;
}

// ─── Database queries ───────────────────────────────────────────────────────

/**
 * Get all unprocessed NanoFix bookings with:
 *  - vehicle info
 *  - customer info (for PPF API lookup)
 *  - coating loyalty card (from loyalty_cards table, if exists for this vehicle)
 *  - parent service type (coating or PPF)
 */
async function getUnprocessedMaintenanceBookings(pool) {
  const [rows] = await pool.query(`
    SELECT 
      b.booking_id,
      b.booking_date,
      b.customer_id,
      b.customer_vehicle_id AS vehicle_id,
      CONCAT(IFNULL(v.make, ''), ' ', IFNULL(v.model, '')) AS vehicle_name,
      v.plate_no,
      c.full_name AS customer_name,
      c.mobile_number AS customer_phone,
      -- Coating card from loyalty_cards (if exists for this vehicle)
      coating_lc.card_no AS coating_card_no,
      coating_lc.card_type AS coating_card_type
    FROM bookings b
    JOIN bookings_service_types bst ON bst.booking_id = b.booking_id
    JOIN vehicles v ON b.customer_vehicle_id = v.id
    JOIN customers c ON b.customer_id = c.id
    -- LEFT JOIN to find coating loyalty card for the same vehicle
    LEFT JOIN (
      SELECT lc.card_no, lc.card_type, b2.customer_vehicle_id
      FROM loyalty_cards lc
      JOIN bookings b2 ON lc.booking_id = b2.booking_id
      WHERE lc.card_type IN ('Nano Ceramic Coating')
    ) coating_lc ON coating_lc.customer_vehicle_id = b.customer_vehicle_id
    -- Exclude already-audited bookings
    LEFT JOIN care_stamp_audit_log sal ON sal.booking_id = b.booking_id
    WHERE bst.service_name = ?
      AND b.notes NOT LIKE 'CANCELLED:%'
      AND b.booking_date < CURDATE()
      AND sal.id IS NULL
    ORDER BY b.customer_id, b.customer_vehicle_id, b.booking_date
  `, [NANOFIX_SERVICE]);
  return rows;
}

/**
 * Determine if a vehicle's NanoFix maintenance is for coating or PPF
 * by checking the most recent parent service booking on that vehicle.
 */
async function getVehicleParentService(pool, vehicleId) {
  const [rows] = await pool.query(`
    SELECT bst.service_name, b.booking_date
    FROM bookings b
    JOIN bookings_service_types bst ON bst.booking_id = b.booking_id
    WHERE b.customer_vehicle_id = ?
      AND bst.service_name IN (?, ?)
      AND b.notes NOT LIKE 'CANCELLED:%'
    ORDER BY b.booking_date DESC
    LIMIT 1
  `, [vehicleId, COATING_SERVICE, PPF_SERVICE]);
  if (rows.length === 0) return null;
  return rows[0].service_name === COATING_SERVICE ? 'coating' : 'ppf';
}

async function logAuditEntry(pool, entry) {
  await pool.query(`
    INSERT INTO care_stamp_audit_log 
    (customer_id, vehicle_id, booking_id, card_serial, card_category, action, stamps_deducted, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [entry.customer_id, entry.vehicle_id, entry.booking_id,
      entry.card_serial || null, entry.card_category,
      entry.action, entry.stamps_deducted || 0, entry.reason || null]);
}

// ─── PPF card lookup via API ────────────────────────────────────────────────

/**
 * Find a PPF card for a customer via BoomerangMe API (phone lookup).
 * PPF cards are NOT stored in loyalty_cards table.
 */
async function findPpfCardByPhone(phone) {
  const cards = await getCardsByPhone(phone);
  if (!cards || cards.length === 0) return null;
  // Filter to PPF template IDs only
  const ppfCards = cards.filter(c => PPF_TEMPLATE_IDS.includes(c.templateId));
  return ppfCards.length > 0 ? ppfCards[0] : null;
}

// ─── Stamp counting ────────────────────────────────────────────────────────

function countSubtractStampOps(operations) {
  return operations.filter(op => op.amount < 0).length;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  log('info', '═══════════════════════════════════════════════════');
  log('info', `NanoFix Stamp Audit ${DRY_RUN ? '(DRY RUN)' : '(AUTO-DEDUCT MODE)'}`);
  log('info', `Started at ${now()}`);
  log('info', '═══════════════════════════════════════════════════');

  if (!BOOMERANGME_API_KEY) { log('error', 'BOOMERANGME_API_KEY not set'); process.exit(1); }

  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'omnimpdb',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    waitForConnections: true, connectionLimit: 5,
    timezone: '+08:00', charset: 'utf8mb4',
  });

  try { await pool.query('SELECT 1 FROM care_stamp_audit_log LIMIT 1'); }
  catch { log('error', 'care_stamp_audit_log table missing'); await pool.end(); process.exit(1); }

  const stats = { total: 0, coating: 0, ppf: 0, deducted: 0, skipped: 0, errors: 0, stampsTotal: 0 };

  try {
    // Step 1: Get all unprocessed NanoFix bookings
    const bookings = await getUnprocessedMaintenanceBookings(pool);
    stats.total = bookings.length;
    log('info', `Found ${bookings.length} unprocessed Nano Fix (Maintenance) bookings`);
    if (bookings.length === 0) { log('ok', 'Nothing to process'); await pool.end(); return; }

    // Step 2: Group by vehicle
    const vehicleMap = new Map();
    for (const b of bookings) {
      if (!vehicleMap.has(b.vehicle_id)) {
        vehicleMap.set(b.vehicle_id, {
          vehicle_id: b.vehicle_id,
          vehicle_name: b.vehicle_name,
          plate_no: b.plate_no,
          customer_id: b.customer_id,
          customer_name: b.customer_name,
          customer_phone: b.customer_phone,
          coating_card_no: b.coating_card_no,
          coating_card_type: b.coating_card_type,
          bookings: [],
        });
      }
      vehicleMap.get(b.vehicle_id).bookings.push(b);
    }
    log('info', `Grouped into ${vehicleMap.size} vehicles, determining card types...`);

    // Step 3: Process each vehicle
    let vIdx = 0;
    // Cache PPF card lookups by phone to avoid duplicate API calls
    const ppfPhoneCache = new Map(); // phone → card or null

    for (const [vehicleId, veh] of vehicleMap) {
      vIdx++;

      // Determine if this vehicle's maintenance is for coating or PPF
      const parentService = await getVehicleParentService(pool, vehicleId);

      if (!parentService) {
        for (const b of veh.bookings) {
          await logAuditEntry(pool, {
            customer_id: b.customer_id, vehicle_id: b.vehicle_id,
            booking_id: b.booking_id, card_category: 'coating',
            action: 'skipped', reason: 'Vehicle has no Nano Ceramic Coating or PPF parent booking',
          });
          stats.skipped++;
        }
        log('skip', `[${vIdx}/${vehicleMap.size}] ${veh.vehicle_name} — no parent service`);
        continue;
      }

      // ─── Find the card based on parent service type ───────────────
      let cardNo = null;
      let cardCategory = parentService;

      if (parentService === 'coating') {
        // COATING: Use loyalty_cards DB table (card_no already joined in query)
        cardNo = veh.coating_card_no;
        stats.coating++;
        if (!cardNo) {
          for (const b of veh.bookings) {
            await logAuditEntry(pool, {
              customer_id: b.customer_id, vehicle_id: b.vehicle_id,
              booking_id: b.booking_id, card_category: 'coating',
              action: 'skipped', reason: 'No coating loyalty card in loyalty_cards table for this vehicle',
            });
            stats.skipped++;
          }
          log('skip', `[${vIdx}/${vehicleMap.size}] ${veh.customer_name} — ${veh.vehicle_name} (coating) — no card in DB`);
          continue;
        }
      } else {
        // PPF: Use BoomerangMe API (PPF cards not in loyalty_cards)
        const phone = normalizePhone(veh.customer_phone);
        stats.ppf++;
        if (!phone) {
          for (const b of veh.bookings) {
            await logAuditEntry(pool, {
              customer_id: b.customer_id, vehicle_id: b.vehicle_id,
              booking_id: b.booking_id, card_category: 'ppf',
              action: 'skipped', reason: 'Customer has no phone number for PPF card lookup',
            });
            stats.skipped++;
          }
          log('skip', `[${vIdx}/${vehicleMap.size}] ${veh.customer_name} — no phone for PPF lookup`);
          continue;
        }

        // Check cache first
        if (ppfPhoneCache.has(phone)) {
          const cached = ppfPhoneCache.get(phone);
          cardNo = cached ? cached.id : null;
        } else {
          const ppfCard = await findPpfCardByPhone(phone);
          ppfPhoneCache.set(phone, ppfCard);
          cardNo = ppfCard ? ppfCard.id : null;
        }

        if (!cardNo) {
          for (const b of veh.bookings) {
            await logAuditEntry(pool, {
              customer_id: b.customer_id, vehicle_id: b.vehicle_id,
              booking_id: b.booking_id, card_category: 'ppf',
              action: 'skipped', reason: 'No PPF card found in BoomerangMe for this customer phone',
            });
            stats.skipped++;
          }
          log('skip', `[${vIdx}/${vehicleMap.size}] ${veh.customer_name} — ${veh.vehicle_name} (PPF) — no PPF card via API`);
          continue;
        }
      }

      // ─── Compare maintenance count vs stamp deductions ────────────
      const [allMaintenanceRows] = await pool.query(`
        SELECT COUNT(*) as cnt FROM bookings b
        JOIN bookings_service_types bst ON bst.booking_id = b.booking_id
        WHERE b.customer_vehicle_id = ? AND bst.service_name = ?
          AND b.notes NOT LIKE 'CANCELLED:%' AND b.booking_date < CURDATE()
      `, [vehicleId, NANOFIX_SERVICE]);
      const totalMaintenance = allMaintenanceRows[0].cnt;

      const operations = await getCardOperations(cardNo);
      if (operations === null) {
        log('error', `[${vIdx}/${vehicleMap.size}] ${veh.vehicle_name} — API error for card ${cardNo}`);
        stats.errors++;
        continue;
      }

      const existingDeductions = countSubtractStampOps(operations);
      const deficit = totalMaintenance - existingDeductions;

      if (deficit <= 0) {
        for (const b of veh.bookings) {
          await logAuditEntry(pool, {
            customer_id: b.customer_id, vehicle_id: b.vehicle_id,
            booking_id: b.booking_id, card_serial: cardNo, card_category: cardCategory,
            action: 'skipped', stamps_deducted: 0,
            reason: `Balanced (${totalMaintenance} bookings, ${existingDeductions} deductions)`,
          });
          stats.skipped++;
        }
        log('ok', `[${vIdx}/${vehicleMap.size}] ${veh.customer_name} — ${veh.vehicle_name} (${cardCategory}) — balanced (${totalMaintenance}/${existingDeductions})`);
        continue;
      }

      // ─── Mismatch found — deduct ─────────────────────────────────
      if (DRY_RUN) {
        for (const b of veh.bookings) {
          await logAuditEntry(pool, {
            customer_id: b.customer_id, vehicle_id: b.vehicle_id,
            booking_id: b.booking_id, card_serial: cardNo, card_category: cardCategory,
            action: 'skipped', stamps_deducted: 0,
            reason: `DRY RUN: Would deduct ${deficit} (${totalMaintenance} bookings - ${existingDeductions} deductions)`,
          });
          stats.skipped++;
        }
        log('stamp', `[${vIdx}/${vehicleMap.size}] ${veh.customer_name} — ${veh.vehicle_name} (${cardCategory}) — DRY RUN: ${deficit} stamp(s)`);
        continue;
      }

      const comment = `Auto-audit: ${deficit} missed NanoFix deduction(s) for ${veh.vehicle_name || veh.plate_no}`;
      const result = await subtractStamp(cardNo, deficit, comment);

      if (result) {
        let remaining = deficit;
        for (const b of veh.bookings) {
          const s = Math.min(1, remaining);
          remaining = Math.max(0, remaining - 1);
          await logAuditEntry(pool, {
            customer_id: b.customer_id, vehicle_id: b.vehicle_id,
            booking_id: b.booking_id, card_serial: cardNo, card_category: cardCategory,
            action: 'deducted', stamps_deducted: s,
            reason: `Deducted from card ${cardNo} (batch: ${deficit})`,
          });
          stats.deducted++;
        }
        stats.stampsTotal += deficit;
        log('stamp', `[${vIdx}/${vehicleMap.size}] ${veh.customer_name} — ${veh.vehicle_name} (${cardCategory}) — DEDUCTED ${deficit} stamp(s)`);
      } else {
        log('error', `[${vIdx}/${vehicleMap.size}] ${veh.vehicle_name} — FAILED to deduct from ${cardNo}`);
        stats.errors++;
      }

      if (vIdx % 100 === 0) log('info', `Progress: ${vIdx}/${vehicleMap.size} vehicles`);
    }

  } catch (err) {
    log('error', `Fatal error: ${err.message}`);
    console.error(err);
  } finally {
    await pool.end();
  }

  log('info', '═══════════════════════════════════════════════════');
  log('info', 'AUDIT SUMMARY');
  log('info', `  Total bookings: ${stats.total}`);
  log('info', `  Coating vehicles: ${stats.coating} | PPF vehicles: ${stats.ppf}`);
  log('ok',   `  Deducted: ${stats.deducted} bookings (${stats.stampsTotal} stamps)`);
  log('skip', `  Skipped: ${stats.skipped}`);
  log('error',`  Errors (retry next run): ${stats.errors}`);
  log('info', `  Mode: ${DRY_RUN ? 'DRY RUN' : 'AUTO-DEDUCT'}`);
  log('info', `  Finished at ${now()}`);
  log('info', '═══════════════════════════════════════════════════');
}

main().catch(err => { console.error('Unhandled:', err); process.exit(1); });
