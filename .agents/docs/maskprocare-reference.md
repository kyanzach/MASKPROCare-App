# MaskPro Care App — Detailed Reference

> **This file is the living reference document for the MaskPro Care App.**
> All learnings, schemas, patterns, plans, and phase updates go here.
> The agent rule file (`.agents/rules/maskprocare-app.md`) points here for details.

---

## 🏗️ Architecture

- **Stack:** React (Vite) SPA frontend + **Express/Node.js API** (`server/`) + MySQL (mysql2)
- **Local project:** `/Applications/XAMPP/xamppfiles/htdocs/care.maskpro.ph/` (standalone)
- **Production:** `care.maskpro.ph` → `/var/www/care/` on DigitalOcean droplet (167.71.217.49)
- **Port:** 3004 (PM2 process: `maskpro-care`)
- **Target:** React web app + React Native (Expo) mobile app, same Express API backend
- **Shared database:** `unify_maskpro` (prod) / `omnimpdb` (local) — shared with Unify
- **Timezone:** All server-side logic uses `Asia/Manila`
- **Git:** `kyanzach/MASKPROCare-App.git`

---

## ✅ Code Patterns

### Database Access (Express + mysql2)
```javascript
const pool = require('../db/connection');
const [rows] = await pool.query('SELECT * FROM vehicles WHERE customer_id = ?', [customerId]);
```

### API Auth (JWT middleware)
```javascript
const { authenticateToken } = require('../middleware/auth');
router.get('/vehicles', authenticateToken, async (req, res) => {
  const customerId = req.user.customer_id; // set by middleware
});
```

### API Response Format (must match original PHP format)
```javascript
res.json({ success: true, data: { key: value }, message: 'Success' });
res.status(422).json({ success: false, message: 'Validation failed', errors: ['field required'] });
```

### Mobile Number Handling
- Store as `+639XXXXXXXXX` (E.164)
- Compare using last 10 digits
- Standardize helper in `server/utils/mobile.js`

---

## 📁 File Map

| File/Dir | Purpose |
|------|---------|
| `frontend/` | Vite + React SPA (src/, index.html, vite.config.js) |
| `frontend/src/api/client.js` | Axios API client — ALL API calls go through here |
| `server/index.js` | Express entry point (port 3004) |
| `server/db/connection.js` | mysql2 connection pool |
| `server/middleware/auth.js` | JWT verification, sets `req.user.customer_id` |
| `server/routes/` | Express route files (auth, vehicles, bookings, etc.) |
| `server/services/sms.js` | iTexMo + SMS-it dual-provider SMS |
| `.env` | DB creds, JWT secret, SMS keys |

### Express Server Structure
```
server/
├── index.js              ← Entry point (port 3004)
├── db/connection.js      ← mysql2 pool
├── middleware/auth.js    ← JWT auth
├── routes/
│   ├── auth.js           ← login, verify, logout
│   ├── vehicles.js       ← CRUD + photo upload (multer)
│   ├── bookings.js       ← CRUD + availability
│   ├── dashboard.js      ← stats
│   ├── profile.js        ← get, update
│   ├── notifications.js  ← list, count, mark read
│   └── services.js       ← list (public)
└── services/sms.js       ← SMS providers
```

### Legacy PHP (archived)
Original PHP API v2 is in `api/v2/` — kept for reference during rewrite.
Legacy PHP pages archived at `unify.maskpro.ph/_archived_maskprocare-app/`.

---

## 🗄️ Database Schema (Key Tables)

| Table | PK | Notes |
|-------|-----|-------|
| `customers` | `id` | |
| `vehicles` | `id` (NOT `vehicle_id`) | has `photo` VARCHAR(255) for WebP uploads |
| `bookings` | `booking_id` (NOT `id`) | No `status` col — cancel via `notes LIKE 'CANCELLED:%'` |
| `booking_requests` | `request_id` | status ENUM: pending/approved/rejected/cancelled |
| `booking_request_services` | `service_id` | FK: `request_id` |
| `branch_booking_capacity` | `id` | |
| `login_otp` | `id` | `otp_code` is NOT NULL — use empty string to clear |

### bookings table (real schema)
- PK: `booking_id`, Vehicle FK: `customer_vehicle_id`
- No `status`, `scheduled_date`, `scheduled_time` columns
- Uses `booking_date` (datetime), status from notes pattern

### booking_requests table
- `status` ENUM: `pending`, `approved`, `rejected`, `cancelled`
- `cancellation_reason` TEXT — customer-initiated cancels
- `edit_history` TEXT — JSON array of date changes
- `rejection_reason` TEXT — admin rejections only
- `time_added` TIMESTAMP (NOT `created_at`)

---

## 🚀 Deployment (`deploy.sh`)

**Script location:** `deploy.sh` at project root

### Usage
```bash
./deploy.sh              # Deploy everything (frontend + backend)
./deploy.sh --frontend   # Vite build + upload dist/
./deploy.sh --backend    # Upload server/ + npm install + PM2 restart
./deploy.sh --setup-nginx # First-time Nginx config (run once)
```

### What it does
1. **Preflight** — checks SSH, verifies sister apps (maskpro-api, gaq-api, getsales-public) are online in PM2
2. **Frontend** — `npm run build` in `frontend/`, verifies JS bundle, rsync `dist/` → server, cleans orphaned hashes
3. **Backend** — rsync `server/` (excludes node_modules), uploads `package.json`, runs `npm install --production`, starts/restarts PM2 process
4. **Nginx** — writes config to `/etc/nginx/sites-available/care` with SPA fallback, API proxy to port 3004, uploads caching

### Critical notes
- **NO `--delete` flag** — rsync is additive only, never deletes server files
- **`.env` is NOT uploaded** — must be created manually on server (`/var/www/care/.env`)
- First-time deploy needs `--setup-nginx` once, then `certbot --nginx -d care.maskpro.ph` for SSL
- Uses `sshpass` — set `DEPLOY_SSH_PASS` env var or defaults to hardcoded password
- API health check URL: `https://care.maskpro.ph/api/health`

### First-time server setup (before deploy)
```bash
# 1. Create .env on server with production DB creds
ssh root@167.71.217.49
cat > /var/www/care/.env << 'EOF'
PORT=3004
NODE_ENV=production
DB_HOST=localhost
DB_USER=unify_user
DB_PASS=UnifyM@skpr0_2026!
DB_NAME=unify_maskpro
DB_PORT=3306
JWT_SECRET=mpc_jwt_s3cr3t_k3y_2026_xK9pLm2nQ7rT
JWT_EXPIRY=86400
ITEXMO_URL=https://api.itexmo.com/api/broadcast
ITEXMO_EMAIL=ryan@maskpro.ph
ITEXMO_PASSWORD=Godisgood21!
ITEXMO_API_CODE=PR-RYANP221047_30CYC
ITEXMO_SENDER_ID=MASKPROCare
SMSIT_URL=https://aicpanel.smsit.ai/api/v2/smscontact
SMSIT_API_KEY=SMSIT_eedd3ff7f99d05260861705be7650a4b439feae08f8e06bf818ea478179af4fa
SMSIT_FROM_NUMBER=639511047777
CORS_ORIGINS=https://care.maskpro.ph
EOF

# 2. Run deploy with nginx setup
./deploy.sh --setup-nginx
./deploy.sh --all

# 3. Enable SSL
ssh root@167.71.217.49 'certbot --nginx -d care.maskpro.ph'
```

---

## 🔒 Security Checklist

- All DB queries: prepared statements only (no string concatenation)
- All output: `htmlspecialchars()` for XSS prevention
- API endpoints: ownership check (resources belong to authenticated customer)
- Branch isolation: customers see only their branch's data
- JWT in httpOnly cookie (web) or SecureStore (mobile)
- CORS restricted to specific origins
- OTP rate limit: max 3 per mobile per 15 minutes

---

## 🎨 UI/UX Reference (React Frontend)

### Theme
- **Login/Auth**: Indigo→Cyan gradient bg (`#4f46e5→#06b6d4`), white card, 4px gradient top border
- **App pages**: Blue gradient bg (`#eff6ff→#dbeafe→#bfdbfe→#93c5fd`)
- **Cards**: Glassmorphic (`rgba(255,255,255,0.95)`, `backdrop-filter: blur(20px)`), 24px radius, 4px gradient stripe
- **Primary gradient**: `linear-gradient(135deg, #3b82f6, #1d4ed8)`
- **CSS variables**: `--primary-gradient`, `--border-radius-card: 16px`, `--transition-smooth`

### Login Page
- "Welcome Back" title (gradient text), mobile input (09XX format), "Continue with Mobile" CTA
- Pre-fill from `?mobile=` URL param, floating logo with pulse animation
- Footer: ToS + Privacy links, "Secured by MaskPro" badge, support number

### Dashboard
- Welcome greeting with 👋, "Book Now" CTA
- 4 stats: Total Vehicles, Needs Service, Upcoming, Pending Requests
- Upcoming appointments table + vehicle cards (max 3)
- Vehicle icons: make-specific gradient colors (Toyota=red, Honda=blue, etc.)

### Bookings Page (unified, no tabs)
- Single table sorted by date, status badges: Pending (amber), Scheduled (blue), Done (green), Cancelled (red)
- Edit modal: calendar + reason dropdown (only for pending requests)
- Cancel modal: confirmation + reason dropdown (for pending + scheduled)
- New Booking: vehicle → service → calendar → notes → submit (default 8:00 AM)

### Vehicles Page
- Card grid with make-specific icons, photo upload (WebP auto-conversion)
- Add/Edit via modal, LTO registration date → calculated expiry
- 3-dot dropdown: edit, delete

### Profile Page
- Two-column: avatar card (stats row) + quick info + edit form

### Sidebar
- Dashboard, My Bookings, My Vehicles, Services (collapsible), Profile, Account Settings, Sign Out

---

## 📋 Migration Status

- **Phase 1 (PHP API Refactor):** ✅ Complete — 22 endpoints, JWT auth, CORS
- **Phase 2 (React Web):** ✅ Complete — Login, Dashboard, Vehicles, Bookings, Profile, Notifications
- **Phase 3 (PHP→Express Rewrite):** ✅ Complete — 22 endpoints in 7 route files, SMS service, capacity helper
- **Phase 4 (Deploy to Droplet):** 🔄 Ready — `deploy.sh` exists, first deploy pending
- **Phase 5 (React Native):** Not started
- **Phase 6 (App Stores):** Not started

---

## 📝 Session Learnings Log

### 2026-03-13: Express Rewrite Complete + Deploy Script
- **All 22 PHP endpoints rewritten** to Express/Node.js in `server/` (7 route files)
- **SMS service ported** from `SMS_API_settings.php` — iTexMo primary + SMS-it fallback via axios
- **Booking capacity helper ported** from `booking_capacity_helper.php` — inlined in bookings.js
- **Customer branch helper ported** — branch assignment from booking history
- **OTP timezone bug found & fixed** — JS `Date.toISOString()` = UTC, MySQL `NOW()` = Asia/Manila; fixed by using `DATE_ADD(NOW(), INTERVAL)` directly in SQL
- **deploy.sh analyzed** — 301-line deployment script with preflight, frontend build, backend deploy, Nginx setup
- **Frontend client.js updated** — API_BASE → `http://localhost:3004/api` (uses `VITE_API_URL` env var)
- **Server 4GB RAM** — safe to run Node.js + mysql2 (no low-RAM restriction)
- **Production SMS creds differ from CREDENTIALS_REFERENCE.md** — actual iTexMo in SMS_API_settings.php uses `ryan@maskpro.ph` / `Godisgood21!` / `PR-RYANP221047_30CYC` (NOT the ones in CREDENTIALS_REFERENCE)
- **SMS-it API key** also different: `SMSIT_eedd3ff...` with from number `639511047777` (NOT the CREDENTIALS_REFERENCE values)

### 2026-03-12: Standalone Project + Express Rewrite
- **Project moved** from `unify.maskpro.ph/maskprocare-app/` to standalone `care.maskpro.ph/`
- **Legacy PHP pages archived** to `unify.maskpro.ph/_archived_maskprocare-app/`
- **PHP→Express rewrite started** — 22 PHP endpoints mapping to 7 Express route files
- **Port 3004 assigned** on shared droplet for PM2 process `maskpro-care`
- **Database stays shared** with Unify (`unify_maskpro`) — only touch Care's tables
- **Stack uniformity goal:** All MaskPro apps now use React + Express/Node.js + MySQL
- `config.php` updated: production host → `care.maskpro.ph`, local → `care.maskpro.ph/`
- Agent rules rewritten for Express architecture + shared droplet boundaries

### 2026-03-10: Booking Flow & Vehicle Photos
- `booking_requests` uses `customer_vehicle_id` (not `vehicle_id`) and `time_added` (not `created_at`)
- `bookings` table has no `status` column — derived from notes pattern
- Availability endpoint needs to accept GET (not just POST) for frontend `api.get()` calls
- Vehicle photo upload: WebP auto-conversion via GD, max 1200px, ~200KB target
- Unify schema upgraded to v1.15.0: added `cancelled` enum, `edit_history`, `cancellation_reason` columns
- Race condition guard: approve/reject/edit all check `WHERE status = 'pending'`
- Cancel flow: requests use `status='cancelled'` + `cancellation_reason`; bookings use `notes LIKE 'CANCELLED:%'` pattern
