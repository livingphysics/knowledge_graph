import { getDb } from './db';
import { ipHash } from './nodes';

export const REACTION_EMOJIS = ['👍', '❤️', '🤔', '🎯', '🔥', '👀'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export interface ReactionCount {
  emoji: ReactionEmoji;
  count: number;
  mine: boolean;
}

const VALID = new Set<string>(REACTION_EMOJIS);

export function isValidEmoji(e: string): e is ReactionEmoji {
  return VALID.has(e);
}

export function listReactions(
  graph: string,
  slug: string,
  ip: string | null | undefined
): ReactionCount[] {
  const db = getDb(graph);
  const myHash = ipHash(ip) ?? '';
  const rows = db
    .prepare(
      `SELECT emoji,
              COUNT(*) AS count,
              MAX(CASE WHEN author_ip_hash = ? THEN 1 ELSE 0 END) AS mine
       FROM reactions
       WHERE node_slug = ?
       GROUP BY emoji`
    )
    .all(myHash, slug) as { emoji: string; count: number; mine: number }[];

  const map = new Map(rows.map((r) => [r.emoji, r]));
  return REACTION_EMOJIS.map((e) => {
    const row = map.get(e);
    return {
      emoji: e,
      count: row?.count ?? 0,
      mine: row ? Boolean(row.mine) : false,
    };
  });
}

export function toggleReaction(
  graph: string,
  slug: string,
  emoji: string,
  ip: string | null | undefined
): { added: boolean } {
  if (!isValidEmoji(emoji)) throw new Error(`invalid emoji: ${emoji}`);
  const db = getDb(graph);
  const myHash = ipHash(ip) ?? 'no-ip';
  const exists = db
    .prepare(
      'SELECT 1 FROM reactions WHERE node_slug = ? AND emoji = ? AND author_ip_hash = ?'
    )
    .get(slug, emoji, myHash);

  if (exists) {
    db.prepare(
      'DELETE FROM reactions WHERE node_slug = ? AND emoji = ? AND author_ip_hash = ?'
    ).run(slug, emoji, myHash);
    return { added: false };
  }
  db.prepare(
    'INSERT OR IGNORE INTO reactions (node_slug, emoji, author_ip_hash, created_at) VALUES (?, ?, ?, ?)'
  ).run(slug, emoji, myHash, Date.now());
  return { added: true };
}
