#!/usr/bin/env node
/**
 * MaskPro Care — Revert Stamp Deductions
 * 
 * Reverses ALL stamp deductions made by the stamp-audit cron job.
 * The cron had a bug: it used getCardOperations() which returned empty,
 * causing it to assume 0 prior deductions and re-deduct ALL maintenance visits.
 * This double-counted stamps for cards where front desk had already deducted.
 * 
 * Strategy: For each card in care_stamp_audit_log where action='deducted',
 * call BoomerangMe API `add-visit` to restore the stamps.
 * 
 * Usage:
 *   node server/scripts/revert-stamp-deductions.js --dry-run    (report only)
 *   node server/scripts/revert-stamp-deductions.js --execute     (actually revert)
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const mysql = require('mysql2/promise');
const axios = require('axios');

// ─── Configuration ──────────────────────────────────────────────────────────

const DRY_RUN = !process.argv.includes('--execute');

const BOOMERANGME_API_BASE = 'https://api.digitalwallet.cards/api/v2';
const BOOMERANGME_API_KEY = process.env.BOOMERANGME_API_KEY || '';

const REQUESTS_PER_SECOND = 8;
const MAX_RETRIES = 3;

const now = () => new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ─── Rate-limited API client ────────────────────────────────────────────────

const apiClient = axios.create({
  baseURL: BOOMERANGME_API_BASE,
  headers: { 'X-API-Key': BOOMERANGME_API_KEY },
  timeout: 15000,
});

let requestsThisSecond = 0;
let lastResetTime = Date.now();

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
        console.log(`⚠️  Rate limited, retry ${attempt}/${MAX_RETRIES} in ${2000*attempt}ms`);
        await sleep(2000 * attempt);
        requestsThisSecond = 0; lastResetTime = Date.now();
        continue;
      }
      throw err;
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log(`🔄 Revert Stamp Deductions ${DRY_RUN ? '(DRY RUN)' : '⚠️  EXECUTE MODE'}`);
  console.log(`Started at ${now()}`);
  console.log('═══════════════════════════════════════════════════');

  if (!BOOMERANGME_API_KEY) { console.error('❌ BOOMERANGME_API_KEY not set'); process.exit(1); }

  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'omnimpdb',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    waitForConnections: true, connectionLimit: 5,
    timezone: '+08:00', charset: 'utf8mb4',
  });

  try {
    // Step 1: Get all deducted entries grouped by card_serial
    const [rows] = await pool.query(`
      SELECT card_serial, SUM(stamps_deducted) as total_stamps, COUNT(*) as entry_count
      FROM care_stamp_audit_log
      WHERE action = 'deducted' AND stamps_deducted > 0
      GROUP BY card_serial
      ORDER BY total_stamps DESC
    `);

    console.log(`\n📊 Found ${rows.length} unique cards with deductions to revert`);
    const totalStamps = rows.reduce((sum, r) => sum + r.total_stamps, 0);
    console.log(`📊 Total stamps to restore: ${totalStamps}`);

    if (rows.length === 0) {
      console.log('✅ Nothing to revert');
      await pool.end();
      return;
    }

    const stats = { restored: 0, failed: 0, totalStamps: 0 };

    // Step 2: For each card, call add-visit to restore stamps
    for (let i = 0; i < rows.length; i++) {
      const { card_serial, total_stamps, entry_count } = rows[i];

      if (DRY_RUN) {
        console.log(`[${i+1}/${rows.length}] ${card_serial} — would restore ${total_stamps} stamp(s) (${entry_count} entries)`);
        stats.restored++;
        stats.totalStamps += total_stamps;
        continue;
      }

      try {
        const comment = `Revert: restoring ${total_stamps} stamp(s) wrongly deducted by stamp-audit cron`;
        const resp = await throttledApiCall(() =>
          apiClient.post(`/cards/${card_serial}/add-visit`, {
            visits: total_stamps,
            comment: comment,
          })
        );

        if (resp.status === 200 || resp.data) {
          console.log(`✅ [${i+1}/${rows.length}] ${card_serial} — restored ${total_stamps} stamp(s)`);
          stats.restored++;
          stats.totalStamps += total_stamps;
        } else {
          console.log(`❌ [${i+1}/${rows.length}] ${card_serial} — unexpected response: ${resp.status}`);
          stats.failed++;
        }
      } catch (err) {
        const errMsg = err.response?.data?.message || err.response?.data || err.message;
        console.log(`❌ [${i+1}/${rows.length}] ${card_serial} — FAILED: ${JSON.stringify(errMsg)}`);
        stats.failed++;
      }

      // Progress log
      if ((i + 1) % 100 === 0) {
        console.log(`📊 Progress: ${i+1}/${rows.length} cards processed`);
      }
    }

    // Step 3: If executed, mark audit log entries as reverted
    if (!DRY_RUN && stats.restored > 0) {
      await pool.query(`
        UPDATE care_stamp_audit_log 
        SET reason = CONCAT('[REVERTED] ', IFNULL(reason, ''))
        WHERE action = 'deducted' AND stamps_deducted > 0
          AND reason NOT LIKE '[REVERTED]%'
      `);
      console.log(`\n📝 Marked all deducted audit log entries as [REVERTED]`);
    }

    console.log('\n═══════════════════════════════════════════════════');
    console.log('REVERT SUMMARY');
    console.log(`  Cards restored: ${stats.restored} / ${rows.length}`);
    console.log(`  Stamps restored: ${stats.totalStamps}`);
    console.log(`  Failed: ${stats.failed}`);
    console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'EXECUTE'}`);
    console.log(`  Finished at ${now()}`);
    console.log('═══════════════════════════════════════════════════');

  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    console.error(err);
  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error('Unhandled:', err); process.exit(1); });
