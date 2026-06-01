#!/usr/bin/env bash
# Snapshot every instance's data dir (DB + markdown + PDFs). Rotates older than KEEP_DAYS.
# Suggested cron (run as root): 0 3 * * * /srv/kg/deploy/backup.sh >> /var/log/kg-backup.log 2>&1
#
# Covers both layouts:
#   /srv/kg/data            ← the original single-instance ("default") data dir, if present
#   /srv/kg-data/<name>/    ← each multi-instance data dir
#
# NOTE: backups land on the same droplet. If the droplet dies, they die with it.
# For real safety: rsync /var/backups/kg/ elsewhere, or rclone to DigitalOcean Spaces.
set -euo pipefail

BACKUP_DIR="/var/backups/kg"
KEEP_DAYS="${KEEP_DAYS:-14}"
TS=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"

# Build the list of (instance-name, data-dir) pairs to back up.
declare -A TARGETS=()
[ -d /srv/kg/data ] && TARGETS["default"]="/srv/kg/data"
if [ -d /srv/kg-data ]; then
  for d in /srv/kg-data/*/; do
    [ -d "$d" ] || continue
    name=$(basename "$d")
    TARGETS["$name"]="${d%/}"
  done
fi

if [ ${#TARGETS[@]} -eq 0 ]; then
  echo "$(date -Iseconds) backup: no data dirs found, nothing to do"
  exit 0
fi

for name in "${!TARGETS[@]}"; do
  dir="${TARGETS[$name]}"
  out="$BACKUP_DIR/kg-$name-$TS.tar.gz"
  # WAL-aware: .db, .db-wal, .db-shm all live in the dir; tar-at-rest is fine,
  # SQLite recovers any partial WAL on next open.
  tar -czf "$out" -C "$(dirname "$dir")" "$(basename "$dir")"
  size=$(du -h "$out" | cut -f1)
  echo "$(date -Iseconds) backup: $name → $out ($size)"
done

# Rotate every instance's snapshots together.
find "$BACKUP_DIR" -name 'kg-*.tar.gz' -mtime "+$KEEP_DAYS" -delete
