#!/usr/bin/env bash
# Pull latest, rebuild, restart. Safe to run repeatedly.
set -euo pipefail

APP_DIR="/srv/kg"
SERVICE_USER="kg"

cd "$APP_DIR"
sudo -u "$SERVICE_USER" git pull
sudo -u "$SERVICE_USER" npm ci
sudo -u "$SERVICE_USER" npm run build
sudo systemctl restart kg.service

echo "✓ Updated. Tail logs with: sudo journalctl -u kg -f"
