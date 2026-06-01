#!/usr/bin/env bash
# Pull latest, rebuild, restart. Safe to run repeatedly.
set -euo pipefail

APP_DIR="/srv/kg"
SERVICE_USER="kg"

cd "$APP_DIR"
sudo -u "$SERVICE_USER" git pull
sudo -u "$SERVICE_USER" npm ci
sudo -u "$SERVICE_USER" npm run build

# Re-install systemd units if the repo versions differ from what's live, so unit
# changes (env vars, resource limits, etc.) actually reach the running services.
reinstall_unit() {
  local src="$1" dst="$2"
  [ -f "$src" ] || return 0
  if ! sudo cmp -s "$src" "$dst" 2>/dev/null; then
    echo ">>> updating $dst"
    sudo cp "$src" "$dst"
    NEED_RELOAD=1
  fi
}
NEED_RELOAD=0
reinstall_unit "$APP_DIR/deploy/kg.service"  "/etc/systemd/system/kg.service"
reinstall_unit "$APP_DIR/deploy/kg@.service" "/etc/systemd/system/kg@.service"
[ "$NEED_RELOAD" = 1 ] && sudo systemctl daemon-reload

# Restart the single/default service (if installed) plus every template instance.
RESTARTED=0
if systemctl list-unit-files kg.service >/dev/null 2>&1 && \
   sudo systemctl is-enabled kg.service >/dev/null 2>&1; then
  sudo systemctl restart kg.service && RESTARTED=$((RESTARTED+1))
fi
for unit in $(systemctl list-units 'kg@*.service' --no-legend --plain 2>/dev/null | awk '{print $1}'); do
  sudo systemctl restart "$unit" && RESTARTED=$((RESTARTED+1))
done

echo "✓ Updated and restarted $RESTARTED service(s)."
echo "  Logs: sudo journalctl -u kg -f   (or -u kg@<name> for an instance)"
