# Vencore installer bootstrap for Windows
# Usage: irm https://get.vencore.in/install.ps1 | iex

$ErrorActionPreference = 'Stop'

$INSTALLER_IMAGE = if ($env:VENCORE_INSTALLER_IMAGE) { $env:VENCORE_INSTALLER_IMAGE } else { 'vencore/installer:latest' }
$INSTALLER_PORT  = if ($env:VENCORE_PORT) { $env:VENCORE_PORT } else { '3000' }
$DEST_DIR        = if ($env:VENCORE_DEST_DIR) { $env:VENCORE_DEST_DIR } else { 'C:\vencore' }
$CONTAINER_NAME  = 'vencore-installer'

function log($msg) { Write-Host "▶ $msg" -ForegroundColor Blue }
function ok($msg)  { Write-Host "✓ $msg" -ForegroundColor Green }
function err($msg) { Write-Host "✗ $msg" -ForegroundColor Red -NoNewline; Write-Host ''; exit 1 }

if ($env:OS -ne 'Windows_NT') {
    err 'This script is for Windows only. For Linux: curl -fsSL https://get.vencore.in | bash'
}

# Check Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    err 'Docker not found. Install Docker Desktop from https://www.docker.com/products/docker-desktop/ then re-run.'
}
ok "Docker $(docker --version)"

# Check Docker daemon
$dockerInfo = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    err 'Docker daemon not running. Start Docker Desktop and re-run this script.'
}

# Remove existing installer container
$existing = docker ps -a --format '{{.Names}}' 2>$null | Where-Object { $_ -eq $CONTAINER_NAME }
if ($existing) {
    log 'Removing existing installer container...'
    docker rm -f $CONTAINER_NAME | Out-Null
}

# Create dest dir
New-Item -ItemType Directory -Force -Path $DEST_DIR | Out-Null
ok "Destination: $DEST_DIR"

# Get server IP (first non-loopback, non-APIPA IPv4)
$SERVER_IP = (
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
    Select-Object -First 1
).IPAddress
if (-not $SERVER_IP) { $SERVER_IP = 'localhost' }

log "Pulling $INSTALLER_IMAGE..."
docker pull $INSTALLER_IMAGE
if ($LASTEXITCODE -ne 0) { err 'Failed to pull installer image.' }
ok 'Image pulled'

# On Windows + Docker Desktop (Linux containers mode), /var/run/docker.sock
# is accessible via the WSL2 integration socket proxy.
# If using Windows containers mode, this mount path will differ.
log 'Starting Vencore installer...'
docker run -d `
    --name $CONTAINER_NAME `
    --restart unless-stopped `
    -p "${INSTALLER_PORT}:3000" `
    -v /var/run/docker.sock:/var/run/docker.sock `
    -v "${DEST_DIR}:${DEST_DIR}" `
    -e INSTALLER_MODE=true `
    -e VENCORE_DEST_DIR="$DEST_DIR" `
    $INSTALLER_IMAGE

if ($LASTEXITCODE -ne 0) { err 'Failed to start installer container.' }

$line = '━' * 52
Write-Host ''
Write-Host $line -ForegroundColor Green
Write-Host '  Vencore installer is running!' -ForegroundColor Green
Write-Host ''
Write-Host '  Open your browser and go to:'
Write-Host "  http://${SERVER_IP}:${INSTALLER_PORT}/setup" -ForegroundColor Blue
Write-Host ''
Write-Host '  After setup is complete, remove this container:'
Write-Host "  docker rm -f $CONTAINER_NAME"
Write-Host $line -ForegroundColor Green
