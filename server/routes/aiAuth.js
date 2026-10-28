/**
 * AI Helper Login Routes — Conversational Identity Verification
 * 
 * Verifies identity through 5 key identifiers:
 * 1. Full Name (with elderly-friendly spelling/phonetic tolerance) [25 pts]
 * 2. Booking Month (first booking visit month) [25 pts]
 * 3. Booked Service (service acquired) [20 pts]
 * 4. Vehicle Make & Model (priority on Model) [15 pts]
 * 5. Registered Mobile Number [15 pts]
 * 
 * Passing Score: >= 90%
 * Anti-Fishing: Monitors IP, device, and multiple name attempts; auto-blocks suspicious IPs.
 */

const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const router = express.Router();

const pool = require('../db/connection');
const { JWT_SECRET } = require('../middleware/auth');
const { getLast10, standardizeMobile } = require('../utils/mobile');

const JWT_EXPIRY = parseInt(process.env.JWT_EXPIRY, 10) || 86400;

// Helper: Extract real client IP behind reverse proxies (Nginx)
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] || req.socket.remoteAddress || '127.0.0.1';
}

// Helper: Parse device/platform summary from User-Agent
function parseDeviceInfo(userAgent = '') {
  const ua = userAgent.toLowerCase();
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) return 'Apple iOS';
  if (ua.includes('android')) return 'Android Mobile';
  if (ua.includes('macintosh') || ua.includes('mac os')) return 'macOS';
  if (ua.includes('windows')) return 'Windows PC';
  if (ua.includes('linux')) return 'Linux';
  return 'Web Client';
}

// Levenshtein Distance for typo tolerance
function levenshteinDistance(s1, s2) {
  const a = (s1 || '').toLowerCase().trim();
  const b = (s2 || '').toLowerCase().trim();
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function calculateStringSimilarity(s1, s2) {
  if (!s1 || !s2) return 0;
  const a = s1.toLowerCase().trim();
  const b = s2.toLowerCase().trim();
  if (a === b) return 1.0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(a, b);
  return Math.max(0, 1 - dist / maxLen);
}

// Identifier 1: Full Name Evaluator (Max 25 pts)
function evaluateNameScore(claimedName, actualName) {
  if (!claimedName || !actualName) return 0;
  const cleanClaimed = claimedName.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const cleanActual = actualName.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

  if (cleanClaimed === cleanActual) return 25.0;

  const claimedTokens = cleanClaimed.split(/\s+/).filter(Boolean);
  const actualTokens = cleanActual.split(/\s+/).filter(Boolean);
  let tokenMatches = 0;
  for (const ct of claimedTokens) {
    if (actualTokens.some(at => at === ct || calculateStringSimilarity(at, ct) >= 0.8)) {
      tokenMatches++;
    }
  }
  const tokenRatio = tokenMatches / Math.max(claimedTokens.length, actualTokens.length);
  const directSim = calculateStringSimilarity(cleanClaimed, cleanActual);
  const bestSim = Math.max(tokenRatio, directSim);

  // Generous threshold for elderly users: small spelling discrepancy accepted
  if (bestSim >= 0.80) return 24.0; // 96%
  if (bestSim >= 0.65) return 21.0; // 84%
  if (bestSim >= 0.50) return 15.0; // partial
  return 0;
}

// Identifier 2: Booking Month Evaluator (Max 25 pts)
const MONTH_MAP = {
  'january': 1, 'jan': 1, '1': 1, '01': 1,
  'february': 2, 'feb': 2, '2': 2, '02': 2,
  'march': 3, 'mar': 3, '3': 3, '03': 3,
  'april': 4, 'apr': 4, '4': 4, '04': 4,
  'may': 5, '5': 5, '05': 5,
  'june': 6, 'jun': 6, '6': 6, '06': 6,
  'july': 7, 'jul': 7, '7': 7, '07': 7,
  'august': 8, 'aug': 8, '8': 8, '08': 8,
  'september': 9, 'sep': 9, 'sept': 9, '9': 9, '09': 9,
  'october': 10, 'oct': 10, '10': 10,
  'november': 11, 'nov': 11, '11': 11,
  'december': 12, 'dec': 12, '12': 12,
};

function parseMonthFromText(text) {
  if (!text) return null;
  const lower = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
  const words = lower.split(/\s+/).filter(Boolean);
  let matchedMonth = null;
  let matchedYear = null;

  for (const word of words) {
    if (MONTH_MAP[word]) {
      matchedMonth = MONTH_MAP[word];
    }
    const yr = parseInt(word, 10);
    if (yr >= 2018 && yr <= 2035) {
      matchedYear = yr;
    }
  }
  return matchedMonth ? { month: matchedMonth, year: matchedYear } : null;
}

function evaluateMonthScore(inputMonthText, bookingDate) {
  if (!inputMonthText || !bookingDate) return 0;
  const parsedInput = parseMonthFromText(inputMonthText);
  if (!parsedInput) return 0;

  const bDate = new Date(bookingDate);
  const actualMonth = bDate.getMonth() + 1;
  const actualYear = bDate.getFullYear();

  if (parsedInput.month === actualMonth) {
    if (parsedInput.year) {
      return parsedInput.year === actualYear ? 25.0 : 20.0;
    }
    return 24.0; // Month matched without year
  }
  return 0;
}

// Identifier 3: Booked Service Evaluator (Max 20 pts)
function evaluateServiceScore(inputService, actualServices) {
  if (!inputService || !actualServices || actualServices.length === 0) return 0;
  const input = inputService.toLowerCase();

  const serviceKeywords = [
    { aliases: ['nanofix', 'nano fix', 'maintenance', 'fix', 'maintain'] },
    { aliases: ['ceramic coating', 'ceramic', 'coating', 'nano ceramic'] },
    { aliases: ['tint', 'window tint', 'ceramic tint', 'titanium', 'film'] },
    { aliases: ['graphene', 'graphene coating'] },
    { aliases: ['paint', 'auto paint', 'repair', 'body repair'] },
    { aliases: ['ppf', 'paint protection film', 'protection film'] },
    { aliases: ['clean', 'go and clean', 'go & clean', 'carwash', 'wash', 'detailing'] },
  ];

  const actualNames = actualServices.map(s => (s.service_name || s.name || '').toLowerCase()).join(' ');

  for (const group of serviceKeywords) {
    const userMentions = group.aliases.some(alias => input.includes(alias));
    const actualHas = group.aliases.some(alias => actualNames.includes(alias));
    if (userMentions && actualHas) {
      return 20.0;
    }
  }

  for (const s of actualServices) {
    const name = (s.service_name || s.name || '').toLowerCase();
    if (name && (input.includes(name) || name.includes(input))) {
      return 20.0;
    }
    if (calculateStringSimilarity(input, name) >= 0.6) {
      return 17.0;
    }
  }

  return 0;
}

// Identifier 4: Vehicle Model Evaluator (Max 15 pts) — Model takes priority
function evaluateVehicleScore(inputVehicle, actualVehicle) {
  if (!inputVehicle || !actualVehicle) return 0;
  const input = inputVehicle.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const model = (actualVehicle.model || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const make = (actualVehicle.make || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

  // Priority on model
  if (model) {
    const modelTokens = model.split(/\s+/).filter(Boolean);
    const inputTokens = input.split(/\s+/).filter(Boolean);

    if (input.includes(model) || model.includes(input) || modelTokens.some(mt => inputTokens.some(it => it === mt || calculateStringSimilarity(it, mt) >= 0.8))) {
      return 15.0; // Full 15 pts for model match
    }
  }

  // Fallback: only make matched
  if (make && (input.includes(make) || make.includes(input))) {
    return 7.5; // Half score for make only
  }

  return 0;
}

// Identifier 5: Mobile Number Evaluator (Max 15 pts)
function evaluateMobileScore(inputMobile, actualMobile) {
  if (!inputMobile || !actualMobile) return 0;
  const cleanInput = getLast10(inputMobile);
  const cleanActual = getLast10(actualMobile);
  if (cleanInput && cleanActual && cleanInput === cleanActual) {
    return 15.0;
  }
  return 0;
}

// Security Check: Anti-Fishing & IP Block Enforcement
async function checkSecurityStatus(ip) {
  // Check if IP is currently blocked
  const [blocked] = await pool.query(
    "SELECT id, reason, blocked_until FROM care_blocked_ips WHERE ip_address = ? AND (blocked_until IS NULL OR blocked_until > NOW())",
    [ip]
  );
  if (blocked.length > 0) {
    return { blocked: true, reason: blocked[0].reason || 'Security block active' };
  }

  // Anti-fishing: check if same IP has attempted logins with >= 3 different names within 2 hours
  const [fishingCheck] = await pool.query(
    `SELECT COUNT(DISTINCT claimed_name) as distinct_names, COUNT(*) as total_attempts 
     FROM care_ai_login_logs 
     WHERE ip_address = ? 
       AND created_at > DATE_SUB(NOW(), INTERVAL 2 HOUR) 
       AND claimed_name IS NOT NULL 
       AND TRIM(claimed_name) != ''`,
    [ip]
  );

  const distinctNames = fishingCheck[0]?.distinct_names || 0;
  const totalAttempts = fishingCheck[0]?.total_attempts || 0;

  if (distinctNames >= 3) {
    const blockReason = `Automated Anti-Fishing Block: Detected ${distinctNames} different customer names from IP`;
    await pool.query(
      `INSERT INTO care_blocked_ips (ip_address, reason, attempts_count, created_at, updated_at) 
       VALUES (?, ?, ?, NOW(), NOW()) 
       ON DUPLICATE KEY UPDATE reason = VALUES(reason), attempts_count = attempts_count + 1, updated_at = NOW()`,
      [ip, blockReason, totalAttempts]
    );
    return { blocked: true, reason: blockReason };
  }

  return { blocked: false };
}

// ─── POST /api/auth/ai-login/session ──────────────────────────────
router.post('/session', async (req, res) => {
  try {
    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';
    const deviceInfo = parseDeviceInfo(userAgent);

    // Security check
    const secStatus = await checkSecurityStatus(clientIp);
    if (secStatus.blocked) {
      return res.status(403).json({
        success: false,
        blocked: true,
        message: 'Security Notice: Login verification from this network is currently restricted. Please contact MaskPro support.',
        errors: [secStatus.reason]
      });
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const initialAnswers = JSON.stringify({});

    await pool.query(
      `INSERT INTO care_ai_login_sessions 
       (session_token, ip_address, user_agent, device_info, step, answers, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'name', ?, 'in_progress', NOW(), NOW())`,
      [sessionToken, clientIp, userAgent, deviceInfo, initialAnswers]
    );

    return res.json({
      success: true,
      data: {
        session_token: sessionToken,
        step: 'name',
        assistant_name: 'Izumi',
        message: "Hello! I'm Izumi, your MaskPro Care Assistant. Don't worry if your SMS code hasn't arrived. I can verify your account through a few quick questions so you can log in safely.\n\nTo begin, what is your full name?"
      }
    });
  } catch (err) {
    console.error('Error starting AI login session:', err);
    return res.status(500).json({ success: false, message: 'Unable to start verification session. Please try again.', errors: [] });
  }
});

// ─── POST /api/auth/ai-login/message ──────────────────────────────
router.post('/message', async (req, res) => {
  try {
    const { session_token, message } = req.body;
    if (!session_token || !message || !String(message).trim()) {
      return res.status(422).json({ success: false, message: 'Message and session token are required.', errors: [] });
    }

    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';
    const deviceInfo = parseDeviceInfo(userAgent);
    const userText = String(message).trim();

    // Security check
    const secStatus = await checkSecurityStatus(clientIp);
    if (secStatus.blocked) {
      return res.status(403).json({
        success: false,
        blocked: true,
        message: 'Security Notice: Access restricted. Please contact support.',
        errors: [secStatus.reason]
      });
    }

    // Retrieve active session
    const [sessions] = await pool.query(
      "SELECT * FROM care_ai_login_sessions WHERE session_token = ? AND status = 'in_progress'",
      [session_token]
    );
    if (sessions.length === 0) {
      return res.status(404).json({ success: false, message: 'Verification session expired or invalid. Please start again.', errors: [] });
    }

    const session = sessions[0];
    let answers = {};
    try {
      answers = typeof session.answers === 'string' ? JSON.parse(session.answers || '{}') : (session.answers || {});
    } catch {
      answers = {};
    }

    const currentStep = session.step;

    // STEP 1: Full Name
    if (currentStep === 'name') {
      answers.full_name = userText;

      // Anti-fishing check: log attempt name early to prevent fishing attacks
      const postNameSec = await checkSecurityStatus(clientIp);
      if (postNameSec.blocked) {
        await pool.query("UPDATE care_ai_login_sessions SET status = 'blocked' WHERE id = ?", [session.id]);
        return res.status(403).json({ success: false, blocked: true, message: 'Access restricted due to suspicious activity.', errors: [] });
      }

      await pool.query(
        "UPDATE care_ai_login_sessions SET step = 'month', answers = ?, updated_at = NOW() WHERE id = ?",
        [JSON.stringify(answers), session.id]
      );

      return res.json({
        success: true,
        data: {
          step: 'month',
          message: `Nice to meet you, ${userText}! What month was your first visit or booking with MaskPro? (For example: November, or July 2024)`
        }
      });
    }

    // STEP 2: Booking Month
    if (currentStep === 'month') {
      answers.booking_month = userText;

      await pool.query(
        "UPDATE care_ai_login_sessions SET step = 'service', answers = ?, updated_at = NOW() WHERE id = ?",
        [JSON.stringify(answers), session.id]
      );

      return res.json({
        success: true,
        data: {
          step: 'service',
          message: "Got it! What was the service you acquired for that booking? (For example: Nano Ceramic Coating, NanoFix Maintenance, or Tint)"
        }
      });
    }

    // STEP 3: Booked Service
    if (currentStep === 'service') {
      answers.booked_service = userText;

      await pool.query(
        "UPDATE care_ai_login_sessions SET step = 'vehicle', answers = ?, updated_at = NOW() WHERE id = ?",
        [JSON.stringify(answers), session.id]
      );

      return res.json({
        success: true,
        data: {
          step: 'vehicle',
          message: "Thank you! And which vehicle was that service for? (Please tell me the model, for example: Tang, Fortuner, Innova, or Civic)"
        }
      });
    }

    // STEP 4: Vehicle Model
    if (currentStep === 'vehicle') {
      answers.vehicle_model = userText;

      await pool.query(
        "UPDATE care_ai_login_sessions SET step = 'mobile', answers = ?, updated_at = NOW() WHERE id = ?",
        [JSON.stringify(answers), session.id]
      );

      return res.json({
        success: true,
        data: {
          step: 'mobile',
          message: "Almost done! Finally, what is the mobile number you registered for your booking?"
        }
      });
    }

    // STEP 5: Registered Mobile & Final Verification Evaluation
    if (currentStep === 'mobile') {
      answers.mobile_number = userText;

      const claimedName = answers.full_name || '';
      const claimedMobile = answers.mobile_number || '';
      const claimedMonth = answers.booking_month || '';
      const claimedService = answers.booked_service || '';
      const claimedVehicle = answers.vehicle_model || '';

      const last10 = getLast10(claimedMobile);

      // 1. Locate candidate customer by mobile (or fuzzy name fallback)
      let customer = null;
      if (last10 && last10.length === 10) {
        const [custByMobile] = await pool.query(
          "SELECT id, full_name, mobile_number, branch_id FROM customers WHERE RIGHT(REPLACE(REPLACE(mobile_number, '+', ''), ' ', ''), 10) = ? LIMIT 1",
          [last10]
        );
        if (custByMobile.length > 0) {
          customer = custByMobile[0];
        }
      }

      if (!customer && claimedName) {
        // Fallback: search by name soundex / token match
        const [custByName] = await pool.query(
          "SELECT id, full_name, mobile_number, branch_id FROM customers WHERE full_name LIKE ? OR SOUNDEX(full_name) = SOUNDEX(?) LIMIT 5",
          [`%${claimedName.split(' ')[0]}%`, claimedName]
        );
        let bestCust = null;
        let bestSim = 0;
        for (const c of custByName) {
          const sim = calculateStringSimilarity(claimedName, c.full_name);
          if (sim > bestSim && sim >= 0.7) {
            bestSim = sim;
            bestCust = c;
          }
        }
        customer = bestCust;
      }

      if (!customer) {
        // Unknown customer: log failure and reject
        await pool.query(
          `INSERT INTO care_ai_login_logs 
           (session_id, customer_id, claimed_name, claimed_mobile, ip_address, user_agent, device, score, status, details, created_at)
           VALUES (?, NULL, ?, ?, ?, ?, ?, 0.00, 'failed', ?, NOW())`,
          [session.id, claimedName, claimedMobile, clientIp, userAgent, deviceInfo, JSON.stringify({ answers, reason: 'Customer not found' })]
        );

        await pool.query(
          "UPDATE care_ai_login_sessions SET step = 'failed', status = 'rejected', total_score = 0, answers = ?, updated_at = NOW() WHERE id = ?",
          [JSON.stringify(answers), session.id]
        );

        return res.json({
          success: false,
          verified: false,
          score: 0,
          message: "I could not find an account matching these details. For your security, please check your mobile number and name, or contact our branch support team."
        });
      }

      // 2. Query customer's booking history with services and vehicles
      const [bookings] = await pool.query(
        `SELECT b.booking_id, b.booking_date, b.customer_vehicle_id, v.make, v.model,
                bst.service_name
         FROM bookings b
         LEFT JOIN bookings_service_types bst ON b.booking_id = bst.booking_id
         LEFT JOIN vehicles v ON b.customer_vehicle_id = v.id
         WHERE b.customer_id = ?
         ORDER BY b.booking_date ASC`,
        [customer.id]
      );

      // Group bookings by booking_id
      const bookingMap = new Map();
      for (const row of bookings) {
        if (!bookingMap.has(row.booking_id)) {
          bookingMap.set(row.booking_id, {
            booking_id: row.booking_id,
            booking_date: row.booking_date,
            make: row.make,
            model: row.model,
            services: []
          });
        }
        if (row.service_name) {
          bookingMap.get(row.booking_id).services.push({ service_name: row.service_name });
        }
      }

      const bookingList = Array.from(bookingMap.values());
      const firstBooking = bookingList[0] || null;

      // 3. Compute score breakdown
      const nameScore = evaluateNameScore(claimedName, customer.full_name); // max 25
      const mobileScore = evaluateMobileScore(claimedMobile, customer.mobile_number); // max 15

      // Evaluate Month, Service, and Vehicle against bookings
      // We test against their first booking (primary) and find the best matching booking on their profile
      let bestMonthScore = 0;
      let bestServiceScore = 0;
      let bestVehicleScore = 0;

      if (firstBooking) {
        bestMonthScore = evaluateMonthScore(claimedMonth, firstBooking.booking_date);
        bestServiceScore = evaluateServiceScore(claimedService, firstBooking.services);
        bestVehicleScore = evaluateVehicleScore(claimedVehicle, { make: firstBooking.make, model: firstBooking.model });
      }

      // If user provided details for another booking on their profile, also check all bookings
      for (const b of bookingList) {
        const mScore = evaluateMonthScore(claimedMonth, b.booking_date);
        const sScore = evaluateServiceScore(claimedService, b.services);
        const vScore = evaluateVehicleScore(claimedVehicle, { make: b.make, model: b.model });

        if ((mScore + sScore + vScore) > (bestMonthScore + bestServiceScore + bestVehicleScore)) {
          bestMonthScore = mScore;
          bestServiceScore = sScore;
          bestVehicleScore = vScore;
        }
      }

      const totalScore = parseFloat((nameScore + bestMonthScore + bestServiceScore + bestVehicleScore + mobileScore).toFixed(1));
      const breakdown = {
        name: { score: nameScore, max: 25 },
        booking_month: { score: bestMonthScore, max: 25 },
        service: { score: bestServiceScore, max: 20 },
        vehicle: { score: bestVehicleScore, max: 15 },
        mobile: { score: mobileScore, max: 15 },
        total: totalScore,
      };

      const isVerified = totalScore >= 90.0;
      const logStatus = isVerified ? 'success' : 'failed';

      // 4. Log the attempt
      await pool.query(
        `INSERT INTO care_ai_login_logs 
         (session_id, customer_id, claimed_name, claimed_mobile, ip_address, user_agent, device, score, status, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [session.id, customer.id, claimedName, claimedMobile, clientIp, userAgent, deviceInfo, totalScore, logStatus, JSON.stringify({ answers, breakdown })]
      );

      if (isVerified) {
        // Issue JWT token
        const token = jwt.sign(
          {
            customer_id: customer.id,
            mobile: customer.mobile_number,
            branch_id: customer.branch_id || 1,
            auth_method: 'ai_helper'
          },
          JWT_SECRET,
          { expiresIn: JWT_EXPIRY }
        );

        await pool.query(
          "UPDATE care_ai_login_sessions SET step = 'completed', status = 'verified', customer_id = ?, total_score = ?, match_scores = ?, answers = ?, updated_at = NOW() WHERE id = ?",
          [customer.id, totalScore, JSON.stringify(breakdown), JSON.stringify(answers), session.id]
        );

        return res.json({
          success: true,
          verified: true,
          score: totalScore,
          token,
          customer: {
            id: customer.id,
            full_name: customer.full_name,
            mobile_number: customer.mobile_number,
            branch_id: customer.branch_id || 1
          },
          message: `Verification complete! Identity confirmed with a ${totalScore}% match score. Welcome back, ${customer.full_name}! Logging you in now...`
        });
      } else {
        await pool.query(
          "UPDATE care_ai_login_sessions SET step = 'completed', status = 'rejected', customer_id = ?, total_score = ?, match_scores = ?, answers = ?, updated_at = NOW() WHERE id = ?",
          [customer.id, totalScore, JSON.stringify(breakdown), JSON.stringify(answers), session.id]
        );

        // Check if this IP is making too many failed attempts (>= 5 in 30 mins)
        const [failCount] = await pool.query(
          "SELECT COUNT(*) as cnt FROM care_ai_login_logs WHERE ip_address = ? AND status = 'failed' AND created_at > DATE_SUB(NOW(), INTERVAL 30 MINUTE)",
          [clientIp]
        );
        if ((failCount[0]?.cnt || 0) >= 5) {
          await pool.query(
            `INSERT INTO care_blocked_ips (ip_address, reason, attempts_count, blocked_until, created_at, updated_at) 
             VALUES (?, 'Automated Rate Limit Block: Exceeded 5 failed AI verification attempts in 30 minutes', ?, DATE_ADD(NOW(), INTERVAL 1 HOUR), NOW(), NOW())
             ON DUPLICATE KEY UPDATE attempts_count = attempts_count + 1, blocked_until = DATE_ADD(NOW(), INTERVAL 1 HOUR), updated_at = NOW()`,
            [clientIp, failCount[0].cnt]
          );
        }

        return res.json({
          success: false,
          verified: false,
          score: totalScore,
          message: `We could not verify your identity with the required 90% confidence score (scored ${totalScore}%). For your protection, please review your answers or contact our branch support team.`
        });
      }
    }

    return res.status(400).json({ success: false, message: 'Invalid step', errors: [] });
  } catch (err) {
    console.error('Error handling AI login message:', err);
    return res.status(500).json({ success: false, message: 'Error processing verification. Please try again.', errors: [] });
  }
});

module.exports = router;
