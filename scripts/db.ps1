# Manage docker services (postgres:5432, redis:6379)
# Usage: .\db.ps1 [up|down|logs|reset]
param([string]$Command = "up")

Set-Location $PSScriptRoot\..

switch ($Command) {
  "up"    { docker compose up -d }
  "down"  { docker compose down }
  "logs"  { docker compose logs -f }
  "reset" {
    Write-Host "[db] WARNING: This will delete all data." -ForegroundColor Yellow
    $confirm = Read-Host "Type 'yes' to confirm"
    if ($confirm -eq "yes") {
      docker compose down -v
      docker compose up -d
    } else {
      Write-Host "Aborted." -ForegroundColor Red
    }
  }
  default { Write-Host "Usage: .\db.ps1 [up|down|logs|reset]" -ForegroundColor Yellow }
}
