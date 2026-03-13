/**
 * Loyalty Routes — BoomerangMe card integration
 * 
 * Flow:
 *   1. Query loyalty_cards via bookings JOIN to get card_no(s) for the customer  
 *   2. Call BoomerangMe API GET /cards/{card_no} for each card to get balance
 *   3. Return combined data to frontend
 *
 * GET /api/loyalty/cards  — Get customer's loyalty cards
 */

const express = require('express');
const router = express.Router();

const pool = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');
const { getCardById, formatCard } = require('../services/boomerangme');

// ─── GET /api/loyalty/cards ───────────────────────────────────────
router.get('/cards', authenticateToken, async (req, res) => {
  try {
    const customerId = req.user.customer_id;
    console.log('[Loyalty] Fetching cards for customer_id:', customerId);

    // Step 1: Get card numbers from Unify's loyalty_cards table via bookings
    const [dbCards] = await pool.query(`
      SELECT 
        lc.lc_id,
        lc.card_no,
        lc.created_date,
        lc.expiration_date,
        lc.card_install_link,
        lc.joturl_shortlink,
        lc.joturl_qrlink,
        lc.booking_id
      FROM loyalty_cards lc
      JOIN bookings b ON lc.booking_id = b.booking_id
      WHERE b.customer_id = ?
      ORDER BY lc.created_date DESC
    `, [customerId]);

    console.log('[Loyalty] Found', dbCards.length, 'card(s) in database for customer', customerId);

    if (dbCards.length === 0) {
      return res.json({
        success: true,
        data: { cards: [], grouped: {}, total: 0 },
        message: 'No loyalty cards found for your account',
        errors: []
      });
    }

    // Step 2: Fetch live balance/details from BoomerangMe API for each card
    const cards = [];
    for (const dbCard of dbCards) {
      try {
        console.log('[Loyalty] Fetching BoomerangMe data for card:', dbCard.card_no);
        const apiCard = await getCardById(dbCard.card_no);

        if (apiCard) {
          // Merge DB data with API data, format for frontend
          const formatted = formatCard(apiCard);
          // Override with DB data where available (DB is source of truth for expiry etc.)
          formatted.dbId = dbCard.lc_id;
          formatted.installLink = dbCard.card_install_link || formatted.installLink;
          formatted.shortLink = dbCard.joturl_shortlink || null;
          formatted.qrLink = dbCard.joturl_qrlink || formatted.qrLink;
          cards.push(formatted);
        } else {
          // API returned nothing — show card from DB data only (fallback)
          console.log('[Loyalty] BoomerangMe API returned null for card:', dbCard.card_no);
          cards.push({
            id: dbCard.card_no,
            templateId: null,
            service: 'MaskPro',
            tier: 'Care Card',
            category: 'other',
            icon: '🎫',
            color: '#3b82f6',
            type: 'subscription',
            status: 'unknown',
            visitsUsed: 0,
            stampsTotal: null,
            stampsBeforeReward: null,
            rewardsUnused: 0,
            cashbackBalance: 0,
            discountPercent: null,
            bonusBalance: 0,
            expiresAt: dbCard.expiration_date || null,
            createdAt: dbCard.created_date || null,
            installLink: dbCard.card_install_link || null,
            shortLink: dbCard.joturl_shortlink || null,
            qrLink: dbCard.joturl_qrlink || null,
            vehicle: null,
            branch: null,
            customerName: null,
            dbId: dbCard.lc_id,
          });
        }
      } catch (cardErr) {
        console.error('[Loyalty] Error fetching card', dbCard.card_no, ':', cardErr.message);
        // Still include the card from DB data
        cards.push({
          id: dbCard.card_no,
          templateId: null,
          service: 'MaskPro',
          tier: 'Care Card',
          category: 'other',
          icon: '🎫',
          color: '#3b82f6',
          type: 'subscription',
          status: 'error',
          visitsUsed: 0,
          expiresAt: dbCard.expiration_date || null,
          createdAt: dbCard.created_date || null,
          installLink: dbCard.card_install_link || null,
          shortLink: dbCard.joturl_shortlink || null,
          dbId: dbCard.lc_id,
        });
      }
    }

    console.log('[Loyalty] Total cards formatted:', cards.length);

    // Group by category for organized display
    const grouped = {};
    cards.forEach(card => {
      const cat = card.category || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(card);
    });

    return res.json({
      success: true,
      data: {
        cards,
        grouped,
        total: cards.length,
      },
      message: `Found ${cards.length} loyalty card(s)`,
      errors: []
    });
  } catch (err) {
    console.error('Loyalty cards error:', err.message, err.stack);
    return res.status(500).json({
      success: false, data: null,
      message: 'Failed to fetch loyalty cards', errors: [err.message]
    });
  }
});

module.exports = router;
