/**
 * Loyalty Routes — BoomerangMe card integration
 *
 * GET /api/loyalty/cards  — Get customer's loyalty cards (by phone from JWT)
 */

const express = require('express');
const router = express.Router();

const pool = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');
const { getCardsByPhone, getCardsByEmail, formatCard } = require('../services/boomerangme');

// ─── GET /api/loyalty/cards ───────────────────────────────────────
router.get('/cards', authenticateToken, async (req, res) => {
  try {
    const customerId = req.user.customer_id;
    console.log('[Loyalty] Fetching cards for customer_id:', customerId);

    // Get customer's mobile from DB
    const [customers] = await pool.query(
      'SELECT mobile_number, email, full_name FROM customers WHERE id = ?',
      [customerId]
    );

    if (customers.length === 0) {
      return res.status(404).json({
        success: false, data: null,
        message: 'Customer not found', errors: []
      });
    }

    const customer = customers[0];
    const mobile = customer.mobile_number;
    console.log('[Loyalty] Customer:', customer.full_name, '| Phone:', mobile, '| Email:', customer.email);

    // Try phone lookup (multiple PH formats)
    // BoomerangMe stores PH phones as 63XXXXXXXXX (no leading 0, no +)
    let cards = [];
    if (mobile) {
      const digits = mobile.replace(/\D/g, '');
      const last10 = digits.slice(-10);

      // Try +63 format first (most common in BoomerangMe)
      cards = await getCardsByPhone('+63' + last10);
      console.log('[Loyalty] +63 format result:', cards.length, 'cards');

      // If no results, try original format (09XXXXXXXXX)
      if (cards.length === 0) {
        cards = await getCardsByPhone(mobile);
        console.log('[Loyalty] Original format result:', cards.length, 'cards');
      }

      // If still no results, try just the 63XXXXXXXXX format (no +)
      if (cards.length === 0) {
        cards = await getCardsByPhone('63' + last10);
        console.log('[Loyalty] 63 format result:', cards.length, 'cards');
      }
    }

    // If still no results and customer has email, try email lookup
    if (cards.length === 0 && customer.email) {
      cards = await getCardsByEmail(customer.email);
      console.log('[Loyalty] Email lookup result:', cards.length, 'cards');
    }

    console.log('[Loyalty] Total cards found:', cards.length);

    // Format cards for frontend
    const formattedCards = cards.map(formatCard);

    // Group by category for organized display
    const grouped = {};
    formattedCards.forEach(card => {
      if (!grouped[card.category]) grouped[card.category] = [];
      grouped[card.category].push(card);
    });

    return res.json({
      success: true,
      data: {
        cards: formattedCards,
        grouped,
        total: formattedCards.length,
      },
      message: formattedCards.length > 0
        ? `Found ${formattedCards.length} loyalty card(s)`
        : 'No loyalty cards found for your account',
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
