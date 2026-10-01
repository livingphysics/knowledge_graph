import { headers } from 'next/headers';
import { graphExists } from '@/lib/registry';
import { ipHash } from '@/lib/nodes';
import { rateLimit } from '@/lib/ratelimit';
import { lookupReference } from '@/lib/ref-lookup';
import { isArxivId, isDoi, stripArxivVersion } from '@/lib/ref-ids';

export const dynamic = 'force-dynamic';

const MAX_URL = 2048;
const MAX_TEXT = 300;
// Each lookup fans out to a few scholarly APIs; keep any one client from
// turning the server into a crawler.
const LOOKUPS_PER_MINUTE = 30;

// Metadata for the New Reference auto-fill. Query: one of ?url= ?arxiv= ?doi=
// ?title=, plus optional ?verify=<title guessed from a PDF>. Answers
// { found: false } or { found: true, ...RefMeta }. The lookup isn't
// graph-specific; it lives under /g/<graph> to sit behind the same password
// gate as the form that calls it.
export async function GET(req: Request, { params }: { params: Promise<{ graph: string }> }) {
  const { graph } = await params;
  if (!graphExists(graph)) return Response.json({ error: 'Unknown graph' }, { status: 404 });

  const sp = new URL(req.url).searchParams;
  const param = (k: string) => sp.get(k)?.trim() || null;
  const url = param('url');
  const rawArxiv = param('arxiv');
  const arxiv = rawArxiv ? stripArxivVersion(rawArxiv) : null;
  const doi = param('doi');
  const title = param('title');
  const verifyHint = param('verify');

  if (!url && !arxiv && !doi && !title) {
    return Response.json({ error: 'Give one of url, arxiv, doi or title' }, { status: 400 });
  }
  if (
    (url && url.length > MAX_URL) ||
    (arxiv && !isArxivId(arxiv)) ||
    (doi && (doi.length > MAX_TEXT || !isDoi(doi))) ||
    (title && title.length > MAX_TEXT) ||
    (verifyHint && verifyHint.length > MAX_TEXT)
  ) {
    return Response.json({ error: 'Invalid input' }, { status: 400 });
  }

  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
  if (!rateLimit(`lookup:${ipHash(ip) ?? 'unknown'}`, LOOKUPS_PER_MINUTE, 60_000)) {
    return Response.json({ error: 'Too many lookups — try again in a minute' }, { status: 429 });
  }

  const meta = await lookupReference({ url, arxiv, doi, title, verifyHint });
  return Response.json(meta ? { found: true, ...meta } : { found: false });
}
