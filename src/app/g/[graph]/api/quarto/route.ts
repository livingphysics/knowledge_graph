import { buildQuartoZip } from '@/lib/quarto';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ graph: string }> }) {
  const { graph } = await params;
  const buf = await buildQuartoZip(graph);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="knowledge-graph-quarto.zip"',
      'Content-Length': String(buf.length),
      'Cache-Control': 'no-store',
    },
  });
}
