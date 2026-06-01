#!/bin/bash
# Deploy Vantage to GCP VM
# Usage: ./scripts/deploy.sh <zone>
# Example: ./scripts/deploy.sh us-central1-a

set -e

PROJECT=stone-outpost-472905-f8
VM=vantage-test
ZONE=${1:?Usage: deploy.sh <zone>}
REMOTE=/opt/vantage

echo "==> Getting VM IP..."
VM_IP=$(gcloud compute instances describe "$VM" \
  --project="$PROJECT" --zone="$ZONE" \
  --format='value(networkInterfaces[0].accessConfigs[0].natIP)')
echo "    VM IP: $VM_IP"

echo "==> Ensuring firewall rules for ports 3000 and 3001..."
gcloud compute firewall-rules describe vantage-web --project="$PROJECT" &>/dev/null || \
  gcloud compute firewall-rules create vantage-web \
    --project="$PROJECT" \
    --allow=tcp:3000,tcp:3001 \
    --source-ranges=0.0.0.0/0 \
    --description="Vantage web and API ports"

echo "==> Checking Docker on VM..."
gcloud compute ssh "$VM" --project="$PROJECT" --zone="$ZONE" --command="
  if ! command -v docker &>/dev/null; then
    echo 'Installing Docker...'
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    usermod -aG docker \$USER
  else
    echo 'Docker already installed:' \$(docker --version)
  fi
"

echo "==> Packaging source (excluding node_modules, dist, .next)..."
ARCHIVE=/tmp/vantage-deploy.tar.gz
tar -czf "$ARCHIVE" \
  --exclude='./node_modules' \
  --exclude='./.git' \
  --exclude='./.turbo' \
  --exclude='*/.next' \
  --exclude='*/dist' \
  --exclude='*/node_modules' \
  --exclude='./.env.prod' \
  --exclude='./apps/mobile' \
  --exclude='./apps/agent' \
  --exclude='./_design' \
  --exclude='./screenshots' \
  --exclude='*.zip' \
  -C "$(pwd)" .

echo "==> Uploading to $VM..."
gcloud compute ssh "$VM" --project="$PROJECT" --zone="$ZONE" \
  --command="sudo mkdir -p $REMOTE && sudo chown \$USER:\$USER $REMOTE"
gcloud compute scp --project="$PROJECT" --zone="$ZONE" \
  "$ARCHIVE" "$VM:/tmp/vantage-deploy.tar.gz"
gcloud compute ssh "$VM" --project="$PROJECT" --zone="$ZONE" \
  --command="tar -xzf /tmp/vantage-deploy.tar.gz -C $REMOTE && rm /tmp/vantage-deploy.tar.gz"
rm -f "$ARCHIVE"

echo "==> Checking .env.prod on VM..."
gcloud compute ssh "$VM" --project="$PROJECT" --zone="$ZONE" --command="
  if [ ! -f $REMOTE/.env.prod ]; then
    sed 's/REPLACE_WITH_VM_IP/$VM_IP/g' $REMOTE/.env.prod.example > $REMOTE/.env.prod
    echo ''
    echo 'ACTION REQUIRED: Fill in secrets in .env.prod before re-running:'
    echo '  gcloud compute ssh $VM --zone=$ZONE'
    echo '  nano $REMOTE/.env.prod'
    echo ''
    exit 1
  fi
"

echo "==> Checking vantage.config.json on VM..."
gcloud compute ssh "$VM" --project="$PROJECT" --zone="$ZONE" --command="
  if [ ! -f $REMOTE/vantage.config.json ]; then
    cp $REMOTE/vantage.config.example.json $REMOTE/vantage.config.json
    echo ''
    echo 'ACTION REQUIRED: Edit vantage.config.json before re-running:'
    echo '  gcloud compute ssh $VM --zone=$ZONE'
    echo '  nano $REMOTE/vantage.config.json'
    echo ''
    exit 1
  fi
"

echo "==> Building Docker images on VM..."
gcloud compute ssh "$VM" --project="$PROJECT" --zone="$ZONE" --command="
  cd $REMOTE
  # Inject VM IP into NEXT_PUBLIC_APP_URL if not already set
  grep -q 'NEXT_PUBLIC_APP_URL=http://$VM_IP' .env.prod || \
    sed -i 's|NEXT_PUBLIC_APP_URL=http://REPLACE_WITH_VM_IP|NEXT_PUBLIC_APP_URL=http://$VM_IP|g' .env.prod
  docker compose -f docker-compose.prod.yml --env-file .env.prod build
"

echo "==> Starting DB and Redis, running migrations..."
gcloud compute ssh "$VM" --project="$PROJECT" --zone="$ZONE" --command="
  cd $REMOTE
  docker compose -f docker-compose.prod.yml --env-file .env.prod up -d db redis
  echo 'Waiting for DB...'
  sleep 15
  source .env.prod
  DB_URL=\"postgresql://\${DB_USER:-vantage}:\${DB_PASSWORD}@db:5432/\${DB_NAME:-vantage}\"
  docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm \
    -e DATABASE_URL=\"\$DB_URL\" \
    api sh -c 'node_modules/.bin/tsx packages/db/src/migrate.ts'
"

echo "==> Starting all services..."
gcloud compute ssh "$VM" --project="$PROJECT" --zone="$ZONE" --command="
  cd $REMOTE
  docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
"

echo ""
echo "==> Services:"
gcloud compute ssh "$VM" --project="$PROJECT" --zone="$ZONE" \
  --command="cd $REMOTE && docker compose -f docker-compose.prod.yml ps"

echo ""
echo "========================================"
echo "  Web:  http://$VM_IP:3000"
echo "  API:  http://$VM_IP:3001"
echo "========================================"
