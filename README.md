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

## Update/redeploy

After pushing changes from macOS:

```bash
# On LXC
cd /opt/intercom
git pull
cd client/ui && npm ci && npm run build
pm2 restart intercom-ui
pm2 restart intercom-signal
```

If server code changed:

```bash
cd /opt/intercom/server && npm ci
pm2 restart intercom-signal
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

- URL: `http://LXC_IP:3000/intercom` (or `https://` if you set up Caddy below)
- Keep screen on, kiosk mode, auto-reload in Fully Kiosk.

## HTTPS setup (for macOS/iOS testing)

macOS Safari/Chrome and iOS Safari block `getUserMedia` on HTTP for non-localhost URLs. Fire tablets (Android) work fine with HTTP, but if testing on macOS/iOS, use HTTPS. Browsers also block mixed content (HTTPS page connecting to HTTP WebSocket), so we proxy signaling through HTTPS too.

```bash
# On LXC, install Caddy
apt install -y debian-keyring debian-archive-keyring apt-transport-https gnupg
mkdir -p /etc/apt/keyrings
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /etc/apt/keyrings/caddy-stable.gpg
echo "deb [signed-by=/etc/apt/keyrings/caddy-stable.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" >/etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

# Create Caddyfile (proxy Socket.io WebSocket through HTTPS)
# Replace 192.168.4.226 with your LXC_IP
cat >/etc/caddy/Caddyfile <<EOF
192.168.4.226 {
  reverse_proxy /socket.io/* localhost:3001
  reverse_proxy /intercom* localhost:3000
  reverse_proxy /_next/* localhost:3000
  reverse_proxy / localhost:3000
  tls internal
}
EOF

# Update UI env to use HTTPS (no port, Caddy proxies /socket.io/*)
# Replace 192.168.4.226 with your LXC_IP
cat >/opt/intercom/client/ui/.env.local <<EOF
NEXT_PUBLIC_SIGNALING_URL=https://192.168.4.226
NEXT_PUBLIC_INTERCOM_ROOM=door
EOF

# Update server CORS to allow HTTPS origin
# Replace 192.168.4.226 with your LXC_IP
pm2 delete intercom-signal
cd /opt/intercom/server
PORT=3001 ALLOWED_ORIGINS=https://192.168.4.226 pm2 start npm --name intercom-signal -- run start
pm2 save

# Rebuild UI with new env
cd /opt/intercom/client/ui
npm run build
pm2 restart intercom-ui

# Start Caddy
systemctl enable caddy
systemctl start caddy

# Verify Caddy is listening on 443
ss -tlnp | grep caddy
```

Then access `https://192.168.4.226/intercom`. Browsers will show a security warning about the self-signed certificate (Caddy's `tls internal`); click "Advanced" → "Proceed" to accept it. No certificate copying needed—this is all server-side.

**Note:** The signaling WebSocket is proxied through Caddy on HTTPS (`wss://`), so both UI and signaling use HTTPS. For Fire tablets, HTTP works fine (no HTTPS needed).

## Troubleshooting

**Check service status:**

```bash
pm2 ls
pm2 logs intercom-signal --lines 50
pm2 logs intercom-ui --lines 50
```

**Test signaling server:**

```bash
curl http://localhost:3001/health  # should return {"status":"ok"}
```

**Test UI locally (macOS) connecting to LXC signaling:**

```bash
# On macOS, update local .env.local to point to LXC
cd /Users/chase/Code/intercom/client/ui
cat >.env.local <<EOF
NEXT_PUBLIC_SIGNALING_URL=http://192.168.4.226:3001
NEXT_PUBLIC_INTERCOM_ROOM=door
EOF
npm run dev
# Then access http://localhost:3000/intercom
```

**Caddy not starting:**

- Check Caddyfile syntax: `caddy validate --config /etc/caddy/Caddyfile`
- Check logs: `journalctl -u caddy -n 50`
- Verify ports: `ss -tlnp | grep caddy` (should show 80 and 443)

**WebSocket not connecting:**

- Ensure Caddyfile proxies `/socket.io/*` to `localhost:3001`
- Check CORS allows the correct origin
- Verify signaling URL in `.env.local` matches your setup (HTTP vs HTTPS)
