#!/bin/bash
# ============================================================
# MaskPro Care — Safe Deploy to DigitalOcean
#
# Architecture: Vite+React frontend + Express/Node.js API
# PM2 Process: maskpro-care (port 3004)
# Server Path: /var/www/care/
# Database: unify_maskpro (SHARED with Unify — DO NOT migrate/alter)
#
# ⚠️ SAFETY RULES:
#   - NEVER uses rsync --delete (additive only)
#   - NEVER touches /var/www/getsales/, /var/www/gaq/, /var/www/unify/
#   - NEVER runs bare 'pm2 restart' — always specifies 'maskpro-care'
#   - NEVER touches ports 3002, 3003, 3005
#   - NEVER modifies Unify-owned tables in unify_maskpro
#
# Usage:
#   ./deploy.sh              # Deploy everything (frontend + backend)
#   ./deploy.sh --frontend   # Frontend only (Vite build + upload)
#   ./deploy.sh --backend    # Backend only (Express server + PM2 restart)
# ============================================================

set -euo pipefail

DROPLET_IP="167.71.217.49"
REMOTE_USER="root"
SSH_PASS="${DEPLOY_SSH_PASS:-777Godisgood}"
APP_DIR="/var/www/care"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOMAIN="https://care.maskpro.ph"
PM2_PROCESS="maskpro-care"
PORT="3004"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[deploy]${NC} $1"; }
ok()   { echo -e "${GREEN}[  ✓  ]${NC} $1"; }
warn() { echo -e "${YELLOW}[  ⚠  ]${NC} $1"; }
fail() { echo -e "${RED}[  ✗  ]${NC} $1"; exit 1; }

# ─── Helpers ────────────────────────────────────────────────────────────
ssh_cmd() {
  SSHPASS="$SSH_PASS" sshpass -e ssh $SSH_OPTS "${REMOTE_USER}@${DROPLET_IP}" "$1"
}

rsync_safe() {
  SSHPASS="$SSH_PASS" sshpass -e rsync -avz --progress \
    -e "ssh $SSH_OPTS" "$1" "${REMOTE_USER}@${DROPLET_IP}:$2"
}

# ─── Pre-flight ─────────────────────────────────────────────────────────
preflight() {
  log "Pre-flight checks..."

  local DEPS=("sshpass" "ssh" "rsync" "npm" "curl" "jq")
  for dep in "${DEPS[@]}"; do
    if ! command -v "$dep" &>/dev/null; then
      fail "Dependency '$dep' not found. Install: brew install $dep"
    fi
  done

  if [ "${SSH_PASS}" = "777Godisgood" ]; then
    warn "Using hardcoded password. Set DEPLOY_SSH_PASS env var for security."
  fi

  # Quick SSH test
  ssh_cmd "echo ok" >/dev/null 2>&1 || fail "Cannot SSH to $DROPLET_IP. Check credentials."

  # Verify sister apps are untouched — check PM2 processes
  local PM2_CHECK=$(ssh_cmd "pm2 jlist 2>/dev/null" || echo "[]")
  local SISTER_APPS=("maskpro-api" "gaq-api" "getsales-public")
  for app in "${SISTER_APPS[@]}"; do
    if echo "$PM2_CHECK" | jq -e ".[] | select(.name == \"$app\" and .pm2_env.status == \"online\")" >/dev/null 2>&1; then
      ok "Sister app '$app' is online ✓"
    else
      warn "Sister app '$app' is NOT online — proceed with caution"
    fi
  done

  ok "Pre-flight passed"
}

# ─── Frontend (Vite + React) ───────────────────────────────────────────
build_frontend() {
  log "Building Vite frontend..."
  cd "${PROJECT_DIR}/frontend" || fail "No frontend/ directory found"
  npm run build 2>&1 | tail -n 5
  cd "$PROJECT_DIR"

  local INDEX_HTML="${PROJECT_DIR}/frontend/dist/index.html"
  [ -f "$INDEX_HTML" ] || fail "index.html missing from frontend/dist/"

  local JS_BUNDLE=$(grep -oE 'index-[a-zA-Z0-9_-]+\.js' "$INDEX_HTML" | head -1)
  [ -n "$JS_BUNDLE" ] || fail "No JS bundle found in index.html"
  [ -f "${PROJECT_DIR}/frontend/dist/assets/$JS_BUNDLE" ] || fail "$JS_BUNDLE missing from dist/assets/"

  local SIZE=$(wc -c < "${PROJECT_DIR}/frontend/dist/assets/$JS_BUNDLE" | awk '{print $1}')
  ok "Build verified: $JS_BUNDLE (${SIZE} bytes)"
}

upload_frontend() {
  log "Uploading frontend (NO --delete — additive only)..."

  # Ensure remote directory exists
  ssh_cmd "mkdir -p $APP_DIR/frontend/dist"

  rsync_safe "${PROJECT_DIR}/frontend/dist/" "$APP_DIR/frontend/dist/"
  ok "Frontend uploaded to $APP_DIR/frontend/dist/"
}

verify_frontend() {
  log "Verifying frontend on server..."

  local STATUS=$(curl -sk -o /dev/null -w "%{http_code}" "$DOMAIN/" 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ]; then
    ok "Frontend → HTTP 200 OK"
  else
    warn "Frontend → HTTP $STATUS (may need Nginx config or DNS setup first)"
  fi
}

clean_orphan_assets() {
  log "Cleaning orphaned JS/CSS hashes..."

  local INDEX_FILE="${PROJECT_DIR}/frontend/dist/index.html"
  [ -f "$INDEX_FILE" ] || fail "dist/index.html missing for orphan cleanup"

  local CURRENT_JS=$(grep -oE 'index-[a-zA-Z0-9_-]+\.js' "$INDEX_FILE" | head -1)
  local CURRENT_CSS=$(grep -oE 'index-[a-zA-Z0-9_-]+\.css' "$INDEX_FILE" | head -1)

  local SERVER_FILES=$(ssh_cmd "find $APP_DIR/frontend/dist/assets/ -maxdepth 1 -name 'index-*' -printf '%f\n' 2>/dev/null" || echo "")

  local CLEANED=0
  for FILE in $SERVER_FILES; do
    if [[ "$FILE" != "$CURRENT_JS" ]] && [[ "$FILE" != "$CURRENT_CSS" ]]; then
      ssh_cmd "rm -f \"$APP_DIR/frontend/dist/assets/$FILE\""
      log "  Removed orphan: $FILE"
      CLEANED=$((CLEANED + 1))
    fi
  done

  [ "$CLEANED" -gt 0 ] && ok "Cleaned $CLEANED orphan(s)" || ok "No orphans found"
}

# ─── Backend (Express/Node.js) ─────────────────────────────────────────
deploy_backend() {
  log "Uploading backend..."

  # Ensure remote directories exist
  ssh_cmd "mkdir -p $APP_DIR/server $APP_DIR/uploads"

  # Upload server code (NOT node_modules, NOT .env)
  SSHPASS="$SSH_PASS" sshpass -e rsync -avz --progress \
    --exclude 'node_modules' \
    -e "ssh $SSH_OPTS" \
    "${PROJECT_DIR}/server/" "${REMOTE_USER}@${DROPLET_IP}:$APP_DIR/server/"

  # Upload package files
  rsync_safe "${PROJECT_DIR}/package.json" "$APP_DIR/package.json"
  [ -f "${PROJECT_DIR}/package-lock.json" ] && rsync_safe "${PROJECT_DIR}/package-lock.json" "$APP_DIR/package-lock.json"

  log "Installing production dependencies..."
  ssh_cmd "cd $APP_DIR && npm install --production --silent 2>&1 | tail -3"

  log "Restarting PM2 process '$PM2_PROCESS'..."
  # Check if process exists, start or restart accordingly
  local EXISTS=$(ssh_cmd "pm2 jlist 2>/dev/null | jq -r '.[] | select(.name==\"$PM2_PROCESS\") | .name' 2>/dev/null" || echo "")
  if [ -n "$EXISTS" ]; then
    ssh_cmd "pm2 restart $PM2_PROCESS --update-env 2>&1 | head -5"
  else
    ssh_cmd "cd $APP_DIR && pm2 start server/index.js --name $PM2_PROCESS 2>&1 | head -5"
    ssh_cmd "pm2 save"
    ok "PM2 process '$PM2_PROCESS' created and saved"
  fi

  # Verify API health
  sleep 3
  local API_STATUS=$(curl -sk -o /dev/null -w "%{http_code}" "$DOMAIN/api/health" 2>/dev/null || echo "000")
  if [ "$API_STATUS" = "200" ]; then
    ok "API health → 200 OK"
  else
    warn "API health → HTTP $API_STATUS (may need Nginx/DNS setup)"
  fi

  # Verify PM2 is online
  local PM2_STATUS=$(ssh_cmd "pm2 jlist 2>/dev/null | jq -r '.[] | select(.name==\"$PM2_PROCESS\") | .pm2_env.status' 2>/dev/null" || echo "unknown")
  [ "$PM2_STATUS" = "online" ] && ok "PM2 '$PM2_PROCESS' → online" || warn "PM2 '$PM2_PROCESS' → $PM2_STATUS"
}

# ─── Nginx Setup (first-time only) ────────────────────────────────────
setup_nginx() {
  log "Setting up Nginx for care.maskpro.ph..."

  # Generate config to a temp file to avoid shell escaping issues
  local NGINX_TMP=$(mktemp)
  cat > "$NGINX_TMP" <<'NGINXEOF'
server {
    listen 80;
    server_name care.maskpro.ph;

    root /var/www/care/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3004;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /uploads/ {
        alias /var/www/care/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # API-served uploads — ^~ gives prefix priority over regex
    location ^~ /api/uploads/ {
        proxy_pass http://127.0.0.1:3004;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webp)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINXEOF

  rsync_safe "$NGINX_TMP" "/etc/nginx/sites-available/care"
  rm -f "$NGINX_TMP"
  ssh_cmd "ln -sf /etc/nginx/sites-available/care /etc/nginx/sites-enabled/care"
  ssh_cmd "nginx -t 2>&1" || fail "Nginx config test failed!"
  ssh_cmd "systemctl reload nginx"
  ok "Nginx configured for care.maskpro.ph"

  log "To enable SSL, run: ssh root@$DROPLET_IP 'certbot --nginx -d care.maskpro.ph'"
}

# ─── Main ───────────────────────────────────────────────────────────────
main() {
  local VERSION=$(jq -r '.version // "0.0.0"' "${PROJECT_DIR}/package.json" 2>/dev/null || echo "0.0.0")

  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}  MaskPro Care — Safe Deploy v${VERSION}${NC}"
  echo -e "${BLUE}  Target: ${DOMAIN} → ${APP_DIR}${NC}"
  echo -e "${BLUE}  PM2: ${PM2_PROCESS} (port ${PORT})${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  preflight

  local MODE="${1:---all}"
  case "$MODE" in
    --frontend)
      build_frontend
      upload_frontend
      verify_frontend
      clean_orphan_assets
      ;;
    --backend)
      deploy_backend
      ;;
    --setup-nginx)
      setup_nginx
      ;;
    --all)
      build_frontend
      upload_frontend
      deploy_backend
      verify_frontend
      clean_orphan_assets
      ;;
    *)
      echo "Usage: ./deploy.sh [--frontend|--backend|--setup-nginx|--all]"
      echo ""
      echo "  --frontend     Build Vite + upload dist/"
      echo "  --backend      Upload server/ + restart PM2"
      echo "  --setup-nginx  First-time Nginx config (run once)"
      echo "  --all          Full deploy (default)"
      exit 1
      ;;
  esac

  echo ""
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}  Deploy complete! 🚀  v${VERSION}${NC}"
  echo -e "${GREEN}  Frontend: ${DOMAIN}${NC}"
  echo -e "${GREEN}  API:      ${DOMAIN}/api/health${NC}"
  echo -e "${GREEN}  PM2:      ${PM2_PROCESS} (port ${PORT})${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

main "$@"
