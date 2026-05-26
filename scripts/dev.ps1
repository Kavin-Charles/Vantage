# Start full Vantage stack: docker services + all apps via turbo
Set-Location $PSScriptRoot\..

Write-Host "[db] Starting docker services..." -ForegroundColor Cyan
docker compose up -d
if ($LASTEXITCODE -ne 0) { Write-Host "[db] Docker failed. Is Docker Desktop running?" -ForegroundColor Red; exit 1 }

Write-Host "[dev] Starting all apps (web :3000, api :3001, mobile)..." -ForegroundColor Cyan
pnpm dev
