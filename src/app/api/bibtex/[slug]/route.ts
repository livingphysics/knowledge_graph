import { getNode } from '@/lib/nodes';
import { bibtexFor } from '@/lib/bibtex';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const node = getNode(slug);
  if (!node) return new Response('Not found', { status: 404 });
  if (node.type !== 'reference') {
    return new Response('Only references can be exported as BibTeX', { status: 400 });
  }
  const { source, bibtex } = await bibtexFor(node);
  return new Response(bibtex + '\n', {
    headers: {
      'Content-Type': 'application/x-bibtex; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}.bib"`,
      'X-Bibtex-Source': source,
      'Cache-Control': 'no-store',
    },
  });
}
