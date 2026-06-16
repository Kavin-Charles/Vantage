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
}

gen_secret() { openssl rand -hex 32; }

detect_ip() {
  hostname -I 2>/dev/null | awk '{print $1}' || \
  ip route get 1 2>/dev/null | awk '{print $NF;exit}' || \
  echo "localhost"
}

write_compose() {
  cat > "$INSTALL_DIR/docker-compose.yml" <<'COMPOSE'
services:
  web:
    image: ghcr.io/vencorehq/vencore-web:latest
    ports:
      - "80:3000"
    env_file: .env
    depends_on:
      api:
        condition: service_healthy
    restart: unless-stopped

  api:
    image: ghcr.io/vencorehq/vencore-api:latest
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
    image: ghcr.io/vencorehq/vencore-worker:latest
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
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

# App
NODE_ENV=production
NEXT_PUBLIC_API_URL=http://api:3001
COOKIE_SECURE=false
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
  warn "API health check timed out. Check logs: cd $INSTALL_DIR && docker compose logs api"
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

  log "Writing docker-compose.yml..."
  write_compose

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

  SERVER_IP=$(detect_ip)

  echo ""
  ok "Vencore is running!"
  echo ""
  echo "  → Open http://$SERVER_IP in your browser to complete setup."
  echo ""
  echo "  Useful commands:"
  echo "    cd $INSTALL_DIR"
  echo "    docker compose logs -f         # View logs"
  echo "    docker compose down            # Stop"
  echo "    docker compose pull && docker compose up -d  # Update"
  echo ""
}

main "$@"
