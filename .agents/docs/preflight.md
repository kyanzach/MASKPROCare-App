# MaskPro Care — Preflight (Run Every Session)

## 1) Read First (Required)

- `.agents/rules/maskprocare-app.md` (guardrails)
- `.agents/docs/maskprocare-reference.md` (schemas, patterns, UI specs, session learnings)
- `CHANGELOG.md` (recent changes + version context)
- `CREDENTIALS_REFERENCE.md` (server/DB/API details; never paste secrets into tickets/chats)

## 2) Safety & Boundaries (Non-Negotiable)

- Only touch **Care-owned tables**: bookings, booking_requests, customer_vehicles, customer_notifications, login_otp, services, branches
- Never modify **Unify-owned tables/code** (this workspace may contain Unify references; do not change them here)
- Always use `customer_id` (never `user_id`) and **verify ownership** on every endpoint
- Always use **parameterized SQL** (`?` placeholders); no string concatenation
- Server-side timezone must be **Asia/Manila**
- Never send OTP/SMS to non-test numbers; only approved: `09992216923`, `09173333589`, `09852779777`
- Never use native dialogs (`alert`, `confirm`, `prompt`) in the frontend

## 3) Deployment & Infra Constraints

- Local/prod port: **3004**; PM2 process: `maskpro-care`
- Don’t touch sister app ports: **3002, 3003, 3005**
- Deploy only via `deploy.sh` (no manual rsync/pm2)
- Nginx serves from `/var/www/care/frontend/dist/` (never `/var/www/care/dist/`)

## 4) Schema Gotchas to Re-Check Before Querying

- `bookings.booking_id` is the PK (not `id`); FK is `customer_vehicle_id`
- `bookings` has no `status` column (derive via notes/date + service status logic if applicable)
- `booking_requests.time_added` is the timestamp (not `created_at`); status includes `cancelled`
- `login_otp.otp_code` is NOT NULL (use empty string to clear)

## 5) Working Agreement (Assistant Behavior)

- Start every task by re-reading the 4 “Read First” files above.
- If a request conflicts with any guardrail, propose a safe alternative instead of proceeding.
- Never output or log secrets (even if present in repo docs); redact before sharing.
