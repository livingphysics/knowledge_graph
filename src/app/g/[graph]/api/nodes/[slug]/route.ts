import { deleteNode } from '@/lib/nodes';
import { graphExists } from '@/lib/registry';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ graph: string; slug: string }> }
) {
  const { graph, slug } = await params;
  if (!graphExists(graph)) {
    return Response.json({ error: 'no such graph' }, { status: 404 });
  }
  try {
    await requireAuth();
  } catch {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const res = deleteNode(graph, slug);
  if (!res.deleted) {
    return Response.json({ error: 'not found' }, { status: 404 });
  }
  return Response.json({ ok: true });
}
