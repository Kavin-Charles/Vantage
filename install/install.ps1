#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$INSTALL_DIR = if ($env:VENCORE_DIR) { $env:VENCORE_DIR } else { "$env:USERPROFILE\vencore" }

function Write-Log  { Write-Host "[vencore] $args" -ForegroundColor Cyan }
function Write-Ok   { Write-Host "[vencore] $args" -ForegroundColor Green }
function Write-Warn { Write-Host "[vencore] $args" -ForegroundColor Yellow }
function Write-Err  { Write-Host "[vencore] ERROR: $args" -ForegroundColor Red; exit 1 }

function Test-Deps {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Err "Docker not found. Install Docker Desktop from https://docs.docker.com/desktop/install/windows/"
    }
    try { docker compose version | Out-Null }
    catch { Write-Err "Docker Compose v2 not found. Update Docker Desktop." }
}

function New-Secret {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return ([System.BitConverter]::ToString($bytes)).Replace('-', '').ToLower()
}

function Get-LocalIP {
    try {
        $ip = (Get-NetIPAddress -AddressFamily IPv4 |
            Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.PrefixOrigin -ne 'WellKnown' } |
            Select-Object -First 1).IPAddress
        if ($ip) { return $ip }
    } catch {}
    return 'localhost'
}

function Resolve-Version {
    try {
        $tok = (Invoke-RestMethod "https://ghcr.io/token?service=ghcr.io&scope=repository:vencorehq/vencore-api:pull").token
        $tags = (Invoke-RestMethod "https://ghcr.io/v2/vencorehq/vencore-api/tags/list?n=1000" -Headers @{ Authorization = "Bearer $tok" }).tags
        $semvers = $tags | Where-Object { $_ -match '^\d+\.\d+\.\d+$' } | Sort-Object { [version]$_ }
        if ($semvers) { return $semvers[-1] }
    } catch {}
    return 'latest'
}

function Write-Compose {
    @'
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
'@ | Set-Content -Path "$INSTALL_DIR\docker-compose.yml" -Encoding utf8
}

function Write-Env {
    @"
# Database (internal Docker network - do not change hostnames)
DATABASE_URL=postgresql://vencore:vencore@db:5432/vencore
REDIS_URL=redis://redis:6379

# Secrets (auto-generated - keep private)
JWT_SECRET=$(New-Secret)
CRON_SECRET=$(New-Secret)
AGENT_SIGNING_SECRET=$(New-Secret)
SSH_ENCRYPTION_KEY=$(New-Secret)
UPDATER_SECRET=$(New-Secret)

# App
NODE_ENV=production
NEXT_PUBLIC_API_URL=http://api:3001
COOKIE_SECURE=false

# Updater (managed by the in-app updater - do not edit by hand)
VENCORE_VERSION=$script:ResolvedVersion
VENCORE_INSTALL_DIR=$INSTALL_DIR
"@ | Set-Content -Path "$INSTALL_DIR\.env" -Encoding utf8
}

function Wait-ForApi {
    Write-Log "Waiting for API to be ready..."
    for ($i = 0; $i -lt 30; $i++) {
        try {
            docker compose -f "$INSTALL_DIR\docker-compose.yml" exec -T api `
                wget -qO- http://localhost:3001/api/setup/status 2>$null | Out-Null
            return $true
        } catch {}
        Start-Sleep -Seconds 3
    }
    return $false
}

# -- Main -----------------------------------------------------------------

Write-Host ""
Write-Host "  Vencore Installer"
Write-Host "  -----------------"
Write-Host ""

Write-Log "Checking dependencies..."
Test-Deps
Write-Ok "Dependencies OK."

Write-Log "Creating install directory: $INSTALL_DIR"
New-Item -ItemType Directory -Force -Path $INSTALL_DIR | Out-Null

Write-Log "Writing docker-compose.yml..."
Write-Compose

Write-Log "Resolving latest release version..."
$script:ResolvedVersion = Resolve-Version
Write-Ok "Installing version: $script:ResolvedVersion"

if (Test-Path "$INSTALL_DIR\.env") {
    Write-Warn ".env already exists - skipping secret generation."
    Write-Warn "To regenerate: Remove-Item '$INSTALL_DIR\.env' then re-run this script."
} else {
    Write-Log "Generating secrets and writing .env..."
    Write-Env
    Write-Ok ".env written."
}

Write-Log "Pulling images (first run may take a few minutes)..."
docker compose -f "$INSTALL_DIR\docker-compose.yml" pull

Write-Log "Starting Vencore..."
docker compose -f "$INSTALL_DIR\docker-compose.yml" up -d

if (-not (Wait-ForApi)) {
    Write-Err "API health check timed out. Check logs: cd '$INSTALL_DIR'; docker compose logs api"
}

$ip = Get-LocalIP

Write-Host ""
Write-Ok "Vencore is running!"
Write-Host ""
Write-Host "  -> Open http://$ip in your browser to complete setup."
Write-Host ""
Write-Host "  Useful commands:"
Write-Host "    cd '$INSTALL_DIR'"
Write-Host "    docker compose logs -f                           # View logs"
Write-Host "    docker compose down                              # Stop"
Write-Host "    docker compose pull; docker compose up -d       # Update"
Write-Host ""

Start-Process "http://$ip"
