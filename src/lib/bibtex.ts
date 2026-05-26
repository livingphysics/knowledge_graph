import { listNodes, type NodeRecord } from './nodes';
import { extractArxivIdFromPdf } from './pdf-arxiv';

const TIMEOUT_MS = 10_000;
const USER_AGENT = 'KnowledgeGraph/1.0 (mailto:noreply@example.com)';
const CONCURRENCY = 4;

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
  const res = await fetchWithTimeout(
    `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`
  );
  if (!res || !res.ok) return null;
  const xml = await res.text();
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
  source: 'override' | 'doi' | 'arxiv' | 'arxiv-pdf' | 'crossref-title' | 'fallback';
  bibtex: string;
}

/** Best-effort BibTeX for a single reference node. Always returns something. */
export async function bibtexFor(node: NodeRecord): Promise<BibtexResult> {
  if (node.bibtex_override && node.bibtex_override.trim().startsWith('@')) {
    return { source: 'override', bibtex: node.bibtex_override.trim() };
  }
  const id = extractIdentifier(node.url);
  if (id?.kind === 'doi') {
    const out = await fetchBibtexFromDoi(id.id);
    if (out) return { source: 'doi', bibtex: out };
  }
  if (id?.kind === 'arxiv') {
    const out = await fetchBibtexFromArxiv(id.id);
    if (out) return { source: 'arxiv', bibtex: out };
  }
  // PDF-based arXiv id: if the user uploaded an arXiv PDF, the watermark gives us the id
  // even when the URL doesn't point to arxiv.
  if (node.pdf_sha256) {
    const arxivId = await extractArxivIdFromPdf(node.pdf_sha256);
    if (arxivId) {
      const out = await fetchBibtexFromArxiv(arxivId);
      if (out) return { source: 'arxiv-pdf', bibtex: out };
    }
  }
  // Title-based fallback via Crossref
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
