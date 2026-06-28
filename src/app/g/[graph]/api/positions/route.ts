import { savePositions, clearPositions } from '@/lib/positions';
import { graphExists } from '@/lib/registry';

export const dynamic = 'force-dynamic';

interface SaveBody {
  positions?: { slug: string; x: number; y: number }[];
}

/** Replace the saved manual layout with a full snapshot of node positions. */
export async function POST(req: Request, { params }: { params: Promise<{ graph: string }> }) {
  const { graph } = await params;
  if (!graphExists(graph)) return Response.json({ error: 'no such graph' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as SaveBody;
  const items = Array.isArray(body.positions) ? body.positions.slice(0, 10_000) : [];
  savePositions(graph, items);
  return Response.json({ ok: true, saved: items.length });
}

/** Forget the manual layout (Re-layout). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ graph: string }> }) {
  const { graph } = await params;
  if (!graphExists(graph)) return Response.json({ error: 'no such graph' }, { status: 404 });
  clearPositions(graph);
  return Response.json({ ok: true });
}
