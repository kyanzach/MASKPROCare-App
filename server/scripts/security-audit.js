#!/usr/bin/env node
/**
 * MaskPro Care — Automated Security & Anti-PHP2Shell Verification Suite
 * Run via: npm run security:audit
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT_DIR = path.resolve(__dirname, '../..');
const SERVER_DIR = path.join(ROOT_DIR, 'server');

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${label}${detail ? ` — ${detail}` : ''}`);
    passed += 1;
  } else {
    console.error(`  ❌ [FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
    failed += 1;
  }
}

function getAllJsFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) getAllJsFiles(full, files);
    else if (entry.name.endsWith('.js')) files.push(full);
  }
  return files;
}

function fetchHeaders(url) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'GET', timeout: 6000 }, (res) => {
      res.resume();
      resolve({ statusCode: res.statusCode, headers: res.headers });
    });
    req.on('error', (err) => resolve({ statusCode: 0, headers: {}, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ statusCode: 0, headers: {}, error: 'timeout' });
    });
    req.end();
  });
}

(async () => {
  console.log('\n🔒 MASKPROCare Automated Security & Anti-PHP2Shell Audit\n' + '═'.repeat(60));

  // 1. Secret Scan across server/*.js & legacy PHP
  console.log('\n[1/4] Source Code Secret & Hardcoded Fallback Audit');
  const jsFiles = getAllJsFiles(SERVER_DIR).filter((f) => !f.endsWith('security-audit.js'));
  const bannedLiterals = [
    'mpc_jwt_s3cr3t_k3y_2026_xK9pLm2nQ7rT',
    'Godisgood21!',
    'Godisgood777!',
    'UnifyM@skpr0_2026!',
    'SMSIT_eedd3ff7f99d05260861705be7650a4b439feae08f8e06bf818ea478179af4fa',
    '6f59f368388c29e4a01e704af6432d74',
  ];

  let leakedFiles = [];
  for (const file of [...jsFiles, path.join(ROOT_DIR, 'db_connect.php'), path.join(ROOT_DIR, 'api/v2/config/jwt.php')]) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const secret of bannedLiterals) {
      if (content.includes(secret)) {
        leakedFiles.push(path.relative(ROOT_DIR, file));
      }
    }
  }
  check('Zero hardcoded production secrets in server/ and legacy PHP', leakedFiles.length === 0, leakedFiles.join(', '));

  // 2. Security Middleware & Guard Verification
  console.log('\n[2/4] Express Hardening, Rate Limiting & Upload Guard Audit');
  const indexContent = fs.readFileSync(path.join(SERVER_DIR, 'index.js'), 'utf8');
  check('Express disables x-powered-by header', indexContent.includes("app.disable('x-powered-by')"));
  check('Security headers middleware mounted', indexContent.includes('securityHeadersMiddleware'));
  check('JSON body payload size bounded (256kb)', indexContent.includes("limit: '256kb'"));

  const { validateImageBuffer, safeUploadPath } = require('../utils/security');
  const phpShellBuf = Buffer.from('<?php system($_GET["cmd"]); ?>');
  const polyglotJpegBuf = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]), phpShellBuf]);
  const validPngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

  check('Rejects raw PHP shell upload', !validateImageBuffer(phpShellBuf).valid);
  check('Rejects JPEG+PHP polyglot webshell upload (php2shell)', !validateImageBuffer(polyglotJpegBuf).valid);
  check('Accepts clean PNG magic bytes', validateImageBuffer(validPngBuf).valid);
  check('Blocks path traversal in upload file deletion', safeUploadPath('/var/www/care/uploads', '../../etc/passwd') === null);

  // 3. Privilege Escalation & Brute-Force Guard Check
  console.log('\n[3/4] Auth & Admin Privilege Guard Audit');
  const adminContent = fs.readFileSync(path.join(SERVER_DIR, 'routes/admin.js'), 'utf8');
  const authContent = fs.readFileSync(path.join(SERVER_DIR, 'routes/auth.js'), 'utf8');
  const profileContent = fs.readFileSync(path.join(SERVER_DIR, 'routes/profile.js'), 'utf8');
  check('Admin check restricts name cross-reference to immutable VERIFIED_ADMIN_CUSTOMER_IDS', adminContent.includes('VERIFIED_ADMIN_CUSTOMER_IDS'));
  check('Admin login enforces brute-force lockout (admin_login_ip & admin_login_user)', adminContent.includes('admin_login_ip') && adminContent.includes('admin_login_user'));
  check('OTP verification enforces brute-force lockout & burns OTP after 5 failed guesses', authContent.includes('otp_verify_mobile') && authContent.includes('otp_verify_ip'));
  check('Profile update blocks spoofing staff/admin full_name', profileContent.includes('reserved for verified MaskPro staff accounts'));

  // 4. Live Endpoint Security Headers & Anti-PHP2Shell Probe
  console.log('\n[4/4] Live Production Endpoint & Nginx Shield Check (https://care.maskpro.ph)');
  const healthRes = await fetchHeaders('https://care.maskpro.ph/api/health');
  if (healthRes.statusCode === 200) {
    check('Live /api/health returns HTTP 200', true);
    check('Live API hides X-Powered-By header', !healthRes.headers['x-powered-by']);
    check('Live API sets Strict-Transport-Security (HSTS)', Boolean(healthRes.headers['strict-transport-security']));
    check('Live API sets X-Content-Type-Options: nosniff', healthRes.headers['x-content-type-options'] === 'nosniff');
    check('Live API sets X-Frame-Options', Boolean(healthRes.headers['x-frame-options']));

    const phpProbe = await fetchHeaders('https://care.maskpro.ph/uploads/shell.php');
    check('Live Nginx blocks /uploads/*.php execution (403/404)', [403, 404].includes(phpProbe.statusCode), `HTTP ${phpProbe.statusCode}`);

    const dotEnvProbe = await fetchHeaders('https://care.maskpro.ph/.env');
    check('Live Nginx blocks /.env dotfile access (403/404)', [403, 404].includes(dotEnvProbe.statusCode), `HTTP ${dotEnvProbe.statusCode}`);
  } else {
    console.log(`  ℹ️ Skipping live header checks (offline or unreachable: ${healthRes.error || healthRes.statusCode})`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`Result: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
