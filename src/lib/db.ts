import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

// Root for ALL graphs. KG_DATA_DIR overrides; default <cwd>/data.
// Each graph lives in its own subdir: <DATA_ROOT>/graphs/<graph>/{app.db,nodes,uploads}
// The registry lives at <DATA_ROOT>/registry.db
export const DATA_ROOT = process.env.KG_DATA_DIR || path.join(process.cwd(), 'data');
const GRAPHS_DIR = path.join(DATA_ROOT, 'graphs');

fs.mkdirSync(GRAPHS_DIR, { recursive: true });

const GRAPH_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Validate a graph name — guards against path traversal and keeps URLs clean. */
export function isValidGraphName(graph: string): boolean {
  return GRAPH_NAME_RE.test(graph);
}
export function assertGraphName(graph: string): void {
  if (!isValidGraphName(graph)) throw new Error(`Invalid graph name: ${graph}`);
}

export function graphDir(graph: string): string {
  assertGraphName(graph);
  return path.join(GRAPHS_DIR, graph);
}

declare global {
  // eslint-disable-next-line no-var
  var __dbs: Map<string, Database.Database> | undefined;
}

function init(db: Database.Database) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      slug         TEXT PRIMARY KEY,
      type         TEXT NOT NULL CHECK (type IN ('question','thought','reference')),
      title        TEXT NOT NULL,
      url          TEXT,
      pdf_sha256   TEXT,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
    CREATE INDEX IF NOT EXISTS idx_nodes_updated ON nodes(updated_at DESC);

    CREATE TABLE IF NOT EXISTS links (
      from_slug TEXT NOT NULL,
      to_slug   TEXT NOT NULL,
      PRIMARY KEY (from_slug, to_slug),
      FOREIGN KEY (from_slug) REFERENCES nodes(slug) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_links_to ON links(to_slug);

    CREATE TABLE IF NOT EXISTS revisions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      node_slug       TEXT NOT NULL,
      body_md         TEXT NOT NULL,
      title           TEXT NOT NULL,
      author_ip_hash  TEXT,
      created_at      INTEGER NOT NULL,
      FOREIGN KEY (node_slug) REFERENCES nodes(slug) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_revisions_node ON revisions(node_slug, created_at DESC);

    CREATE TABLE IF NOT EXISTS comments (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      node_slug       TEXT NOT NULL,
      body            TEXT NOT NULL,
      author_ip_hash  TEXT,
      created_at      INTEGER NOT NULL,
      FOREIGN KEY (node_slug) REFERENCES nodes(slug) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_comments_node ON comments(node_slug, created_at ASC);

    CREATE TABLE IF NOT EXISTS reactions (
      node_slug       TEXT NOT NULL,
      emoji           TEXT NOT NULL,
      author_ip_hash  TEXT NOT NULL,
      created_at      INTEGER NOT NULL,
      PRIMARY KEY (node_slug, emoji, author_ip_hash),
      FOREIGN KEY (node_slug) REFERENCES nodes(slug) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_reactions_node ON reactions(node_slug, emoji);
  `);

  // Idempotent column additions for existing DBs.
  ensureColumn(db, 'nodes', 'bibtex_override', 'TEXT');
  ensureColumn(db, 'nodes', 'pdf_arxiv_id', 'TEXT');
  ensureColumn(db, 'nodes', 'pinned_at', 'INTEGER');
}

function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  decl: string
): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}

/** Open (and cache) the SQLite connection for a single graph, creating its dir + schema. */
export function getDb(graph: string): Database.Database {
  assertGraphName(graph);
  if (!global.__dbs) global.__dbs = new Map();
  const cached = global.__dbs.get(graph);
  if (cached) return cached;

  const dir = path.join(GRAPHS_DIR, graph);
  fs.mkdirSync(path.join(dir, 'nodes'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'uploads'), { recursive: true });
  const db = new Database(path.join(dir, 'app.db'));
  init(db);
  global.__dbs.set(graph, db);
  return db;
}

export const paths = {
  DATA_ROOT,
  GRAPHS_DIR,
  graphDir,
  nodeFile: (graph: string, slug: string) => path.join(graphDir(graph), 'nodes', `${slug}.md`),
  uploadFile: (graph: string, sha: string) => path.join(graphDir(graph), 'uploads', `${sha}.pdf`),
};
