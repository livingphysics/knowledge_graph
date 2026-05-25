import { getDb } from './db';
import { ipHash } from './nodes';

export interface Comment {
  id: number;
  node_slug: string;
  body: string;
  created_at: number;
}

export const MAX_COMMENT_LEN = 4000;

export function listComments(slug: string): Comment[] {
  return getDb()
    .prepare(
      'SELECT id, node_slug, body, created_at FROM comments WHERE node_slug = ? ORDER BY created_at ASC LIMIT 500'
    )
    .all(slug) as Comment[];
}

export function addComment(
  slug: string,
  body: string,
  ip: string | null | undefined
): Comment {
  const trimmed = body.trim();
  if (!trimmed) throw new Error('comment body required');
  if (trimmed.length > MAX_COMMENT_LEN) {
    throw new Error(`comment too long (max ${MAX_COMMENT_LEN} chars)`);
  }
  const now = Date.now();
  const r = getDb()
    .prepare(
      'INSERT INTO comments (node_slug, body, author_ip_hash, created_at) VALUES (?, ?, ?, ?)'
    )
    .run(slug, trimmed, ipHash(ip), now);
  return { id: Number(r.lastInsertRowid), node_slug: slug, body: trimmed, created_at: now };
}

export function deleteComment(id: number): boolean {
  const r = getDb().prepare('DELETE FROM comments WHERE id = ?').run(id);
  return r.changes > 0;
}
