# Start API server only (port 3001)
Set-Location $PSScriptRoot\..
pnpm --filter @vantage/api dev
