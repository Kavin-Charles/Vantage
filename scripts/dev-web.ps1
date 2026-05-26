# Start web app only (port 3000)
Set-Location $PSScriptRoot\..
pnpm --filter @vantage/web dev
