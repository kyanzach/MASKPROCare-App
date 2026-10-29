# Changelog

## [v1.17.12] — 2026-10-30
### Added & Fixed
- **Added Izumi AI Login Helper Modal & Trigger Buttons to Native iOS & Android Login Screen (`mobile/app/login.tsx`, `mobile/components/ui/AiLoginModal.tsx`, `mobile/app/admin.tsx`)**:
  - Created native `mobile/components/ui/AiLoginModal.tsx` for iOS & Android with full conversational identity verification (`/auth/ai-login/session` and `/auth/ai-login/message`), live typing state, score badge, working **Try Again** reset, and keyboard-avoiding layout.
  - Added **"SMS Delayed or Unavailable? Verify with AI Helper"** on Step 1 (`mobile`) and **"SMS Delayed? Login with AI Assistant"** on Step 2 (`otp`) in `mobile/app/login.tsx`.
  - Replaced legacy purple/indigo hex codes (`#4f46e5`, `#6366f1`, `#4338ca`) in `mobile/app/login.tsx` with MaskPro royal/sky blue (`#2563eb`, `#0284c7`, `#1d4ed8`).
  - Replaced `Ionicons` with `FontAwesome` in `mobile/app/admin.tsx` search input so `npx tsc --noEmit` compiles with zero errors.

## [v1.17.11] — 2026-10-29
### Added
- **Multi-Field Search & Sort Bar in Magic Link Security & Intrusion Audit Log Across Web, iOS & Android (`server/routes/admin.js`, `frontend/src/pages/AdminPanel.jsx`, `mobile/app/admin.tsx`)**:
  - Added instant client-side + server-side search (`sec_search`) across customer name, mobile number, customer ID (`#1924`), event ID, vehicle make/model/plate, URL slug, attempted/bound device, browser/OS, device fingerprint hash, IP address, location/ISP, and HTTP server code.
  - Added a 5-mode sort selector (`sec_sort`: `Sort: Newest First`, `Sort: Most Attempts`, `Sort: Customer Name (A–Z)`, `Sort: IP Address`, `Sort: Oldest First`) for rapid customer support troubleshooting on Desktop Web, Mobile Web, iOS, and Android.

## [v1.17.10] — 2026-10-29
### Changed
- **Strict Per-Booking Service Category Matching with Short-Form Acceptance in Izumi AI Identity Verification (`server/routes/aiAuth.js`)**:
  - Reverted the `coating <-> nanofix` equivalence and cross-booking dilution so Izumi strictly verifies the exact service category recorded on that specific booking (`mScore + sScore + vScore` evaluated as a single booking unit).
  - Kept short-form acceptance within each true service category: `maintenance` and `nanofix` share the same category (`Nano Fix (Maintenance)`), while `coating` matches `Nano Ceramic Coating` / `Graphene Coating`, `tint` matches `Nano Ceramic Tint` / `Window Tint`, and `ppf` matches `PPF` / `Paint Protection Film`.

## [v1.17.9] — 2026-10-29
### Fixed & Improved
- **Smarter Izumi AI Identity Verification: Cross-Booking Service Matching, NanoFix/Coating Domain Equivalence & Year-Only Acceptance (`server/routes/aiAuth.js`)**:
  - Investigated `care_ai_login_logs` for `customer_id = 1924` (`Ryan Paco`): `"2021 march"` scored a full `25/25` (order-independent month+year parsing worked), `name` scored `25/25`, `vehicle` (`innova`) scored `15/15`, and `mobile` scored `15/15`, but `booked_service` (`nano ceramic coating`) scored `0/20` (`total = 80%`) because the earliest March 2021 booking (`#6964`) was imported as `"Nano Fix (Maintenance)"` while `"Nano Ceramic Coating"` was on a later booking (`#14946`).
  - Updated `server/routes/aiAuth.js` to evaluate Month, Service, and Vehicle across the customer's full booking and vehicle history, and added domain equivalence between `Nano Ceramic Coating` and `Nano Fix (Maintenance)`.
  - Updated `parseMonthFromText()` and `evaluateMonthScore()` to silently accept year-only answers (`22/25 pts`, e.g., `"2021"` or `"i forgot it seems like 2021"`) while keeping the prompt encouraging **month and year** (`"What month and year was your first visit or booking with MaskPro? (For example: March 2021, or July 2024)"`).

## [v1.17.8] — 2026-10-29
### Fixed
- **Fixed Izumi AI Login Helper "Try Again" Button Not Restoring Chat Input Field (`frontend/src/components/AiLoginModal.jsx`)**:
  - Updated `startSession()` in `AiLoginModal.jsx` to reset `verificationResult` (`null`), `inputText` (`''`), `isTyping` (`false`), and `messages` (`[]`) when clicking **Try Again**, so the bottom footer immediately restores the chat text input and send button instead of keeping the `Try Again` / `Use Standard OTP` buttons stuck on screen.

## [v1.17.7] — 2026-10-29
### Fixed
- **Fixed Mobile Web Admin Tab Bar Overlapping & iOS Header Button Clipping (`frontend/src/pages/AdminPanel.jsx`, `mobile/app/admin.tsx`)**:
  - Updated the 3-tab navigation bar in `AdminPanel.jsx` to use clean single-word labels (`Dashboard`, `Moderation`, `Impersonate`) with `flex: 1, minWidth: 0, overflow: 'hidden'`, eliminating text overlap and horizontal scrollbars on Mobile Web while matching the native iOS & Android segmented tab bar.
  - Added `flex: 1` and single-line truncation to `headerLeft` in `mobile/app/admin.tsx` so the top-right `App` and sign-out buttons never clip on narrower iOS/Android viewports.

## [v1.17.6] — 2026-10-29
### Fixed & Added
- **Removed Admin Identity OPSEC Leak on Public Security Blocked Page & Added iOS/Android Pagination Bars (`server/routes/auth.js`, `frontend/src/pages/MagicLinkGate.jsx`, `mobile/app/admin.tsx`)**:
  - Removed internal admin names (`Manually blocked by Admin (Ryan Paco)`) from the public `403 DEVICE_BLOCKED` / `IP_BLOCKED` response in `server/routes/auth.js` and `frontend/src/pages/MagicLinkGate.jsx` so blocked external devices only see a neutral `"Access from this device has been restricted by MaskPro Security Shield"` message while keeping the admin audit trail private in the database.
  - Added full pagination footer controls (`Prev`, page number pills, `Next`, and `Showing X–Y of Z`) plus smart lazy-prefetching to both **Who Uses the App (10/page)** and **Magic Link Security & Intrusion Log (5/page)** on iOS and Android (`mobile/app/admin.tsx`), along with event filter pills (`All`, `Blocked`, `Opens`, `Bots`).

## [v1.17.5] — 2026-10-29
### Changed
- **Widened Admin Control Center Wrapper & Tuned Magic Link Security Table Column Widths (`frontend/src/pages/AdminPanel.jsx`)**:
  - Increased the outer container width in `AdminPanel.jsx` from `maxWidth: '1180px'` to `maxWidth: '1580px'` (`width: '100%'`) and refined the 8 column `minWidth`s and cell paddings in the **Magic Link Security & Intrusion Audit Log** table so all 8 columns fit side-by-side without horizontal scrolling on desktop screens.

## [v1.17.4] — 2026-10-29
### Added & Changed
- **Reordered Admin Dashboard Bottom Widgets, Added Smart Lazy-Prefetch Pagination (10/page & 5/page), and Added Dedicated Device/IP Blocked Security Gate UI (`server/routes/admin.js`, `server/routes/auth.js`, `frontend/src/pages/AdminPanel.jsx`, `frontend/src/pages/MagicLinkGate.jsx`, `mobile/app/admin.tsx`)**:
  - Moved **Who Uses the App (Active Customers & Device Log)** to **2nd to last** and paginated it to **10 per page** with automatic background lazy-prefetching of pages `N+1` and `N+2` when moving to page 2+.
  - Moved **Magic Link Security & Intrusion Audit Log** to the **very last bottom widget** and paginated it to **5 per page** with automatic background lazy-prefetching of pages `N+1` and `N+2` when moving to page 2+ (saving server resources by querying only 2 pages initially and pausing 5s polling when the browser tab is hidden).
  - Added a dedicated red **Device Blocked by Security** / **Network IP Blocked** card on `MagicLinkGate.jsx` when `DEVICE_BLOCKED` or `IP_BLOCKED` is returned; clicking the green **`Unblock Device`** button in the Admin Control Center immediately restores the device back to the blue **`Already Active on Another Device`** screen.

## [v1.17.3] — 2026-10-29
### Fixed & Improved
- **Fixed Magic Link Security Audit Log Collation Mismatch & Added Full Server-Log Forensics + Live Monitoring Blinking Red Dot (`server/routes/admin.js`, `server/routes/auth.js`, `frontend/src/pages/AdminPanel.jsx`, `frontend/src/pages/MagicLinkGate.jsx`)**:
  - Resolved `ERROR 1267: Illegal mix of collations (utf8mb4_unicode_ci and utf8mb4_general_ci)` between `care_magic_link_security_logs` and `care_blocked_ips` that caused the table rows to fail silently while the `Blocked Attempts: 6` counter incremented.
  - Added forensic columns (`request_url`, `http_status`, `server_code`, `browser_detail`, `os_detail`, `request_headers`) to `care_magic_link_security_logs` and backfilled all Nginx access log events (`16:00:17`, `16:45:33`, `18:57:18` Android opens, `18:59:37` Facebot/Twitterbot preview crawler, `18:59:48` iPhone block, and `21:43:17`–`21:44:12` Mac Chrome blocks).
  - Enhanced the **Magic Link Security & Intrusion Audit Log** widget with a pulsing **blinking red dot (`LIVE MONITORING`)** indicator, event filter pills (`All Server Events`, `Blocked Intrusions`, `Authorized Opens`, `Preview Bots`), copyable exact accessed URL, HTTP status & server code badges, parsed Browser & OS/Hardware details, SHA-256 device fingerprint, full raw `User-Agent`, Geo-IP + ISP location, visual brute-force progress bars (`Device x/10`, `IP x/100`), and exact down-to-the-second timestamps.

## [v1.17.2] — 2026-10-29
### Added
- **Added `Current Location (Optional)` Field to iOS & Android Community S.O.S. Post Form (`mobile/app/(tabs)/community.tsx`)**:
  - Added the `Current Location (Optional)` text input (`E.g. SM Lanang Premier parking, Davao City`) and `"Broadcast S.O.S."` button label to the native iOS and Android Create Post modal when `MASKPRO S.O.S.` is selected, matching the Web App, and rendered the location badge on S.O.S. post cards and the detail modal.

## [v1.17.1] — 2026-10-29
### Changed
- **Repositioned MaskPro Icon Logo Below CTA Button on Magic Link Gate (`frontend/src/pages/MagicLinkGate.jsx`)**:
  - Moved the `/maskpro_logo.png` icon from above the mobile/link status icon to below the `"Login Here with Mobile Number"` button with `24px` top spacing headroom.

## [v1.17.0] — 2026-10-29
### Added & Improved
- **Magic Link Security & Intrusion Audit Log + Tiered Brute-Force Shield (`server/routes/auth.js`, `server/routes/admin.js`, `frontend/src/pages/AdminPanel.jsx`, `mobile/app/admin.tsx`)**:
  - Created `care_magic_link_security_logs` and `care_blocked_devices` tables to track every Magic Link security event (`first_bind`, `device_locked_elsewhere`, `invalid_token`, `invalid_slug`, `revoked_link`, `device_blocked`, `ip_blocked`) with full forensics: target customer, vehicle, link slug, attempted device vs locked device, raw `User-Agent`, IP address, Geo-IP + ISP location (`ip-api.com`), and 24h device/IP attempt counters.
  - Implemented elderly-safe **3-Tier Brute-Force Protection**:
    - **Tier 1 (Attempts 1–9 on a device)**: Soft `403` warning (`Already Active on Another Device`) with option to sign in via mobile number—prevents false-positive lockouts for elderly users or family members.
    - **Tier 2 (10th failed attempt on the same device in 24h)**: Automatically blocks the offending device (`care_blocked_devices`).
    - **Tier 3 (100th failed attempt from the same IP in 24h)**: Automatically blocks the offending IP address (`care_blocked_ips`).
  - Added the **Magic Link Security & Intrusion Audit Log** widget to the Admin Control Center (Web + Native iOS/Android) with 1-click security actions (`Block Device` / `Unblock Device`, `Block IP` / `Unblock IP`, `Reset Lock` to allow customer device re-binding, and `Revoke Link` / `Restore Link`), and backfilled the `18:59:48` iPhone test attempt.

## [v1.16.7] — 2026-10-29
### Fixed
- **Fixed MySQL Left-to-Right `UPDATE` Evaluation on Subsequent Magic Link Clicks (`server/routes/auth.js`)**:
  - In `v1.16.6`, placing `SET last_accessed_at = NOW()` before `access_count = IF(... TIMESTAMPDIFF(SECOND, last_accessed_at, NOW()) >= 10 ...)` caused MySQL's left-to-right `SET` evaluation to overwrite `last_accessed_at` with `NOW()` first, making `TIMESTAMPDIFF` always `0` on subsequent clicks while `care_app_telemetry` (`SESSIONS: 3`) incremented properly.
  - Replaced the inline SQL `TIMESTAMPDIFF` expression with `SET access_count = access_count + ?, last_accessed_at = NOW()` bound to `isDuplicateBurst ? 0 : 1`, and synced the `18:57:18` click (`access_count = 3`) in `care_magic_links`.

## [v1.16.6] — 2026-10-29
### Fixed
- **Fixed Magic Link Double-Counting on Click (`frontend/src/pages/MagicLinkGate.jsx`, `frontend/src/context/AuthContext.jsx`, `server/routes/auth.js`)**:
  - Added a `verifiedSlugRef` guard in `MagicLinkGate.jsx` and wrapped `login()` in `useCallback` in `AuthContext.jsx` so calling `login()` upon magic link verification no longer re-triggers `useEffect` a second time on the same click (`2 clicks × 2 = 4`).
  - Added a 10-second burst deduplication window in `POST /api/auth/magic-verify` (`server/routes/auth.js`) so rapid back-to-back verification requests on the same click only increment `access_count` and `session_count` once.
  - Corrected the existing `ryanp-bydtang-01` magic link `access_count` and `magic_link` telemetry `session_count` from `4` to the exact `2` clicks performed.

## [v1.16.5] — 2026-10-29
### Fixed & Improved
- **Fixed Admin Dashboard Auth Funnel Widget Counts (`server/routes/admin.js`, `server/routes/auth.js`, `server/routes/aiAuth.js`, `server/middleware/auth.js`)**:
  - Fixed column names in `GET /api/admin/dashboard` so all 3 authentication funnel cards query the exact database columns instead of falling back to `0`:
    - **1-Click Magic Link Logins (`care_magic_links`)**: Queries `access_count` (`Links Sent`, `Opened`, `Clicks`, and `Unique Users`) instead of the non-existent `used_count`.
    - **SMS OTP Logins (`login_otp`)**: Added `request_count` and `verified_count` counters to `login_otp` (incremented on `POST /api/auth/login` and `POST /api/auth/verify`) and queried `mobile_number` / `last_login` instead of `mobile` / `used`.
    - **AI Smart Verification (`care_ai_login_sessions` & `care_ai_login_logs`)**: Queries `status = 'verified'` and `status = 'success'` instead of `verified = 1`.
  - Updated `recordAppTelemetry()` in `server/middleware/auth.js` so login endpoints (`OTP`, `Magic Link`, `AI Helper`, `Admin Login`) immediately record new sessions with their exact `auth_method`.

## [v1.16.4] — 2026-10-29
### Changed
- **Reordered Sidebar Navigation Menu (`frontend/src/components/Layout.jsx`)**:
  - Updated the sidebar navigation menu order to: `1. Dashboard`, `2. My Bookings`, `3. My Vehicles`, `4. My MASKPROCare Cards`, `5. Aftercare`, `6. Community Care`, and `7. Shop`.

## [v1.16.3] — 2026-10-29
### Fixed
- **Fixed Sidebar Header Admin Button & Notification Bell Overflow on Desktop & Mobile Web (`frontend/src/components/Layout.jsx`, `frontend/src/index.css`)**:
  - Moved the compact `Admin` badge inline with the `v1.16.3` version pill directly underneath `MASKPROCare` inside `.sidebar-header`, preventing the `Admin` pill and Notification Bell from overflowing past the `280px` sidebar width onto the main content area on Desktop.
  - Added `visibility: hidden; pointer-events: none;` on `.sidebar:not(.open)` and hid `.sidebar-bell-wrap` on mobile viewports (`@media (max-width: 768px)`) so the desktop sidebar bell never bleeds onto the top-left mobile hamburger menu (`☰`).

## [v1.16.2] — 2026-10-29
### Fixed & Improved
- **Purged Test Community S.O.S. & Discussion Posts + Cascaded Notification Cleanup on Post Delete/Reject (`server/routes/admin.js`)**:
  - Deleted the 2 test posts (`"Flat tire po ako need help"` and `"Can I apply wax in my vehicle?"`), their comments, and all associated `customer_notifications` and `notifications` rows from the production database.
  - Updated `POST /api/admin/community/moderate` (`delete` and `reject` actions) to automatically delete any associated `customer_notifications` and `notifications` rows for that post so deleted/rejected posts never leave lingering alerts in any user's Notification Bell.
- **Prevented Historical / Next-Day Push Notification Spam (`mobile/services/notificationService.ts`)**:
  - Updated `syncAndAlertNewNotifications()` so first-time logins calibrate `lastSeenId` without firing historical push banners, and only fresh unread notifications created within the last **30 minutes** trigger a pop-up OS push banner (older notifications remain quietly inside the Notification Bell list without popping up as a banner the next day).

## [v1.16.1] — 2026-10-29
### Fixed & Improved
- **Fixed `/api/admin/dashboard` 500 Error & Focused KPIs on App Access (`server/routes/admin.js`, `mobile/app/admin.tsx`, `frontend/src/pages/AdminPanel.jsx`)**:
  - Removed the non-existent `customer_vehicles` query in `GET /api/admin/dashboard` that caused a `500` error (`Table 'unify_maskpro.customer_vehicles' doesn't exist`).
  - Removed `"0 vehicles"` from the Admin Dashboard KPI cards and replaced it with **App Access & Platform Usage** metrics (`Total Customers (Registered in Unify)`, `Active App Users`, `Web App Users`, `Native App Users (iOS & Android)`, `Pending Approval`, and `Active S.O.S.`).
- **Held Pending Discussion Posts Strictly in Admin Moderation Without Premature Push Alerts (`server/routes/community.js`)**:
  - Updated `GET /api/community/posts` so unapproved `Maintenance Discussion` posts (`moderation_status = 'pending'`) do **not** appear in the Community Care feed until an Admin approves them in the Moderation tab.
  - Stopped inserting `community_moderation` rows into `customer_notifications` on pending post creation so pending posts never trigger a customer push notification before approval.
- **Added Real-Time Auto-Sync Polling to Admin Moderation & Community Feed (`mobile/app/admin.tsx`, `frontend/src/pages/AdminPanel.jsx`, `mobile/app/(tabs)/community.tsx`, `frontend/src/pages/Community.jsx`)**:
  - Added silent 5-second background polling on the Admin Dashboard & Moderation tabs and 6-second polling on the Community Care feed so new pending posts, approvals, and S.O.S. alerts appear automatically without manual refreshing.

## [v1.16.0] — 2026-10-29
### Added & Changed
- **Urgent `MASKPRO S.O.S.` Post & S.O.S. Comment Notifications in Notification Bell + Push Alerts (`server/routes/community.js`, `frontend/src/components/Layout.jsx`, `frontend/src/pages/Community.jsx`, `mobile/components/ui/NotificationModal.tsx`, `mobile/components/ui/TopHeader.tsx`)**:
  - Broadcasting a new `MASKPRO S.O.S.` post or commenting on an S.O.S. thread now automatically inserts `community_sos` and `community_sos_comment` notifications into `customer_notifications` for all active Care users (and `notifications` for Unify staff), immediately populating the Notification Bell list on Web/Android/iOS and triggering high-priority native push alerts via `syncAndAlertNewNotifications()`.
  - Added full interactive **Post Detail & Comments Modal** (`Offer Help / Comment` and `Mark Resolved`) to Web `frontend/src/pages/Community.jsx` matching Mobile `community.tsx`.
- **Default `MASKPRO S.O.S.` First on Mobile + Facebook-Group Style Moderation & EdgeRank Feed (`server/routes/community.js`, `mobile/app/(tabs)/community.tsx`, `frontend/src/pages/Community.jsx`)**:
  - Made `MASKPRO S.O.S.` the first (left) button and default selected tab (`useState('sos')`) when creating a post on Android and iOS (`mobile/app/(tabs)/community.tsx`), matching the Web app.
  - Added `moderation_status ENUM('pending','approved','rejected')`, `moderated_by`, and `moderated_at` to `community_posts`. `MASKPRO S.O.S.` emergencies publish immediately (`approved`), while `Maintenance Discussion` posts require Admin approval (`pending`) and notify Admins (`community_moderation`).
  - Ranked the Community feed using a Facebook Group EdgeRank-style algorithm: Open S.O.S. pinned first → Author's own pending discussions (`Pending Approval` badge) → Approved discussions ranked by engagement & recency decay `((comments * 5 + tech_comments * 8 + 10) / POW(hours_age + 2, 1.4))`.
- **Admin Button in Web Header & Web Profile Page (`frontend/src/components/Layout.jsx`, `frontend/src/pages/Profile.jsx`, `mobile/components/ui/TopHeader.tsx`)**:
  - Added the gold `Admin` shield button in the Web top header and sidebar header (`Layout.jsx`) and the **Admin Panel** card in Web `Profile.jsx`, visible strictly only when `/api/admin/check` returns `isAdmin: true` (hidden for regular customers).
- **3-Tab Admin Control Center: Dashboard & Usage Analytics, Community Moderation Queue, and Customer Impersonation (`server/middleware/auth.js`, `server/routes/admin.js`, `frontend/src/pages/AdminPanel.jsx`, `mobile/app/admin.tsx`, `mobile/api/client.ts`)**:
  - Created `care_app_telemetry` table and non-blocking session/platform telemetry tracking in `server/middleware/auth.js` + `X-Client-Platform` header in `mobile/api/client.ts`.
  - Upgraded Web (`AdminPanel.jsx`) and Mobile (`mobile/app/admin.tsx`) Admin Panels into a 3-tab suite:
    1. **Dashboard & Usage**: Core KPIs, **Platform Breakdown (`Web App`, `Android Native App`, `iOS Native App`)**, **Login & Auth Funnel (`1-Click Magic Links`, `SMS OTP`, `AI Verification`)**, and **Who Uses the App** live customer & device log with 1-click `Login as`.
    2. **Community Moderation**: Filterable queue (`Pending Approval`, `MASKPRO S.O.S.`, `Approved`, `Rejected`) with 1-click `Approve & Publish`, `Reject / Hide`, `Mark S.O.S. Resolved`, and `Delete`.
    3. **Customer Impersonate**: Dedicated searchable customer directory (`7,077` customers) with booking counts and 1-click `Login as`.

## [v1.15.10] — 2026-10-29
### Changed
- **Renamed Sidebar Menu `My Loyalty Cards` to `My MASKPROCare Cards` (`frontend/src/components/Layout.jsx`, `frontend/src/pages/Loyalty.jsx`)**:
  - Updated the sidebar navigation label in `Layout.jsx` (`navItems`) and page heading/breadcrumb in `Loyalty.jsx` from `My Loyalty Cards` / `Loyalty Cards` to `My MASKPROCare Cards` / `MASKPROCare Cards`.
- **Updated Community Care S.O.S. Example Placeholders to Davao Locations (`frontend/src/pages/Community.jsx`, `mobile/app/(tabs)/community.tsx`)**:
  - Updated the `MASKPRO S.O.S.` title and details example placeholders from Manila locations (`EDSA Ayala` / `SM Megamall`) to Davao locations (`E.g. Flat tire at J.P. Laurel Bajada, Davao, need help!` and `SM Lanang Premier parking`) across Web and Mobile.

## [v1.15.9] — 2026-10-29
### Fixed & Added
- **Centered Mobile Header Notifications Dropdown Inside Viewport (`frontend/src/components/Layout.jsx`, `frontend/src/index.css`)**:
  - Fixed the mobile Bell icon Notifications dropdown clipping off the left edge of the phone screen (`otifications`) when anchored to the Bell icon (`~66px` from the right edge of the header).
  - Passed `placement="sidebar" | "mobile"` to `<BellIcon />`, changed click-outside detection to `[data-notif-container="true"]` so both desktop and mobile Bell instances work independently, and styled `.notif-dropdown-mobile` on `@media (max-width: 768px)` with `position: fixed; top: 68px; left: 12px; right: 12px; max-width: 420px; margin: 0 auto;` so the dropdown card is always centered inside the mobile viewport with `12px` left/right margins.
- **Reflected Unify `Branch Schedule` Closed Dates & Holidays in MaskPro Care App (`server/routes/bookings.js`, `frontend/src/pages/Bookings.jsx`)**:
  - Updated `/api/bookings/availability` (`get_available_dates` and `get_available_times`) in `server/routes/bookings.js` to query `branch_closed_dates` for the customer's branch, omitting closed dates from `availableDates` (so Web, Android, and iOS automatically render them as `Closed` / unselectable) and returning `closed_dates` reason labels.
  - Added server-side closed-date validation in `POST /api/bookings/create`, `POST /api/bookings/edit-request`, and `POST /api/bookings/respond-offer` (`counter_date`) to prevent booking on branch-closed dates.
  - Updated `frontend/src/pages/Bookings.jsx` to display the closed reason in the date tooltip (`Closed: <reason>`), strikethrough on closed future dates, and a `Closed` badge in the calendar legend.

## [v1.15.8] — 2026-10-29
### Fixed & Improved
- **Mobile Web Screen Optimization Across `care.maskpro.ph` (`frontend/src/index.css`, `frontend/src/pages/Bookings.jsx`, `frontend/src/components/Layout.jsx`, `frontend/src/components/CounterDateModal.jsx`, `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Profile.jsx`, `frontend/src/pages/Shop.jsx`, `frontend/src/pages/Community.jsx`)**:
  - **Fixed New Booking Modal & 7-Column Calendar Horizontal Overflow on Mobile (`index.css`, `Bookings.jsx`)**:
    - Added `max-width: 100vw; overflow-x: hidden;` on `html, body, #root, .app-layout` and `min-width: 0; max-width: 100%; overflow-x: hidden;` on `.main-content`, `.modal-content`, `.form-group`, `.form-input`, and `.form-select` (`text-overflow: ellipsis`) so long `<select>` option strings (e.g., `"Byd Tang — No plate (Update in My Vehicle)"`) never stretch `.modal-content` wider than the mobile viewport.
    - Updated `.modal-overlay` (`padding: 10px`), `.modal-content` (`max-width: calc(100vw - 20px)`), `.modal-header` / `.modal-body` / `.modal-footer` (`padding: 14px 16px`), and `.booking-calendar-box` (`padding: 10px 8px`) on mobile screens.
    - Refactored `renderCalendar` to use `gridTemplateColumns: 'repeat(7, minmax(0, 1fr))'` with `gap: '3px'` and `minWidth: 0; padding: 0` on all 7 day headers and date buttons so `Sun`–`Sat` and the availability legend fit cleanly on `320px–430px` phone screens without clipping `Fri`/`Sat` or the modal `×` close button.
  - **Added Native-Style Mobile Booking Cards (`Bookings.jsx`, `index.css`)**:
    - Added `.bookings-mobile-cards` on mobile viewports (`<= 768px`) to render each booking/request as a full-width card with status badge, vehicle/service info, offer/counter-date actions, and `Change Date` / `Cancel` buttons instead of forcing horizontal table scrolling.
  - **Optimized Mobile Bottom Nav, Notification Dropdown, Dashboard, Profile, Shop & Community (`Layout.jsx`, `CounterDateModal.jsx`, `Dashboard.jsx`, `Profile.jsx`, `Shop.jsx`, `Community.jsx`)**:
    - Constrained the mobile header Notification Bell dropdown to `width: 'min(360px, calc(100vw - 24px))'` and made the 6-item `.mobile-nav` bar compact (`flex: 1 1 0; min-width: 0; font-size: 10px`) with safe-area bottom inset.
    - Added `flexWrap: 'wrap'` and mobile-safe grid/modal sizing across `Dashboard.jsx`, `Profile.jsx` (`minmax(min(100%, 300px), 1fr)`), `CounterDateModal.jsx`, `Shop.jsx` (`.grid-4`), and `Community.jsx`.

## [v1.15.7] — 2026-10-29
### Changed
- **Renamed `My VIP Cards` / `VIP Cards` to `My MASKPROCare Cards` / `MASKPROCare Cards` (`frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Profile.jsx`, `mobile/app/(tabs)/index.tsx`, `mobile/app/(tabs)/profile.tsx`)**:
  - Updated the Dashboard section heading to `My MASKPROCare Cards` and the Profile tab label to `MASKPROCare Cards` across Web and Native Mobile (iOS & Android).

## [v1.15.6] — 2026-10-29
### Fixed & Improved
- **Unified Calendar Availability Logic & Past-Date Styling Across Web, Android, and iOS (`server/routes/bookings.js`, `frontend/src/pages/Bookings.jsx`, `mobile/app/(tabs)/bookings.tsx`, `mobile/components/ui/CalendarPicker.tsx`)**:
  - **Fixed 1-Slot Service `Almost Full` False Positive (`server/routes/bookings.js`)**: Changed `booked >= max - 1` to `booked > 0 && booked >= max - 1` so services with a daily capacity of `1` (such as `Paint Protection Film (PPF)`) show `Available` (green) when `0` cars are booked (`0/1`), instead of showing `Almost Full` (yellow) on empty days.
  - **Removed Colored Borders on Past Dates on Web (`frontend/src/pages/Bookings.jsx`)**: Checked `isPast || isSunday` first before `isLimited / isAvailable / isUnavailable` in both `calendarDays` and `renderCalendar` so past days (`Oct 1`–`Oct 28`) render as clean muted gray disabled cells matching Android and iOS, instead of showing red/yellow/green borders on past dates.
  - **Aligned Mobile Availability Query & Local Timezone (`mobile/app/(tabs)/bookings.tsx`, `mobile/components/ui/CalendarPicker.tsx`)**: Updated Mobile `loadAvailability` and `loadEditAvailability` to pass `vehicle_id` and `month` (`YYYY-MM`) via `useEffect` on `[bookingForm.service_type, bookingForm.vehicle_id, calendarMonth]` (matching Web), and replaced UTC `toISOString().split('T')[0]` with local `YYYY-MM-DD` date strings across Web and Mobile.

## [v1.15.5] — 2026-10-29
### Fixed & Improved
- **Auto-Preselect Vehicle When Clicking `Service` on Vehicle Cards (`frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Bookings.jsx`, `mobile/app/(tabs)/index.tsx`, `mobile/app/(tabs)/bookings.tsx`)**:
  - Updated the `Service` button on every vehicle card in the Dashboard (both Web and Native Mobile iOS/Android) to pass that vehicle's `vehicle_id` into `/bookings?openBooking=true&vehicle_id={id}` so the New Booking modal opens with that exact vehicle already selected.
  - Added a clean `Loading your vehicles...` state in the New Booking modal while vehicle data is fetching so the pre-selected vehicle immediately binds without flashing an empty state.

## [v1.15.4] — 2026-10-29
### Added & Enhanced
- **Smart Drip SMS `maskpro.link` Device-Bound (TOFU) Magic Link Gatekeeper (`server/routes/auth.js`, `frontend/src/pages/MagicLinkGate.jsx`, `frontend/src/App.jsx`, `frontend/src/pages/Bookings.jsx`)**:
  - Added `POST /api/auth/magic-verify` implementing **TOFU (Trust-On-First-Use) Device Locking** against `care_magic_links`:
    - Ignores SMS/chat link preview bots (`WhatsApp`, `iMessage`, `Google-PageRenderer`, `Viber`, etc.) so automated link unfurling never consumes the customer's first-open device lock.
    - On the first real browser open (whether on the phone that received the SMS or on another device the customer forwarded their link to first), generates and stores a persistent `mp_care_device_token` (`HttpOnly; Secure; SameSite=Lax; Max-Age=31536000` cookie + `localStorage`), binds `bound_device_token_hash`, `bound_platform`, `bound_user_agent`, and `bound_ip`, issues a 30-day JWT session without OTP, and deep-links straight to `/bookings?openBooking=true&vehicle_id={vehicle_id}&service=NanoFix`.
    - Subsequent opens on the same bound device log the customer in immediately; opens on any other device return HTTP `403` (`DEVICE_LOCKED_ELSEWHERE`) and render a friendly **"Already Active on Another Device ({bound_platform})"** screen with a 1-tap **"Login Here with Mobile Number"** fallback so the customer never hits a dead end.
  - Updated `Bookings.jsx` to parse `?openBooking=true&vehicle_id=X&service=NanoFix` query parameters and automatically open the New Booking modal with the customer's vehicle and `Maintenance (NanoFix)` pre-selected.

## [v1.15.3] — 2026-10-29
### Changed & Enhanced
- **No-Plate Hint in New Booking Vehicle Selector (`frontend/src/pages/Bookings.jsx`, `mobile/app/(tabs)/bookings.tsx`)**:
  - Updated the vehicle selector fallback text in the New Booking modal from `No plate` to `No plate (Update in My Vehicle)` on both Web and Native Mobile.
- **Thin Full-Width PDF417 Barcode on Dashboard VIP Cards (`frontend/src/pages/Dashboard.jsx`, `mobile/app/(tabs)/index.tsx`, `mobile/components/ui/PDF417Barcode.tsx`)**:
  - Added a sleek, thin (`28px` height), full-width PDF417 barcode strip right above the `View Card` button on each Dashboard VIP card on both Web and Native Mobile.
- **Renamed `My Loyalty Cards` / `Loyalty Cards` to `My VIP Cards` / `VIP Cards` (`frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Profile.jsx`, `mobile/app/(tabs)/index.tsx`, `mobile/app/(tabs)/profile.tsx`)**:
  - Updated the Dashboard section heading to `My VIP Cards` (with royal blue icon styling) and the Profile tab label to `VIP Cards` across Web and Native Mobile.

## [v1.15.2] — 2026-10-29
### Fixed & Improved
- **Expanded Automotive Color Dot Resolution on Web & Native Mobile (`frontend/src/pages/Vehicles.jsx`, `mobile/app/(tabs)/vehicles.tsx`)**:
  - Expanded `COLOR_MAP` with 60+ automotive colors (`pink`, `hot pink`, `light pink`, `rose`, `rose gold`, `sonic titanium`, `titanium`, `platinum`, `magenta`, `fuchsia`, `coral`, `champagne`, `bronze`, `copper`, `gunmetal`, `charcoal`, `teal`, `turquoise`, `jade`, `emerald`, etc.) and added substring fallback matching so multi-word or custom OEM colors like `Pink` and `Sonic Titanium` render accurate color dots instead of gray.

## [v1.15.1] — 2026-10-28
### Fixed
- **Added `registration_date` Column to Production `vehicles` Table & Normalized Date Formatting (`server/routes/vehicles.js`, `server/routes/dashboard.js`, `unify_maskpro.vehicles`)**:
  - Added `registration_date DATE NULL DEFAULT NULL AFTER color` to the production `vehicles` table, resolving `ER_BAD_FIELD_ERROR: Unknown column 'registration_date' in 'field list'` when creating or updating a vehicle.
  - Updated `GET /api/vehicles/list`, `GET /api/vehicles/detail/:id`, `POST /api/vehicles/create`, `POST /api/vehicles/update`, and `GET /api/dashboard/stats` to select `DATE_FORMAT(registration_date, '%Y-%m-%d') AS registration_date` so `registration_date` is always returned as a clean `'YYYY-MM-DD'` string.
- **Prevent Title & Badge Overlap in Mobile LTO Renewal Reminder Card (`mobile/app/(tabs)/vehicles.tsx`)**:
  - Added `flex: 1`, `flexShrink: 1`, `overflow: 'hidden'`, and `paddingRight: 6` to the `Complimentary LTO Renewal Reminder` title text and `flexShrink: 0` on the `Free Auto-SMS` pill badge on iOS and Android so the title never collides with or overlaps the pill badge.

## [v1.15.0] — 2026-10-28
### Added & Improved
- **Automated Daily LTO Registration Renewal SMS & In-App Reminder Scheduler (`server/services/ltoReminderCron.js`, `server/index.js`)**:
  - Added an automated daily LTO registration renewal scheduler (`startLtoReminderScheduler`) that checks all customer vehicles with a `registration_date`, computes their next Philippine LTO renewal date (first 3 years free, then annual), and sends both an **Automated SMS** (iTexMo primary + SMS-it fallback) and an **In-App Notification** (`customer_notifications`) at **30 days** (`30d`) and **7 days** (`7d`) before renewal is due.
  - Added deduplication table `vehicle_lto_reminder_logs` (`UNIQUE KEY (vehicle_id, renewal_date, milestone)`) so each vehicle is notified once per milestone per renewal cycle.
- **Full-Width `Color` Input & Highlighted Value-Added LTO Reminder Guide Above `Vehicle Registration Date` (`frontend/src/pages/Vehicles.jsx`, `mobile/app/(tabs)/vehicles.tsx`)**:
  - Expanded `Color` to a full-width 1-line input on both Web and Native Mobile (iOS & Android).
  - Placed the highlighted **Complimentary LTO Renewal Reminder** (`Free Auto-SMS` badge) guide card **above** the full-width `Vehicle Registration Date` calendar picker at the bottom of the Add/Edit Vehicle Modal so customers immediately see the added-value reminder service before selecting their registration date.

## [v1.14.9] — 2026-10-28
### Added, Changed & Fixed
- **Interactive Hotel/Flight-Style Calendar Date Picker & Web-Matched LTO Wording (`mobile/app/(tabs)/vehicles.tsx`, `frontend/src/pages/Vehicles.jsx`)**:
  - Replaced manual date typing (`YYYY-MM-DD` text input on Mobile and browser `<input type="date">` on Web) with a zero-typing **Hotel/Flight-Style Interactive Calendar Date Picker** modal featuring Month/Year quick-jump grids, a 7-column day grid, and quick `Today` / `Clear` actions.
  - Updated the Mobile Add/Edit Vehicle Modal (`mobile/app/(tabs)/vehicles.tsx`) to match the Web layout and wording: side-by-side `Color` + `Vehicle Registration Date` columns, the blue bell LTO renewal explanation banner (`"Enter your vehicle's registration date and we'll automatically calculate your next renewal — the first 3 years are free in the Philippines, then it's annual. We'll remind you before it's due."`), and Web-matched footer buttons (`Delete Vehicle`, `Cancel`, `Update Vehicle` / `Add Vehicle`).
- **Vehicle Photo Tap Opens Edit Modal Instead of Lightbox (`mobile/app/(tabs)/vehicles.tsx`, `frontend/src/pages/Vehicles.jsx`)**:
  - Updated tapping/clicking a vehicle card's photo on both Mobile and Web to open the **Edit Vehicle Modal** (`openEdit(v)`) instead of the zoom lightbox, and removed the `View` / `Tap to view` magnifying glass badge.
- **Persistent Header & In-Memory Logo on iOS (`mobile/app/(tabs)/_layout.tsx`, `mobile/components/ui/TopHeader.tsx`, `mobile/constants/logoBase64.ts`)**:
  - Mounted `<TopHeader />` once at the root of `TabLayout` instead of per-tab and embedded `maskpro_logo.png` as an inline base64 URI so the MaskPro Care header logo never flickers or disappears when switching to the `Vehicles` tab on iPhone.

## [v1.14.8] — 2026-10-28
### Fixed
- **Exclude Cancelled Appointments from Dashboard "Upcoming Appointments" (`mobile/app/(tabs)/index.tsx`, `frontend/src/pages/Dashboard.jsx`, `server/routes/dashboard.js`)**:
  - Fixed `upcomingBookings` filter on both Mobile and Web Dashboards where future-dated appointments with `status === 'cancelled'` still passed `new Date(b.booking_date) >= new Date()` and rendered with a hardcoded `"Scheduled"` badge.
  - Cancelled, completed, and rejected appointments are now strictly excluded from `Upcoming Appointments` on both client and server (`GET /api/dashboard/stats`), while appointments with `status === 'cancel_requested'` render an amber `"Cancel Requested"` badge.

## [v1.14.7] — 2026-10-28
### Fixed & Improved
- **My Vehicles Dashboard Display & Deep-Link to Vehicle Details (`frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Vehicles.jsx`, `mobile/app/(tabs)/index.tsx`, `mobile/app/(tabs)/vehicles.tsx`)**:
  - Removed the artificial 3-vehicle / 5-vehicle cap on the Main Dashboard so **all** registered vehicles are displayed (`s2`).
  - Added a `"See All →"` link in the `My Vehicles` header on Web and Mobile.
  - Updated the **Details** button on each vehicle card in the Dashboard to deep-link to `/vehicles?vehicle_id=X` (`/(tabs)/vehicles?vehicle_id=X` on mobile), automatically opening that specific vehicle's Edit/Details modal.

## [v1.14.6] — 2026-10-28
### Added & Changed
- **Customer Profile Avatars in Unify Care App Alert Toast (`includes/care_booking_requests_alert.php`, `notification_api.php`)**:
  - Added customer circular profile photo (`c.profile_photo`) with 2-letter initials fallback on the left of each booking activity item row in Unify's Floating Smart Toast (both initial server render and 25-second live polling).
- **My Loyalty Cards Sorting Priority (`server/routes/loyalty.js`, `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Profile.jsx`, `frontend/src/pages/Loyalty.jsx`, `mobile/app/(tabs)/index.tsx`, `mobile/app/(tabs)/profile.tsx`)**:
  - Updated Loyalty Cards sorting order across the Main Dashboard, Profile, and API to prioritize: **1. Nano Ceramic Coating (`coating`) → 2. PPF Cards (`ppf`) → 3. Nano Ceramic Tint (`tint`)**.

## [v1.14.5] — 2026-10-28
### Changed & Improved
- **Modern Bootstrap 5 Modals for Cancellation Review (`booking_requests.php`, `booking_request_card.php`)**:
  - Replaced native browser `confirm()` popups on **Confirm Cancellation & Send SMS** and **Keep Booking (Dismiss Request)** with modern centered Bootstrap 5 modals (`#confirmCancelReqModal` and `#keepBookingModal`) displaying customer name, request `#ID`, vehicle, booking date/time, and client cancellation reason.

## [v1.14.4] — 2026-10-28
### Fixed & Improved
- **Collapsible Booking Request Cards & Timeline in Unify (`booking_requests.php`, `booking_request_card.php`)**:
  - Made every booking request card collapsible by default into a compact, scannable 1-line summary bar (`#ID`, Customer avatar + Name + Mobile, Vehicle + Plate chip, Service chip, Booking Date/Time, Timeline count pill, Status badge, and `Details / Collapse` toggle).
  - Added an **Expand All / Collapse All** button on the tab bar header to expand or collapse all entries in the active tab with one click.
  - Made long **Negotiation & Activity Timelines** collapsible inside expanded cards (displaying the latest 2 events immediately and hiding older events behind a `"Show X earlier events"` toggle button).
  - Deep-linked requests (`?request_id=X` from Floating Smart Toast or `View` in `All Requests`) automatically expand and scroll into view.
- **Fixed False `1 Need Action` Badge on `Negotiating (0)` Tab (`booking_requests.php`)**:
  - Separated `$nego_action_count` (`status IN ('negotiating', 'waitlisted') AND offer_status IN ('declined', 'countered')`) from `$followup_count` so `Negotiating (0)` no longer shows a false `1 Need Action` badge when an `Approved` booking has a pending customer cancellation request (`1 Cancel Req`).
  - Added total approved count to the `Approved (X)` tab header and updated the `Follow-ups Needed` KPI widget click target to route to `Approved` when a cancellation request is pending.

## [v1.14.3] — 2026-10-28
### Fixed & Improved
- **Clean Single-Badge Cancellation UX (`frontend/src/pages/Bookings.jsx`, `mobile/app/(tabs)/bookings.tsx`)**:
  - Removed redundant multi-line amber notice box under the `Service` column (`s1`) that duplicated the `"Cancellation Requested"` status pill and wrapped into 9 vertical lines.
  - Shortened post-action feedback message to concise single-line text (`"Cancellation requested — pending branch review."`).
- **Unify Booking Requests & Floating Smart Toast Cancellation Sync (`server/routes/bookings.js`, `booking_requests.php`, `booking_request_card.php`, `includes/care_booking_requests_alert.php`, `notification_api.php`)**:
  - Synced customer cancellation requests (`CANCEL_REQUESTED: <reason>`) from `bookings` to `booking_requests` (`s2`) so approved cards in `booking_requests.php` immediately display the `"Cancellation Requested"` badge, timeline event, customer reason, and `1 Cancel Req` tab badge.
  - Added 1-click **"Confirm Cancellation & Send SMS"** and **"Keep Booking (Dismiss Request)"** agent actions directly on the card in `booking_requests.php`, automatically cancelling the appointment in `bookings`, freeing the slot, updating `sms_reminders`, and sending Unify's official SMS cancellation confirmation.
  - Updated Unify Floating Smart Toast (`care_booking_requests_alert.php` & `notification_api.php?action=care_alerts`) to surface pending cancellation requests with customer reason and deep-link directly to `booking_requests.php?tab=approved&request_id=X`.
  - Prevented duplicate cancelled rows in `GET /api/bookings/list` by only returning `booking_requests` with `status = 'cancelled'` when `approved_at IS NULL`.

## [v1.14.2] — 2026-10-28
### Added
- **Booking Cancellation Approval Workflow (Option A) (`server/routes/bookings.js`, `frontend/src/pages/Bookings.jsx`, `mobile/app/(tabs)/bookings.tsx`, `mobile/components/ui/StatusBadge.tsx`)**:
  - Implemented branch review workflow for confirmed live appointment cancellations.
  - When customer cancels a confirmed booking in Care (web or mobile):
    - Appends `CANCEL_REQUESTED: <reason>` in `bookings.notes` while preserving the booking on the schedule pending branch review.
    - Sets booking status to `cancel_requested` in Care App with an amber "Cancellation Requested" badge and helpful customer status banner.
    - Dispatches a staff notification to Unify staff and branch managers linking directly to `bookings.php` to review and confirm the cancellation.
    - When confirmed in Unify by an agent, Unify's built-in cancellation engine dispatches the official SMS confirmation to the customer's phone and frees the slot.
    - Unapproved initial booking requests (`booking_requests`) remain instantly cancellable and move to the Unify "Cancelled" tab.
### Fixed
- **Cancel Booking Fatal 500 Error (`server/routes/bookings.js`)**:
  - Removed query to non-existent table `booking_services_to_perform` (which caused `ER_NO_SUCH_TABLE` 500 crash and displayed "Failed to cancel. Please try again.").
  - Properly updated `bookings_service_types.status = 'Cancelled'` and cleared pending appointment SMS in `sms_reminders`.
  - Fixed service lookup query in `GET /api/bookings/detail/:id` from `booking_services_to_perform` to `bookings_service_types`.

### Changed
- **Booking Cancellation Reasons (`frontend/src/pages/Bookings.jsx`, `mobile/app/(tabs)/bookings.tsx`)**:
  - Removed "Found another provider" option from the cancellation reason dropdown across both web and native mobile apps.
### Added
- **AI Helper Login (Izumi Verification Assistant) (`server/routes/aiAuth.js`, `frontend/src/components/AiLoginModal.jsx`)**:
  - Implemented interactive conversational identity verification for elderly or SMS-delayed customers.
  - Verifies 5 key identifiers: Full Name (25%), Booking Month (25%), Booked Service (20%), Vehicle Model (15%), and Registered Mobile (15%).
  - Configured 90% passing confidence threshold with phonetic and typo tolerance for full name discrepancies.
  - Generates secure JWT token upon verification and logs user into MaskPro Care immediately.
- **Dedicated AI Login Security Monitor in Unify (`care_ai_login_audit.php`)**:
  - Administrative review interface in Unify under Customers (`care_ai_login_audit.php`).
  - Displays real-time session logs, confidence score breakdowns, IP addresses, devices, and anti-fishing status.
  - Includes manual IP block and one-click unblock controls, inspect modal with Q&A transcripts, and blacklist management.
- **Anti-Fishing & Automated IP Blocking Engine (`care_ai_login_logs`, `care_blocked_ips`)**:
  - Automatically flags and blacklists IP addresses attempting to verify multiple customer names within 2 hours.
  - Rate-limits failed verification attempts (auto-blocks after 5 failures in 30 minutes).

### Changed
- **Extended OTP Validity to 15 Minutes (`server/routes/auth.js`)**:
  - Increased OTP lifetime from 5 minutes (300s) to 15 minutes (900s) to accommodate carrier network delays.
  - Updated SMS dispatch template to state "Valid for 15 minutes".
- **Login Screen AI Assistant Integration (`frontend/src/pages/Login.jsx`)**:
  - Added "SMS Delayed? Login with AI Assistant" trigger on both mobile and OTP screens.
### Fixed
- **Unify Booking Finalization Fatal 500 Error (`/var/www/unify/booking_requests.php`)**:
  - Fixed PHP Fatal `ArgumentCountError` at line 214 and line 284: `bind_param("isss", ...)` had 4 type characters for only 3 bound parameters (`customer_id`, `notif_title`, `notif_msg`). Corrected type definition string to `"iss"`.
  - Replaced `catch (Exception $cnErr)` with `catch (Throwable $cnErr)` so PHP 8+ Errors cannot bypass catch blocks and cause HTTP 500 crashes.
- **Web App Vehicle Photo Display on My Vehicles Page (`frontend/src/pages/Vehicles.jsx`)**:
  - Replaced legacy hardcoded `const API_BASE = 'http://localhost/unify.maskpro.ph/maskprocare-app'` with production-aware `getPhotoUrl` helper.
  - In production (`care.maskpro.ph`), vehicle photo paths now resolve directly to `/uploads/vehicles/...` served by Nginx with 200 OK.
  - Upgraded vehicle card photo container from CSS background image to an embedded `<img>` tag with `object-fit: cover` and fallback error handling.
  - Fixed full-size photo preview lightbox and edit modal preview to use correct URL resolution.

### Verified
- **Booking Creation & SMS Confirmation Audit**:
  - Verified booking #18359 was created and SMS confirmation for NanoFix (Maintenance) on Nov 2, 2026 was dispatched to ITEXMO API for `639852779777`.
  - Recorded in Unify `sms_history` table: Entry ID `29647`, Status `Sent`, Reference `PRRYA21136446328473173449`, 2 credits used.

### Added
- **Web App Vehicle Photo Thumbnails (`frontend/src/pages/Dashboard.jsx`)**:
  - Dashboard vehicle cards now render the vehicle's actual photograph thumbnail (`v.photo`) with automatic fallback to model-branded vehicle icons.
- **Clickable Dashboard Brand Navigation (`frontend/src/components/Layout.jsx`)**:
  - Logo and brand text in both top mobile header and desktop sidebar header are now clickable to navigate directly to `/` (main Dashboard).

### Changed
- **Mobile Header Alignment Fix (`frontend/src/index.css`, `frontend/src/components/Layout.jsx`)**:
  - Fixed mobile `@media (max-width: 768px)` header styling: removed `flex-direction: column` that forced the bell and profile avatar below the logo.
  - Profile avatar and notification bell are now strictly locked to the top-right corner on all mobile viewports.
- **Loyalty Cards Button Clean-up (`frontend/src/pages/Dashboard.jsx`, `mobile/app/(tabs)/index.tsx`)**:
  - Removed confusing "Use Card" button from the Dashboard Loyalty Cards section.
  - Replaced with a single full-width high-contrast blue "View Card" button with eye icon linking directly to `/profile?tab=loyalty`.

### Performance
- **Dashboard Load Optimization (6.1s → <200ms) (`server/routes/loyalty.js`, `frontend/`, `mobile/`)**:
  - Diagnosed root cause of multi-second lag: `/api/loyalty/cards` was performing 25 sequential external HTTPS round-trips to BoomerangMe API on every request.
  - Converted BoomerangMe card lookups to concurrent `Promise.all` execution and implemented a 5-minute in-memory TTL cache (`cardCache`).
  - Decoupled dashboard loading: core stats, vehicles, and bookings now render immediately in ~180ms, while loyalty cards load asynchronously in parallel.
### Added
- **Unify Lightbox Photo Popup Modal (`booking_request_card.php`)**:
  - Replaced opening raw image URLs in new browser tabs with an in-page Bootstrap modal lightbox (`#brPhotoLightboxModal`).
  - Both customer profile avatar and vehicle thumbnail now pop up high-resolution images in-page with title, customer ID, plate, and color details.
- **Unify Negotiation & Activity Timeline (`booking_request_card.php`)**:
  - Replaced raw cluttered text notes with an interactive, chronological vertical negotiation timeline widget.
  - Automatically parses counter-offer dates, declined offers with reasons, branch offers, and customer notes into styled nodes with icon badges and quote speech bubbles.

### Fixed
- **Real OTP SMS Delivery (`server/routes/auth.js`)**:
  - Restored real OTP SMS generation and delivery via iTexMo / SMS-it for all registered numbers including `09852779777`.
  - Maintained App Store review bypass code `777777` in `/verify` without suppressing SMS notifications.
- **Expo Go Android Push Notification Warning (`mobile/app/_layout.tsx`, `mobile/services/notificationService.ts`)**:
  - Suppressed Expo Go SDK 53 deprecation log in `LogBox` and guarded remote push token registration when running inside Expo Go on Android.
- **Mobile Pull-to-Refresh Freeze (`mobile/app/(tabs)/index.tsx`)**:
  - Wrapped `onRefresh` in `async / try / finally { setRefreshing(false); }` and added iOS `tintColor`.
  - Added catch fallbacks on all `Promise.all` requests and ensured `!user` immediately clears `refreshing` and `loading` states.
- **Unify Schedule Title & Badge Clarification (`booking_request_card.php`)**:
  - Dynamically displays `"Agreed Schedule"` ONLY when customer has accepted or request is approved; displays `"Branch Proposed Schedule"` during active negotiation.
  - Removed misplaced `"Client Counter-Proposal"` badge from inside the branch offer box to eliminate agent confusion.
### Added
- **NanoFix Maintenance Tracker & Missed Visit Counter (`server/routes/dashboard.js`, `mobile/`, `frontend/`)**:
  - Replaced legacy Date-to-string comparison that always returned 0 with full Unify maintenance calculation parity (`getMaintenanceSummary()`).
  - Automatically checks past coating visits, tracks 6-month maintenance intervals, calculates overdue/due status, and computes missed maintenance visits with last missed date.
  - Added helpful dashboard alert widget on both mobile and web: displays `"X Vehicles Needs NanoFix Maintenance"` and `"Y Missed Visits (Last Month DD, YYYY)"` with one-tap `"Book NanoFix"` action.
  - Vehicles in "My Vehicles" now display status badges for `"NanoFix Due"` and `"NanoFix Overdue"`.
- **My Loyalty Cards Dashboard Section (`mobile/`, `frontend/`)**:
  - Added a dedicated "My Loyalty Cards" section right after "My Vehicles" matching its card style and layout.
  - Lists loyalty cards with category badges (coating, tint, ppf, wash, gift), service name, tier, visits/credits counter, and "View Card" / "Use Card" actions.
  - Mobile profile tab directly activates the loyalty view when deep-linked with `?tab=loyalty`.
- **Unify Request Card Customer & Vehicle Real Photo Details (`booking_requests.php`, `booking_request_card.php`)**:
  - Replaced default icon placeholders with real customer avatar photo from Care app profile (`profile_photo`), with initials fallback.
  - Display Customer ID badge (`ID #XXXX`), phone number, and email.
  - Replaced vehicle icon placeholder with vehicle photo thumbnail with zoom lightbox preview.
  - Added chips for plate #, vehicle color swatch + name, and size.

### Changed
- **Mobile Bottom Navigation Tab Order (`mobile/app/(tabs)/_layout.tsx`)**:
  - Reordered tabs to place **Aftercare** (`services`) immediately next to **Vehicles** and before **Community** (Dashboard → Bookings → Vehicles → Aftercare → Community → Shop → Profile).

## [v1.13.10] — 2026-10-28
### Added
- **Client counter-date ("Preferred Date") flow (`mobile/`, `frontend/`, `server/routes/bookings.js`)**:
  - New `CounterDatePicker` (mobile: date chips + time-slot chips, Sundays skipped) and `CounterDateModal` (web: date input + time-slot select). Both send `counter_date` as `YYYY-MM-DD HH:MM`, replacing the old free-text field.
  - Clients can **Propose / Change a Preferred Date** at any time during negotiation, including after declining an offer (previously a dead end).
  - Client's preferred date is shown on the card ("Your Preferred Date: …, our branch will call you to finalize").
- **Unify Negotiating tab — agent actions (`booking_request_card.php`, `booking_requests.php`)**:
  - Prominent "Client's Preferred Date (Counter-Offer)" banner on the card.
  - **Accept Client's Date** and **Set / Edit Agreed Date** open the agreed-date modal, which now has a **"Finalized over the phone"** checkbox (checked by default) plus notes. When checked, the booking is approved right away (booking + services + SMS reminders + client "Booking Approved" notice), with no extra client approval. Unchecked, the date is sent to the client for approval as before.
  - **Move to Waitlist**: inserts into the existing NanoFix waitlist (`nanofix_waitlist`, Admin Dashboard → Waitlist) with the preferred date and time preference, sets request status `waitlisted`, and sends an in-app/push notice (no SMS). The waitlist entry is marked `converted` when the request is finalized later.
  - Waitlisted requests stay in the Negotiating tab with a "Waitlisted" badge and a **View in Waitlist** deep-link (`index.php?tab=waitlist`).
- DB: `booking_requests.status` ENUM gains `'waitlisted'`; new columns `counter_date DATETIME NULL` and `waitlist_id INT NULL`.

### Changed
- Negotiating and waitlisted requests now stay under **Pending Appointments** on the client (mobile + web), showing "Pending Approval" plus a secondary **Negotiating** / **Waitlisted** badge. Before, they disappeared from Pending while the stat card still counted them.
- `/dashboard/stats` pending list and count now include `waitlisted` and return `counter_date`.
- Web Dashboard: replaced native `alert()` calls with an inline dismissible notice.

### Fixed
- `respond-offer` no longer writes free text into the `offered_date` DATETIME column. Counter dates are validated (format, not in the past, Manila time) and stored in `counter_date`. The endpoint returns 409 when the request is not open for negotiation.
- Unify approval: precomputed the booking date before `bind_param`, because PHP 8 cannot pass a ternary expression by reference. Removed a duplicated `set_agreed_date` handler and duplicated count/CSS blocks left by an earlier patch.

## [v1.13.9] — 2026-10-28
### Added & Enhanced
- **Dedicated Negotiations Flow & Tab Lifecycle (`booking_requests.php`, `booking_request_card.php`, `server/routes/bookings.js`, `mobile/`, `frontend/`)**:
  - Upgraded database schema for `booking_requests.status` to include `'negotiating'` (`ENUM('pending','approved','rejected','cancelled','negotiating')`).
  - Added new "Negotiating" tab in Unify `booking_requests.php` with live count badge and counter proposal alerts (`Need Action`).
  - Customer decline modal now allows the client to propose an optional counter date/time (`counter_date`), instantly moving the request into active negotiation (`offer_status = 'countered'`).
  - Added "Set Agreed Date" action button and dedicated modal (`#setAgreedDateModal`) for agents to record dates agreed via phone call or Facebook chat, automatically dispatching push notifications and in-app bell alerts to the client.
  - Client acceptance of an agreed date in Care App directly confirms and settles the booking, inserting into `bookings` and moving the request to the "Approved" tab.
- **Purposeful KPI Summary Widgets in Unify (`booking_requests.php`)**:
  - Replaced dull interface with 4 modern, non-crowded KPI widget cards:
    1. **Pending Review**: Amber clock badge displaying new unreviewed booking requests.
    2. **Active Negotiations**: Purple handshake badge tracking in-progress date agreements.
    3. **Approved (This Month)**: Emerald checkmark badge counting converted live appointments.
    4. **Follow-ups Needed**: Rose phone badge showing customer declines/counters needing call or FB inbox outreach.
  - Cards feature smooth hover lift and one-click quick navigation to their respective tabs.
- **Smart Toast Disappearance Upon Settlement (`includes/care_booking_requests_alert.php`, `notification_api.php`)**:
  - Refined floating toast trigger conditions to strictly exclude approved or cancelled requests (`status NOT IN ('approved', 'cancelled')`).
  - Settling an item by setting an agreed date or approving immediately removes it from the toast stack, eliminating nagging alerts.
  - Dynamically mapped toast primary button and deep-link parameters to exact target state (`tab=negotiating`, `tab=rejected`, or `tab=pending`).

## [v1.13.8] — 2026-10-28
### Added & Enhanced
- **Client-Side Notification Bell & Push Notification System (`mobile/services/notificationService.ts`, `mobile/app/_layout.tsx`, `mobile/components/ui/TopHeader.tsx`, `mobile/app.json`, `mobile/package.json`)**:
  - Integrated `expo-notifications` for standard OS heads-up banners on unlocked screens and native lockscreen notifications on both Android and iOS devices/emulators.
  - Configured high-priority notification channel (`care-alerts`, `AndroidImportance.MAX`, public lockscreen visibility) and auto-permission request.
  - Implemented client-side notification bell with live red unread counter badge in `TopHeader.tsx`, syncing with `/api/notifications/list` via background interval polling.
  - Tapping a notification opens the app and directly routes to `/(tabs)/bookings` for immediate action, while clicking the header bell opens the full in-app `NotificationModal` drawer.
- **Full-Stack Notification Triggers & DB Integration (`server/routes/bookings.js`, `unify_maskpro.customer_notifications`)**:
  - Added customer notification dispatch (`customer_notifications`) across booking lifecycle: initial submission, staff date proposals, approvals, customer offer acceptances, and offer declines.
  - Implemented staff notification dispatch (`notifyUnifyStaff`) inserting directly into Unify's internal `notifications` table for assigned branch agents, sales, accounting, and Ryan Paco.
- **Unify Mother App Floating Smart Toast Stack (`includes/care_booking_requests_alert.php`, `notification_api.php`, `footer.php`, `booking_requests.php`)**:
  - Created a sticky floating alert toast stack on all Unify pages (matching the inventory reorder forecast toast style) for sales agents, accounting, managers, and Ryan Paco.
  - Surfaces real-time alerts for booking requests and customer offer declines with reasons, pulsating blue glow, live badge counts, and direct 1-click links to `booking_requests.php`.
  - Added 25s auto-polling loop via `notification_api.php?action=care_alerts` so alerts appear dynamically without requiring page refreshes.
- **Smart Toast Deep-Linking & Tab State Resolution (`booking_requests.php`, `booking_request_card.php`, `includes/care_booking_requests_alert.php`)**:
  - Resolved issue where clicking "Review Requests" on a declined offer opened the empty "Pending (0)" tab, causing agent confusion.
  - Enabled intelligent deep-linking (`?tab=rejected&request_id=X`) that automatically activates the Rejected tab on page load, smoothly scrolls to the card, and pulses it with a glowing border.
  - Added in-page tab switching without full reload when the agent is already viewing `booking_requests.php`, and added live counter badges for declined offers (`1 Declined`) right on the tab header.

## [v1.13.7] — 2026-10-27
### Added & Enhanced
- **Pending Appointments Section & Live Widget Count (`mobile/app/(tabs)/index.tsx`, `frontend/src/pages/Dashboard.jsx`, `server/routes/dashboard.js`)**:
  - Placed a dedicated "Pending Appointments" section directly above "Upcoming Appointments" on both Mobile and Web Dashboards, clearly distinguishing pending requests awaiting approval from confirmed upcoming appointments.
  - Connected the dashboard "Pending" hourglass stat card to live pending request count (`status = 'pending' OR (status = 'rejected' AND offer_status = 'offered')`).
- **Booking Rejection Red Marking & Alternative Date Negotiation (`booking_requests.php`, `booking_request_card.php`, `server/routes/bookings.js`, `mobile/app/(tabs)/bookings.tsx`, `mobile/app/(tabs)/index.tsx`, `frontend/src/pages/Bookings.jsx`, `frontend/src/pages/Dashboard.jsx`)**:
  - Enhanced Unify Agent rejection modal (`booking_requests.php`) with alternative date & time proposal inputs (`offered_date`, `offer_status = 'offered'`).
  - Added red visual highlighting (`styles.rejectedCardItem` / `#fff8f8` with red border) and rejection reason callout in both Mobile and Web Care Apps.
  - Provided 1-click "Accept Date" action (moves booking to the proposed date and resets to pending for seamless agent approval) and "Decline Offer" action with a reason prompt dialog (`customer_offer_reply`).
  - Displayed proposed alternative dates, offer status badges, and customer decline reasons inside Unify booking request cards (`booking_request_card.php`).
- **Profile Photo Path Resolution (`mobile/app/(tabs)/profile.tsx`)**:
  - Corrected profile photo resolution in mobile app to properly load avatars from `/api/uploads/photos/`.

## [v1.13.6] — 2026-10-27
### Added, Changed & Fixed
- **Nginx Vehicle Photo 404 Resolution (`/etc/nginx/sites-available/care`, `deploy.sh`)**:
  - Resolved vehicle photo missing issue after upload (s1–s2) by adding `^~` modifier to `location ^~ /uploads/` in Nginx configuration, preventing static file regex location blocks (`.(webp)$`) from overriding uploaded vehicle media paths.
  - Updated `deploy.sh` Nginx template so future deployments preserve this rule.
- **Unify App Customer Vehicles Photo Thumbnail & Lightbox (`customers_view_details_fetch_vehicle.php`, `cvd_vehicle_cards.php`)**:
  - Added vehicle photo thumbnail directly beside the vehicle make and model (under the `VEHICLE` column, addressing s4) in both table and mobile card views on Unify.
  - Clicking/tapping the vehicle photo opens a sleek Bootstrap modal lightbox displaying the full resolution photo, vehicle name, and plate number with an instant Close button, returning without refreshing the page.
- **Mobile & Web Vehicle Photo Expansion Lightbox (`mobile/app/(tabs)/vehicles.tsx`, `frontend/src/pages/Vehicles.jsx`)**:
  - Implemented full-screen image viewer modals on both mobile and web with clean dark backdrops and close buttons.
  - Added dedicated camera icon button for seamless photo replacement/re-upload without conflicting with photo view gestures.
- **Booking Requests Double-Entry Gating & Denial Prompts (`server/routes/bookings.js`, `mobile/app/(tabs)/bookings.tsx`)**:
  - Implemented strict database gating checks in `POST /api/bookings/create` and `POST /api/bookings/reschedule` to prevent duplicate submissions when a pending request, approved request, or confirmed booking already exists for the same vehicle on the same date.
  - Added proactive client-side gating and warning prompt modals (`AlertPromptModal`) displaying `"Booking Already Exists"` with descriptive branch guidance.
- **Database Clean-up & Backfill (`unify_maskpro.booking_requests`)**:
  - Cleaned up redundant pending duplicate entries (Requests #2 through #7) for customer `1924` / vehicle `8630` on `2026-10-30` in both `booking_requests` and `booking_request_services`, retaining only the single canonical active booking request (#1).

## [v1.13.5] — 2026-10-27
### Changed & Fixed
- **Mobile UX Modal Alert Architecture (`mobile/components/ui/AlertPromptModal.tsx`)**:
  - Eliminated top inline error banners (`AlertBanner`) that caused form layout shifts and buried critical failure messages off-screen.
  - Implemented `AlertPromptModal` with dark backdrop, centered dialog card, semantic circular status badges (error, warning, success, info), bold titles, and 48pt touch targets adhering to Apple HIG & Material 3.
  - Integrated `asOverlay` prop and `statusBarTranslucent` support ensuring modal alert prompts render seamlessly on top of nested modal forms on both Android and iOS without native window hierarchy conflicts.
- **Mobile UX Skill Integration (`skills/mobile-ux/SKILL.md`)**:
  - Researched and established `mobile-ux` best practices skill across workspace `.agents/skills/mobile-ux/` and globally at `~/.gemini/config/skills/mobile-ux/`.
  - Added Rule 20 to `.agents/rules/maskprocare-app.md` mandating modal prompt dialogs for critical errors, thumb-zone hierarchy, and human-friendly error parsing.
  - Rolled out `AlertPromptModal` across all mobile screens (`bookings.tsx`, `vehicles.tsx`, `profile.tsx`, `community.tsx`, `shop.tsx`, `login.tsx`).
- **Vehicle Photo Upload & Booking Backend Fatal Error Resolution**:
  - **Booking Creation Error 500 (`ER_NO_DEFAULT_FOR_FIELD`)**: Added mapped `service_code` and `service_name` in `server/routes/bookings.js` and modified column `booking_request_services.service_code` to allow `DEFAULT NULL` on production DB `unify_maskpro`.
  - **Vehicle Photo Upload Error 500 (`Unknown column 'photo'`)**: Added missing `photo varchar(255) DEFAULT NULL` column to `unify_maskpro.vehicles`.
  - Sanitized photo upload error handlers in `vehicles.tsx` and `profile.tsx` to prevent raw `AxiosError` exceptions from leaking into developer LogBox banners.

## [v1.13.4] — 2026-10-27
### Changed & Improved
- **Booking Calendar Full-Color Accessibility Badges (`mobile/components/ui/CalendarPicker.tsx`, `frontend/src/pages/Bookings.jsx`)**:
  - Replaced tiny dots with high-contrast, full-color rounded background badges for date numbers (Green for Available, Amber for Almost Full, Red with strikethrough for Full, Solid Blue for Selected) for accessibility and elderly readability.
  - Replaced dot legend with matching rounded status pill badges.
- **Unify Booking Requests & Service Name Synchronization (`booking_requests.php`)**:
  - Migrated `unify_maskpro.booking_request_services` by adding missing `service_name varchar(100)` column, resolving the HTTP 500 fatal exception (`Unknown column 'brs.service_name'`).
  - Added multi-layered `COALESCE(brs.service_name, br.latest_service)` fallback to booking requests query in both server `/var/www/unify/booking_requests.php` and local workspace.

## [v1.13.3] — 2026-10-27
### Fixed & Hardened
- **Expo SDK 54 Dependency Alignment (`mobile/package.json`)**:
  - Aligned 6 core native packages (`expo@~54.0.37`, `expo-constants@~18.0.14`, `expo-font@~14.0.12`, `expo-linking@~8.0.12`, `expo-router@~6.0.24`, `expo-web-browser@~15.0.11`).
  - Successfully validated 18/18 checks on `expo-doctor` with 0 warnings or errors.

## [v1.13.2] — 2026-10-27
### Added
- **Mobile Store Audit & Vulnerability Compliance Skill (`skills/mobile-audit/SKILL.md`)**:
  - Implemented 6-pillar automated audit protocol (OS Permission Hardening, Apple App Store Guidelines, Google Play Policies, OWASP MASVS Security, Store Asset Formats, Expo/RN Diagnostics).
  - Deployed globally in `~/.gemini/config/skills/mobile-audit/` and locally across `care.maskpro.ph`, `gaq.maskpro.ph`, and `getsales.maskpro.ph`.
  - Added Rule 19 to `.agents/rules/maskprocare-app.md`, requiring all future mobile app audits and pre-submission checks to systematically execute and adhere to the `mobile-audit` skill.

## [v1.13.1] — 2026-10-21
### Security & Compliance
- **OS-Level Permissions Hardening (`mobile/app.json`)**:
  - Explicitly blocked `android.permission.RECORD_AUDIO` on Android builds via `blockedPermissions` and `microphonePermission: false` in `expo-image-picker` plugin configuration, eliminating undeclared microphone access rejections from Google Play Console.
  - Confirmed and restricted OS permissions to only camera (`NSCameraUsageDescription`, `android.permission.CAMERA`) and photo library (`NSPhotoLibraryUsageDescription`, `READ_MEDIA_IMAGES`, `READ_EXTERNAL_STORAGE`) used exclusively for customer vehicle photos and profile avatars.
- **Reviewer Demo Bypass for App Store & Google Play (`server/routes/auth.js`)**:
  - Added review credentials bypass for test phone number `09852779777` with fixed OTP `777777`, bypassing SMS rate limits and international carrier delivery blocks for Apple & Google App Review teams.
- **Deployment Hardening (`deploy.sh`)**:
  - Replaced `jq`-dependent PM2 lookup with direct `pm2 describe` check, ensuring reliable PM2 restarts across low-dependency server environments.
  - Sourced credentials securely via `.ssh_helper.sh`.

## [v1.13.0] — 2026-10-20
### Added
- **Apple & Google Play Store Submission Compliance**:
  - **Store-Compliant App Icons & Splash Assets** (`mobile/assets/images/`):
    - Replaced blank Expo default grid placeholders with official MaskPro 1024x1024 solid RGB icon (`icon.png`), Android adaptive icon foreground (`adaptive-icon.png`), launch screen emblem (`splash-icon.png`), and web favicon (`favicon.png`).
  - **Account Deletion Flow (Apple Guideline 5.1.1(v))**:
    - Backend: Added `POST /api/profile/delete-account` endpoint in `server/routes/profile.js` to anonymize PII, delete avatar files, clear OTP records, and log action in audit notes.
    - Mobile: Added "Delete Account" button and custom confirmation modal in `mobile/app/(tabs)/profile.tsx` under Account Details.
  - **Interactive Legal Links & Public Policies**:
    - Frontend: Created public, unauthenticated `Privacy.jsx` and `Terms.jsx` web pages served at `https://care.maskpro.ph/privacy` and `https://care.maskpro.ph/terms` to satisfy Google Play Console and App Store Connect review URL requirements.
    - Mobile: Made "Terms of Service" and "Privacy Policy" links interactive on `mobile/app/login.tsx` and `mobile/app/(tabs)/profile.tsx` using `expo-web-browser`.
  - **EAS Build Configuration (`mobile/eas.json`)**:
    - Added production build profiles for iOS `.ipa` (`m-medium` resource class) and Android `.aab` (App Bundle with `EXPO_PUBLIC_API_URL: https://care.maskpro.ph/api`).
  - **Production Manifest & Permissions (`mobile/app.json`)**:
    - Configured `expo-image-picker` plugin permissions with clear purpose descriptions for camera and photo library usage (`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`).
    - Added `ios.buildNumber: "1"` and `android.versionCode: 1`.

### Fixed
- **Dashboard Greeting Empty String** (`mobile/app/(tabs)/index.tsx`):
  - Handled cases where customer `full_name` is empty or null by trimming before split and defaulting gracefully to "Welcome back, there! 👋".

## [v1.12.3] — 2026-10-20
### Added
- **TopHeader Admin Shortcut Button** (`mobile/components/ui/TopHeader.tsx`):
  - Added an exclusive, amber-accented `[ 🛡️ Admin ]` badge button directly in the universal top header (between brand title and bell notification icon).
  - Automatically queries `/api/admin/check` to only show when the authenticated user is an administrator and not currently impersonating.
  - Tapping routes directly to the Admin Panel / Customer Directory (`/admin`).
- **Profile Page Admin Dashboard Menu Card & Role Badge** (`mobile/app/(tabs)/profile.tsx`):
  - Added an elegant `🛡️ ADMINISTRATOR` role pill in the user header card beneath the customer's phone number when `isAdmin` is verified.
  - Added a dedicated, full-width **Admin Dashboard** menu card situated right below the stats row (before Account Details): dark slate gradient background, amber shield icon badge, "ADMIN" role chip, subtitle "Directory & customer impersonation", and chevron right arrow.
  - Tapping routes directly to `/admin` without requiring deep scrolling to the bottom of the profile.

## [v1.12.2] — 2026-10-20
### Fixed
- **Bottom Dock Menu Safe Area Inset** (`mobile/app/(tabs)/_layout.tsx`):
  - Applied `useSafeAreaInsets` to dynamic `tabBarStyle` padding and height to prevent bottom labels from clipping or overlapping the iOS home indicator bar.
- **Scroll Padding Past Dock Bar** (`mobile/app/(tabs)/index.tsx`, `mobile/app/admin.tsx`):
  - Increased `contentContainer` padding to 110px and added `style={{ flex: 1 }}` to ensure all screens scroll smoothly all the way down without content getting hidden behind the dock menu.
- **Direct App Navigation on Admin Sign-In** (`mobile/app/admin-login.tsx`, `mobile/app/admin.tsx`):
  - Updated admin login to take the user directly into the main app (`/(tabs)`) with all 7 tabs active, and added a quick "App" header shortcut in the Admin directory.

## [v1.12.1] — 2026-10-20
### Added
- **Mobile Admin Login & Customer Impersonation** (`mobile/app/admin-login.tsx`, `mobile/app/admin.tsx`):
  - Ported web `AdminLogin.jsx` pixel-for-pixel to mobile: dark slate gradient theme, gold shield lock emblem, Unify username/password authentication against `/api/admin/login` with zero OTP / SMS credit usage.
  - Ported web `AdminPanel.jsx` pixel-for-pixel to mobile: real-time searchable customer directory, booking count chips, customer initials avatars, and instant 1-tap customer impersonation (`POST /api/admin/impersonate`).
  - Added custom modal for impersonation confirmation complying with agent zero-native-alert rules.
- **Top Impersonation Banner** (`mobile/components/ui/TopHeader.tsx`):
  - Added persistent amber impersonation header banner ("Viewing as [Customer]" with "Exit" button) replicating web `Layout.jsx` parity.
- **5-Tap Secret Gesture** (`mobile/app/login.tsx`):
  - Added secret 5-tap gesture on "Secured by MASKPRO" badge to instantly route to `/admin-login`.

### Fixed
- **Dashboard Load Error on Cold Boot** (`mobile/app/(tabs)/index.tsx`):
  - Guarded initial data fetch to only run when an authenticated `user` exists in `AuthContext`, eliminating the 401 Unauthorized `Dashboard load error` console warning banner on startup.
- **Auth Context Routing & Route Guards** (`mobile/context/AuthContext.tsx`, `mobile/app/_layout.tsx`):
  - Registered `/admin-login` and `/admin` as public and admin routes respectively, preventing premature redirects back to `/login` during admin flows.

## [v1.12.0] — 2026-10-20
### Added
- **TopHeader & Notification System** (`mobile/components/ui/TopHeader.tsx` & `NotificationModal.tsx`):
  - Branded header bar with official MaskPro logo, MASKPRO Care typography, real-time unread notification badge polling (60s), and user avatar with profile shortcut.
  - Interactive native Notification modal sheet to view recent notifications, filter by type (registration renewal, booking confirmed, reminder, system), mark single/all as read, and deep-link to relevant screens.
- **MaskPro Shop Screen** (`mobile/app/(tabs)/shop.tsx`):
  - Complete pixel-for-pixel parity with web Shop.jsx, featuring VIP preview categories (Detailing Kits, Microfiber Towels, Dashcams & Tech, Aromatherapy), animated floating bag, and VIP launch notification form.
- **Community Comments & SOS Resolution** (`mobile/app/(tabs)/community.tsx`):
  - Added full post detail modal with real-time comment fetching (`GET /api/community/posts/:id/comments`) and comment publishing (`POST /api/community/comments`).
  - Added "Mark as Resolved" capability for SOS post authors (`PUT /api/community/posts/:id/resolve`).
  - Interactive "Offer Help" quick-action on open SOS posts.

### Changed
- **High-Performance Native FlatList for Community**:
  - Replaced un-virtualized `ScrollView` with performant `FlatList` with `initialNumToRender`, `maxToRenderPerBatch`, and `windowSize` to eliminate memory leaks and ensure fluid 60/120fps scrolling.
- **Mobile Login Parity & 6-Box OTP**:
  - Replaced generic single-input with pixel-for-pixel web parity (`frontend/src/pages/Login.jsx`): brand logo, top gradient accent border, centered Philippine mobile input, true 6-box OTP digits with auto-advancing, paste, and backspace handling, 30-second live resend countdown, "Use Different Number", and security badges.
  - Fixed API payload keys (`mobile` instead of `mobile_number`, `otp` instead of `otp_code`) aligning with `server/routes/auth.js`.
- **API Client Resilience** (`mobile/api/client.ts`):
  - Added 15s timeout to prevent stalled requests on dropped cellular connections.
- **TabLayout & Navigation Order** (`mobile/app/(tabs)/_layout.tsx`):
  - Seamlessly mounted `TopHeader`, added `Shop` tab, and matched web app navigation order and icons.

## [v1.11.2] — 2026-05-26
### Fixed
- **Fixed 401 Unauthorized handling** — implemented `setSignOutHandler` in `mobile/api/client.ts` to coordinate with `AuthProvider` in `mobile/context/AuthContext.tsx`. On receiving a 401 response, the client clears the SecureStore and resets the `user` state to `null`, triggering an immediate auto-redirect to the login screen instead of hanging on the dashboard with 401 console errors.

## [v1.11.1] — 2026-05-26
### Fixed
- **Resolved Metro bundler error with bwip-js** — changed barcode generator import from `bwip-js` to `bwip-js/generic` in `mobile/components/ui/PDF417Barcode.tsx` to bypass `react-zlib-js` dependency in React Native.

## [v1.11.0] — 2026-05-25
### Added
- **Completed full mobile app screen parity** — ported all remaining screens from web to React Native / Expo:
  - **Dashboard** (`mobile/app/(tabs)/index.tsx`): welcome, stats cards, upcoming appointments list, horizontal vehicle cards
  - **Vehicles** (`mobile/app/(tabs)/vehicles.tsx`): card displays, LTO renewal banner, add/edit slide modal, confirm delete
  - **Bookings** (`mobile/app/(tabs)/bookings.tsx`): unified list, new booking modal, cancel/edit modal
  - **Aftercare** (`mobile/app/(tabs)/services.tsx`): landing portal, locked/unlocked article tabs (5 blog categories)
  - **Profile** (`mobile/app/(tabs)/profile.tsx`): profile edit, photo upload/delete, loyalty cards list (visits/stamps grids, barcode)
- **PDF417 Barcode SVG rendering** (`mobile/components/ui/PDF417Barcode.tsx`) using pure JS `bwip-js` and `react-native-svg`
- **Shared UI components** (`mobile/components/ui/`): LoadingSpinner, EmptyState, StatusBadge, VehicleIcon, SectionHeader, AlertBanner, ConfirmModal, CalendarPicker
- **Image Picker** integrated via `expo-image-picker` for profile and vehicle photo uploads

## [v1.10.0] — 2026-05-06
### Added
- **Care Community / MASKPRO S.O.S.** feature implemented across backend and mobile UI
- **AI Moderation (Straico API)** integrated into `server/services/straico.js` to instantly gate MASKPRO S.O.S. posts against hate/spam with a 0-tolerance policy
- Backend API routes added in `server/routes/community.js` (`GET /posts`, `POST /posts`, `POST /comments`, `PUT /posts/:id/resolve`)
- Database migration script `community_tables.sql` created for `community_posts` and `community_comments`
- React Native UI `mobile/app/(tabs)/community.tsx` created featuring pre-filled text guidelines for SOS and general posts
- Added Community tab to `mobile/app/(tabs)/_layout.tsx`

## [v1.9.0] — 2026-04-13
### Fixed
- **Booking capacity now reads from DB only** — deleted hardcoded `CAPACITY_DEFAULTS` object. All capacity is now sourced exclusively from `branch_booking_capacity` table, managed by admins in Unify's Booking Capacity Settings page. `0 = unlimited` (never full), matching Unify's exact behavior
- **Removed pending booking_requests from capacity count** — only confirmed bookings (from `bookings_service_types`) are counted for capacity. Matches Unify's `bookings_create.php` logic
- **Removed fragile LIKE patterns** in service name matching — now uses exact match (`bst.service_name = ?`) like Unify

### Added
- **"Almost Full" (Limited) indicator** — calendar now shows amber/orange color and dot when only 1 slot remains for a service on a date. Matches Unify's Smart Calendar `limited` status (`booked >= max - 1`)
- **Status dots on calendar days** — green (Open), amber (Limited), red (Full) dots below each date, matching Unify's calendar dot system
- **Updated legend** — now shows 4 states: Open, Limited, Full, Closed (matching Unify's legend)

### Changed
- **API response format** — `GET /api/bookings/availability` now returns `status` field per date (`available`, `limited`, `full`) alongside existing `available` boolean. `capacity` returns `∞` for unlimited services

## [v1.8.3] — 2026-03-26
### Fixed
- **Diamond (No Exp) display** — unlimited-term Diamond template (1006938) now shows "Diamond Package" instead of "Diamond (No Exp)" to match the original Diamond template name. Synthesizes a 12-year warranty expiry date from card creation date so customers see a normal expiry instead of blank. This is a frontend-only display fix for the Y2038 workaround template

## [v1.8.2] — 2026-03-25
### Fixed
- **Cancelled bookings showing as "Done"** — booking list API derived status solely from `notes` field (`CANCELLED:` prefix), but Unify's cancellation flow only sets `bst.status = 'Cancelled'` without modifying notes. All 956 cancelled bookings appeared as "Done" in Care. Now checks both `bst.status` and notes for cancellation detection, and also respects `Done`/`Scheduled`/`Rescheduled` statuses from `bookings_service_types` before falling back to date-based logic

## [v1.8.1] — 2026-03-19
### Fixed
- **Reverted 2,692 wrongful stamp deductions** — restored stamps on 1,302 cards via BoomerangMe `add-visit` API. Audit log entries marked `[REVERTED]`
- **formatCard() display bug** — uninitialized cards (0 balance, never had visits added) were shown as "fully used" (e.g., 24/24). Now correctly detects uninitialized cards and shows 0 used

### Added
- **Revert script** (`server/scripts/revert-stamp-deductions.js`) — reads audit log and restores stamps via `add-visit` API with `--dry-run`/`--execute` modes

### Removed
- **Stamp audit cron** (`server/cron/stamp-audit.js`) — permanently removed. Had a double-deduction bug (BoomerangMe operations API returned empty, causing wrong deductions). Crontab entry also removed from server. Loyalty card stamp tracking now relies on BoomerangMe data as source of truth

## [v1.8.0] — 2026-03-18
### Fixed
- **mysql2 UTF-8 Buffer fix** — after Unify's `utf8mb4_general_ci` migration, mysql2 returned all text columns as Buffers. Added `typeCast` function in `connection.js` to auto-convert Buffers to UTF-8 strings at the driver level. Fixes all routes simultaneously
- **Admin login customer matching** — `LOWER(TRIM())` SQL comparisons break under mysql2 + utf8mb4_general_ci. Removed redundant `LOWER()` since utf8mb4_general_ci is already case-insensitive. Fixed both admin login and impersonate queries
- **Admin login Buffer safety** — wrapped `password`, `full_name`, `mobile_number` from `users` table in `String()` as extra defense
- **Profile stats display** — Profile.jsx was reading `data.total_vehicles` but dashboard API nests stats under `data.stats.total_vehicles`. Fixed path mapping

### Added
- **Loyalty cards backfill script** (`server/scripts/backfill-loyalty.js`) — server-side script to backfill missing loyalty cards from BoomerangMe API into `loyalty_cards` table. Features accent normalization, fuzzy name matching (first+last, without middle initials), row-level dedup checks (SELECT before INSERT), and `--dry-run`/`--execute` modes
- **Backfill executed** — inserted 1,614 missing loyalty cards from BoomerangMe. Total loyalty_cards went from 4,999 → 6,613

### Removed
- Cleaned 2 empty-name customer records (IDs 2993, 5477) from `customers` table

## [v1.7.1] — 2026-03-16
### Added
- **NanoFix Stamp Audit Cron** — daily cron job (1:00 AM) that audits `Nano Fix (Maintenance)` bookings against BoomerangMe loyalty card stamp deductions. Auto-deducts missed stamps. Determines coating vs PPF by checking most recent parent service on the vehicle. Rate-limited at 8 req/sec with 429 backoff retry. Idempotent via `care_stamp_audit_log` table. Supports `--dry-run` flag.
- **`care_stamp_audit_log` table** — audit trail for stamp deductions, prevents double-deduction on re-runs

## [v1.7.0] — 2026-03-16
### Added
- **My Loyalty Cards sidebar shortcut** — deep-links to Profile → Loyalty Cards tab via `?tab=loyalty` URL param
- **Shop page (Coming Soon)** — animated hero with VIP excitement messaging, product category teasers. Added to sidebar and mobile bottom nav
- **Profile photo upload** — clickable avatar with camera overlay, accepts any image format (JPEG, PNG, HEIC, WebP), server-side conversion to 512×512 WebP via sharp. Photo syncs to sidebar + mobile header avatar instantly via AuthContext
- **Profile photo remove** — red "Remove photo" link below avatar when photo is set

### Fixed
- **Version display permanently fixed** — sidebar badge was hardcoded `v1.5.0` in Layout.jsx, never synced with package.json. Now injected at Vite build time via `define: { __APP_VERSION__ }` from package.json — never stale again
- **Aftercare content accuracy** — NanoFix 6-month maintenance now clarifies detailing fee schedule (Small ₱1,500–XXLarge ₱3,500) per maskpro.ph/mfmtc terms. Tint warranty lists specific product tiers (Hogo 12yr, Shirudo 21yr, Shirudo+/Mamori lifetime)

### Changed
- **Sidebar menu reordered** — Profile removed from nav, replaced with My Loyalty Cards. Order: Dashboard → Bookings → Vehicles → Loyalty Cards → Aftercare → Shop → Account
- **Aftercare sidebar header** — changed from ALL CAPS section divider to regular nav item with heart-pulse icon
- **Mobile bottom nav** — added Shop tab (between My Vehicles and Profile)

## [v1.6.1] — 2026-03-14
### Fixed
- **Admin auth architecture** — split `/admin` into `/admin-login` (standalone login form) and `/admin` (inside Layout with sidebar). Root cause: admin panel was outside `<Layout />`, so no sidebar, no navigation, Home redirected to `/login`
- **localStorage key mismatch** — AdminPanel wrote to `care_token`/`care_customer` but AuthContext reads `mpc_token`/`mpc_customer`. Session lost on reload
- **401 interceptor** — API client nuked `mpc_token` when `/admin/check` returned 401. Now skips redirect for `/admin/` API calls
- **AuthContext React state** — AdminPanel now calls `authLogin()` after login to update React state, not just localStorage

## [v1.6.0] — 2026-03-14
### Added
- **Aftercare section** — renamed SERVICES→AFTERCARE in sidebar, collapsible accordion with 5 service categories
- **25 full blog-style aftercare articles** — 5 topics per service (coating, tint, PPF, paint repair, detailing) with tabbed navigation. Content from maskpro.ph/blog + original brand content. Self-contained for future native app packaging.
- **5% discount CTA** for services without bookings → redirects to gaq.maskpro.ph
- **Admin impersonation panel** — searchable customer list with "Login as" button + custom confirmation modal
- **Dedicated admin login** at /admin — username/password from Unify `users` table (bcrypt), no OTP required
- **Impersonation banner** — gold banner "Viewing as {name}" with Exit button

### Fixed
- **Bookings service names** — was showing N/A because `latest_service` was NULL. Now JOINs `bookings_service_types` for actual service data (e.g. "Nano Ceramic Coating")
- **Admin badge** — sidebar footer shows "Admin" instead of "Customer" for admin users
- **No system dialogs** — replaced `window.confirm()` with custom confirmation modal (agent rule compliance)
- **Admin check** — cross-references `customers.full_name → users.full_name` (handles phone number mismatch)

## [v1.5.0] — 2026-03-13
### Added
- **BoomerangMe loyalty card integration** — customers can view their stamps, visits, and rewards on the new Loyalty Cards page
  - `server/services/boomerangme.js` — API wrapper for digitalwallet.cards v2 with template mapping for all 9 card templates
  - `server/routes/loyalty.js` — GET /api/loyalty/cards with phone lookup (tries +63, 09, 63 formats) + email fallback
  - `frontend/src/pages/Loyalty.jsx` — full loyalty page with grouped cards, stamp progress visuals, visit counters, reward badges
- **Loyalty Cards** nav link added to sidebar and mobile navigation (between My Bookings and My Vehicles)
- Phone format normalization for Philippine numbers (`09XX` → `+63XX` for BoomerangMe API compatibility)

## [v1.4.1] — 2026-03-13
### Changed
- **Vehicle cards:** Replaced 3-dot kebab menu with a clear "Edit" button for ease of use (50% older users)
- **Edit modal footer:** Moved "Delete Vehicle" link inside the edit modal (far left, red, separated from action buttons)
- **Delete flow:** Double-confirm modal — clicking Delete in edit modal closes it first, then shows a confirmation dialog

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
