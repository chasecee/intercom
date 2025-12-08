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

if [[ -f /opt/intercom/package-lock.json ]]; then
  echo "Removing root package-lock.json to avoid Next.js warnings..."
  rm -f /opt/intercom/package-lock.json
fi

echo "Installing dependencies..."
cd /opt/intercom/server && npm ci
cd /opt/intercom/client/ui && npm ci

echo "Creating .env.local..."
cat >/opt/intercom/client/ui/.env.local <<EOF
NEXT_PUBLIC_SIGNALING_URL=http://${LXC_IP}:3001
NEXT_PUBLIC_HOME_ASSISTANT_URL=
EOF

echo "Building Next.js app..."
cd /opt/intercom/client/ui && npm run build

echo "Starting services with pm2..."
pm2 delete all 2>/dev/null || true

cd /opt/intercom/server
PORT=3001 ALLOWED_ORIGINS=http://${LXC_IP}:3000 pm2 start npm --name intercom-signal -- run start

cd /opt/intercom/client/ui
pm2 start npm --name intercom-ui -- run start

pm2 save

if [[ $(id -u) -eq 0 ]]; then
  echo "Configuring pm2 to start on boot..."
  STARTUP_CMD=$(pm2 startup systemd -u root --hp /root 2>/dev/null | grep -E "sudo env PATH" || true)
  if [[ -n "$STARTUP_CMD" ]]; then
    eval "$STARTUP_CMD" || true
  fi
else
  echo "WARNING: Not running as root. pm2 startup not configured."
  echo "Run 'pm2 startup' and execute the command it outputs as root."
fi

echo ""
echo "Setup complete!"
echo "Services:"
pm2 ls
echo ""
echo "Tablets should point to: http://${LXC_IP}:3000/intercom"
echo "View logs: pm2 logs"
echo ""
echo "To verify pm2 starts on boot:"
echo "  systemctl status pm2-root"

