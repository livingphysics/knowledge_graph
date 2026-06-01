import { listNodes, type NodeType } from '@/lib/nodes';

export const dynamic = 'force-dynamic';

const VALID: NodeType[] = ['question', 'thought', 'reference'];
const MAX_LIMIT = 50;

export async function GET(req: Request) {
  const url = new URL(req.url);

  const rawType = url.searchParams.get('type');
  const type = rawType && VALID.includes(rawType as NodeType) ? (rawType as NodeType) : undefined;

  const pinnedParam = url.searchParams.get('pinned');
  const pinned =
    pinnedParam === 'true' ? true : pinnedParam === 'false' ? false : undefined;

  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get('limit')) || 20));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);

  const items = listNodes({ type, pinned, limit, offset });
  // hasMore is true when this page filled to the limit (a cheap heuristic that
  // avoids a second COUNT query; an empty next page just ends the feed).
  return Response.json({ items, hasMore: items.length === limit });
}
