import { getDb } from './db';

export interface Position {
  x: number;
  y: number;
}

/** All saved node positions for a graph, keyed by slug. Empty = no manual layout. */
export function listPositions(graph: string): Record<string, Position> {
  const rows = getDb(graph)
    .prepare('SELECT node_slug, x, y FROM node_positions')
    .all() as { node_slug: string; x: number; y: number }[];
  const out: Record<string, Position> = {};
  for (const r of rows) out[r.node_slug] = { x: r.x, y: r.y };
  return out;
}

/**
 * Replace the saved layout with a full snapshot. Rows whose slug is no longer a
 * node are skipped (INSERT OR IGNORE tolerates the FK), so a stale snapshot can't
 * error. Passing an empty array clears the layout.
 */
export function savePositions(
  graph: string,
  items: { slug: string; x: number; y: number }[]
): void {
  const db = getDb(graph);
  const ins = db.prepare('INSERT OR IGNORE INTO node_positions (node_slug, x, y) VALUES (?, ?, ?)');
  db.transaction(() => {
    db.prepare('DELETE FROM node_positions').run();
    for (const it of items) {
      if (Number.isFinite(it.x) && Number.isFinite(it.y)) ins.run(it.slug, it.x, it.y);
    }
  })();
}

/** Forget the manual layout — the next load falls back to the force layout. */
export function clearPositions(graph: string): void {
  getDb(graph).prepare('DELETE FROM node_positions').run();
}
