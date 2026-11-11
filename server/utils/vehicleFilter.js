/**
 * Vehicle & Booking Eligibility Filter for 6-Month NanoFix Maintenance Reminders
 *
 * Strictly excludes non-motorized items and small accessories:
 *  1. Standalone Helmets (Arai, Shoei, AGV, HJC, Nomad, LS2, Spyder, KYT, Bell, Nolan, Schuberth, Gille, HNJ, Zebra, Helmet, RPHA, Visor)
 *     when coating price < ₱4,500 (preserves >= ₱5,000 motorized big bike + bundled helmet packages).
 *  2. Mechanical Bicycles — Mountain Bikes (MTB), Road Bikes, Gravel/Triathlon/Folding Bikes
 *     (Trek, Colnago, Cervelo, Cannondale, Giant, Specialized, S-Works, Santa Cruz, Pinarello, Bianchi,
 *      Merida, Trinx, Brompton, Polygon, Factor, Scott, Orbea, Canyon, BMC, Wilier, De Rosa, Felt, Fuji,
 *      Marin, Norco, Pivot, Yeti, Surly, Madone, V5Rs, Super Six, Propel, MTB, Road Bike, Bicycle).
 *  3. Small Non-Motorized Items & Loose Accessories (Rimowa Bag, Pickleball Paddle, Fender Flare,
 *     Orion Headlights, SUV Mags, Luggage, Stroller, Skateboard, Surfboard, Laptop, Phone, Sunglasses).
 *  4. Partial / Accessory-Only Bookings on a Vehicle (notes matching "Helmet only", "Mags only",
 *     "Rims only", "Tank only", "Dashboard only", "Headlights only", "Bike only", "Paddle only" with price <= ₱4,000).
 *
 * Strictly PRESERVES:
 *  - All 4-wheel vehicles (Cars, SUVs, Pickups, Vans, MPVs, Trucks, EVs — including BYD Shark 6, Hyundai Kona, Subaru Evoltis, Hilux Revo, MG GT, etc.)
 *  - All motorized 2-wheelers & 3-wheelers (Big Bikes, Motorcycles, Scooters — Ducati, Harley-Davidson,
 *    Kawasaki ZX-25R/ZX-6R/Ninja/Z900, BMW Motorrad R1250/GSA 1300/R18/C400GT, Yamaha NMAX/XMAX/Aerox/Fazzio/Mio/MT-15/R3/XSR,
 *    Honda ADV 160/350/PCX/CBR/Goldwing/XR200, Vespa Primavera/Sprint/GTS, Suzuki Katana/Burgman/Raider,
 *    Triumph Bonneville, Royal Enfield, CFMoto, KTM, Bristol, QJ Motors, Kymco, Can-Am, Italjet, Keeway).
 */

const HELMET_MAKES = new Set([
  'helmet', 'hjc', 'agv', 'arai', 'shoei', 'nomad', 'ls2', 'spyder',
  'kyt', 'bell', 'nolan', 'schuberth', 'gille', 'hnj', 'zebra',
]);

const MECHANICAL_BIKE_MAKES = new Set([
  'bike', 'bicycle', 'mtb', 'road bike', 'roadbike',
  'trek', 'colnago', 'cervelo', 'cannondale', 'giant', 'specialized', 's-works', 'sworks',
  'santa cruz', 'pinarello', 'bianchi', 'merida', 'trinx', 'brompton', 'polygon', 'factor',
  'scott', 'orbea', 'canyon', 'bmc', 'wilier', 'de rosa', 'felt', 'fuji', 'marin', 'norco',
  'pivot', 'yeti', 'surly',
]);

const SMALL_ITEM_MAKES = new Set([
  'rimowa', 'pickleball', 'fender', 'orion',
]);

const HELMET_TEXT_RE = /(?:^|[^a-z])(helmet|rpha|visor)(?:[^a-z]|$)/i;
const MECHANICAL_BIKE_TEXT_RE = /(?:^|[^a-z])(mtb|mountain bike|road bike|roadbike|bicycle|bike frame|gravel bike|folding bike|madone|v5rs|super six|propel|cervelo|colnago|cannondale)(?:[^a-z]|$)/i;
const SMALL_ITEM_TEXT_RE = /(?:^|[^a-z])(rimowa|luggage|suitcase|pickleball|paddle|padle|racket|fender flare|headlights|suv mags|mags only|rims only|stroller|skateboard|surfboard|laptop|macbook|iphone|ipad|sunglasses)(?:[^a-z]|$)/i;
const PARTIAL_ACCESSORY_NOTES_RE = /(?:^|[^a-z])(helmet only|mags only|mags coating only|rims only|rims - coating only|tank only|dashboard only|bike only|paddle only|headlights only|2 headlights only)(?:[^a-z]|$)/i;

/**
 * Check in JS whether a vehicle or booking record is a non-motorized item
 * (helmet, mountain/road bicycle, bag, paddle, or loose-part-only booking).
 */
function isNonMotorizedOrSmallItem({ make = '', model = '', bookingNotes = '', price = null } = {}) {
  const cleanMake = String(make || '').trim().toLowerCase();
  const cleanModel = String(model || '').trim().toLowerCase();
  const combinedVehicle = `${cleanMake} ${cleanModel}`.trim();
  const cleanNotes = String(bookingNotes || '').trim().toLowerCase();
  const numericPrice = price !== null && price !== undefined && price !== '' ? Number(price) : 0;

  // 1. Standalone Helmet (when price is not a >= ₱4,500 motorcycle + helmet bundle)
  if ((HELMET_MAKES.has(cleanMake) || HELMET_TEXT_RE.test(combinedVehicle)) && (Number.isNaN(numericPrice) || numericPrice < 4500)) {
    return true;
  }

  // 2. Mechanical Bicycles (Mountain Bike / Road Bike / Triathlon / Folding Bike)
  if (MECHANICAL_BIKE_MAKES.has(cleanMake) || MECHANICAL_BIKE_TEXT_RE.test(combinedVehicle)) {
    return true;
  }

  // 3. Small Non-Motorized Items & Loose Accessories
  if (SMALL_ITEM_MAKES.has(cleanMake) || SMALL_ITEM_TEXT_RE.test(combinedVehicle)) {
    return true;
  }

  // 4. Partial / Accessory-Only Booking on a Vehicle (e.g. "Helmet only", "Mags only", "Rims only", "Tank only", "Dashboard only" <= ₱4,000)
  if (cleanNotes && PARTIAL_ACCESSORY_NOTES_RE.test(cleanNotes) && (Number.isNaN(numericPrice) || numericPrice <= 4000)) {
    return true;
  }

  return false;
}

/**
 * Returns a SQL boolean expression that evaluates to TRUE when a vehicle/booking
 * IS eligible (i.e., NOT a helmet, mechanical bicycle, or small non-motorized item).
 *
 * @param {string} vAlias - Alias for `vehicles` table (e.g. 'v')
 * @param {string|null} bAlias - Optional alias for `bookings` table (e.g. 'b')
 * @param {string|null} sAlias - Optional alias for `bookings_service_types` table (e.g. 's' or 'bst')
 */
function getMotorizedVehicleEligibilitySql(vAlias = 'v', bAlias = null, sAlias = null) {
  const priceExpr = sAlias ? `COALESCE(CAST(${sAlias}.price AS DECIMAL(10,2)), 0)` : '0';

  const clauses = [
    `(
      (
        LOWER(TRIM(COALESCE(${vAlias}.make, ''))) IN ('helmet', 'hjc', 'agv', 'arai', 'shoei', 'nomad', 'ls2', 'spyder', 'kyt', 'bell', 'nolan', 'schuberth', 'gille', 'hnj', 'zebra')
        OR LOWER(CONCAT_WS(' ', ${vAlias}.make, ${vAlias}.model)) REGEXP '(^|[^a-z])(helmet|rpha|visor)([^a-z]|$)'
      )
      ${sAlias ? `AND ${priceExpr} < 4500` : ''}
    )`,
    `LOWER(TRIM(COALESCE(${vAlias}.make, ''))) IN (
      'bike', 'bicycle', 'mtb', 'road bike', 'roadbike',
      'trek', 'colnago', 'cervelo', 'cannondale', 'giant', 'specialized', 's-works', 'sworks',
      'santa cruz', 'pinarello', 'bianchi', 'merida', 'trinx', 'brompton', 'polygon', 'factor',
      'scott', 'orbea', 'canyon', 'bmc', 'wilier', 'de rosa', 'felt', 'fuji', 'marin', 'norco', 'pivot', 'yeti', 'surly'
    )`,
    `LOWER(CONCAT_WS(' ', ${vAlias}.make, ${vAlias}.model)) REGEXP '(^|[^a-z])(mtb|mountain bike|road bike|roadbike|bicycle|bike frame|gravel bike|folding bike|madone|v5rs|super six|propel|cervelo|colnago|cannondale)([^a-z]|$)'`,
    `LOWER(TRIM(COALESCE(${vAlias}.make, ''))) IN ('rimowa', 'pickleball', 'fender', 'orion')`,
    `LOWER(CONCAT_WS(' ', ${vAlias}.make, ${vAlias}.model)) REGEXP '(^|[^a-z])(rimowa|luggage|suitcase|pickleball|paddle|padle|racket|fender flare|headlights|suv mags|mags only|rims only|stroller|skateboard|surfboard|laptop|macbook|iphone|ipad|sunglasses)([^a-z]|$)'`,
  ];

  if (bAlias) {
    clauses.push(`(
      LOWER(COALESCE(${bAlias}.notes, '')) REGEXP '(^|[^a-z])(helmet only|mags only|mags coating only|rims only|rims - coating only|tank only|dashboard only|bike only|paddle only|headlights only|2 headlights only)([^a-z]|$)'
      ${sAlias ? `AND ${priceExpr} <= 4000` : ''}
    )`);
  }

  return `NOT (${clauses.join(' OR ')})`;
}

module.exports = {
  isNonMotorizedOrSmallItem,
  getMotorizedVehicleEligibilitySql,
};
