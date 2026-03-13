# MaskPro Care — Credentials Reference

> **READ THIS FILE** before any deployment or SSH command. Never ask the user for credentials.

---

## DigitalOcean Droplet (Shared Server)

| Item | Value |
|------|-------|
| **IP** | `167.71.217.49` |
| **SSH User** | `root` |
| **SSH Password** | `777Godisgood` |
| **OS** | Ubuntu 22.04 (SGP1 — Singapore) |
| **RAM** | 4 GB + 2 GB swap |
| **CPU** | 2 vCPU |
| **Disk** | 80 GB SSD |
| **PHP** | 8.2 (PHP-FPM via `/run/php/php8.2-fpm.sock`) |
| **Node.js** | v20.20.0 |
| **MySQL** | 8.0.45 |

---

## MySQL — Production (`unify_maskpro`)

> ⚠️ This database is **SHARED with Unify**. Only touch Care's tables.

| Item | Value |
|------|-------|
| **Host** | `localhost` |
| **Database** | `unify_maskpro` |
| **User** | `unify_user` |
| **Password** | `UnifyM@skpr0_2026!` |
| **Port** | `3306` |

### Care's Tables (safe to modify)
`bookings`, `booking_requests`, `booking_request_services`, `customer_vehicles`, `customer_notifications`, `login_otp`, `customers`, `services`, `branches`, `branch_booking_capacity`

### Unify's Tables (DO NOT TOUCH)
`team_leads`, `coupons`, `agents`, `users`, `inventory_*`, `loyalty_*`, `sms_*`

---

## MySQL — Local Development

| Item | Value |
|------|-------|
| **Host** | `localhost` |
| **Database** | `omnimpdb` |
| **User** | `root` |
| **Password** | *(empty)* |

---

## MaskPro Care — Server Deployment

| Item | Value |
|------|-------|
| **PM2 Process** | `maskpro-care` |
| **Port** | `3004` |
| **Server Path** | `/var/www/care/` |
| **Nginx Config** | `/etc/nginx/sites-available/care` |
| **Domain** | `care.maskpro.ph` |
| **SSL** | Let's Encrypt (to be provisioned via certbot) |

---

## SMS API Keys (Shared Across All MaskPro Apps)

### iTexMo (Primary)
| Item | Value |
|------|-------|
| **Email** | `ryan@maskpro.ph` |
| **Password** | `Godisgood21` |
| **API Code** | `ST-Ryan476_X8M5C` |
| **Sender ID** | `MaskPro` |

### SMS-it (Fallback)
| Item | Value |
|------|-------|
| **API Key** | `be0fe6a90f5240c6b4ff34d2f9e50e03` |
| **From Number** | `+639996195498` |

---

## JWT Secret

| Item | Value |
|------|-------|
| **JWT Secret** | `mpc_jwt_s3cr3t_k3y_2026_xK9pLm2nQ7rT` |
| **Expiry** | `86400` (24 hours) |

> Use the same secret that was used in the PHP version for token compatibility during migration.

---

## TEAM_LEADS_API_KEY (GetSales ↔ Unify Integration)

| Item | Value |
|------|-------|
| **API Key** | `52ddde2954300045c61ebb8e53dea224` |

> MaskPro Care does NOT directly use this key. It's here for reference only.

---

## BoomerangMe Loyalty Cards API

| Item | Value |
|------|-------|
| **API Base** | `https://api.digitalwallet.cards/api/v2` |
| **API Key** | `6f59f368388c29e4a01e704af6432d74` |
| **Auth Header** | `X-API-Key: <key>` |
| **Rate Limit** | 10 req/sec (600/min) |
| **Docs** | `https://docs.digitalwallet.cards` |

### Template IDs
| Template | ID | Type |
|----------|-----|------|
| Silver Package (Nano Ceramic Coating) | 41402 | subscription |
| Gold Package (Nano Ceramic Coating) | 42605 | subscription |
| Diamond Package (Nano Ceramic Coating) | 43203 | subscription |
| Diamond Package (No Exp) | 1006938 | subscription |
| MaskPro Loyalty Card (Tint) | 147644 | discount |
| PPF Maintenance Membership | 318553 | subscription |
| MASKPROCare Protection Plan (PPF) | 302979 | subscription |
| Care Wash Prepaid Card | 40799 | subscription |
| MaskPro Gift Card | 283699 | certificate |

> Phone format: BoomerangMe stores PH phones as `639XXXXXXXXX` (no leading 0, no +). Use `+639XXXXXXXXX` for API lookups.

---

## Sister Apps on This Droplet

| App | PM2 Process | Port | DB | Path |
|-----|-------------|------|----|------|
| **MaskPro Care** | `maskpro-care` | 3004 | `unify_maskpro` | `/var/www/care/` |
| GetSales | `maskpro-api` | 3002 | `maskpro_commissions` | `/var/www/getsales/` |
| GetSales SSR | `getsales-public` | 3005 | `maskpro_commissions` | `/var/www/getsales/public-web/` |
| GAQ | `gaq-api` | 3003 | `maskpro_quotations` | `/var/www/gaq/` |
| Unify | PHP-FPM | — | `unify_maskpro` (shared!) | `/var/www/unify/` |

---

## Git

| Item | Value |
|------|-------|
| **Repo** | `https://github.com/kyanzach/MASKPROCare-App.git` |
| **Branch** | `main` |
