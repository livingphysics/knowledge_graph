import { getDb } from '@/lib/db';
import type { NodeType } from '@/lib/nodes';

export const dynamic = 'force-dynamic';

interface Suggestion {
  slug: string;
  title: string;
  type: NodeType;
}

export async function GET(req: Request, { params }: { params: Promise<{ graph: string }> }) {
  const { graph } = await params;
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const db = getDb(graph);

  // Empty query → recent 8. Else match slug prefix OR title substring (case-insensitive).
  let rows: Suggestion[];
  if (q.length === 0) {
    rows = db
      .prepare('SELECT slug, type, title FROM nodes ORDER BY updated_at DESC LIMIT 8')
      .all() as Suggestion[];
  } else {
    rows = db
      .prepare(
        `SELECT slug, type, title FROM nodes
         WHERE slug LIKE ? OR LOWER(title) LIKE LOWER(?)
         ORDER BY
           CASE WHEN slug LIKE ? THEN 0 ELSE 1 END,
           updated_at DESC
         LIMIT 8`
      )
      .all(`${q}%`, `%${q}%`, `${q}%`) as Suggestion[];
  }
  return Response.json(rows);
}
