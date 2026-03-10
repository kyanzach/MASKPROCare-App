---
trigger: always_on
glob:
description: Rules, learnings, and guardrails for the MaskPro Care App (customer-facing vehicle maintenance app)
---

# MaskPro Care App — Agent Rules & Learnings

## 🏗️ Architecture Context

- **Current stack:** Vanilla PHP + MySQL + Apache (XAMPP) — server-rendered pages
- **Migration in progress:** Moving to React (Vite) SPA + PHP REST API backend with JWT auth
- **Target:** React web app + React Native (Expo) mobile app, same PHP API backend
- **Shared database:** Same MySQL DB used by Unify (agent CRM), GetSales (commissions), and this app

---

## ⚠️ Things to AVOID (Learned the Hard Way)

### 1. Never mix PDO and MySQLi
- The entire ecosystem uses `mysqli` via `db_connect.php` (`$conn` / `$mysqli`)
- `dashboard.php` was found using PDO + `config/database.php` — this is a **dead file** from a different template
- **Rule:** Always use `$conn` from `db_connect.php`. Never introduce `PDO` or separate DB config files.

### 2. Never use `$_SESSION['user_id']` in this app
- `user_id` is for the **agent/staff** Unify app
- This customer app uses `$_SESSION['customer_id']`
- **Mixing these causes silent data leaks** where one customer sees another's data

### 3. Don't duplicate utility functions
- `standardize_mobile_number()` and `get_last_10_digits()` exist in BOTH `functions.php` AND `login.php`
- When refactoring, consolidate to `functions.php` only
- PHP will fatal error on "cannot redeclare function" if both files are included

### 4. Don't use `session_start()` in page files
- `config.php` already handles session lifecycle
- Calling `session_start()` again causes "headers already sent" errors
- **Rule:** Only `config.php` starts sessions. All other files just `require_once('config.php')`.

### 5. Don't use `git add -A` or `git add .`
- This project has `.php.backup` files, `logfiles/`, and `.DS_Store` scattered around
- Always stage specific files: `git add file1.php file2.php`

### 6. Never hardcode service types in multiple places
- Service types are currently a PHP array in `bookings.php` lines 45-55
- If adding new services, you must update the array AND any JS that references them
- **Future fix:** Move service types to a DB table in Phase 1

---

## ✅ Patterns That Work

### Database Access Pattern
```php
require_once('db_connect.php');   // provides $conn ($mysqli alias)
$stmt = $conn->prepare("SELECT * FROM vehicles WHERE customer_id = ?");
$stmt->bind_param("i", $customerId);
$stmt->execute();
$result = $stmt->get_result();
$stmt->close();
```

### Session Check Pattern
```php
require_once('config.php');      // starts session, sets constants
if (!isset($_SESSION['customer_id'])) {
    header('Location: login.php');
    exit;
}
$customerId = (int)$_SESSION['customer_id'];
```

### API Response Pattern
```php
function api_response($success, $data = null, $message = '') {
    echo json_encode([
        'success' => $success,
        'data'    => $data,
        'message' => $message
    ]);
    exit;
}
```

### Mobile Number Handling
- Always store as `+639XXXXXXXXX` (E.164 format)
- Compare using last 10 digits (strips country code variations)
- Use `standardize_mobile_number()` from `functions.php` — never roll your own

---

## 🔒 Security Checklist

- [ ] All DB queries use prepared statements (parameterized) — no string concatenation
- [ ] All user output uses `htmlspecialchars()` to prevent XSS
- [ ] API endpoints validate that resources belong to the authenticated customer (ownership check)
- [ ] Branch isolation: customers only see their branch's data
- [ ] JWT tokens (once implemented) stored in httpOnly cookie (web) or SecureStore (mobile)
- [ ] CORS restricted to specific allowed origins — no wildcard `*`
- [ ] Rate limit OTP sending: max 3 per mobile per 15 minutes

---

## 📁 File Map (Key Files)

| File | Purpose | Notes |
|------|---------|-------|
| `config.php` | App constants, session, env detection | **Entry point** — include first |
| `db_connect.php` | MySQLi connection | Provides `$conn` and `$mysqli` |
| `functions.php` | Shared utilities | Mobile formatting, date helpers, auth checks |
| `api.php` | REST API (legacy monolith) | Being replaced by `/api/` directory |
| `SMS_API_settings.php` | ITEXMO + SMS-it dual-provider SMS | `sendSms()` primary, `retrySms()` fallback |
| `includes/header.php` | Shared page layout | Bootstrap 5 NiceAdmin template |
| `includes/booking_capacity_helper.php` | Branch capacity logic | Used by bookings + availability check |

---

## 🗄️ Database Tables (Referenced in Code)

| Table | Used By | PK |
|-------|---------|-----|
| `customers` | All pages | `id` |
| `vehicles` | vehicles.php, index.php | `id` (NOT `vehicle_id`) |
| `bookings` | bookings.php, index.php | `booking_id` (NOT `id`) |
| `booking_services_to_perform` | bookings detail | `id` |
| `booking_requests` | bookings.php (new flow) | `request_id` |
| `booking_request_services` | bookings.php | `id` |
| `branch_booking_capacity` | capacity helper | `id` |
| `login_otp` | login.php, api.php | `id` — **otp_code is NOT NULL** |

### ⚠️ Real `bookings` table schema (Phase 1 discovery)
The `functions.php` helpers assume wrong column names. The REAL schema:
- PK is `booking_id` (not `id`)
- Vehicle FK is `customer_vehicle_id` (not `vehicle_id`)
- No `status` column — cancellation tracked via `notes LIKE '%CANCELLED:%'`
- No `scheduled_date`/`scheduled_time` — uses `booking_date` (datetime)
- `login_otp.otp_code` does NOT allow NULL — use empty string to clear

---

## 🆕 API v2 Patterns (Phase 1)

### API v2 File Structure
```
api/v2/
├── .htaccess          ← Front-controller (routes all to index.php)
├── index.php          ← Router (parses REQUEST_URI)
├── config/cors.php    ← CORS with origin allow-list
├── config/jwt.php     ← JWT encode/decode helpers
├── helpers/response.php ← api_success(), api_error()
├── middleware/auth.php ← Auto-authenticates, sets $authCustomerId
├── auth/              ← login, verify, logout (public)
├── vehicles/          ← list, detail, create, update, delete (JWT)
├── bookings/          ← list, detail, create, cancel, availability (JWT)
├── services/          ← list (public)
├── profile/           ← get, update (JWT)
└── dashboard/         ← stats (JWT)
```

### JWT Auth Pattern
```php
// In any protected endpoint:
require_once __DIR__ . '/../middleware/auth.php';
// After this line, $authCustomerId, $authBranchId, $authMobile are available
```

### Response Pattern
```php
api_success(['key' => $data], 'Success message');       // 200
api_success(['key' => $data], 'Created', 201);          // 201
api_error('Validation failed', 422, ['field required']); // 422
api_error('Not found', 404);                             // 404
api_error('Auth required', 401);                         // 401
```

### Schema Safety Pattern
Always wrap `functions.php` helpers in try/catch — they use wrong column names:
```php
try {
    $status = get_vehicle_service_status($vehicle);
} catch (\Throwable $e) {
    $status = 'Unknown';
}
```

---

## 🎨 Legacy UX/UI Audit (MUST preserve in React migration)

> ⚠️ **RULE**: The React frontend MUST faithfully reproduce ALL design patterns, colors, layouts, sections, tabs, and UX flows from the legacy PHP app. Never create a "simpler" version — carry over every detail.

### Color Palette & Theme
- **Login/Auth**: Indigo→Cyan gradient background (`#4f46e5→#06b6d4`), white card with 4px gradient top border
- **App pages**: Blue gradient background (`#eff6ff→#dbeafe→#bfdbfe→#93c5fd`)
- **Cards**: White glassmorphic (`rgba(255,255,255,0.95)`) with `backdrop-filter: blur(20px)`, 4px gradient top stripe, `border-radius: 24px`
- **Primary gradient**: `linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)`
- **CSS variables**: `--primary-gradient`, `--border-radius-card: 16px`, `--transition-smooth: all 0.3s cubic-bezier(0.4, 0, 0.2, 1)`

### Login Page (login.php)
- Title: "Welcome Back" (gradient text)
- Subtitle: "Enter your mobile number to access your account"
- Input placeholder: "09XX XXX XXXX" (no +63 prefix — accepts 09 format)
- Help text: "Please use the mobile number registered for the service or from where you receive maintenance reminders"
- Button: "Continue with Mobile" (gradient, full width)
- Footer: Terms of Service + Privacy Policy links, divider, security badge ("Secured by MaskPro" with shield + lock icons)
- Below card: Support number "Need help? Contact our support team at +63-1800-1-550-0037"
- Floating logo icon with `animation: float 3s ease-in-out infinite` + pulse ring
- **URL pre-fill UX**: Supports `?mobile=09173333589` URL param from admin/sales links → pre-fills the input so customer doesn't have to type. After OTP sent, redirects to `login-verify.php?mobile=+639XXXXXXXXX` so the verify page knows which number.

### OTP Verify Page (login-verify.php)
- Title: "Verify OTP"
- OTP input: monospace `'Courier New'`, 24px, `letter-spacing: 8px`, placeholder "000000", green border on complete (6 digits)
- Help text: "Enter the 6-digit OTP sent to +639XXXXXXXXX"
- Button: "Verify & Continue"
- Two secondary buttons: "Resend OTP" + "Use Different Number" (outlined, full width)
- Footer: Terms of Service + Privacy Policy, "Secured with 256-bit SSL encryption" badge

### Dashboard (index.php)
- Welcome: "Welcome back, {full_name}! 👋" (gradient text)
- Subtitle: "Manage your vehicles and appointments with ease"
- CTA button: "Book Now" (gradient, top right)
- **4 stats cards** (24px border-radius, 4px gradient top stripe, hover lifts -12px):
  1. Total Vehicles — blue icon `fas fa-car`
  2. Needs Service — amber icon `fas fa-spray-can`
  3. Upcoming — cyan icon `fas fa-calendar-check`  
  4. Pending Requests — yellow icon `fas fa-hourglass-half`
- Each stat card: icon (65×65px gradient rounded-20px box), value, label, sub-text (e.g. "Active fleet")
- **Upcoming Appointments** section: Modern card with table (date/time, vehicle with icon, service, status badge, View action)
- **My Vehicles** section: Vehicle cards (3 max, with make-specific colored icons, year/mileage stats, Details + Service buttons)

### Vehicle Icon System (index.php lines 17-61)
- Maps vehicle makes to specific gradient colors: Toyota=red, Honda=blue, Nissan=gold, Mitsubishi=green, Hyundai=purple, etc.
- SUV models (Innova, Fortuner) use `fa-car-side`, trucks use `fa-truck`, vans use `fa-shuttle-van`
- Default: sky blue gradient

### Sidebar (header.php)
- Items: Dashboard (`bi-grid`), My Bookings (`bi-calendar-check`), My Vehicles (`bi-car-front`), Services (collapsible dropdown with sub-items: Nano Ceramic Coating, Nano Ceramic Tint, PPF, Auto Paint, Full Detailing), Profile (`bi-person`), F.A.Q (`bi-question-circle`), Contact (`bi-envelope`)
- "Account" heading separator between main nav and Account section
- Active state: not collapsed class on current page

### Top Header (header.php)
- Logo + MaskPro Care text, sidebar toggle
- Search bar
- Notifications bell with badge count dropdown
- Profile avatar (ui-avatars.com), dropdown with: My Profile, Account Settings, Need Help?, Sign Out

### Bookings Page (bookings.php — 1681 lines)
- **Tabs** (Bootstrap nav-tabs, centered, gradient active state): My Bookings, New Booking, Pending Requests
- **Booking cards**: 20px rounded, glassmorphic, with status badges (Scheduled=green, Done=blue, Cancelled=red)
- **New Booking form**: Vehicle dropdown, service type dropdown (10 types), custom calendar with capacity check (available=green, unavailable=red with strikethrough, past=gray, closed=dark), time slots
- **Cancel booking**: Confirm modal

### Vehicles Page (vehicles.php)
- Breadcrumb: Home > Vehicles
- "Add Vehicle" button → Bootstrap modal with form (Make, Model, Plate, Color, Size dropdown)
- Card grid (col-lg-4 col-md-6), 16px rounded, shadow, with:
  - Make/Model title, plate no badge
  - 3-dot dropdown menu (Edit, Delete)
  - Color/size/year details
- Edit vehicle: Same modal, populated fields
- Delete: Confirm action

### Profile Page (profile.php)
- Two-column layout (xl-4 / xl-8)
- Left: Avatar card (100px gradient circle, full name, stat row: Vehicles | Bookings | Completed), Quick Info card (mobile, email, branch, birthday, address), Logout card
- Right: Edit Profile card with tabbed form (Overview, Edit Profile tabs)
- Edit form: Full Name, Email, Address inputs

---

## 📋 Migration Status

- **Phase 1 (API Refactor):** ✅ Complete — 17 endpoints, JWT auth, CORS secured
- **Phase 2 (React Web):** Not started
- **Phase 3 (Deploy):** Not started
- **Phase 4 (React Native):** Not started
- **Phase 5 (App Stores):** Not started

> Update this section as phases are completed.

