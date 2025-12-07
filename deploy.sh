#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "Intercom Deployment Script"
echo "=========================================="
echo ""

if ! command -v pm2 &>/dev/null; then
  echo "Error: pm2 not found. Is this script running on the LXC server?"
  exit 1
fi

echo "Step 1/4: Installing server dependencies..."
cd server
npm ci
cd ..

echo ""
echo "Step 2/4: Installing client dependencies..."
cd client/ui
npm ci
cd ../..

echo ""
echo "Step 3/4: Building client application..."
cd client/ui
npm run build
cd ../..

echo ""
echo "Step 4/4: Restarting pm2 services..."
pm2 restart intercom-signal || echo "Warning: intercom-signal not found or failed to restart"
pm2 restart intercom-ui || echo "Warning: intercom-ui not found or failed to restart"

echo ""
echo "=========================================="
echo "Deployment complete!"
echo "=========================================="
pm2 ls

