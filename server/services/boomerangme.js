/**
 * BoomerangMe API Service
 * Digital loyalty card integration via api.digitalwallet.cards v2
 */

const axios = require('axios');

const API_BASE = 'https://api.digitalwallet.cards/api/v2';
const API_KEY = process.env.BOOMERANGME_API_KEY || '';

// Template ID → card metadata mapping
// defaultTotal = the original number of visits/credits the card starts with
const TEMPLATE_MAP = {
  41402:  { service: 'Nano Ceramic Coating', tier: 'Silver Package',       category: 'coating', icon: '🛡️', color: '#94a3b8', defaultTotal: 10 },
  42605:  { service: 'Nano Ceramic Coating', tier: 'Gold Package',         category: 'coating', icon: '🛡️', color: '#d97706', defaultTotal: 14 },
  43203:  { service: 'Nano Ceramic Coating', tier: 'Diamond Package',      category: 'coating', icon: '🛡️', color: '#6366f1', defaultTotal: 24 },
  1006938:{ service: 'Nano Ceramic Coating', tier: 'Diamond (No Exp)',     category: 'coating', icon: '🛡️', color: '#6366f1', defaultTotal: 24 },
  147644: { service: 'Nano Ceramic Tint',    tier: 'Loyalty Card',         category: 'tint',    icon: '🪟', color: '#0ea5e9', defaultTotal: 0 },
  318553: { service: 'PPF',                  tier: 'Maintenance Membership', category: 'ppf',   icon: '🔥', color: '#ef4444', defaultTotal: 24 },
  302979: { service: 'PPF',                  tier: 'Extended Warranty',    category: 'ppf',     icon: '🔥', color: '#f97316', defaultTotal: 4 },
  40799:  { service: 'Care Wash',            tier: 'Prepaid Card',         category: 'wash',    icon: '⭐', color: '#10b981', defaultTotal: 0 },
  283699: { service: 'MaskPro',              tier: 'Gift Card',            category: 'gift',    icon: '🎁', color: '#8b5cf6', defaultTotal: 0 },
};

const apiClient = axios.create({
  baseURL: API_BASE,
  headers: { 'X-API-Key': API_KEY },
  timeout: 10000,
});

/**
 * Get all loyalty cards for a customer by phone number
 * Returns cards across all templates
 */
async function getCardsByPhone(phone) {
  if (!API_KEY) throw new Error('BOOMERANGME_API_KEY not configured');

  // Normalize phone: strip +63 prefix, ensure 09xx format for PH
  let searchPhone = String(phone).trim();

  try {
    const response = await apiClient.get('/cards', {
      params: {
        customerPhone: searchPhone,
        itemsPerPage: 100,
      },
    });
    return response.data?.data || [];
  } catch (err) {
    console.error('BoomerangMe getCardsByPhone error:', err.response?.data || err.message);
    return [];
  }
}

/**
 * Get card details by serial number (e.g., "939829-317-169")
 */
async function getCardById(cardId) {
  if (!API_KEY) throw new Error('BOOMERANGME_API_KEY not configured');

  try {
    const response = await apiClient.get(`/cards/${cardId}`);
    return response.data?.data || null;
  } catch (err) {
    console.error('BoomerangMe getCardById error:', err.response?.data || err.message);
    return null;
  }
}

/**
 * Search cards by customer email 
 * (some BoomerangMe customers have no phone — lookup by email instead)
 */
async function getCardsByEmail(email) {
  if (!API_KEY) throw new Error('BOOMERANGME_API_KEY not configured');

  try {
    const response = await apiClient.get('/cards', {
      params: {
        customerEmail: email,
        itemsPerPage: 100,
      },
    });
    return response.data?.data || [];
  } catch (err) {
    console.error('BoomerangMe getCardsByEmail error:', err.response?.data || err.message);
    return [];
  }
}

/**
 * Get template metadata from our map
 */
function getTemplateInfo(templateId) {
  return TEMPLATE_MAP[templateId] || {
    service: 'MaskPro', tier: 'Loyalty Card', category: 'other', icon: '🎫', color: '#3b82f6'
  };
}

/**
 * Format a raw BoomerangMe card into a clean object for the frontend
 */
function formatCard(card) {
  const meta = getTemplateInfo(card.templateId);
  const balance = card.balance || {};

  // Extract customer info from custom fields
  const customFields = {};
  (card.customFields || []).forEach(f => {
    if (f.type === 'FName') customFields.firstName = f.value;
    if (f.type === 'SName') customFields.lastName = f.value;
    if (f.name?.toLowerCase().includes('vehicle') || f.name?.toLowerCase().includes('plate') || f.name?.toLowerCase().includes('vmm')) {
      customFields.vehicle = f.value;
    }
    if (f.name?.toLowerCase().includes('branch')) customFields.branch = f.value;
  });

  // currentNumberOfUses = REMAINING visits on BoomerangMe
  // IMPORTANT: For uninitialized cards, currentNumberOfUses is 0 because visits
  // were never added (not because all were consumed). We detect this by checking
  // if numberStampsTotal is null — BoomerangMe sets this once visits are added.
  const remaining = balance.currentNumberOfUses || 0;
  const totalDefault = meta.defaultTotal || 0;
  const stampsTotal = balance.numberStampsTotal;
  
  // Detect uninitialized cards: balance is 0 AND BoomerangMe never tracked stamps
  const isUninitialized = remaining === 0 && stampsTotal === null && totalDefault > 0;
  
  // If remaining > default total, card may have had extra visits added — use remaining as total
  const total = totalDefault > 0 ? Math.max(totalDefault, remaining) : remaining;
  // Uninitialized cards: show 0 used (not "all used")
  const used = isUninitialized ? 0 : (total > 0 ? Math.max(0, total - remaining) : 0);

  return {
    id: card.id,
    templateId: card.templateId,
    service: meta.service,
    tier: meta.tier,
    category: meta.category,
    icon: meta.icon,
    color: meta.color,
    type: card.type,
    status: card.status,
    // Balance / progress
    visitsRemaining: remaining,
    visitsUsed: used,
    visitsTotal: total,
    stampsTotal: balance.numberStampsTotal || total || null,
    stampsBeforeReward: balance.stampsBeforeReward || null,
    rewardsUnused: balance.numberRewardsUnused || 0,
    cashbackBalance: balance.balance || 0,
    discountPercent: balance.discountPercentage || null,
    bonusBalance: balance.bonusBalance || 0,
    // Dates
    expiresAt: card.expiresAt || null,
    createdAt: card.createdAt || null,
    // Links
    installLink: card.installLink || null,
    shareLink: card.shareLink || null,
    qrLink: card.qrLink || null,
    // Custom fields
    vehicle: customFields.vehicle || null,
    branch: customFields.branch || null,
    customerName: [customFields.firstName, customFields.lastName].filter(Boolean).join(' ') || null,
  };
}

module.exports = {
  getCardsByPhone,
  getCardsByEmail,
  getCardById,
  getTemplateInfo,
  formatCard,
  TEMPLATE_MAP,
};
