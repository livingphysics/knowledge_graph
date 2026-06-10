import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { DATA_ROOT, assertGraphName, isValidGraphName, graphDir, getDb } from './db';
import { slugify } from './slug';

export interface GraphMeta {
  name: string; // url-safe id, also the data subdir name
  title: string;
  description: string | null;
  created_at: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __registryDb: Database.Database | undefined;
}

function registry(): Database.Database {
  if (global.__registryDb) return global.__registryDb;
  fs.mkdirSync(DATA_ROOT, { recursive: true });
  const db = new Database(path.join(DATA_ROOT, 'registry.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS graphs (
      name        TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      description TEXT,
      created_at  INTEGER NOT NULL
    );
  `);
  global.__registryDb = db;
  return db;
}

export function listGraphs(): GraphMeta[] {
  return registry()
    .prepare('SELECT name, title, description, created_at FROM graphs ORDER BY created_at DESC')
    .all() as GraphMeta[];
}

export function getGraph(name: string): GraphMeta | null {
  if (!isValidGraphName(name)) return null;
  return (
    (registry()
      .prepare('SELECT name, title, description, created_at FROM graphs WHERE name = ?')
      .get(name) as GraphMeta | undefined) ?? null
  );
}

export function graphExists(name: string): boolean {
  return getGraph(name) !== null;
}

/** Derive a unique, url-safe graph name from a desired title. */
export function uniqueGraphName(title: string): string {
  const base = slugify(title).slice(0, 48) || 'graph';
  const exists = registry().prepare('SELECT 1 FROM graphs WHERE name = ?');
  if (!exists.get(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const c = `${base}-${i}`;
    if (!exists.get(c)) return c;
  }
  return `${base}-${Date.now()}`;
}

export interface CreateGraphResult {
  meta: GraphMeta;
}

export function createGraph(input: { title: string; description?: string | null }): CreateGraphResult {
  const title = input.title.trim() || 'Untitled graph';
  const name = uniqueGraphName(title);
  assertGraphName(name);
  const now = Date.now();
  registry()
    .prepare('INSERT INTO graphs (name, title, description, created_at) VALUES (?, ?, ?, ?)')
    .run(name, title, input.description?.trim() || null, now);
  // Create the graph's own DB + dirs eagerly so it's immediately usable.
  getDb(name);
  return { meta: { name, title, description: input.description?.trim() || null, created_at: now } };
}

/** Remove a graph from the registry and delete its data directory. */
export function deleteGraph(name: string): boolean {
  if (!isValidGraphName(name)) return false;
  const r = registry().prepare('DELETE FROM graphs WHERE name = ?').run(name);
  if (r.changes === 0) return false;
  // Drop the cached connection then remove the data dir.
  try {
    global.__dbs?.get(name)?.close();
    global.__dbs?.delete(name);
  } catch {}
  try {
    fs.rmSync(graphDir(name), { recursive: true, force: true });
  } catch {}
  return true;
}
