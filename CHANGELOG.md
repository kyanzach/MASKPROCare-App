# Changelog

## [v1.4.0] — 2026-03-13
### Added
- **Complete PHP → Express/Node.js API rewrite** — all 22 endpoints ported to `server/`
  - `server/routes/auth.js` — login (OTP + SMS), verify (JWT), logout
  - `server/routes/vehicles.js` — list, detail, create, update, delete, photo upload (multer + sharp)
  - `server/routes/bookings.js` — list, detail, create, cancel, availability, edit-request
  - `server/routes/dashboard.js` — stats (vehicles, bookings, upcoming, completed)
  - `server/routes/profile.js` — get, update
  - `server/routes/notifications.js` — list, count, mark_read
  - `server/routes/services.js` — list (conditional NanoFix based on MNCC history)
- **Express server infrastructure:**
  - `server/index.js` — Entry point (port 3004, CORS, JSON parsing, error handling)
  - `server/db/connection.js` — mysql2 pool (Asia/Manila timezone)
  - `server/middleware/auth.js` — JWT verification (same secret + payload as PHP)
  - `server/services/sms.js` — Full port of SMS_API_settings.php (iTexMo + SMS-it with GSM sanitizer)
  - `server/utils/mobile.js` — PH mobile number helpers
- `.env` with all environment variables (DB, JWT, SMS keys)
- `package.json` with Express dependencies (mysql2, jsonwebtoken, multer, sharp, cors, axios)
- `deploy.sh` deployment documentation in reference docs

### Changed
- `frontend/src/api/client.js` — API_BASE changed from PHP path to `http://localhost:3004/api`
- `.gitignore` — added `logfiles-new/`
- Version bumped from v1.3.0 to v1.4.0

### Fixed
- **OTP timezone bug** — Node.js `Date.toISOString()` stored UTC time but MySQL `NOW()` uses Asia/Manila, causing all OTPs to appear expired. Fixed by using `DATE_ADD(NOW(), INTERVAL)` in SQL.

## [v1.3.0] — 2026-03-10
### Added
- **Internal notification system** — bell icon with red badge count, dropdown panel
  - `customer_notifications` DB table
  - API endpoints: `notifications/list`, `notifications/count`, `notifications/mark_read`
  - 60-second polling for unread count
  - Type-based icons (registration_renewal, booking, system)
  - Mark single or all as read, deep-link navigation
- **Vehicle photo placeholder** — grey car silhouette with "Snap a photo of your ride" CTA
- **Philippine vehicle registration renewal logic** — calculates next renewal from registration date (first 3 years free, then annual)

### Changed
- Profile: **"Quick Info" → "Contact Details"** with address-book icon
- Email always shown in Contact Details (displays "Not set" if empty)
- Login logo: **removed CSS circle/shadow/pulse** — just clean floating image
- Login footer text: forced single-line with `white-space: nowrap`
- Dropdown menu z-index: `50 → 200` (fixes menu hiding behind card edges)
- Renamed `registration_expiry` → `registration_date` (DB column, API, frontend)
- Form label: "Registration Expiry" → "Vehicle Registration Date"
- Footnote text updated for PH renewal logic explanation
- Bell icon in both sidebar header and mobile header
- Mobile header: bell + avatar grouped on right side
- Version bumped from v1.2.0 to v1.3.0



## [v1.2.0] — 2026-03-10
### Added
- **Registration expiry** date field for vehicles (form + DB column + API)
- Friendly SMS renewal reminder footnote on Add/Edit Vehicle modal
- **Version badge** (v1.2.0) displayed in sidebar next to brand name
- Real **MaskPro logo** replaces shield icon on login, sidebar, mobile header, favicon
- **Color dot indicator** on vehicle cards (maps vehicle color to CSS dot)

### Changed
- Branding updated to **MASKPROCare** (uppercase MASKPRO)
- Dashboard greeting uses **first name only** (e.g. "Welcome back, Kyrah!")
- Vehicle cards: removed box-style Color/Size stats, replaced with inline badges
- **Book Now** button on dashboard now auto-opens booking modal on Bookings page
- Top header hidden on desktop (sidebar already has logo); shown only on mobile
- Page title updated to "MASKPROCare — Vehicle Maintenance & Protection"

### Removed
- Vehicle **Size** field removed from form, API, and card display
- Redundant year/size stat boxes from vehicle cards on Dashboard

## [v1.1.0] — 2026-03-10
### Added
- **API v2 REST endpoints** — Complete modular REST API with JWT authentication
  - `api/v2/` directory with 22 files (router, config, middleware, 17 endpoints)
  - Auth endpoints: login (OTP), verify (JWT), logout
  - Vehicle endpoints: list, detail, create, update, delete
  - Booking endpoints: list, detail, create, cancel, availability
  - Services: list (public, no auth)
  - Profile: get, update
  - Dashboard: stats (vehicles, bookings, upcoming/recent)
- **JWT authentication** via `firebase/php-jwt` (Composer)
  - Bearer token in Authorization header
  - 24-hour token expiry
  - Apache header pass-through in `.htaccess`
- **Secure CORS** — Origin allow-list instead of wildcard `*`
- **OTP rate limiting** — Max 3 OTP requests per mobile per 15 minutes
- **Standard JSON response format** — `{ success, data, message, errors }`
- `.gitignore` for vendor/, backups, logs, IDE files
- `api/v2/.htaccess` front-controller routing

### Fixed
- OTP verification NULL column crash (`otp_code` column doesn't allow NULL)
- DB schema mismatches in dashboard/bookings (using real `customer_vehicle_id`, `booking_id` PK)

### Changed
- `.htaccess` — Added v2 API routing, legacy API preserved with backward compatibility
- Protected `vendor/` and `composer.*` from direct web access
