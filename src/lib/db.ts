import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'app.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'nodes'), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

declare global {
  // eslint-disable-next-line no-var
  var __db: Database.Database | undefined;
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
}

export function getDb(): Database.Database {
  if (!global.__db) {
    const db = new Database(DB_PATH);
    init(db);
    global.__db = db;
  }
  return global.__db;
}

export const paths = {
  DATA_DIR,
  nodeFile: (slug: string) => path.join(DATA_DIR, 'nodes', `${slug}.md`),
  uploadFile: (sha: string) => path.join(DATA_DIR, 'uploads', `${sha}.pdf`),
};
