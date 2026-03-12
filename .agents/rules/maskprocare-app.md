---
trigger: always_on
description: Critical guardrails for MaskPro Care App (customer-facing vehicle maintenance app)
---

# MaskPro Care App — Agent Rules

> 📖 **Full reference:** `.agents/docs/maskprocare-reference.md` — schemas, patterns, UI specs, learnings, phase status.
> Read it before making changes. Record all new learnings there, NOT in this file.
> 📋 **Check `CHANGELOG.md`** at session start for recall — it tracks all recent changes, versions, and context.

## Architecture
- **Vite + React SPA** frontend (`frontend/`) + **Express/Node.js API** (`server/`) + **MySQL** (mysql2)
- **Shared `unify_maskpro` database** — shared with Unify. ONLY touch Care's tables
- **Port:** 3004 (local dev + production PM2)
- **PM2 Process:** `maskpro-care`
- **Domain:** `care.maskpro.ph`
- **Auth:** JWT (jsonwebtoken) — Bearer token in Authorization header
- **SMS:** iTexMo + SMS-it (dual provider, shared across MaskPro apps)
- **Timezone:** All server-side MUST use Asia/Manila

## Critical Rules

1. **Never modify Unify-owned tables** — only touch Care's tables (bookings, booking_requests, customer_vehicles, customer_notifications, login_otp, services, branches)
2. **Never use `user_id`** — that's Unify (agent app). This app uses `customer_id`
3. **Always filter by customer_id** — every API endpoint must verify ownership
4. **Never use `git add -A` or `git add .`** — stage specific files only
5. **Never modify Unify code** from this workspace — use handoff prompts instead
6. **Always use parameterized queries** — no string concatenation in SQL (use mysql2 `?` placeholders)
7. **NEVER modify files outside `/var/www/care/`** on the server
8. **NEVER touch ports 3002, 3003, 3005** — those belong to sister apps (GetSales, GAQ, GetSales SSR)
9. **NEVER modify other apps' databases** — `maskpro_commissions` (GetSales), `maskpro_quotations` (GAQ)
10. **NEVER run bare `pm2 restart`** — always use `pm2 restart maskpro-care`
11. **NEVER modify Nginx configs** other than `/etc/nginx/sites-available/care`
12. Always check CHANGELOG.md at session start for recall
13. Always log new learnings to `.agents/docs/maskprocare-reference.md` with dates
14. NEVER use native system dialogs (`alert()`, `confirm()`, `prompt()`) — use modals instead
15. Always read `CREDENTIALS_REFERENCE.md` for SSH, MySQL, API keys, and server details — never ask for credentials

## Schema Gotchas
- `bookings.booking_id` is PK (NOT `id`), FK is `customer_vehicle_id` (NOT `vehicle_id`)
- `bookings` has NO `status` column — determined from `notes LIKE 'CANCELLED:%'` + date comparison
- `booking_requests` uses `time_added` (NOT `created_at`), status ENUM includes `cancelled`
- `login_otp.otp_code` is NOT NULL — use empty string to clear

## Shared Droplet — Sister Apps (DO NOT TOUCH)
| App | PM2 | Port | DB | Path |
|-----|-----|------|----|------|
| GetSales | `maskpro-api` | 3002 | `maskpro_commissions` | `/var/www/getsales/` |
| GAQ | `gaq-api` | 3003 | `maskpro_quotations` | `/var/www/gaq/` |
| GetSales SSR | `getsales-public` | 3005 | `maskpro_commissions` | `/var/www/getsales/public-web/` |
| Unify | PHP-FPM | — | `unify_maskpro` (shared!) | `/var/www/unify/` |

## Git & Versioning
- Check `CHANGELOG.md` at session start for recall
- Every functional code change MUST have a CHANGELOG entry before committing
- Commit often, push often — each commit = one logical change
- Version lives in `package.json` → bump patch/minor/major
- Always verify with `git status --short` before committing

## Deployment (`deploy.sh`)
- **Always use `deploy.sh`** for deploying — NEVER manual rsync/pm2
- Usage: `./deploy.sh` (all) | `--frontend` | `--backend` | `--setup-nginx`
- `.env` is **NOT uploaded** by deploy.sh — must be created manually on server at `/var/www/care/.env`
- First-time deploy requires `./deploy.sh --setup-nginx` once, then `certbot --nginx -d care.maskpro.ph` for SSL
- Rsync is **additive only** (no `--delete`) — never removes server files
- Deploy.sh does preflight checks: SSH test + verifies sister apps in PM2
- Backend deploy: uploads `server/`, runs `npm install --production`, restarts PM2
- Frontend deploy: `npm run build`, uploads `dist/`, cleans orphaned JS/CSS hashes
- API health check: `https://care.maskpro.ph/api/health`
- See `maskprocare-reference.md` for first-time server setup (production `.env` values)