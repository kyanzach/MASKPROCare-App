# Changelog

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
