import { headers } from 'next/headers';
import { getNode, updateNode } from '@/lib/nodes';
import { addLinkToMarkdown, removeLinkFromMarkdown } from '@/lib/wikilinks';

export const dynamic = 'force-dynamic';

async function clientIp(): Promise<string | null> {
  const h = await headers();
  return (
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    null
  );
}

interface LinkBody {
  from?: string;
  to?: string;
  a?: string;
  b?: string;
}

type Ctx = { params: Promise<{ graph: string }> };

/** Create a link `from → to` by adding `[[to]]` to the `from` node's hidden links block. */
export async function POST(req: Request, { params }: Ctx) {
  const { graph } = await params;
  const body = (await req.json().catch(() => ({}))) as LinkBody;
  const from = body.from?.trim();
  const to = body.to?.trim();
  if (!from || !to || from === to) {
    return Response.json({ error: 'from and to are required and must differ' }, { status: 400 });
  }
  const fromNode = getNode(graph, from);
  const toNode = getNode(graph, to);
  if (!fromNode) return Response.json({ error: `node not found: ${from}` }, { status: 404 });
  if (!toNode) return Response.json({ error: `node not found: ${to}` }, { status: 404 });

  const ip = await clientIp();
  const nextBody = addLinkToMarkdown(fromNode.body_md, to);
  if (nextBody === fromNode.body_md) {
    return Response.json({ ok: true, changed: false });
  }
  updateNode(graph, {
    slug: from,
    title: fromNode.title,
    body_md: nextBody,
    url: fromNode.url,
    authorIp: ip,
  });
  return Response.json({ ok: true, changed: true });
}

/** Remove the link between a and b. Strips `[[b]]` from a and `[[a]]` from b. */
export async function DELETE(req: Request, { params }: Ctx) {
  const { graph } = await params;
  const body = (await req.json().catch(() => ({}))) as LinkBody;
  const a = body.a?.trim();
  const b = body.b?.trim();
  if (!a || !b || a === b) {
    return Response.json({ error: 'a and b are required and must differ' }, { status: 400 });
  }
  const ip = await clientIp();
  let changed = false;
  for (const [src, dst] of [
    [a, b],
    [b, a],
  ] as const) {
    const node = getNode(graph, src);
    if (!node) continue;
    if (!node.body_md.includes(`[[${dst}`)) continue;
    const next = removeLinkFromMarkdown(node.body_md, dst);
    if (next === node.body_md) continue;
    updateNode(graph, {
      slug: src,
      title: node.title,
      body_md: next,
      url: node.url,
      authorIp: ip,
    });
    changed = true;
  }
  return Response.json({ ok: true, changed });
}
