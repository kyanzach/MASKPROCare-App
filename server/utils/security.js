/**
 * MaskPro Care — Core Security Utilities
 *
 * 1. Trusted Client IP extraction (X-Real-IP priority to prevent X-Forwarded-For spoofing)
 * 2. Sliding-window Brute-Force & Rate Limiters (OTP verify, Admin login, API requests)
 * 3. Magic-Byte Image Buffer Validation & Anti-Polyglot/PHP2Shell Guard
 * 4. Hardened HTTP Security Headers Middleware
 */

const path = require('path');

// ─── 1. Trusted Client IP Extraction ─────────────────────────────────────────
/**
 * Extracts the real client IP behind Nginx reverse proxy.
 * Nginx sets `proxy_set_header X-Real-IP $remote_addr;`, which cannot be spoofed
 * by a client sending a fake `X-Forwarded-For` header.
 */
function getTrustedClientIp(req) {
  const realIp = req.headers['x-real-ip'];
  if (realIp && typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim().replace(/^::ffff:/, '').slice(0, 64);
  }

  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    const parts = forwarded.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) {
      // Use the rightmost IP appended by the local Nginx reverse proxy
      return parts[parts.length - 1].replace(/^::ffff:/, '').slice(0, 64);
    }
  }

  const remote = req.socket?.remoteAddress || req.ip || '127.0.0.1';
  return String(remote).replace(/^::ffff:/, '').slice(0, 64);
}

// ─── 2. Sliding-Window Rate Limiter & Brute-Force Guard ──────────────────────
const rateBuckets = new Map();

// Periodic cleanup of expired buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateBuckets.entries()) {
    if (now > entry.resetAt && (!entry.lockedUntil || now > entry.lockedUntil)) {
      rateBuckets.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

/**
 * Check if a key (e.g., `admin_login:1.2.3.4` or `otp_verify:09171234567`) is currently locked out.
 */
function checkRateLimit(namespace, identifier, { maxAttempts = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const key = `${namespace}:${identifier}`;
  const now = Date.now();
  const entry = rateBuckets.get(key);

  if (!entry) {
    return { allowed: true, remaining: maxAttempts, retryAfterSeconds: 0 };
  }

  if (entry.lockedUntil && now < entry.lockedUntil) {
    const retryAfterSeconds = Math.ceil((entry.lockedUntil - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSeconds, count: entry.count };
  }

  if (now > entry.resetAt) {
    rateBuckets.delete(key);
    return { allowed: true, remaining: maxAttempts, retryAfterSeconds: 0 };
  }

  if (entry.count >= maxAttempts) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSeconds, count: entry.count };
  }

  return {
    allowed: true,
    remaining: Math.max(0, maxAttempts - entry.count),
    retryAfterSeconds: 0,
    count: entry.count,
  };
}

/**
 * Record a failed attempt or rate-limited hit.
 */
function recordRateLimitHit(namespace, identifier, { maxAttempts = 5, windowMs = 15 * 60 * 1000, lockoutMs = 15 * 60 * 1000 } = {}) {
  const key = `${namespace}:${identifier}`;
  const now = Date.now();
  let entry = rateBuckets.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs, lockedUntil: null };
  }

  entry.count += 1;
  if (entry.count >= maxAttempts) {
    entry.lockedUntil = now + lockoutMs;
  }

  rateBuckets.set(key, entry);
  return {
    count: entry.count,
    locked: entry.count >= maxAttempts,
    retryAfterSeconds: entry.lockedUntil ? Math.ceil((entry.lockedUntil - now) / 1000) : 0,
  };
}

/**
 * Clear rate limit counter after a successful authentication.
 */
function clearRateLimit(namespace, identifier) {
  rateBuckets.delete(`${namespace}:${identifier}`);
}

// ─── 3. Magic-Byte Image Buffer Validator (Anti-PHP2Shell / Polyglot) ────────
/**
 * Validates that an uploaded buffer has genuine image magic bytes
 * (JPEG, PNG, WebP, HEIC/HEIF/AVIF) and does not contain embedded PHP/HTML shell tags.
 */
function validateImageBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return { valid: false, reason: 'Invalid or empty image file.' };
  }

  // 1. Check magic bytes
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  const isWebp =
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP';

  const ftypBox = buffer.toString('ascii', 4, 12).toLowerCase();
  const isHeic =
    ftypBox.startsWith('ftyp') &&
    ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'avif'].includes(ftypBox.slice(4, 8));

  if (!isJpeg && !isPng && !isWebp && !isHeic) {
    return {
      valid: false,
      reason: 'File signature does not match a valid JPEG, PNG, WebP, or HEIC image.',
    };
  }

  // 2. Anti-polyglot / Anti-PHP2Shell scan on first 4KB and last 4KB of buffer
  const headSample = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('latin1').toLowerCase();
  const tailSample = buffer.subarray(Math.max(0, buffer.length - 4096)).toString('latin1').toLowerCase();
  const dangerousPatterns = ['<?php', '<?=', '<script', 'eval(', 'base64_decode(', 'shell_exec(', 'passthru(', 'system('];

  for (const pat of dangerousPatterns) {
    if (headSample.includes(pat) || tailSample.includes(pat)) {
      return {
        valid: false,
        reason: 'Security policy rejected image containing embedded script signatures.',
      };
    }
  }

  return { valid: true };
}

/**
 * Safely resolves a filename inside a target directory, preventing any path traversal (`../`).
 */
function safeUploadPath(uploadDir, filename) {
  const raw = String(filename || '').trim();
  if (!raw || raw.includes('..') || raw.includes('/') || raw.includes('\\') || raw.includes('\0')) {
    return null;
  }
  const cleanName = path.basename(raw);
  if (!cleanName || cleanName !== raw || cleanName === '.' || cleanName === '..') return null;
  const resolvedDir = path.resolve(uploadDir);
  const resolvedTarget = path.resolve(resolvedDir, cleanName);
  if (!resolvedTarget.startsWith(resolvedDir + path.sep)) return null;
  return resolvedTarget;
}

// ─── 4. HTTP Security Headers Middleware ─────────────────────────────────────
function securityHeadersMiddleware(req, res, next) {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=()');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
  next();
}

module.exports = {
  getTrustedClientIp,
  checkRateLimit,
  recordRateLimitHit,
  clearRateLimit,
  validateImageBuffer,
  safeUploadPath,
  securityHeadersMiddleware,
};
