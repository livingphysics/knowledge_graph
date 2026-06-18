import { bibtexForAllReferences } from '@/lib/bibtex';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ graph: string }> }) {
  const { graph } = await params;
  const bibtex = await bibtexForAllReferences(graph);
  return new Response(bibtex, {
    headers: {
      'Content-Type': 'application/x-bibtex; charset=utf-8',
      'Content-Disposition': 'attachment; filename="references.bib"',
      'Cache-Control': 'no-store',
    },
  });
}
