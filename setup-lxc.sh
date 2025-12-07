#!/usr/bin/env bash
set -euo pipefail

LXC_IP="${LXC_IP:-}"
if [[ -z "$LXC_IP" ]]; then
  echo "Error: LXC_IP not set. Export it first:"
  echo "  export LXC_IP=192.168.4.226"
  echo "  ./setup-lxc.sh"
  exit 1
fi

echo "Setting up intercom on LXC at $LXC_IP"
echo "Running as: $(whoami)"

apt update
apt install -y curl git build-essential

if ! command -v node &>/dev/null; then
  echo "Installing Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
  apt install -y nodejs
fi

if ! command -v pm2 &>/dev/null; then
  echo "Installing pm2..."
  npm install -g pm2
fi

if [[ ! -d /opt/intercom ]]; then
  echo "Cloning repo..."
  git clone https://github.com/chasecee/intercom.git /opt/intercom
fi

cd /opt/intercom

echo "Installing dependencies..."
cd server && npm ci
cd ../client/ui && npm ci

echo "Building Next.js app..."
npm run build

echo "Creating .env.local..."
cat >.env.local <<EOF
NEXT_PUBLIC_SIGNALING_URL=http://${LXC_IP}:3001
NEXT_PUBLIC_INTERCOM_ROOM=door
EOF

if [[ -f /opt/intercom/package-lock.json ]]; then
  echo "Removing root package-lock.json to avoid Next.js warnings..."
  rm -f /opt/intercom/package-lock.json
fi

echo "Starting services with pm2..."
pm2 delete all 2>/dev/null || true

cd /opt/intercom/server
PORT=3001 ALLOWED_ORIGINS=http://${LXC_IP}:3000 pm2 start npm --name intercom-signal -- run start

cd /opt/intercom/client/ui
pm2 start npm --name intercom-ui -- run start

pm2 save
pm2 startup

echo ""
echo "Setup complete!"
echo "Services:"
pm2 ls
echo ""
echo "Tablets should point to: http://${LXC_IP}:3000/intercom"
echo "View logs: pm2 logs"

