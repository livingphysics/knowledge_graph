import { listNodes, setNodePdfArxivId, type NodeRecord } from './nodes';
import { extractArxivIdFromPdf } from './pdf-arxiv';

const TIMEOUT_MS = 10_000;
const USER_AGENT = 'KnowledgeGraph/1.0 (mailto:noreply@example.com)';
const CONCURRENCY = 4;
// arXiv asks for no more than 1 request per 3 seconds. We use 3.5s for safety.
const ARXIV_MIN_INTERVAL_MS = 3500;
// Semantic Scholar unauthenticated: 100 requests per 5 minutes ≈ 1/3s.
const S2_MIN_INTERVAL_MS = 3500;

function makeThrottle(minIntervalMs: number) {
  let nextAvailableAt = 0;
  return async function throttle(): Promise<void> {
    const slot = Math.max(Date.now(), nextAvailableAt);
    nextAvailableAt = slot + minIntervalMs;
    const delay = slot - Date.now();
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  };
}

const arxivThrottle = makeThrottle(ARXIV_MIN_INTERVAL_MS);
const s2Throttle = makeThrottle(S2_MIN_INTERVAL_MS);

interface Identifier {
  kind: 'doi' | 'arxiv';
  id: string;
}

/** Extracts a DOI or arXiv id from a URL, or null if neither pattern matches. */
export function extractIdentifier(url: string | null | undefined): Identifier | null {
  if (!url) return null;
  // DOI in URL: https://doi.org/10.x/y, https://dx.doi.org/..., or "doi:..."
  const doiInHost = url.match(/doi\.org\/(10\.\d{4,9}\/[^\s?#]+)/i);
  if (doiInHost) return { kind: 'doi', id: decodeURIComponent(doiInHost[1]) };

  // arXiv: arxiv.org/abs/2401.12345, arxiv.org/abs/cs.AI/0601001, arxiv.org/pdf/...
  const arxiv = url.match(/arxiv\.org\/(?:abs|pdf|html)\/([a-zA-Z\-.\/0-9]+)/i);
  if (arxiv) {
    let id = arxiv[1].replace(/\.pdf$/i, '').replace(/v\d+$/, '');
    return { kind: 'arxiv', id };
  }

  // Bare DOI in path (e.g., https://link.springer.com/article/10.x/y)
  const bareDoi = url.match(/(10\.\d{4,9}\/[^\s?#]+)/);
  if (bareDoi) return { kind: 'doi', id: bareDoi[1] };

  return null;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
    });
    return res;
  } catch {
    return null;
  }
}

async function fetchBibtexFromDoi(doi: string): Promise<string | null> {
  const res = await fetchWithTimeout(`https://doi.org/${doi}`, {
    headers: { Accept: 'application/x-bibtex; charset=utf-8' },
  });
  if (!res || !res.ok) return null;
  const text = (await res.text()).trim();
  if (text.startsWith('@')) return text;
  return null;
}

async function fetchBibtexFromArxiv(id: string): Promise<string | null> {
  // arXiv returns plain "Rate exceeded." with status 200 when throttled.
  // The throttle below should prevent this on our side, but retry once
  // in case another process / earlier-this-run state slipped through.
  let xml: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    await arxivThrottle();
    const res = await fetchWithTimeout(
      `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`
    );
    if (!res || !res.ok) continue;
    const body = await res.text();
    if (/^\s*Rate exceeded/i.test(body)) continue;
    xml = body;
    break;
  }
  if (!xml) return null;

  const titleMatch = xml.match(/<entry>[\s\S]*?<title>([\s\S]*?)<\/title>/);
  if (!titleMatch) return null;
  const title = titleMatch[1].replace(/\s+/g, ' ').trim();
  const authors = [...xml.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/g)].map((m) =>
    m[1].trim()
  );
  const yearMatch = xml.match(/<entry>[\s\S]*?<published>(\d{4})/);
  const year = yearMatch?.[1] ?? '';
  const key = `arxiv_${id.replace(/[^a-zA-Z0-9]/g, '_')}`;

  return [
    `@misc{${key},`,
    `  title         = {${escapeBraces(title)}},`,
    `  author        = {${authors.map(escapeBraces).join(' and ')}},`,
    year ? `  year          = {${year}},` : null,
    `  eprint        = {${id}},`,
    `  archivePrefix = {arXiv},`,
    `  url           = {https://arxiv.org/abs/${id}},`,
    '}',
  ]
    .filter(Boolean)
    .join('\n');
}

interface SemanticScholarResponse {
  title?: string;
  authors?: { name?: string }[];
  year?: number;
  venue?: string;
  externalIds?: { ArXiv?: string; DOI?: string };
}

/**
 * Semantic Scholar lookup by arXiv id. Hits a different infrastructure than
 * export.arxiv.org, so it's a useful fallback when arxiv is throttling us.
 */
async function fetchBibtexFromSemanticScholar(arxivId: string): Promise<string | null> {
  await s2Throttle();
  const url = `https://api.semanticscholar.org/graph/v1/paper/arXiv:${encodeURIComponent(
    arxivId
  )}?fields=title,authors,year,externalIds,venue`;
  const res = await fetchWithTimeout(url);
  if (!res || !res.ok) return null;
  let data: SemanticScholarResponse;
  try {
    data = (await res.json()) as SemanticScholarResponse;
  } catch {
    return null;
  }
  if (!data.title) return null;

  const authors = (data.authors ?? []).map((a) => a.name ?? '').filter(Boolean);
  const key = `arxiv_${arxivId.replace(/[^a-zA-Z0-9]/g, '_')}`;

  return [
    `@misc{${key},`,
    `  title         = {${escapeBraces(data.title)}},`,
    authors.length
      ? `  author        = {${authors.map(escapeBraces).join(' and ')}},`
      : null,
    data.year ? `  year          = {${data.year}},` : null,
    `  eprint        = {${arxivId}},`,
    `  archivePrefix = {arXiv},`,
    `  url           = {https://arxiv.org/abs/${arxivId}},`,
    '}',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Skeleton entry when we know it's an arxiv paper but the API is unreachable. */
function bibtexArxivMinimal(node: NodeRecord, id: string): string {
  const key = `arxiv_${id.replace(/[^a-zA-Z0-9]/g, '_')}`;
  return [
    `@misc{${key},`,
    `  title         = {${escapeBraces(node.title)}},`,
    `  eprint        = {${id}},`,
    `  archivePrefix = {arXiv},`,
    `  url           = {https://arxiv.org/abs/${id}},`,
    '}',
  ].join('\n');
}

/** Skeleton entry when we know the DOI but doi.org won't serve us. */
function bibtexDoiMinimal(node: NodeRecord, doi: string): string {
  return [
    `@misc{${node.slug},`,
    `  title = {${escapeBraces(node.title)}},`,
    `  doi   = {${doi}},`,
    `  url   = {https://doi.org/${doi}},`,
    '}',
  ].join('\n');
}

function tokenizeForCompare(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3) // drop short/common-noise tokens
  );
}

function titleSimilarity(a: string, b: string): number {
  const A = tokenizeForCompare(a);
  const B = tokenizeForCompare(b);
  if (A.size === 0 || B.size === 0) return 0;
  let overlap = 0;
  for (const t of A) if (B.has(t)) overlap++;
  return overlap / Math.min(A.size, B.size); // 1.0 = full subset match
}

async function searchCrossrefForDoi(title: string): Promise<string | null> {
  if (title.split(/\s+/).length < 4) return null; // too short, prone to mismatch
  const q = encodeURIComponent(title);
  const res = await fetchWithTimeout(`https://api.crossref.org/works?query.title=${q}&rows=3`);
  if (!res || !res.ok) return null;
  try {
    const data = (await res.json()) as {
      message?: {
        items?: Array<{ DOI?: string; title?: string[] }>;
      };
    };
    const items = data.message?.items ?? [];
    // Accept only when the candidate's title clearly contains our title's tokens.
    for (const item of items) {
      const candidate = (item.title?.[0] ?? '').trim();
      if (!candidate || !item.DOI) continue;
      if (titleSimilarity(title, candidate) >= 0.8) return item.DOI;
    }
    return null;
  } catch {
    return null;
  }
}

function escapeBraces(s: string): string {
  return s.replace(/[{}]/g, '\\$&');
}

function bibtexMisc(node: NodeRecord): string {
  const year = new Date(node.created_at).getFullYear();
  const lines: string[] = [
    `@misc{${node.slug},`,
    `  title  = {${escapeBraces(node.title)}},`,
  ];
  if (node.url) lines.push(`  howpublished = {\\url{${node.url}}},`);
  lines.push(`  year   = {${year}},`);
  lines.push('}');
  return lines.join('\n');
}

export interface BibtexResult {
  source:
    | 'override'
    | 'doi'
    | 'doi-minimal'
    | 'arxiv'
    | 'arxiv-s2'
    | 'arxiv-minimal'
    | 'arxiv-pdf'
    | 'arxiv-pdf-s2'
    | 'arxiv-pdf-minimal'
    | 'crossref-title'
    | 'fallback';
  bibtex: string;
}

/** Best-effort BibTeX for a single reference node. Always returns something. */
export async function bibtexFor(node: NodeRecord): Promise<BibtexResult> {
  if (node.bibtex_override && node.bibtex_override.trim().startsWith('@')) {
    return { source: 'override', bibtex: node.bibtex_override.trim() };
  }
  const id = extractIdentifier(node.url);

  // Explicit identifier in URL → use API result if we get one, otherwise a minimal
  // entry pointing at the known id. Crucially we do NOT fall through to fuzzy title
  // search when we already know what paper this is.
  if (id?.kind === 'doi') {
    const out = await fetchBibtexFromDoi(id.id);
    if (out) return { source: 'doi', bibtex: out };
    return { source: 'doi-minimal', bibtex: bibtexDoiMinimal(node, id.id) };
  }
  if (id?.kind === 'arxiv') {
    const out = await fetchBibtexFromArxiv(id.id);
    if (out) return { source: 'arxiv', bibtex: out };
    // arxiv down/throttled — try Semantic Scholar (different infra)
    const s2 = await fetchBibtexFromSemanticScholar(id.id);
    if (s2) return { source: 'arxiv-s2', bibtex: s2 };
    return { source: 'arxiv-minimal', bibtex: bibtexArxivMinimal(node, id.id) };
  }

  // No identifier in URL — check the PDF watermark next.
  if (node.pdf_sha256) {
    let arxivId: string | null;
    if (node.pdf_arxiv_id === null) {
      arxivId = await extractArxivIdFromPdf(node.pdf_sha256);
      setNodePdfArxivId(node.slug, arxivId ?? '');
    } else {
      arxivId = node.pdf_arxiv_id || null;
    }
    if (arxivId) {
      const out = await fetchBibtexFromArxiv(arxivId);
      if (out) return { source: 'arxiv-pdf', bibtex: out };
      const s2 = await fetchBibtexFromSemanticScholar(arxivId);
      if (s2) return { source: 'arxiv-pdf-s2', bibtex: s2 };
      // Same logic: PDF gave us a known arxiv id; don't fall through to title search.
      return { source: 'arxiv-pdf-minimal', bibtex: bibtexArxivMinimal(node, arxivId) };
    }
  }

  // Last resort: fuzzy title search via Crossref. Only reached when we have no
  // identifier from URL or PDF.
  const doi = await searchCrossrefForDoi(node.title);
  if (doi) {
    const out = await fetchBibtexFromDoi(doi);
    if (out) return { source: 'crossref-title', bibtex: out };
  }
  return { source: 'fallback', bibtex: bibtexMisc(node) };
}

/** Concatenated BibTeX for every reference node. */
export async function bibtexForAllReferences(): Promise<string> {
  const refs = listNodes({ type: 'reference', limit: 1000 });
  const out: string[] = [];
  for (let i = 0; i < refs.length; i += CONCURRENCY) {
    const chunk = refs.slice(i, i + CONCURRENCY);
    const batch = await Promise.all(chunk.map((r) => bibtexFor(r)));
    out.push(...batch.map((b) => b.bibtex));
  }
  return out.join('\n\n') + (out.length ? '\n' : '');
}
