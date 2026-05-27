import fs from 'node:fs';
import { getDb, paths } from '@/lib/db';
import { makePreview, type NodeType } from '@/lib/nodes';

export const dynamic = 'force-dynamic';

interface GraphNodeRow {
  slug: string;
  type: NodeType;
  title: string;
  in_degree: number;
}

interface GraphNode extends GraphNodeRow {
  preview: string;
}

interface GraphEdge {
  source: string;
  target: string;
}

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         n.slug, n.type, n.title,
         COALESCE(d.in_degree, 0) AS in_degree
       FROM nodes n
       LEFT JOIN (
         SELECT to_slug AS slug, COUNT(*) AS in_degree
         FROM links
         GROUP BY to_slug
       ) d ON d.slug = n.slug`
    )
    .all() as GraphNodeRow[];

  const nodes: GraphNode[] = rows.map((n) => {
    let body = '';
    try {
      body = fs.readFileSync(paths.nodeFile(n.slug), 'utf8');
    } catch {}
    return { ...n, preview: makePreview(body, 160) };
  });

  const edges = db
    .prepare(
      `SELECT DISTINCT
         CASE WHEN from_slug < to_slug THEN from_slug ELSE to_slug END AS source,
         CASE WHEN from_slug < to_slug THEN to_slug   ELSE from_slug END AS target
       FROM links`
    )
    .all() as GraphEdge[];

  return Response.json({ nodes, edges });
}
