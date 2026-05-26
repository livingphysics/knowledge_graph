import { bibtexForAllReferences } from '@/lib/bibtex';

export const dynamic = 'force-dynamic';

export async function GET() {
  const bibtex = await bibtexForAllReferences();
  return new Response(bibtex, {
    headers: {
      'Content-Type': 'application/x-bibtex; charset=utf-8',
      'Content-Disposition': 'attachment; filename="references.bib"',
      'Cache-Control': 'no-store',
    },
  });
}
