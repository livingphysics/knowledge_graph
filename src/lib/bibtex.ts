import { listNodes, setNodePdfArxivId, type NodeRecord } from './nodes';
import { extractArxivIdFromPdf } from './pdf-arxiv';

const TIMEOUT_MS = 10_000;
const USER_AGENT = 'KnowledgeGraph/1.0 (mailto:noreply@example.com)';
const CONCURRENCY = 4;
// arXiv asks for no more than 1 request per 3 seconds. We use 3.5s for safety.
const ARXIV_MIN_INTERVAL_MS = 3500;
// Semantic Scholar unauthenticated: 100 requests per 5 minutes ≈ 1/3s.
const S2_MIN_INTERVAL_MS = 3500;
// OpenAlex polite pool: 10/sec. Throttle at 5/sec to stay comfortably under.
const OPENALEX_MIN_INTERVAL_MS = 200;

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
const openAlexThrottle = makeThrottle(OPENALEX_MIN_INTERVAL_MS);

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

// --- OpenAlex --------------------------------------------------------------

interface OpenAlexAuthor {
  author?: { display_name?: string };
}

interface OpenAlexWork {
  id?: string;
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  publication_date?: string | null;
  type?: string | null;
  type_crossref?: string | null;
  authorships?: OpenAlexAuthor[];
  host_venue?: { display_name?: string | null } | null;
  primary_location?: { source?: { display_name?: string | null } | null } | null;
  biblio?: {
    volume?: string | null;
    issue?: string | null;
    first_page?: string | null;
    last_page?: string | null;
  } | null;
}

async function openAlexFetch(url: string): Promise<OpenAlexWork | null> {
  await openAlexThrottle();
  const res = await fetchWithTimeout(url);
  if (!res || !res.ok) return null;
  try {
    return (await res.json()) as OpenAlexWork;
  } catch {
    return null;
  }
}

async function fetchOpenAlexByArxiv(arxivId: string): Promise<OpenAlexWork | null> {
  // OpenAlex doesn't accept arXiv URLs/IDs directly — papers are only findable
  // via their arXiv DOI (10.48550/arXiv.<id>), which arXiv started registering
  // automatically around late 2022. Older papers will 404 and we fall through.
  return openAlexFetch(
    `https://api.openalex.org/works/https://doi.org/10.48550/arXiv.${encodeURIComponent(
      arxivId
    )}`
  );
}

async function fetchOpenAlexByDoi(doi: string): Promise<OpenAlexWork | null> {
  return openAlexFetch(
    `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`
  );
}

async function fetchOpenAlexByTitle(title: string): Promise<OpenAlexWork | null> {
  if (title.split(/\s+/).length < 4) return null;
  await openAlexThrottle();
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(title)}&per_page=3`;
  const res = await fetchWithTimeout(url);
  if (!res || !res.ok) return null;
  try {
    const data = (await res.json()) as { results?: OpenAlexWork[] };
    for (const w of data.results ?? []) {
      const candidate = (w.title ?? w.display_name ?? '').trim();
      if (titleSimilarity(title, candidate) >= 0.8) return w;
    }
    return null;
  } catch {
    return null;
  }
}

function entryTypeFor(type: string | null | undefined): string {
  switch (type) {
    case 'article':
    case 'journal-article':
      return '@article';
    case 'book':
    case 'monograph':
      return '@book';
    case 'book-chapter':
      return '@inbook';
    case 'proceedings-article':
      return '@inproceedings';
    default:
      return '@misc';
  }
}

function citationKey(authorLastName: string | undefined, year: number | undefined, fallback: string): string {
  const a = (authorLastName ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (a) return `${a}${year ?? ''}`;
  return fallback.replace(/[^a-zA-Z0-9]/g, '_');
}

function bibtexFromOpenAlex(work: OpenAlexWork, opts: { node: NodeRecord; arxivId?: string }): string {
  const title = work.title ?? work.display_name ?? opts.node.title;
  const authors = (work.authorships ?? [])
    .map((a) => a.author?.display_name ?? '')
    .filter(Boolean);
  const year =
    work.publication_year ??
    (work.publication_date ? Number(work.publication_date.slice(0, 4)) : undefined);
  const venue =
    work.primary_location?.source?.display_name ?? work.host_venue?.display_name ?? null;
  const doi = (work.doi ?? '').replace(/^https?:\/\/doi\.org\//, '') || null;
  const type = entryTypeFor(work.type ?? work.type_crossref);

  // Pick the family name: "Smith, John" → "Smith"; "John Smith" → "Smith".
  const firstAuthor = authors[0] ?? '';
  const firstAuthorLast = firstAuthor.includes(',')
    ? firstAuthor.split(',')[0].trim()
    : firstAuthor.split(/\s+/).pop();
  const key = citationKey(firstAuthorLast, year ?? undefined, opts.arxivId ?? opts.node.slug);

  const lines: string[] = [`${type}{${key},`];
  lines.push(`  title         = {${escapeBraces(title)}},`);
  if (authors.length)
    lines.push(`  author        = {${authors.map(escapeBraces).join(' and ')}},`);
  if (year) lines.push(`  year          = {${year}},`);
  if (venue) {
    const field = type === '@article' ? 'journal' : type === '@inproceedings' ? 'booktitle' : 'publisher';
    lines.push(`  ${field.padEnd(13)} = {${escapeBraces(venue)}},`);
  }
  if (work.biblio?.volume) lines.push(`  volume        = {${work.biblio.volume}},`);
  if (work.biblio?.issue) lines.push(`  number        = {${work.biblio.issue}},`);
  if (work.biblio?.first_page) {
    const pages = work.biblio.last_page
      ? `${work.biblio.first_page}--${work.biblio.last_page}`
      : work.biblio.first_page;
    lines.push(`  pages         = {${pages}},`);
  }
  if (doi) lines.push(`  doi           = {${doi}},`);
  if (opts.arxivId) {
    lines.push(`  eprint        = {${opts.arxivId}},`);
    lines.push(`  archivePrefix = {arXiv},`);
    lines.push(`  url           = {https://arxiv.org/abs/${opts.arxivId}},`);
  } else if (doi) {
    lines.push(`  url           = {https://doi.org/${doi}},`);
  }
  lines.push('}');
  return lines.join('\n');
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
    | 'openalex-doi'
    | 'doi'
    | 'doi-minimal'
    | 'openalex-arxiv'
    | 'arxiv'
    | 'arxiv-s2'
    | 'arxiv-minimal'
    | 'openalex-pdf'
    | 'arxiv-pdf'
    | 'arxiv-pdf-s2'
    | 'arxiv-pdf-minimal'
    | 'openalex-title'
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

  // Explicit identifier in URL: try OpenAlex first (cleanest structured metadata),
  // then provider-specific APIs, then a minimal entry. Crucially we never fall
  // through to fuzzy title search when we already know what paper this is.
  if (id?.kind === 'doi') {
    const oa = await fetchOpenAlexByDoi(id.id);
    if (oa) return { source: 'openalex-doi', bibtex: bibtexFromOpenAlex(oa, { node }) };
    const out = await fetchBibtexFromDoi(id.id);
    if (out) return { source: 'doi', bibtex: out };
    return { source: 'doi-minimal', bibtex: bibtexDoiMinimal(node, id.id) };
  }
  if (id?.kind === 'arxiv') {
    const oa = await fetchOpenAlexByArxiv(id.id);
    if (oa) return { source: 'openalex-arxiv', bibtex: bibtexFromOpenAlex(oa, { node, arxivId: id.id }) };
    const out = await fetchBibtexFromArxiv(id.id);
    if (out) return { source: 'arxiv', bibtex: out };
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
      const oa = await fetchOpenAlexByArxiv(arxivId);
      if (oa) return { source: 'openalex-pdf', bibtex: bibtexFromOpenAlex(oa, { node, arxivId }) };
      const out = await fetchBibtexFromArxiv(arxivId);
      if (out) return { source: 'arxiv-pdf', bibtex: out };
      const s2 = await fetchBibtexFromSemanticScholar(arxivId);
      if (s2) return { source: 'arxiv-pdf-s2', bibtex: s2 };
      return { source: 'arxiv-pdf-minimal', bibtex: bibtexArxivMinimal(node, arxivId) };
    }
  }

  // No identifier from URL or PDF — fall back to title search.
  // OpenAlex first (richer metadata), Crossref as backup.
  const oa = await fetchOpenAlexByTitle(node.title);
  if (oa) return { source: 'openalex-title', bibtex: bibtexFromOpenAlex(oa, { node }) };
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
