#!/usr/bin/env bash
# Port a single-graph (old) data dir into the multi-graph layout.
#
#   sudo ./deploy/migrate-to-multigraph.sh <graph-name> ["Graph Title"]
#
# Single-graph stored everything flat:
#   <data>/app.db, <data>/nodes/, <data>/uploads/
# Multi-graph expects it under a named subdir, plus a registry row:
#   <data>/graphs/<name>/{app.db,nodes,uploads}  +  <data>/registry.db
#
# The SQLite schema is identical, so this just MOVES the files and registers
# the graph — no data is rewritten. Run it right after switching the droplet
# to the multi-graph branch and BEFORE visiting /g/<name> (so an empty graph
# dir isn't auto-created first).
#
# Porting from ANOTHER droplet: scp that droplet's data dir over first, then
# point this script at it with SRC=/path/to/old/data.
set -euo pipefail

NAME="${1:-}"
TITLE="${2:-$NAME}"
APP_DIR="/srv/kg"
SERVICE_USER="kg"
DATA_ROOT="${KG_DATA_DIR:-$APP_DIR/data}"
SRC="${SRC:-$DATA_ROOT}"            # where the old flat app.db currently lives
DEST="$DATA_ROOT/graphs/$NAME"

if [[ -z "$NAME" ]]; then
  echo "Usage: sudo $0 <graph-name> [\"Graph Title\"]" >&2
  exit 1
fi
if ! [[ "$NAME" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "ERROR: graph name must be lowercase alphanumeric/dash (e.g. 'aspen26')." >&2
  exit 1
fi
if [[ ! -f "$SRC/app.db" ]]; then
  echo "ERROR: no single-graph database at $SRC/app.db" >&2
  exit 1
fi
if [[ -e "$DEST/app.db" ]]; then
  echo "ERROR: $DEST/app.db already exists — refusing to overwrite. Migrate to a fresh name." >&2
  exit 1
fi

echo ">>> stopping kg.service"
sudo systemctl stop kg 2>/dev/null || true

echo ">>> moving data into $DEST"
sudo mkdir -p "$DEST"
for f in app.db app.db-wal app.db-shm; do
  [[ -e "$SRC/$f" ]] && sudo mv "$SRC/$f" "$DEST/$f"
done
[[ -d "$SRC/nodes" ]]   && sudo mv "$SRC/nodes"   "$DEST/nodes"
[[ -d "$SRC/uploads" ]] && sudo mv "$SRC/uploads" "$DEST/uploads"
sudo mkdir -p "$DEST/nodes" "$DEST/uploads"
sudo chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_ROOT"

echo ">>> registering '$NAME' in the graph registry"
sudo -u "$SERVICE_USER" env KG_NAME="$NAME" KG_TITLE="$TITLE" KG_REG="$DATA_ROOT/registry.db" \
  sh -c 'cd "'"$APP_DIR"'" && node -e "
    const Database = require(\"better-sqlite3\");
    const db = new Database(process.env.KG_REG);
    db.exec(\"CREATE TABLE IF NOT EXISTS graphs (name TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, created_at INTEGER NOT NULL)\");
    const info = db.prepare(\"INSERT OR IGNORE INTO graphs (name,title,description,created_at) VALUES (?,?,?,?)\").run(process.env.KG_NAME, process.env.KG_TITLE, null, Date.now());
    console.log(info.changes ? \"registered\" : \"already registered\");
  "'

echo ">>> starting kg.service"
sudo systemctl start kg

cat <<EOF

==============================================================
  Ported single-graph data into:  $DEST
  Registered as graph:            $NAME  ("$TITLE")
  Now reachable at:               /g/$NAME

  Verify:  sudo journalctl -u kg -f   then open the portal.
==============================================================
EOF
