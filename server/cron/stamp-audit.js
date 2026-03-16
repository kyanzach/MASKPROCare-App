#!/usr/bin/env node
/**
 * MaskPro Care — NanoFix Stamp Audit Cron
 * 
 * Runs daily at 1:00 AM via crontab.
 * Checks all "Nano Fix (Maintenance)" bookings against BoomerangMe loyalty card
 * stamp deductions. Auto-deducts missed stamps.
 * 
 * Usage:
 *   node server/cron/stamp-audit.js
 *   node server/cron/stamp-audit.js --dry-run    (report only, no deductions)
 * 
 * Requirements:
 *   - .env loaded (DB_*, BOOMERANGME_API_KEY)
 *   - care_stamp_audit_log table created
 */

'use strict';

const path = require('path');
// Load .env from project root
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const mysql = require('mysql2/promise');
const axios = require('axios');

// ─── Configuration ──────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');

const BOOMERANGME_API_BASE = 'https://api.digitalwallet.cards/api/v2';
const BOOMERANGME_API_KEY = process.env.BOOMERANGME_API_KEY || '';

// Template ID → category mapping
const COATING_TEMPLATE_IDS = [41402, 42605, 43203, 1006938];
const PPF_TEMPLATE_IDS = [318553, 302979];

// Rate limiting: 8 req/sec (safety margin below 10/sec API limit)
const REQUESTS_PER_SECOND = 8;
const BATCH_DELAY_MS = 1000;
const MAX_RETRIES = 3;

// Service name constants
const NANOFIX_SERVICE = 'Nano Fix (Maintenance)';
const COATING_SERVICE = 'Nano Ceramic Coating';
const PPF_SERVICE = 'PPF';

// ─── Logging ────────────────────────────────────────────────────────────────

const now = () => new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' });

function log(level, msg, data = null) {
  const prefix = { info: 'ℹ️', warn: '⚠️', error: '❌', ok: '✅', skip: '⏭️', stamp: '🎫' }[level] || '•';
  const line = `[${now()}] ${prefix} ${msg}`;
  console.log(data ? `${line} ${JSON.stringify(data)}` : line);
}

// ─── Axios client with API key ──────────────────────────────────────────────

const apiClient = axios.create({
  baseURL: BOOMERANGME_API_BASE,
  headers: { 'X-API-Key': BOOMERANGME_API_KEY },
  timeout: 15000,
});

// ─── Rate limiter ───────────────────────────────────────────────────────────

let requestQueue = [];
let requestsThisSecond = 0;
let lastResetTime = Date.now();

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function throttledApiCall(fn) {
  const now = Date.now();
  if (now - lastResetTime >= 1000) {
    requestsThisSecond = 0;
    lastResetTime = now;
  }
  
  if (requestsThisSecond >= REQUESTS_PER_SECOND) {
    const waitMs = 1000 - (now - lastResetTime);
    if (waitMs > 0) await sleep(waitMs);
    requestsThisSecond = 0;
    lastResetTime = Date.now();
  }
  
  requestsThisSecond++;
  
  // Retry with exponential backoff on 429
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err.response?.status === 429 && attempt < MAX_RETRIES) {
        const backoff = 2000 * attempt; // 2s, 4s, 6s
        log('warn', `Rate limited (429), retrying in ${backoff}ms (attempt ${attempt}/${MAX_RETRIES})`);
        await sleep(backoff);
        requestsThisSecond = 0;
        lastResetTime = Date.now();
        continue;
      }
      throw err;
    }
  }
}

// ─── BoomerangMe API calls ──────────────────────────────────────────────────

async function getCardsByPhone(phone) {
  try {
    const resp = await throttledApiCall(() =>
      apiClient.get('/cards', { params: { customerPhone: phone, itemsPerPage: 100 } })
    );
    return resp.data?.data || [];
  } catch (err) {
    log('error', `API getCardsByPhone failed for ${phone}`, err.response?.data || err.message);
    return null; // null = error, [] = no cards
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
    return resp.data?.data || null;
  } catch (err) {
    log('error', `API subtractStamp failed for ${cardId}`, err.response?.data || err.message);
    return null;
  }
}

// ─── Database queries ───────────────────────────────────────────────────────

async function getUnprocessedMaintenanceBookings(pool) {
  const [rows] = await pool.query(`
    SELECT 
      b.booking_id,
      b.booking_date,
      b.customer_id,
      b.customer_vehicle_id AS vehicle_id,
      CONCAT(IFNULL(v.make, ''), ' ', IFNULL(v.model, '')) AS vehicle_name,
      v.plate_no,
      c.mobile_number AS customer_phone,
      c.full_name AS customer_name
    FROM bookings b
    JOIN bookings_service_types bst ON bst.booking_id = b.booking_id
    JOIN vehicles v ON b.customer_vehicle_id = v.id
    JOIN customers c ON b.customer_id = c.id
    LEFT JOIN care_stamp_audit_log sal ON sal.booking_id = b.booking_id
    WHERE bst.service_name = ?
      AND b.notes NOT LIKE 'CANCELLED:%'
      AND b.booking_date < CURDATE()
      AND sal.id IS NULL
    ORDER BY b.customer_id, b.customer_vehicle_id, b.booking_date
  `, [NANOFIX_SERVICE]);
  
  return rows;
}

async function getVehicleParentService(pool, vehicleId) {
  // Find the most recent coating or PPF booking for this vehicle
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
  `, [
    entry.customer_id,
    entry.vehicle_id,
    entry.booking_id,
    entry.card_serial || null,
    entry.card_category,
    entry.action,
    entry.stamps_deducted || 0,
    entry.reason || null,
  ]);
}

// ─── Card matching logic ────────────────────────────────────────────────────

function findMatchingCard(cards, category, vehicleInfo) {
  const templateIds = category === 'coating' ? COATING_TEMPLATE_IDS : PPF_TEMPLATE_IDS;
  
  // Filter cards by matching template IDs
  const matchingCards = cards.filter(c => templateIds.includes(c.templateId));
  
  if (matchingCards.length === 0) return null;
  if (matchingCards.length === 1) return matchingCards[0];
  
  // Multiple cards — try to match by vehicle custom field
  if (vehicleInfo) {
    const plateNorm = (vehicleInfo.plate_no || '').replace(/\s/g, '').toLowerCase();
    const makeNorm = (vehicleInfo.vehicle_name || '').toLowerCase();
    
    for (const card of matchingCards) {
      const customFields = card.customFields || [];
      for (const f of customFields) {
        const val = (f.value || '').toLowerCase();
        if (plateNorm && val.includes(plateNorm)) return card;
        if (makeNorm && val.includes(makeNorm)) return card;
      }
    }
  }
  
  // Fallback: use the card with the earliest creation (most likely the active one)
  matchingCards.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return matchingCards[0];
}

function countSubtractStampOps(operations) {
  // Count operations that subtracted stamps (eventId for subtract-stamp)
  // BoomerangMe operations have negative amounts for subtractions
  return operations.filter(op => op.amount < 0).length;
}

// ─── Phone normalization ────────────────────────────────────────────────────

function normalizePhone(phone) {
  if (!phone) return null;
  let p = String(phone).trim().replace(/[^0-9+]/g, '');
  
  // Convert 09xx to +639xx
  if (p.startsWith('09') && p.length === 11) {
    p = '+63' + p.substring(1);
  }
  // Convert 639xx to +639xx
  if (p.startsWith('63') && !p.startsWith('+63')) {
    p = '+' + p;
  }
  
  return p || null;
}

// ─── Main processing ────────────────────────────────────────────────────────

async function main() {
  log('info', '═══════════════════════════════════════════════════');
  log('info', `NanoFix Stamp Audit ${DRY_RUN ? '(DRY RUN — no deductions)' : '(AUTO-DEDUCT MODE)'}`);
  log('info', `Started at ${now()}`);
  log('info', '═══════════════════════════════════════════════════');
  
  if (!BOOMERANGME_API_KEY) {
    log('error', 'BOOMERANGME_API_KEY not set in .env — aborting');
    process.exit(1);
  }
  
  // Connect to database
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'omnimpdb',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    waitForConnections: true,
    connectionLimit: 5,
    timezone: '+08:00',
    charset: 'utf8mb4',
  });
  
  // Ensure audit_log table exists
  try {
    await pool.query(`SELECT 1 FROM care_stamp_audit_log LIMIT 1`);
  } catch (err) {
    log('error', 'care_stamp_audit_log table does not exist. Run the migration first.');
    await pool.end();
    process.exit(1);
  }
  
  // Stats
  const stats = { total: 0, deducted: 0, skipped: 0, errors: 0, stampsTotal: 0 };
  
  try {
    // Step 1: Get all unprocessed maintenance bookings
    const bookings = await getUnprocessedMaintenanceBookings(pool);
    stats.total = bookings.length;
    log('info', `Found ${bookings.length} unprocessed Nano Fix (Maintenance) bookings`);
    
    if (bookings.length === 0) {
      log('ok', 'Nothing to process — all bookings already audited');
      await pool.end();
      return;
    }
    
    // Step 2: Group by customer
    const customerMap = new Map();
    for (const b of bookings) {
      if (!customerMap.has(b.customer_id)) {
        customerMap.set(b.customer_id, {
          customer_id: b.customer_id,
          customer_phone: b.customer_phone,
          customer_name: b.customer_name,
          vehicles: new Map(),
        });
      }
      const cust = customerMap.get(b.customer_id);
      if (!cust.vehicles.has(b.vehicle_id)) {
        cust.vehicles.set(b.vehicle_id, {
          vehicle_id: b.vehicle_id,
          vehicle_name: b.vehicle_name,
          plate_no: b.plate_no,
          bookings: [],
        });
      }
      cust.vehicles.get(b.vehicle_id).bookings.push(b);
    }
    
    log('info', `Grouped into ${customerMap.size} customers, processing...`);
    
    // Step 3: Process each customer
    let customerIndex = 0;
    for (const [customerId, customer] of customerMap) {
      customerIndex++;
      const phone = normalizePhone(customer.customer_phone);
      
      if (!phone) {
        // No phone — skip all bookings for this customer
        for (const [, vehicle] of customer.vehicles) {
          for (const b of vehicle.bookings) {
            await logAuditEntry(pool, {
              customer_id: b.customer_id, vehicle_id: b.vehicle_id,
              booking_id: b.booking_id, card_category: 'coating',
              action: 'skipped', reason: 'Customer has no phone number',
            });
            stats.skipped++;
          }
        }
        log('skip', `[${customerIndex}/${customerMap.size}] ${customer.customer_name} — no phone`);
        continue;
      }
      
      // Fetch BoomerangMe cards for this customer
      const cards = await getCardsByPhone(phone);
      
      if (cards === null) {
        // API error — skip, don't log as processed (will retry next run)
        log('error', `[${customerIndex}/${customerMap.size}] ${customer.customer_name} — API error fetching cards`);
        stats.errors++;
        continue;
      }
      
      if (cards.length === 0) {
        // No BoomerangMe cards at all
        for (const [, vehicle] of customer.vehicles) {
          for (const b of vehicle.bookings) {
            const cat = await getVehicleParentService(pool, b.vehicle_id) || 'coating';
            await logAuditEntry(pool, {
              customer_id: b.customer_id, vehicle_id: b.vehicle_id,
              booking_id: b.booking_id, card_category: cat,
              action: 'skipped', reason: 'No BoomerangMe cards found for this customer',
            });
            stats.skipped++;
          }
        }
        log('skip', `[${customerIndex}/${customerMap.size}] ${customer.customer_name} — no cards`);
        continue;
      }
      
      // Process each vehicle for this customer
      for (const [vehicleId, vehicle] of customer.vehicles) {
        // Determine card category (coating or ppf)
        const category = await getVehicleParentService(pool, vehicleId);
        
        if (!category) {
          // Vehicle has no coating/PPF parent service
          for (const b of vehicle.bookings) {
            await logAuditEntry(pool, {
              customer_id: b.customer_id, vehicle_id: b.vehicle_id,
              booking_id: b.booking_id, card_category: 'coating',
              action: 'skipped', reason: 'Vehicle has no Nano Ceramic Coating or PPF booking',
            });
            stats.skipped++;
          }
          log('skip', `  Vehicle ${vehicle.vehicle_name} — no parent service`);
          continue;
        }
        
        // Find matching BoomerangMe card
        const card = findMatchingCard(cards, category, vehicle);
        
        if (!card) {
          for (const b of vehicle.bookings) {
            await logAuditEntry(pool, {
              customer_id: b.customer_id, vehicle_id: b.vehicle_id,
              booking_id: b.booking_id, card_category: category,
              action: 'skipped', reason: `No matching ${category} card found in BoomerangMe`,
            });
            stats.skipped++;
          }
          log('skip', `  Vehicle ${vehicle.vehicle_name} — no ${category} card`);
          continue;
        }
        
        // Get existing operations for this card to count actual deductions
        const operations = await getCardOperations(card.id);
        
        if (operations === null) {
          // API error — skip this vehicle, will retry next run
          log('error', `  Vehicle ${vehicle.vehicle_name} — API error fetching operations`);
          stats.errors++;
          continue;
        }
        
        const existingDeductions = countSubtractStampOps(operations);
        
        // Count ALL maintenance bookings for this vehicle (not just unprocessed ones)
        // We need the total to compare against total deductions
        const [allMaintenanceRows] = await pool.query(`
          SELECT COUNT(*) as cnt FROM bookings b
          JOIN bookings_service_types bst ON bst.booking_id = b.booking_id
          WHERE b.customer_vehicle_id = ?
            AND bst.service_name = ?
            AND b.notes NOT LIKE 'CANCELLED:%'
            AND b.booking_date < CURDATE()
        `, [vehicleId, NANOFIX_SERVICE]);
        
        const totalMaintenanceBookings = allMaintenanceRows[0].cnt;
        const deficit = totalMaintenanceBookings - existingDeductions;
        
        if (deficit <= 0) {
          // Stamps already match or more deductions than bookings (manual deductions)
          for (const b of vehicle.bookings) {
            await logAuditEntry(pool, {
              customer_id: b.customer_id, vehicle_id: b.vehicle_id,
              booking_id: b.booking_id, card_serial: card.id, card_category: category,
              action: 'skipped', stamps_deducted: 0,
              reason: `Stamps already balanced (${totalMaintenanceBookings} bookings, ${existingDeductions} deductions)`,
            });
            stats.skipped++;
          }
          log('ok', `  Vehicle ${vehicle.vehicle_name} (${category}) — balanced (${totalMaintenanceBookings} bookings, ${existingDeductions} deductions)`);
          continue;
        }
        
        // Need to deduct stamps
        if (DRY_RUN) {
          for (const b of vehicle.bookings) {
            await logAuditEntry(pool, {
              customer_id: b.customer_id, vehicle_id: b.vehicle_id,
              booking_id: b.booking_id, card_serial: card.id, card_category: category,
              action: 'skipped', stamps_deducted: 0,
              reason: `DRY RUN: Would deduct ${deficit} stamp(s) (${totalMaintenanceBookings} bookings, ${existingDeductions} deductions)`,
            });
            stats.skipped++;
          }
          log('stamp', `  Vehicle ${vehicle.vehicle_name} (${category}) — DRY RUN: would deduct ${deficit} stamp(s) from card ${card.id}`);
          continue;
        }
        
        // AUTO-DEDUCT: Subtract the missing stamps in one API call
        const comment = `Auto-audit: ${deficit} missed NanoFix maintenance deduction(s) for ${vehicle.vehicle_name || vehicle.plate_no}`;
        const result = await subtractStamp(card.id, deficit, comment);
        
        if (result) {
          // Success — log each booking as deducted
          const stampsPerBooking = Math.floor(deficit / vehicle.bookings.length);
          let remaining = deficit;
          
          for (const b of vehicle.bookings) {
            const stampsForThis = Math.min(stampsPerBooking || 1, remaining);
            remaining -= stampsForThis;
            await logAuditEntry(pool, {
              customer_id: b.customer_id, vehicle_id: b.vehicle_id,
              booking_id: b.booking_id, card_serial: card.id, card_category: category,
              action: 'deducted', stamps_deducted: stampsForThis,
              reason: `Deducted from card ${card.id} (total batch: ${deficit})`,
            });
            stats.deducted++;
          }
          stats.stampsTotal += deficit;
          log('stamp', `  Vehicle ${vehicle.vehicle_name} (${category}) — DEDUCTED ${deficit} stamp(s) from card ${card.id}`);
        } else {
          // API error during deduction
          for (const b of vehicle.bookings) {
            await logAuditEntry(pool, {
              customer_id: b.customer_id, vehicle_id: b.vehicle_id,
              booking_id: b.booking_id, card_serial: card.id, card_category: category,
              action: 'error', reason: `API error during subtract-stamp call`,
            });
            stats.errors++;
          }
          log('error', `  Vehicle ${vehicle.vehicle_name} (${category}) — FAILED to deduct from card ${card.id}`);
        }
      }
      
      // Progress log every 50 customers
      if (customerIndex % 50 === 0) {
        log('info', `Progress: ${customerIndex}/${customerMap.size} customers processed`);
      }
    }
    
  } catch (err) {
    log('error', `Fatal error: ${err.message}`);
    console.error(err);
  } finally {
    await pool.end();
  }
  
  // Summary
  log('info', '═══════════════════════════════════════════════════');
  log('info', 'AUDIT SUMMARY');
  log('info', `  Total bookings processed: ${stats.total}`);
  log('ok',   `  Deducted: ${stats.deducted} bookings (${stats.stampsTotal} total stamps)`);
  log('skip', `  Skipped: ${stats.skipped}`);
  log('error',`  Errors: ${stats.errors}`);
  log('info', `  Mode: ${DRY_RUN ? 'DRY RUN' : 'AUTO-DEDUCT'}`);
  log('info', `  Finished at ${now()}`);
  log('info', '═══════════════════════════════════════════════════');
}

// ─── Entry point ────────────────────────────────────────────────────────────

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
