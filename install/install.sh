#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

log()  { echo -e "${BLUE}[vencore]${NC} $*"; }
ok()   { echo -e "${GREEN}[vencore]${NC} $*"; }
warn() { echo -e "${YELLOW}[vencore]${NC} $*"; }
err()  { echo -e "${RED}[vencore]${NC} ERROR: $*" >&2; exit 1; }

INSTALL_DIR="${VENCORE_DIR:-$HOME/vencore}"

check_deps() {
  command -v docker >/dev/null 2>&1 || err "Docker not found. Install from https://docs.docker.com/get-docker/"
  docker compose version >/dev/null 2>&1 || err "Docker Compose v2 plugin not found. Update Docker Desktop or run: apt-get install docker-compose-plugin"
  command -v openssl >/dev/null 2>&1 || err "openssl not found. Install it: apt-get install openssl"
  command -v curl >/dev/null 2>&1 || err "curl not found. Install it: apt-get install curl"
}

gen_secret() { openssl rand -hex 32; }

detect_ip() {
  hostname -I 2>/dev/null | awk '{print $1}' || \
  ip route get 1 2>/dev/null | awk '{print $NF;exit}' || \
  echo "localhost"
}

resolve_version() {
  local token tags
  token=$(curl -fsSL "https://ghcr.io/token?service=ghcr.io&scope=repository:vencorehq/vencore-api:pull" 2>/dev/null \
    | sed -n 's/.*"token" *: *"\([^"]*\)".*/\1/p') || true
  if [ -n "${token:-}" ]; then
    tags=$(curl -fsSL -H "Authorization: Bearer $token" \
      "https://ghcr.io/v2/vencorehq/vencore-api/tags/list?n=1000" 2>/dev/null) || true
    echo "$tags" | tr '",' '\n\n' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' \
      | sort -t. -k1,1n -k2,2n -k3,3n | tail -1 || true
  fi
}

write_compose() {
  cat > "$INSTALL_DIR/docker-compose.yml" <<'COMPOSE'
services:
  web:
    image: ghcr.io/vencorehq/vencore-web:${VENCORE_VERSION:-latest}
    ports:
      - "80:3000"
    env_file: .env
    depends_on:
      api:
        condition: service_healthy
    restart: unless-stopped

  api:
    image: ghcr.io/vencorehq/vencore-api:${VENCORE_VERSION:-latest}
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3001/api/setup/status || exit 1"]
      interval: 5s
      timeout: 3s
      retries: 20
    restart: unless-stopped

  worker:
    image: ghcr.io/vencorehq/vencore-worker:${VENCORE_VERSION:-latest}
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  updater:
    image: ghcr.io/vencorehq/vencore-updater:${VENCORE_VERSION:-latest}
    env_file: .env
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - .:/vencore
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: vencore
      POSTGRES_PASSWORD: vencore
      POSTGRES_DB: vencore
    volumes:
      - db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vencore"]
      interval: 5s
      timeout: 3s
      retries: 10
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10
    restart: unless-stopped

volumes:
  db_data:
  redis_data:
COMPOSE
}

write_env() {
  cat > "$INSTALL_DIR/.env" << EOF
# Database (internal Docker network — do not change hostnames)
DATABASE_URL=postgresql://vencore:vencore@db:5432/vencore
REDIS_URL=redis://redis:6379

# Secrets (auto-generated — keep private)
JWT_SECRET=$(gen_secret)
CRON_SECRET=$(gen_secret)
AGENT_SIGNING_SECRET=$(gen_secret)
SSH_ENCRYPTION_KEY=$(gen_secret)
UPDATER_SECRET=$(gen_secret)

# App
NODE_ENV=production
NEXT_PUBLIC_API_URL=http://api:3001
APP_URL=http://${SERVER_IP}
COOKIE_SECURE=false

# Updater (managed by the in-app updater — do not edit by hand)
VENCORE_VERSION=${RESOLVED_VERSION}
VENCORE_INSTALL_DIR=${INSTALL_DIR}
EOF
}

wait_for_api() {
  log "Waiting for API to be ready..."
  local attempts=0
  while [ $attempts -lt 30 ]; do
    if docker compose -f "$INSTALL_DIR/docker-compose.yml" exec -T api \
        wget -qO- http://localhost:3001/api/setup/status >/dev/null 2>&1; then
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 3
  done
  err "API health check timed out. Check logs: cd $INSTALL_DIR && docker compose logs api"
}

main() {
  echo ""
  echo "  Vencore Installer"
  echo "  ─────────────────"
  echo ""

  log "Checking dependencies..."
  check_deps
  ok "Dependencies OK."

  log "Creating install directory: $INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"

  SERVER_IP=$(detect_ip)

  log "Writing docker-compose.yml..."
  write_compose

  log "Resolving latest release version..."
  RESOLVED_VERSION=$(resolve_version)
  RESOLVED_VERSION=${RESOLVED_VERSION:-latest}
  ok "Installing version: $RESOLVED_VERSION"

  if [ -f "$INSTALL_DIR/.env" ]; then
    warn ".env already exists — skipping secret generation."
    warn "To regenerate secrets: rm $INSTALL_DIR/.env && bash $0"
  else
    log "Generating secrets and writing .env..."
    write_env
    ok ".env written."
  fi

  log "Pulling images (first run may take a few minutes)..."
  docker compose -f "$INSTALL_DIR/docker-compose.yml" pull

  log "Starting Vencore..."
  docker compose -f "$INSTALL_DIR/docker-compose.yml" up -d

  wait_for_api

  echo ""
  ok "Vencore is running!"
  echo ""
  echo "  → Open http://$SERVER_IP in your browser to complete setup."
  echo ""
  echo "  Useful commands:"
  echo "    cd $INSTALL_DIR"
  echo "    docker compose logs -f         # View logs"
  echo "    docker compose down            # Stop"
  echo "    Updates: Settings → Updates in the dashboard (or docker compose pull && docker compose up -d)"
  echo ""
}

main "$@"
