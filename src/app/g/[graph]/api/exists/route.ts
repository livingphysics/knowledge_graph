import { getDb } from '@/lib/db';
import { slugify } from '@/lib/slug';

export const dynamic = 'force-dynamic';

// Reports whether a node already occupies the slug a given title would take —
// i.e. exactly the condition under which createNode would mint an incremented
// "-2" duplicate. Used by the new-node form to confirm before duplicating.
export async function GET(req: Request, { params }: { params: Promise<{ graph: string }> }) {
  const { graph } = await params;
  const title = (new URL(req.url).searchParams.get('title') ?? '').trim();
  if (!title) return Response.json({ exists: false });
  const slug = slugify(title);
  const row = getDb(graph).prepare('SELECT title FROM nodes WHERE slug = ?').get(slug) as
    | { title: string }
    | undefined;
  return Response.json({ exists: !!row, slug, existingTitle: row?.title ?? null });
}
