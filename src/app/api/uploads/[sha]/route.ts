import fs from 'node:fs';
import { paths } from '@/lib/db';

const SHA_RE = /^[a-f0-9]{64}$/;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sha: string }> }
) {
  const { sha } = await params;
  if (!SHA_RE.test(sha)) {
    return new Response('Invalid hash', { status: 400 });
  }
  const filePath = paths.uploadFile(sha);
  if (!fs.existsSync(filePath)) {
    return new Response('Not found', { status: 404 });
  }
  const data = fs.readFileSync(filePath);
  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${sha.slice(0, 12)}.pdf"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(data.length),
    },
  });
}
