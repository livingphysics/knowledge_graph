import { getNode } from '@/lib/nodes';
import { bibtexFor } from '@/lib/bibtex';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ graph: string; slug: string }> }
) {
  const { graph, slug } = await params;
  const node = getNode(graph, slug);
  if (!node) return new Response('Not found', { status: 404 });
  if (node.type !== 'reference') {
    return new Response('Only references can be exported as BibTeX', { status: 400 });
  }
  const { source, bibtex } = await bibtexFor(graph, node);
  return new Response(bibtex + '\n', {
    headers: {
      'Content-Type': 'application/x-bibtex; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}.bib"`,
      'X-Bibtex-Source': source,
      'Cache-Control': 'no-store',
    },
  });
}
