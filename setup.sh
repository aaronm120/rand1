#!/bin/bash
# ============================================================
# Randolph Office Center Tenant Portal — Linux Setup Script
# Tested on Ubuntu 20.04 / 22.04 LTS
# Run as root or with sudo
# ============================================================
set -e

# Always run from the directory the script lives in
cd "$(dirname "$0")"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   Randolph Office Center — Tenant Portal Setup       ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── 1. Node.js (v20 LTS) ──────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "[1/6] Installing Node.js v20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
  # Reload shell PATH so npm is visible immediately
  hash -r 2>/dev/null || true
  export PATH="$PATH:/usr/bin:/usr/local/bin"
else
  echo "[1/6] Node.js already installed: $(node -v)"
fi

# Verify npm is available
if ! command -v npm &>/dev/null; then
  echo "ERROR: npm not found after Node.js install."
  echo "Try running: source /etc/profile && hash -r, then re-run this script."
  exit 1
fi
echo "  Using npm $(npm -v) at $(command -v npm)"

# ── 2. Build tools (needed for better-sqlite3 native bindings) ──
echo "[2/6] Installing build dependencies..."
apt-get install -y build-essential python3 python3-pip

# ── 3. PM2 (process manager) ──────────────────────────────
if ! command -v pm2 &>/dev/null; then
  echo "[3/6] Installing PM2..."
  npm install -g pm2
  hash -r 2>/dev/null || true
else
  echo "[3/6] PM2 already installed: $(pm2 -v)"
fi

# ── 4. Project dependencies ───────────────────────────────
echo "[4/6] Installing project dependencies..."
npm install --production

# ── 5. Environment file ───────────────────────────────────
echo "[5/6] Configuring environment..."
if [ ! -f .env ]; then
  SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
  if [ -f .env.example ]; then
    cp .env.example .env
    sed -i "s/change-this-to-a-long-random-secret-string/$SECRET/" .env
  else
    # .env.example wasn't transferred — write .env directly
    cat > .env << EOF
PORT=3000
NODE_ENV=production
JWT_SECRET=$SECRET
EOF
  fi
  echo "  ✓ Created .env with generated JWT secret"
  echo "  → Edit .env to set SMTP credentials and PORT if needed"
else
  echo "  .env already exists — skipping"
fi

# ── 6. Directories ────────────────────────────────────────
echo "[6/6] Creating required directories..."
mkdir -p data uploads logs

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   Setup Complete!                                    ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Start the portal:"
echo ""
echo "  # Development (foreground, auto-restarts on file changes):"
echo "  npm run dev"
echo ""
echo "  # Production (background with PM2):"
echo "  pm2 start deploy/ecosystem.config.js"
echo "  pm2 save && pm2 startup   # auto-start on reboot"
echo ""
echo "Default credentials (change immediately after first login!):"
echo "  PM Admin:  admin@randolphofficecenter.com  /  Admin123!"
echo "  PM Staff:  staff@randolphofficecenter.com  /  Staff123!"
echo "  Demo tenant contacts are seeded for 720, 730, and 732."
echo ""
echo "Nginx reverse proxy:"
echo "  cp deploy/nginx.conf /etc/nginx/sites-available/randolph-portal"
echo "  ln -s /etc/nginx/sites-available/randolph-portal /etc/nginx/sites-enabled/"
echo "  nginx -t && systemctl reload nginx"
echo ""
echo "HTTPS / SSL (recommended for production):"
echo "  apt-get install -y certbot python3-certbot-nginx"
echo "  certbot --nginx -d your-domain.com"
echo ""
