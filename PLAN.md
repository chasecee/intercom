# Fire Tablet Intercom – WebRTC + Next.js + Socket.io

- Stack: Next.js (app router, Tailwind 4) in `client/ui`, signaling server in `server`.
- Tablets point to `http://LXC_IP:3000/intercom` inside Fully Kiosk.

## Local dev (macOS)

- Terminal 1: `cd server && npm install && npm run dev` (set `PORT=3001` if you want a different port).
- Terminal 2: `cd client/ui && npm install && cp env.example .env.local && npm run dev`.
- Browser: `http://localhost:3000/intercom`.

## Env

- `NEXT_PUBLIC_SIGNALING_URL` – e.g. `http://localhost:3001`.
- `NEXT_PUBLIC_INTERCOM_ROOM` – defaults to `door`.
- `ALLOWED_ORIGINS` on the server if you need to lock CORS (comma-separated).

## Proxmox LXC (Debian 12) setup

- `sudo apt update && sudo apt install -y curl git build-essential`
- `curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -`
- `sudo apt install -y nodejs`
- Git target: `sudo mkdir -p /opt/intercom.git && sudo git init --bare /opt/intercom.git`
- On macOS inside this repo: push to GitHub as usual: `git remote add origin git@github.com:chasecee/intercom.git` (if not set) then `git push origin main`.
- On LXC: `sudo git clone https://github.com/chasecee/intercom.git /opt/intercom` (or use SSH URL if you have keys there)
- Install deps: `cd /opt/intercom/server && npm ci`; `cd /opt/intercom/client/ui && npm ci`
- Env: create `/opt/intercom/client/ui/.env.local` from `env.example`; set `ALLOWED_ORIGINS`/`PORT` in systemd or pm2 env.
- Run with pm2:
  - `cd /opt/intercom/server && pm2 start npm --name intercom-signal -- run start`
  - `cd /opt/intercom/client/ui && pm2 start npm --name intercom-ui -- run start`
  - `pm2 save`

## Tablets (Fully Kiosk)

- Launch URL: `http://LXC_IP:3000/intercom`
- Keep screen on, kiosk mode, auto-reload on failure.
