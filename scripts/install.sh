#!/usr/bin/env bash
# Vencore installer bootstrap
# Usage: curl -fsSL https://get.vencore.in | bash

set -euo pipefail

INSTALLER_IMAGE="${VENCORE_INSTALLER_IMAGE:-vencore/installer:latest}"
INSTALLER_PORT="${VENCORE_PORT:-3000}"
DEST_DIR="${VENCORE_DEST_DIR:-/opt/vencore}"
CONTAINER_NAME="vencore-installer"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log()   { echo -e "${BLUE}▶${NC} $*"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
err()   { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

# Check OS
if [[ "$(uname -s)" != "Linux" ]]; then
  err "This installer supports Linux only. For other platforms, see https://vencore.in/docs/install"
fi

# Check Docker
if ! command -v docker &>/dev/null; then
  log "Docker not found — installing via get.docker.com..."
  curl -fsSL https://get.docker.com | sh
  ok "Docker installed"
else
  ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"
fi

# Check Docker daemon running
if ! docker info &>/dev/null; then
  log "Starting Docker daemon..."
  sudo systemctl start docker 2>/dev/null || sudo service docker start 2>/dev/null || true
  sleep 3
  docker info &>/dev/null || err "Docker daemon not running. Start it manually and re-run this script."
fi

# Remove existing installer container if present
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  log "Removing existing installer container..."
  docker rm -f "${CONTAINER_NAME}"
fi

# Create dest dir
mkdir -p "${DEST_DIR}"

# Get server IP for display
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

log "Pulling ${INSTALLER_IMAGE}..."
docker pull "${INSTALLER_IMAGE}"
ok "Image pulled"

log "Starting Vencore installer..."
docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  -p "${INSTALLER_PORT}:3000" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "${DEST_DIR}:${DEST_DIR}" \
  -e INSTALLER_MODE=true \
  -e VENCORE_DEST_DIR="${DEST_DIR}" \
  "${INSTALLER_IMAGE}"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Vencore installer is running!${NC}"
echo ""
echo -e "  Open your browser and go to:"
echo -e "  ${BLUE}http://${SERVER_IP}:${INSTALLER_PORT}/setup${NC}"
echo ""
echo -e "  After setup is complete, remove this container:"
echo -e "  docker rm -f ${CONTAINER_NAME}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
