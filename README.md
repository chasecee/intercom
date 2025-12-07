# Fire Tablet Intercom

Local-only WebRTC audio intercom for Fire tablets. Next.js + Tailwind (client) and Socket.io signaling (server). Tablets hit `http://LXC_IP:3000/intercom`.

## Prereqs

- Node 20+ (Nodesource LTS repo is fine).
- npm.
- Git.

## Workflow

1. **Develop on macOS**: Edit code locally, test with `npm run dev`.
2. **Push to GitHub**: `git push origin main` (or your branch).
3. **Deploy on LXC**: Clone from GitHub and run `setup-lxc.sh`.

## Local dev (macOS)

```bash
cd /Users/chase/Code/intercom
cp client/ui/env.example client/ui/.env.local        # set NEXT_PUBLIC_SIGNALING_URL to http://localhost:3001
npm --prefix server install
npm --prefix client/ui install
npm --prefix server run dev   # port 3001
npm --prefix client/ui run dev # port 3000
# browser: http://localhost:3000/intercom
```

## Environment

- Client `.env.local`:
  - `NEXT_PUBLIC_SIGNALING_URL=http://LXC_IP:3001`
  - `NEXT_PUBLIC_INTERCOM_ROOM=door`
- Server env (pm2/systemd):
  - `PORT=3001`
  - `ALLOWED_ORIGINS=http://LXC_IP:3000`

## Proxmox LXC deploy (Debian 12/13)

1. Create LXC using community-scripts helper:

   ```bash
   bash -c "$(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/debian.sh)"
   ```

   Choose Debian 12 or 13, unprivileged, static LAN IP, 1 vCPU, 1–2GB RAM, 15–20GB disk.

2. Inside LXC (as root):

   ```bash
   export LXC_IP=192.168.4.226  # your LXC's LAN IP

   # Install git if not present (script will install node/pm2)
   apt update && apt install -y git

   git clone https://github.com/chasecee/intercom.git /opt/intercom
   cd /opt/intercom
   chmod +x setup-lxc.sh
   ./setup-lxc.sh
   ```

The script installs Node.js/pm2, installs deps, builds Next.js, creates `.env.local`, and starts both services with pm2.

## Manual commands (if not using script)

Run as root inside LXC:

```bash
export LXC_IP=192.168.4.226

apt update && apt install -y curl git build-essential
curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
apt install -y nodejs
npm install -g pm2

git clone https://github.com/chasecee/intercom.git /opt/intercom
cd /opt/intercom/server && npm ci
cd /opt/intercom/client/ui && npm ci && npm run build

cat >/opt/intercom/client/ui/.env.local <<EOF
NEXT_PUBLIC_SIGNALING_URL=http://${LXC_IP}:3001
NEXT_PUBLIC_INTERCOM_ROOM=door
EOF

rm -f /opt/intercom/package-lock.json  # avoid Next.js warnings

cd /opt/intercom/server
PORT=3001 ALLOWED_ORIGINS=http://${LXC_IP}:3000 pm2 start npm --name intercom-signal -- run start

cd /opt/intercom/client/ui
pm2 start npm --name intercom-ui -- run start

pm2 save
pm2 startup
```

## Reset/redeploy

```bash
pm2 delete all
rm -rf /opt/intercom
git clone https://github.com/chasecee/intercom.git /opt/intercom
cd /opt/intercom
export LXC_IP=192.168.4.226
./setup-lxc.sh
```

## Tablets

- URL: `http://LXC_IP:3000/intercom`
- Keep screen on, kiosk mode, auto-reload in Fully Kiosk.
