#!/usr/bin/env node
/**
 * Backfill loyalty_cards from BoomerangMe API
 * 
 * Fetches ALL cards from BoomerangMe, checks which card_no values
 * are missing from the loyalty_cards table, matches customers by name,
 * finds a booking_id, and inserts the missing records.
 * 
 * Usage:
 *   node backfill-loyalty.js --dry-run    # preview only, no inserts
 *   node backfill-loyalty.js --execute    # actually insert records
 */

const mysql = require('mysql2/promise');
const axios = require('axios');

// Config
const DB_CONFIG = {
  host: 'localhost',
  user: 'unify_user',
  password: 'UnifyM@skpr0_2026!',
  database: 'unify_maskpro',
  charset: 'utf8mb4',
  typeCast: function (field, next) {
    if (field.type === 'VAR_STRING' || field.type === 'STRING' ||
        field.type === 'TINY_BLOB' || field.type === 'MEDIUM_BLOB' ||
        field.type === 'LONG_BLOB' || field.type === 'BLOB') {
      const val = field.buffer();
      return val ? val.toString('utf8') : null;
    }
    return next();
  },
};

const BOOMERANG_API = 'https://api.digitalwallet.cards/api/v2';
const BOOMERANG_KEY = '6f59f368388c29e4a01e704af6432d74';

// Template ID → card_type mapping (matches Unify's card_type format)
const TEMPLATE_CARD_TYPE = {
  41402:   'Nano Ceramic Coating',
  42605:   'Nano Ceramic Coating',
  43203:   'Nano Ceramic Coating',
  1006938: 'Nano Ceramic Coating',
  147644:  'Nano Ceramic Tint',
  318553:  'PPF Maintenance',
  302979:  'PPF Extended Warranty',
  40799:   'Care Wash',
  283699:  'Gift Card',
};

// Normalize name: strip accents, lowercase, collapse whitespace
function normalizeName(name) {
  return String(name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents (ñ→n, ü→u)
    .replace(/ñ/gi, 'n') // explicit ñ fallback
    .replace(/[.,]/g, '') // strip periods and commas
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

// Generate match candidates: original, without middle initial, first+last only
function nameVariants(name) {
  const n = normalizeName(name);
  const parts = n.split(' ').filter(Boolean);
  const variants = [n];
  // If 3+ words, try first + last (skip middle)
  if (parts.length >= 3) {
    variants.push(`${parts[0]} ${parts[parts.length - 1]}`);
    // Also try without single-letter middle initials
    const noMiddle = parts.filter((p, i) => i === 0 || i === parts.length - 1 || p.length > 2);
    variants.push(noMiddle.join(' '));
  }
  return [...new Set(variants)];
}

const DRY_RUN = process.argv.includes('--dry-run');
const EXECUTE = process.argv.includes('--execute');

if (!DRY_RUN && !EXECUTE) {
  console.log('Usage: node backfill-loyalty.js --dry-run | --execute');
  process.exit(1);
}

const apiClient = axios.create({
  baseURL: BOOMERANG_API,
  headers: { 'X-API-Key': BOOMERANG_KEY },
  timeout: 15000,
});

async function fetchAllCards() {
  const allCards = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    console.log(`  Fetching page ${page}/${totalPages}...`);
    try {
      const res = await apiClient.get('/cards', {
        params: { itemsPerPage: 100, page },
      });
      const data = res.data;
      totalPages = Math.ceil(data.meta.totalItems / data.meta.itemsPerPage);
      allCards.push(...(data.data || []));
      page++;
      // Rate limit: small delay between requests
      await new Promise(r => setTimeout(r, 150));
    } catch (err) {
      console.error(`  Error fetching page ${page}:`, err.message);
      // Retry once after 2s
      await new Promise(r => setTimeout(r, 2000));
      try {
        const res = await apiClient.get('/cards', { params: { itemsPerPage: 100, page } });
        allCards.push(...(res.data?.data || []));
        totalPages = Math.ceil(res.data.meta.totalItems / res.data.meta.itemsPerPage);
        page++;
      } catch (err2) {
        console.error(`  Failed again on page ${page}, skipping:`, err2.message);
        page++;
      }
    }
  }

  return allCards;
}

function extractName(card) {
  let fname = '', lname = '';
  for (const f of (card.customFields || [])) {
    if (f.type === 'FName') fname = (f.value || '').trim();
    if (f.type === 'SName') lname = (f.value || '').trim();
  }
  return `${fname} ${lname}`.trim();
}

async function main() {
  console.log(`\n=== BoomerangMe → loyalty_cards Backfill ===`);
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '⚡ EXECUTE (will insert)'}\n`);

  // Step 1: Fetch all cards from BoomerangMe
  console.log('[1/5] Fetching all cards from BoomerangMe API...');
  const allCards = await fetchAllCards();
  console.log(`  Total cards from API: ${allCards.length}\n`);

  // Step 2: Connect to DB and get existing card_no values
  console.log('[2/5] Connecting to MySQL and fetching existing card_no values...');
  const pool = await mysql.createPool(DB_CONFIG);
  
  const [existingRows] = await pool.query('SELECT card_no FROM loyalty_cards');
  const existingCardNos = new Set(existingRows.map(r => r.card_no));
  console.log(`  Existing loyalty_cards records: ${existingCardNos.size}\n`);

  // Step 3: Find missing cards
  console.log('[3/5] Identifying missing cards...');
  const missingCards = allCards.filter(c => !existingCardNos.has(c.id));
  console.log(`  Missing from loyalty_cards: ${missingCards.length}\n`);

  if (missingCards.length === 0) {
    console.log('✅ All BoomerangMe cards are already in loyalty_cards. Nothing to do!');
    await pool.end();
    return;
  }

  // Step 4: For each missing card, try to match to a customer and find booking_id
  console.log('[4/5] Matching missing cards to customers and bookings...');
  
  // Pre-load all customers for fast name matching
  const [allCustomers] = await pool.query('SELECT id, full_name FROM customers');
  // Build lookup maps: exact normalized name → customer id
  const customerByNorm = {};
  // Also build variant map for fuzzy matching
  const customerByVariant = {};
  for (const c of allCustomers) {
    if (c.full_name) {
      const norm = normalizeName(c.full_name);
      customerByNorm[norm] = c.id;
      for (const v of nameVariants(c.full_name)) {
        if (!customerByVariant[v]) customerByVariant[v] = c.id;
      }
    }
  }

  const toInsert = [];
  const unmatched = [];
  let matchedCount = 0;
  let noBookingCount = 0;

  for (const card of missingCards) {
    const cardName = extractName(card);
    const templateId = card.templateId;
    const cardType = TEMPLATE_CARD_TYPE[templateId] || null;

    // Try normalized exact match first
    let customerId = customerByNorm[normalizeName(cardName)] || null;

    // If no exact match, try variants (first+last, without middle initials)
    if (!customerId) {
      for (const variant of nameVariants(cardName)) {
        if (customerByNorm[variant]) {
          customerId = customerByNorm[variant];
          break;
        }
        if (customerByVariant[variant]) {
          customerId = customerByVariant[variant];
          break;
        }
      }
    }

    if (!customerId) {
      unmatched.push({ cardNo: card.id, name: cardName, templateId });
      continue;
    }

    matchedCount++;

    // Find the most recent booking for this customer
    const [bookings] = await pool.query(
      'SELECT booking_id FROM bookings WHERE customer_id = ? ORDER BY booking_date DESC LIMIT 1',
      [customerId]
    );

    let bookingId = null;
    if (bookings.length > 0) {
      bookingId = bookings[0].booking_id;
    } else {
      noBookingCount++;
      // Still insert, but with NULL booking_id — card exists, customer exists, just no booking yet
    }

    toInsert.push({
      booking_id: bookingId,
      card_no: card.id,
      card_type: cardType,
      created_date: card.createdAt ? new Date(card.createdAt) : null,
      expiration_date: card.expiresAt ? new Date(card.expiresAt) : null,
      card_install_link: card.installLink || null,
      joturl_shortlink: card.shareLink || null,
      joturl_qrlink: card.qrLink || null,
      // Metadata for log
      _customerName: cardName,
      _customerId: customerId,
    });
  }

  console.log(`  Matched: ${matchedCount}`);
  console.log(`  Matched but no booking: ${noBookingCount}`);
  console.log(`  Unmatched (no customer found): ${unmatched.length}\n`);

  // Show unmatched for review
  if (unmatched.length > 0) {
    console.log('--- Unmatched cards (top 20) ---');
    for (const u of unmatched.slice(0, 20)) {
      console.log(`  Card ${u.cardNo}: "${u.name}" (template ${u.templateId})`);
    }
    if (unmatched.length > 20) console.log(`  ... and ${unmatched.length - 20} more`);
    console.log('');
  }

  // Step 5: Insert
  console.log(`[5/5] ${DRY_RUN ? 'DRY RUN — would insert' : 'Inserting'} ${toInsert.length} records...\n`);

  if (DRY_RUN) {
    // Show first 10 for preview
    console.log('--- Preview (first 10) ---');
    for (const r of toInsert.slice(0, 10)) {
      console.log(`  ${r.card_no} | ${r.card_type || 'unknown'} | ${r._customerName} (customer ${r._customerId}) | booking ${r.booking_id || 'NULL'}`);
    }
    if (toInsert.length > 10) console.log(`  ... and ${toInsert.length - 10} more\n`);
  }

  if (EXECUTE && toInsert.length > 0) {
    let inserted = 0;
    let skipped = 0;
    let errors = 0;
    for (const r of toInsert) {
      try {
        // Belt-and-suspenders: check DB one more time before inserting
        const [exists] = await pool.query('SELECT lc_id FROM loyalty_cards WHERE card_no = ? LIMIT 1', [r.card_no]);
        if (exists.length > 0) {
          skipped++;
          continue;
        }
        await pool.query(
          `INSERT INTO loyalty_cards (booking_id, card_no, card_type, created_date, expiration_date, card_install_link, joturl_shortlink, joturl_qrlink)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [r.booking_id, r.card_no, r.card_type, r.created_date, r.expiration_date, r.card_install_link, r.joturl_shortlink, r.joturl_qrlink]
        );
        inserted++;
      } catch (err) {
        errors++;
        console.error(`  Error inserting card ${r.card_no}:`, err.message);
      }
    }
    console.log(`\n✅ Inserted: ${inserted} | Skipped (already exists): ${skipped} | Errors: ${errors}`);
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`  Total BoomerangMe cards: ${allCards.length}`);
  console.log(`  Already in loyalty_cards: ${existingCardNos.size}`);
  console.log(`  Missing: ${missingCards.length}`);
  console.log(`  Matched to customers: ${matchedCount}`);
  console.log(`  Unmatched: ${unmatched.length}`);
  console.log(`  ${DRY_RUN ? 'Would insert' : 'Inserted'}: ${toInsert.length}`);

  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
