#!/usr/bin/env bash
# One-time setup on a fresh Ubuntu 22.04 / 24.04 droplet.
# Run as a sudo user (not root). Set REPO before invoking, e.g.:
#   REPO=https://github.com/you/playground.git ./deploy/setup.sh
set -euo pipefail

REPO="${REPO:-}"
APP_DIR="/srv/kg"
SERVICE_USER="kg"

if [[ -z "$REPO" ]]; then
  echo "ERROR: set REPO=<git-url> before running this script." >&2
  exit 1
fi

# --- packages ---
echo ">>> installing system packages"
sudo apt-get update
sudo apt-get install -y curl git nginx ufw build-essential python3

# Node 20 via nodesource (better-sqlite3 needs to compile against the same node)
if ! command -v node >/dev/null || [[ "$(node -v)" != v20.* ]]; then
  echo ">>> installing Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# --- service user owns the app dir ---
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  echo ">>> creating service user '$SERVICE_USER'"
  sudo useradd --system --create-home --shell /bin/bash "$SERVICE_USER"
fi

# --- clone / pull ---
if [[ ! -d "$APP_DIR/.git" ]]; then
  echo ">>> cloning $REPO into $APP_DIR"
  sudo mkdir -p "$APP_DIR"
  sudo chown "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
  sudo -u "$SERVICE_USER" git clone "$REPO" "$APP_DIR"
else
  echo ">>> $APP_DIR already a git repo, pulling latest"
  sudo -u "$SERVICE_USER" git -C "$APP_DIR" pull
fi

# --- install + build ---
echo ">>> npm ci + npm run build"
cd "$APP_DIR"
sudo -u "$SERVICE_USER" npm ci
sudo -u "$SERVICE_USER" npm run build

# --- systemd ---
echo ">>> installing systemd unit"
sudo cp deploy/kg.service /etc/systemd/system/kg.service
sudo systemctl daemon-reload
sudo systemctl enable kg.service
sudo systemctl restart kg.service

# --- nginx ---
echo ">>> installing nginx config"
sudo cp deploy/nginx.conf /etc/nginx/sites-available/kg
sudo ln -sf /etc/nginx/sites-available/kg /etc/nginx/sites-enabled/kg
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

# --- firewall ---
echo ">>> configuring ufw"
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw --force enable

PUBLIC_IP=$(curl -s --max-time 3 ifconfig.me || echo "<your-droplet-ip>")
cat <<EOF

==============================================================
  Done. Visit:  http://$PUBLIC_IP/

  Service:     sudo systemctl status kg
  Logs:        sudo journalctl -u kg -f
  Update:      sudo $APP_DIR/deploy/update.sh
  Backup now:  sudo $APP_DIR/deploy/backup.sh
==============================================================
EOF
