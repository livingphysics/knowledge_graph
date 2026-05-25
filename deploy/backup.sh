#!/usr/bin/env bash
# Snapshot the data dir (DB + markdown + PDFs). Rotates older than KEEP_DAYS.
# Suggested cron (run as root): 0 3 * * * /srv/kg/deploy/backup.sh >> /var/log/kg-backup.log 2>&1
#
# NOTE: this stores backups on the same droplet. If the droplet dies, the backups die with it.
# For real safety: rsync /var/backups/kg/ to a separate machine, or use `s3cmd`/`rclone` to push
# to DigitalOcean Spaces.
set -euo pipefail

APP_DIR="/srv/kg"
BACKUP_DIR="/var/backups/kg"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
TS=$(date +%Y%m%d-%H%M%S)
OUT="$BACKUP_DIR/kg-$TS.tar.gz"

# WAL-aware copy: better-sqlite3 uses WAL, so the .db, .db-wal, and .db-shm files are all in data/.
# tar at rest is fine; SQLite handles a partial-WAL recovery on next open.
tar -czf "$OUT" -C "$APP_DIR" data/

find "$BACKUP_DIR" -name 'kg-*.tar.gz' -mtime "+$KEEP_DAYS" -delete

SIZE=$(du -h "$OUT" | cut -f1)
echo "$(date -Iseconds) backup: $OUT ($SIZE)"
