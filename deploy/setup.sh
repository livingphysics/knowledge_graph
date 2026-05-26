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

# --- swap (small droplets only) ---
# next build needs ~2GB peak; tiny droplets OOM/thrash without swap.
TOTAL_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
SWAP_MB=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo)
if [[ "$TOTAL_MB" -lt 2048 && "$SWAP_MB" -lt 1024 ]]; then
  echo ">>> low RAM ($TOTAL_MB MB) and no swap — creating 2GB /swapfile"
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
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

# --- ssh deploy key (only if REPO is an SSH URL) ---
if [[ "$REPO" == git@* ]]; then
  KEY="/home/$SERVICE_USER/.ssh/id_ed25519"
  if ! sudo test -f "$KEY"; then
    echo ">>> generating SSH deploy key for $SERVICE_USER (none found at $KEY)"
    sudo -u "$SERVICE_USER" mkdir -p "/home/$SERVICE_USER/.ssh"
    sudo -u "$SERVICE_USER" chmod 700 "/home/$SERVICE_USER/.ssh"
    sudo -u "$SERVICE_USER" ssh-keygen -t ed25519 -N "" -f "$KEY"
  fi
  # Pre-trust GitHub host key so the clone doesn't hang on a prompt.
  if ! sudo -u "$SERVICE_USER" grep -q github.com "/home/$SERVICE_USER/.ssh/known_hosts" 2>/dev/null; then
    echo ">>> trusting github.com host key"
    sudo -u "$SERVICE_USER" sh -c "ssh-keyscan -t ed25519,rsa github.com >> /home/$SERVICE_USER/.ssh/known_hosts"
  fi
  # Test auth before attempting the clone — friendlier error.
  # `ssh -T git@github.com` exits 1 on SUCCESS (GitHub closes the session), so
  # capture output first and grep separately — can't pipe under `set -o pipefail`.
  GH_AUTH_OUT=$(sudo -u "$SERVICE_USER" ssh -o BatchMode=yes -T git@github.com 2>&1 || true)
  if ! echo "$GH_AUTH_OUT" | grep -q "successfully authenticated"; then
    REPO_PATH=$(echo "$REPO" | sed -E 's#^git@github\.com:##; s#\.git$##')
    echo ""
    echo "*** GitHub SSH auth failed for the '$SERVICE_USER' user. ***"
    echo ""
    echo "Add this PUBLIC KEY as a Deploy Key on the repo:"
    echo "  https://github.com/$REPO_PATH/settings/keys/new"
    echo "  (Title: anything, e.g. 'kg-droplet'. Leave 'Allow write access' unchecked.)"
    echo ""
    sudo cat "$KEY.pub"
    echo ""
    echo "ssh output was:"
    echo "$GH_AUTH_OUT" | sed 's/^/  /'
    echo ""
    echo "Then re-run this script."
    exit 1
  fi
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
# If certbot has already added SSL to the live config, don't overwrite it.
if sudo grep -q ssl_certificate /etc/nginx/sites-available/kg 2>/dev/null; then
  echo ">>> nginx config has SSL bits already (certbot?) — leaving untouched"
else
  echo ">>> installing nginx config"
  sudo cp deploy/nginx.conf /etc/nginx/sites-available/kg
  sudo ln -sf /etc/nginx/sites-available/kg /etc/nginx/sites-enabled/kg
  sudo rm -f /etc/nginx/sites-enabled/default
fi
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
