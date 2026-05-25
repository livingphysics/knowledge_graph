import { getDb } from './db';

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';
}

export function uniqueSlug(title: string): string {
  const db = getDb();
  const base = slugify(title);
  const exists = db.prepare('SELECT 1 FROM nodes WHERE slug = ?');
  if (!exists.get(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!exists.get(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}
