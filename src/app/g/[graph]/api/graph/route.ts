import fs from 'node:fs';
import { getDb, paths } from '@/lib/db';
import { makePreview, type NodeType } from '@/lib/nodes';
import { listPositions } from '@/lib/positions';

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

export async function GET(_req: Request, { params }: { params: Promise<{ graph: string }> }) {
  const { graph } = await params;
  const db = getDb(graph);
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
      body = fs.readFileSync(paths.nodeFile(graph, n.slug), 'utf8');
    } catch {}
    return { ...n, preview: makePreview(body, 160) };
  });

  // Only edges whose BOTH endpoints are real nodes. `links.to_slug` has no FK,
  // so it can dangle — from missing wikilinks ([[not-yet-created]]) or from a
  // referrer still pointing at a since-deleted node. Such edges would reference
  // a node id Cytoscape doesn't have, crashing the graph on init.
  const edges = db
    .prepare(
      `SELECT DISTINCT
         CASE WHEN from_slug < to_slug THEN from_slug ELSE to_slug END AS source,
         CASE WHEN from_slug < to_slug THEN to_slug   ELSE from_slug END AS target
       FROM links
       WHERE from_slug IN (SELECT slug FROM nodes)
         AND to_slug   IN (SELECT slug FROM nodes)`
    )
    .all() as GraphEdge[];

  const positions = listPositions(graph);

  return Response.json({ nodes, edges, positions });
}
