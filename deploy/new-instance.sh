#!/usr/bin/env bash
# Provision a new Knowledge Graph instance on a multi-instance host.
#
#   sudo ./deploy/new-instance.sh <name> <port> [server_name]
#
# Example:
#   sudo ./deploy/new-instance.sh alpha 3001 alpha.livingphysics.org
#
# Creates the data dir + env file, enables the kg@<name> service, and (if a
# server_name is given) drops in an nginx vhost. Idempotent-ish: it refuses to
# clobber an existing instance's env file so you can't accidentally reset config.
set -euo pipefail

APP_DIR="/srv/kg"
SERVICE_USER="kg"
DATA_ROOT="/srv/kg-data"
ENV_DIR="/etc/kg"
TEMPLATE_SRC="$APP_DIR/deploy/kg@.service"
TEMPLATE_DST="/etc/systemd/system/kg@.service"

NAME="${1:-}"
PORT="${2:-}"
SERVER_NAME="${3:-}"

if [[ -z "$NAME" || -z "$PORT" ]]; then
  echo "Usage: sudo $0 <name> <port> [server_name]" >&2
  exit 1
fi
if ! [[ "$NAME" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "ERROR: name must be lowercase alphanumeric/dash, e.g. 'alpha' or 'my-graph'." >&2
  exit 1
fi
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1024 || PORT > 65535 )); then
  echo "ERROR: port must be an integer in 1024-65535." >&2
  exit 1
fi

DATA_DIR="$DATA_ROOT/$NAME"
ENV_FILE="$ENV_DIR/$NAME.env"

# --- ensure the template unit is installed ---
if ! sudo cmp -s "$TEMPLATE_SRC" "$TEMPLATE_DST" 2>/dev/null; then
  echo ">>> installing systemd template unit"
  sudo cp "$TEMPLATE_SRC" "$TEMPLATE_DST"
  sudo systemctl daemon-reload
fi

# --- data dir ---
echo ">>> creating data dir $DATA_DIR"
sudo mkdir -p "$DATA_DIR/nodes" "$DATA_DIR/uploads"
sudo chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR"

# --- env file (never overwrite an existing one) ---
sudo mkdir -p "$ENV_DIR"
if sudo test -e "$ENV_FILE"; then
  echo ">>> $ENV_FILE already exists — leaving it untouched"
else
  echo ">>> writing $ENV_FILE"
  sudo install -m 600 -o "$SERVICE_USER" -g "$SERVICE_USER" /dev/null "$ENV_FILE"
  sudo tee "$ENV_FILE" > /dev/null <<EOF
# Knowledge Graph instance: $NAME
NODE_ENV=production
PORT=$PORT
KG_DATA_DIR=$DATA_DIR
SITE_TITLE=$NAME
# SITE_DESCRIPTION=...
# SITE_PASSWORD=...   # set to enable the login gate for this instance
EOF
  sudo chown "$SERVICE_USER:$SERVICE_USER" "$ENV_FILE"
  sudo chmod 600 "$ENV_FILE"
fi

# --- enable + start ---
echo ">>> enabling kg@$NAME"
sudo systemctl enable --now "kg@$NAME.service"

# --- nginx (optional) ---
if [[ -n "$SERVER_NAME" ]]; then
  SITE="/etc/nginx/sites-available/kg-$NAME"
  echo ">>> writing nginx vhost $SITE ($SERVER_NAME → 127.0.0.1:$PORT)"
  sudo tee "$SITE" > /dev/null <<EOF
server {
  listen 80;
  listen [::]:80;
  server_name $SERVER_NAME;

  client_max_body_size 30M;

  location / {
    proxy_pass http://127.0.0.1:$PORT;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 60s;
  }
}
EOF
  sudo ln -sf "$SITE" "/etc/nginx/sites-enabled/kg-$NAME"
  sudo nginx -t && sudo systemctl reload nginx
fi

cat <<EOF

==============================================================
  Instance '$NAME' is live on port $PORT.

  Data:     $DATA_DIR
  Config:   $ENV_FILE
  Service:  sudo systemctl status kg@$NAME
  Logs:     sudo journalctl -u kg@$NAME -f
EOF
if [[ -n "$SERVER_NAME" ]]; then
  cat <<EOF

  Next: enable HTTPS for this host:
    sudo certbot --nginx -d $SERVER_NAME
EOF
else
  cat <<EOF

  No server_name given — reachable only via 127.0.0.1:$PORT.
  Add an nginx vhost later, or re-run with a server_name.
EOF
fi
echo "=============================================================="
