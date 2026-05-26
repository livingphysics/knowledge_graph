import fs from 'node:fs';
import crypto from 'node:crypto';
import { getDb, paths } from './db';
import { uniqueSlug, slugify } from './slug';
import { uniqueSlugsFromMarkdown } from './wikilinks';

// Re-exported from the DB-free leaf so existing imports keep working.
export {
  typeLabel,
  type NodeType,
  type NodeRecord,
  type NodeWithPreview,
  type RelatedItem,
} from './node-types';
import type { NodeType, NodeRecord, NodeWithPreview, RelatedItem } from './node-types';

export interface NodeWithBody extends NodeRecord {
  body_md: string;
}

export function ipHash(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

export function getNode(slug: string): NodeWithBody | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM nodes WHERE slug = ?').get(slug) as NodeRecord | undefined;
  if (!row) return null;
  let body = '';
  try {
    body = fs.readFileSync(paths.nodeFile(slug), 'utf8');
  } catch {}
  return { ...row, body_md: body };
}

export function listNodes(opts: { type?: NodeType; limit?: number } = {}): NodeWithPreview[] {
  const db = getDb();
  const limit = opts.limit ?? 200;
  const rows = (opts.type
    ? db
        .prepare('SELECT * FROM nodes WHERE type = ? ORDER BY updated_at DESC LIMIT ?')
        .all(opts.type, limit)
    : db
        .prepare('SELECT * FROM nodes ORDER BY updated_at DESC LIMIT ?')
        .all(limit)) as NodeRecord[];

  return rows.map((n) => {
    let body = '';
    try {
      body = fs.readFileSync(paths.nodeFile(n.slug), 'utf8');
    } catch {}
    return { ...n, preview: makePreview(body, 200) };
  });
}

export type RelatedByType = Record<NodeType, RelatedItem[]>;

export function makePreview(md: string, maxChars = 280): string {
  const stripped = md
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, t, l) => l ?? t)
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~]/g, '')
    .replace(/^#+\s+/gm, '')
    .replace(/^[->]\s+/gm, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length > maxChars ? stripped.slice(0, maxChars).trim() + '…' : stripped;
}

export function getRelatedByType(slug: string): RelatedByType {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT n.* FROM nodes n
       WHERE n.slug != ? AND (
         n.slug IN (SELECT to_slug   FROM links WHERE from_slug = ?) OR
         n.slug IN (SELECT from_slug FROM links WHERE to_slug   = ?)
       )
       ORDER BY n.updated_at DESC`
    )
    .all(slug, slug, slug) as NodeRecord[];

  const groups: RelatedByType = { question: [], thought: [], reference: [] };
  for (const n of rows) {
    let body = '';
    try {
      body = fs.readFileSync(paths.nodeFile(n.slug), 'utf8');
    } catch {}
    groups[n.type].push({ ...n, preview: makePreview(body) });
  }
  return groups;
}

export interface CreateNodeInput {
  type: NodeType;
  title: string;
  body_md: string;
  url?: string | null;
  pdf_sha256?: string | null;
  authorIp?: string | null;
  /** If provided, ensures a [[backlink]] to this slug is appended to the body. */
  linkFromSlug?: string | null;
}

export function createNode(input: CreateNodeInput): NodeRecord {
  const db = getDb();
  const now = Date.now();
  const title = input.title.trim() || 'Untitled';
  const slug = uniqueSlug(title);
  let body = input.body_md ?? '';
  if (input.linkFromSlug) {
    const back = `[[${input.linkFromSlug}]]`;
    if (!body.includes(back)) {
      body = body.replace(/<!--links\s*([\s\S]*?)-->/, (_, inner) =>
        `<!--links\n${inner.trim()}\n${back}\n-->`
      );
      if (!body.includes('<!--links')) {
        const prefix = body.length === 0 ? '' : body.endsWith('\n') ? '\n' : '\n\n';
        body = `${body}${prefix}<!--links\n${back}\n-->\n`;
      }
    }
  }

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO nodes (slug, type, title, url, pdf_sha256, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(slug, input.type, title, input.url ?? null, input.pdf_sha256 ?? null, now, now);

    db.prepare(
      `INSERT INTO revisions (node_slug, body_md, title, author_ip_hash, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(slug, body, title, ipHash(input.authorIp), now);

    refreshLinks(slug, body);
  });
  tx();

  fs.writeFileSync(paths.nodeFile(slug), body, 'utf8');
  return db.prepare('SELECT * FROM nodes WHERE slug = ?').get(slug) as NodeRecord;
}

export interface UpdateNodeInput {
  slug: string;
  title: string;
  body_md: string;
  url?: string | null;
  /** undefined = leave unchanged, null = clear, string = set */
  pdf_sha256?: string | null;
  authorIp?: string | null;
}

export function updateNode(input: UpdateNodeInput): NodeRecord {
  const db = getDb();
  const now = Date.now();
  const existing = db.prepare('SELECT * FROM nodes WHERE slug = ?').get(input.slug) as
    | NodeRecord
    | undefined;
  if (!existing) throw new Error(`No node with slug ${input.slug}`);
  const title = input.title.trim() || existing.title;
  const pdf = input.pdf_sha256 === undefined ? existing.pdf_sha256 : input.pdf_sha256;

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE nodes SET title = ?, url = ?, pdf_sha256 = ?, updated_at = ? WHERE slug = ?`
    ).run(title, input.url ?? existing.url, pdf, now, input.slug);

    db.prepare(
      `INSERT INTO revisions (node_slug, body_md, title, author_ip_hash, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(input.slug, input.body_md, title, ipHash(input.authorIp), now);

    refreshLinks(input.slug, input.body_md);
  });
  tx();

  fs.writeFileSync(paths.nodeFile(input.slug), input.body_md, 'utf8');
  return db.prepare('SELECT * FROM nodes WHERE slug = ?').get(input.slug) as NodeRecord;
}

export interface DeleteResult {
  deleted: boolean;
  pdf_removed: boolean;
}

export function deleteNode(slug: string): DeleteResult {
  const db = getDb();
  const row = db.prepare('SELECT pdf_sha256 FROM nodes WHERE slug = ?').get(slug) as
    | { pdf_sha256: string | null }
    | undefined;
  if (!row) return { deleted: false, pdf_removed: false };

  db.transaction(() => {
    db.prepare('DELETE FROM links WHERE to_slug = ?').run(slug);
    db.prepare('DELETE FROM nodes WHERE slug = ?').run(slug);
  })();

  try {
    fs.unlinkSync(paths.nodeFile(slug));
  } catch {}

  let pdf_removed = false;
  if (row.pdf_sha256) {
    const stillReferenced = db
      .prepare('SELECT 1 FROM nodes WHERE pdf_sha256 = ? LIMIT 1')
      .get(row.pdf_sha256);
    if (!stillReferenced) {
      try {
        fs.unlinkSync(paths.uploadFile(row.pdf_sha256));
        pdf_removed = true;
      } catch {}
    }
  }

  return { deleted: true, pdf_removed };
}

function refreshLinks(slug: string, body: string): void {
  const db = getDb();
  db.prepare('DELETE FROM links WHERE from_slug = ?').run(slug);
  const targets = uniqueSlugsFromMarkdown(body).filter((t) => t !== slug);
  const insert = db.prepare(
    'INSERT OR IGNORE INTO links (from_slug, to_slug) VALUES (?, ?)'
  );
  for (const t of targets) insert.run(slug, t);
}

export { slugify };
