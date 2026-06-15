#!/bin/sh
set -e

# Start API on port 3001 (background)
echo "▶ Starting Vencore API (installer mode)..."
node /app/apps/api/dist/index.js &
API_PID=$!

# Wait for API to be ready
for i in $(seq 1 20); do
  if wget -qO- http://localhost:3001/api/installer/server-ip >/dev/null 2>&1; then
    echo "✓ API ready"
    break
  fi
  sleep 1
done

# Start Next.js on port 3000 (foreground)
echo "▶ Starting Vencore web (setup wizard)..."
cd /app/apps/web
exec node_modules/.bin/next start -p 3000
