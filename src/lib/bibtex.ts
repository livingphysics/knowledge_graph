import { listNodes, setNodePdfArxivId, type NodeRecord } from './nodes';
import { extractArxivIdFromPdf } from './pdf-arxiv';
import {
  arxivIdFromDoi,
  arxivYear,
  extractIdentifier,
  isArxivId,
  stripArxivVersion,
  type Identifier,
} from './ref-ids';

const TIMEOUT_MS = 10_000;
const USER_AGENT = 'KnowledgeGraph/1.0 (mailto:noreply@example.com)';
const CONCURRENCY = 4;
// arXiv asks for no more than 1 request per 3 seconds. We use 3.5s for safety.
const ARXIV_MIN_INTERVAL_MS = 3500;
// Semantic Scholar unauthenticated: 100 requests per 5 minutes ≈ 1/3s.
const S2_MIN_INTERVAL_MS = 3500;
// OpenAlex polite pool: 10/sec. Throttle at 5/sec to stay comfortably under.
const OPENALEX_MIN_INTERVAL_MS = 200;
// DataCite's public REST API: the same polite 5/sec.
const DATACITE_MIN_INTERVAL_MS = 200;

function makeThrottle(minIntervalMs: number) {
  let nextAvailableAt = 0;
  async function throttle(): Promise<void> {
    const slot = Math.max(Date.now(), nextAvailableAt);
    nextAvailableAt = slot + minIntervalMs;
    const delay = slot - Date.now();
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  }
  /** How long a call made right now would wait for its slot. */
  throttle.waitMs = () => Math.max(0, nextAvailableAt - Date.now());
  return throttle;
}

const arxivThrottle = makeThrottle(ARXIV_MIN_INTERVAL_MS);
const s2Throttle = makeThrottle(S2_MIN_INTERVAL_MS);
const openAlexThrottle = makeThrottle(OPENALEX_MIN_INTERVAL_MS);
const dataCiteThrottle = makeThrottle(DATACITE_MIN_INTERVAL_MS);

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

export interface ArxivMeta {
  title: string;
  authors: string[];
  /** Four-digit year of first submission, or '' if absent. */
  year: string;
  /** DOI of the published version, when the authors gave one to arXiv. */
  doi?: string;
}

// arXiv metadata is cached so "export all" can fetch every id it needs in a
// few batched requests up front (prefetchArxivMeta), and so a paper looked up
// again soon after (auto-fill, then export) is answered at once.
const ARXIV_BATCH_SIZE = 100;
const ARXIV_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
// An id missing from a well-formed response doesn't exist (or isn't public yet).
const ARXIV_MISS_TTL_MS = 10 * 60 * 1000;
// When neither DataCite nor the arXiv API answers, don't ask again for a bit:
// "export all" would otherwise retry every id, 3.5 s apart.
const ARXIV_DOWN_TTL_MS = 60 * 1000;
const ARXIV_CACHE_MAX = 2000;
const arxivCache = new Map<string, { meta: ArxivMeta | null; expires: number }>();

/** An arXiv id as the API knows it: no version, lower case, no subject class ("math.AG/0601001" → "math/0601001"). */
function arxivKey(id: string): string {
  return stripArxivVersion(id.trim())
    .replace(/^([a-z-]+)\.[a-z-]+\//i, '$1/')
    .toLowerCase();
}

/** Cached metadata: null = no such paper (or no answer lately), undefined = not cached. */
function cachedArxivMeta(id: string): ArxivMeta | null | undefined {
  const key = arxivKey(id);
  const hit = arxivCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.meta;
  arxivCache.delete(key);
  return undefined;
}

function cacheArxivMeta(
  id: string,
  meta: ArxivMeta | null,
  ttlMs = meta ? ARXIV_CACHE_TTL_MS : ARXIV_MISS_TTL_MS
): void {
  const key = arxivKey(id);
  arxivCache.delete(key); // re-insert at the end, so the Map stays oldest-first
  arxivCache.set(key, { meta, expires: Date.now() + ttlMs });
  if (arxivCache.size > ARXIV_CACHE_MAX) arxivCache.delete(arxivCache.keys().next().value!);
}

interface DataCiteRecord {
  attributes?: {
    doi?: string;
    titles?: { title?: string; titleType?: string | null }[];
    creators?: { name?: string; givenName?: string; familyName?: string }[];
    publicationYear?: number | string | null;
    relatedIdentifiers?: {
      relationType?: string;
      relatedIdentifier?: string;
      relatedIdentifierType?: string;
    }[];
  };
}

/**
 * arXiv registers a DataCite DOI (10.48550/arXiv.<id>) for every paper, with
 * the same title, authors and year its own API gives. DataCite answers in well
 * under a second, for many DOIs at once, whereas the arXiv API can take 10–30 s
 * per query and rate-limits hard — so DataCite is asked first. Null if it
 * gave no usable answer.
 */
async function queryDataCite(keys: string[]): Promise<Map<string, ArxivMeta> | null> {
  await dataCiteThrottle();
  const params = new URLSearchParams({
    ids: keys.map((key) => `10.48550/arxiv.${key}`).join(','),
    'page[size]': String(keys.length),
    'fields[dois]': 'doi,titles,creators,publicationYear,relatedIdentifiers',
  });
  const res = await fetchWithTimeout(`https://api.datacite.org/dois?${params}`);
  if (!res || !res.ok) return null;
  let records: DataCiteRecord[];
  try {
    records = ((await res.json()) as { data?: DataCiteRecord[] }).data ?? [];
  } catch {
    return null;
  }
  const papers = new Map<string, ArxivMeta>();
  for (const record of records) {
    const a = record?.attributes;
    const id = arxivIdFromDoi(a?.doi ?? '');
    const title = (a?.titles?.find((t) => !t.titleType) ?? a?.titles?.[0])?.title
      ?.replace(/\s+/g, ' ')
      .trim();
    if (!a || !id || !title) continue;
    papers.set(arxivKey(id), {
      title,
      // "Given Family", as the arXiv API writes names.
      authors: (a.creators ?? [])
        .map((c) => (c.givenName && c.familyName ? `${c.givenName} ${c.familyName}` : c.name ?? ''))
        .filter(Boolean),
      year: a.publicationYear ? String(a.publicationYear) : '',
      doi: a.relatedIdentifiers?.find(
        (r) => r.relationType === 'IsVersionOf' && r.relatedIdentifierType === 'DOI'
      )?.relatedIdentifier,
    });
  }
  return papers;
}

/** Atom text content → plain string: XML entities decoded, whitespace collapsed. */
function atomText(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The papers in an arXiv API response, keyed by arxivKey (entries come back in no particular order). */
function parseArxivFeed(xml: string): Map<string, ArxivMeta> {
  const papers = new Map<string, ArxivMeta>();
  for (const [, entry] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    // Error entries ("incorrect id format for …") have no arxiv.org/abs/ id.
    const id = entry.match(/<id>\s*https?:\/\/arxiv\.org\/abs\/(\S+?)\s*<\/id>/)?.[1];
    const title = atomText(entry.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? '');
    if (!id || !title) continue;
    papers.set(arxivKey(id), {
      title,
      authors: [...entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/g)].map((m) =>
        atomText(m[1])
      ),
      year: entry.match(/<published>(\d{4})/)?.[1] ?? '',
      doi: atomText(entry.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/)?.[1] ?? '') || undefined,
    });
  }
  return papers;
}

/** One arXiv API request (for up to ARXIV_BATCH_SIZE ids). Null if arXiv gave no usable answer. */
async function queryArxiv(ids: string[]): Promise<Map<string, ArxivMeta> | null> {
  const idList = ids.map((id) => encodeURIComponent(arxivKey(id))).join(',');
  const url = `https://export.arxiv.org/api/query?id_list=${idList}&max_results=${ids.length}`;
  // arXiv answers 429, or a plain "Rate exceeded." with status 200, when
  // throttled. The throttle below should prevent this on our side, but retry
  // once in case another process / earlier-this-run state slipped through.
  for (let attempt = 0; attempt < 2; attempt++) {
    await arxivThrottle();
    const res = await fetchWithTimeout(url);
    if (!res || !res.ok) continue;
    const body = await res.text().catch(() => '');
    if (!/<feed[\s>]/.test(body)) continue; // "Rate exceeded." (or an error page)
    return parseArxivFeed(body);
  }
  return null;
}

/**
 * Looks `keys` (arxivKey form) up, DataCite first and then the arXiv API for
 * whatever DataCite lacked, and caches the answers.
 */
async function lookupArxivMeta(keys: string[], opts: { maxWaitMs?: number } = {}): Promise<void> {
  const fromDataCite = (await queryDataCite(keys)) ?? new Map<string, ArxivMeta>();
  for (const [key, meta] of fromDataCite) cacheArxivMeta(key, meta);
  const rest = keys.filter((key) => !fromDataCite.has(key));
  if (!rest.length) return;
  if (opts.maxWaitMs !== undefined && arxivThrottle.waitMs() > opts.maxWaitMs) return;
  const fromArxiv = await queryArxiv(rest);
  for (const key of rest) {
    // Only arXiv itself can tell us a paper doesn't exist.
    if (fromArxiv) cacheArxivMeta(key, fromArxiv.get(key) ?? null);
    else cacheArxivMeta(key, null, ARXIV_DOWN_TTL_MS);
  }
}

/**
 * Title/authors/year of an arXiv paper, from arXiv's own records (cached).
 * `maxWaitMs` lets interactive callers bail out instead of queueing behind a
 * long run of throttled arXiv API requests (e.g. a BibTeX "export all" in
 * progress).
 */
export async function fetchArxivMeta(
  id: string,
  opts: { maxWaitMs?: number } = {}
): Promise<ArxivMeta | null> {
  if (cachedArxivMeta(id) === undefined) await lookupArxivMeta([arxivKey(id)], opts);
  return cachedArxivMeta(id) ?? null;
}

/** Caches metadata for many ids with a request per ARXIV_BATCH_SIZE of them, not one per id. */
async function prefetchArxivMeta(ids: string[]): Promise<void> {
  // A single malformed id makes arXiv reject a whole request (HTTP 400), so
  // anything that doesn't look like an id is left to its own lookup.
  const todo = [...new Set(ids.map(arxivKey))].filter(
    (key) => isArxivId(key) && cachedArxivMeta(key) === undefined
  );
  for (let i = 0; i < todo.length; i += ARXIV_BATCH_SIZE) {
    await lookupArxivMeta(todo.slice(i, i + ARXIV_BATCH_SIZE));
  }
}

/** An arXiv paper as a @misc entry, from arXiv's (or Semantic Scholar's) metadata. */
function bibtexFromArxivMeta(id: string, meta: ArxivMeta): string {
  const key = `arxiv_${id.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const year = meta.year || arxivYear(id);
  return [
    `@misc{${key},`,
    `  title         = {${escapeBraces(meta.title)}},`,
    meta.authors.length
      ? `  author        = {${meta.authors.map(escapeBraces).join(' and ')}},`
      : null,
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
async function fetchSemanticScholarMeta(arxivId: string): Promise<ArxivMeta | null> {
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
  return {
    title: data.title,
    authors: (data.authors ?? []).map((a) => a.name ?? '').filter(Boolean),
    year: data.year ? String(data.year) : '',
  };
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

export interface OpenAlexWork {
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
  primary_location?: {
    landing_page_url?: string | null;
    source?: { display_name?: string | null; type?: string | null } | null;
  } | null;
  locations?: { landing_page_url?: string | null }[] | null;
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

export async function fetchOpenAlexByDoi(doi: string): Promise<OpenAlexWork | null> {
  return openAlexFetch(
    `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`
  );
}

export async function fetchOpenAlexByTitle(title: string): Promise<OpenAlexWork | null> {
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

// Below this, an OpenAlex record isn't taken to be the paper arXiv describes.
// Across OpenAlex's records for 34 popular arXiv papers, the genuine ones
// scored 1.0 and the six mis-merged ones under 0.15.
const SAME_PAPER_MIN_TITLE_SIMILARITY = 0.8;

/**
 * Whether OpenAlex's record is recognisably the paper arXiv describes. It has
 * mis-merged records for some arXiv DOIs: 10.48550/arXiv.2106.09685 (LoRA)
 * carries another paper's title.
 */
function isSamePaper(meta: ArxivMeta, work: OpenAlexWork): boolean {
  // OpenAlex titles can carry markup (<i>, <sub>…).
  const title = (work.title ?? work.display_name ?? '').replace(/<[^>]+>/g, ' ');
  return titleSimilarity(meta.title, title, 'max') >= SAME_PAPER_MIN_TITLE_SIMILARITY;
}

/** The arXiv id of an OpenAlex work, from its arXiv DOI or an arXiv location. */
function arxivIdOfWork(work: OpenAlexWork): string | null {
  for (const url of [work.doi, ...(work.locations ?? []).map((l) => l.landing_page_url)]) {
    const id = arxivIdOf(extractIdentifier(url));
    if (id) return id;
  }
  return null;
}

// OpenAlex source types that are where a paper was published, as opposed to a
// repository holding a copy of it (arXiv itself, Zenodo, university archives).
const VENUE_SOURCE_TYPES = new Set(['journal', 'conference', 'book series', 'ebook platform']);

/** "https://doi.org/10.X/Y" or "10.X/Y" → "10.x/y" (DOIs are case-insensitive). */
function bareDoi(doi: string | null | undefined): string | null {
  return (doi ?? '').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').toLowerCase() || null;
}

/**
 * `work` reduced to what can be trusted about arXiv paper `id`: arXiv's title,
 * authors and year; the venue (and volume/pages) only if OpenAlex places the
 * paper in a journal or proceedings rather than a repository; the DOI only if
 * it's provably this paper's — arXiv's own, the one its authors gave arXiv, or
 * that venue's. Mis-merged records carry DOIs of unrelated deposits
 * (1706.03762 → 10.65215/2q58a426) and archive copies posing as venues.
 */
function trustedArxivWork(work: OpenAlexWork, id: string, meta: ArxivMeta): OpenAlexWork {
  const location = work.primary_location;
  const atVenue = VENUE_SOURCE_TYPES.has(location?.source?.type ?? '');
  const doi = bareDoi(work.doi);
  const doiIsThisPaper =
    doi !== null &&
    (arxivKey(arxivIdFromDoi(doi) ?? '') === arxivKey(id) ||
      doi === bareDoi(meta.doi) ||
      (atVenue && doi === bareDoi(location?.landing_page_url)));
  return {
    ...work,
    title: meta.title,
    authorships: meta.authors.map((name) => ({ author: { display_name: name } })),
    publication_year: Number(meta.year) || arxivYear(id),
    publication_date: null,
    type: atVenue ? work.type : null,
    type_crossref: atVenue ? work.type_crossref : null,
    host_venue: null,
    primary_location: atVenue ? location : null,
    biblio: atVenue ? work.biblio : null,
    doi: doiIsThisPaper ? doi : null,
  };
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

/**
 * Token overlap between two titles. By default it's divided by the smaller
 * token set (1.0 = one title's words all appear in the other — lenient, good
 * for search hits). `'max'` divides by the larger set, so extra words count
 * against the match — used to check an identifier really belongs to a PDF.
 */
export function titleSimilarity(a: string, b: string, denominator: 'min' | 'max' = 'min'): number {
  const A = tokenizeForCompare(a);
  const B = tokenizeForCompare(b);
  if (A.size === 0 || B.size === 0) return 0;
  let overlap = 0;
  for (const t of A) if (B.has(t)) overlap++;
  const size = denominator === 'min' ? Math.min(A.size, B.size) : Math.max(A.size, B.size);
  return overlap / size; // 1.0 = full match
}

/** Crossref title search: the DOI (and Crossref's title) of a clearly matching work. */
export async function searchCrossrefForDoi(
  title: string
): Promise<{ doi: string; title: string } | null> {
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
      if (titleSimilarity(title, candidate) >= 0.8) return { doi: item.DOI, title: candidate };
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

type ArxivSources = Record<'enriched' | 'arxiv' | 's2' | 'minimal', BibtexResult['source']>;
const ARXIV_FROM_URL: ArxivSources = {
  enriched: 'openalex-arxiv',
  arxiv: 'arxiv',
  s2: 'arxiv-s2',
  minimal: 'arxiv-minimal',
};
const ARXIV_FROM_PDF: ArxivSources = {
  enriched: 'openalex-pdf',
  arxiv: 'arxiv-pdf',
  s2: 'arxiv-pdf-s2',
  minimal: 'arxiv-pdf-minimal',
};

/**
 * BibTeX for an arXiv paper. Title, authors and year come from arXiv's own
 * records (Semantic Scholar if those are unreachable). OpenAlex only enriches
 * the entry, and only when its record is recognisably the same paper — a
 * confidently wrong entry is worse than a plain preprint one.
 */
async function bibtexForArxiv(
  node: NodeRecord,
  id: string,
  sources: ArxivSources
): Promise<BibtexResult> {
  // Different hosts with separate throttles, so ask both at once.
  const [arxiv, oa] = await Promise.all([fetchArxivMeta(id), fetchOpenAlexByArxiv(id)]);
  const meta = arxiv ?? (await fetchSemanticScholarMeta(id));
  if (!meta) return { source: sources.minimal, bibtex: bibtexArxivMinimal(node, id) };
  if (oa && isSamePaper(meta, oa)) {
    return {
      source: sources.enriched,
      bibtex: bibtexFromOpenAlex(trustedArxivWork(oa, id, meta), { node, arxivId: id }),
    };
  }
  return { source: arxiv ? sources.arxiv : sources.s2, bibtex: bibtexFromArxivMeta(id, meta) };
}

/** The arXiv paper an identifier names: an arXiv id, or arXiv's own DOI for one (10.48550/arXiv.<id>). */
function arxivIdOf(id: Identifier | null): string | null {
  if (!id) return null;
  return id.kind === 'arxiv' ? id.id : arxivIdFromDoi(id.id);
}

/** Best-effort BibTeX for a single reference node. Always returns something. */
export async function bibtexFor(graph: string, node: NodeRecord): Promise<BibtexResult> {
  if (node.bibtex_override && node.bibtex_override.trim().startsWith('@')) {
    return { source: 'override', bibtex: node.bibtex_override.trim() };
  }
  const id = extractIdentifier(node.url);
  const urlArxivId = arxivIdOf(id);

  // Explicit identifier in URL: for a DOI, try OpenAlex first (cleanest
  // structured metadata), then doi.org, then a minimal entry; arXiv papers
  // (including arXiv DOIs) go through bibtexForArxiv. Crucially we never fall
  // through to fuzzy title search when we already know what paper this is.
  if (id?.kind === 'doi' && !urlArxivId) {
    const oa = await fetchOpenAlexByDoi(id.id);
    if (oa) return { source: 'openalex-doi', bibtex: bibtexFromOpenAlex(oa, { node }) };
    const out = await fetchBibtexFromDoi(id.id);
    if (out) return { source: 'doi', bibtex: out };
    return { source: 'doi-minimal', bibtex: bibtexDoiMinimal(node, id.id) };
  }
  if (urlArxivId) return bibtexForArxiv(node, urlArxivId, ARXIV_FROM_URL);

  // No identifier in URL — check the PDF watermark next.
  if (node.pdf_sha256) {
    let arxivId: string | null;
    if (node.pdf_arxiv_id === null) {
      arxivId = await extractArxivIdFromPdf(graph, node.pdf_sha256);
      setNodePdfArxivId(graph, node.slug, arxivId ?? '');
    } else {
      arxivId = node.pdf_arxiv_id || null;
    }
    if (arxivId) return bibtexForArxiv(node, arxivId, ARXIV_FROM_PDF);
  }

  // No identifier from URL or PDF — fall back to title search.
  // OpenAlex first (richer metadata), Crossref as backup.
  const oa = await fetchOpenAlexByTitle(node.title);
  if (oa) {
    // A paper on arXiv gets its title/authors/year from arXiv's records, as for
    // an arXiv link: OpenAlex's own DOI and year can be another deposit's
    // ("Attention Is All You Need" → 10.65215/2q58a426, 2025).
    const arxivId = arxivIdOfWork(oa);
    const meta = arxivId ? await fetchArxivMeta(arxivId) : null;
    const bibtex =
      arxivId && meta && isSamePaper(meta, oa)
        ? bibtexFromOpenAlex(trustedArxivWork(oa, arxivId, meta), { node, arxivId })
        : bibtexFromOpenAlex(oa, { node });
    return { source: 'openalex-title', bibtex };
  }
  const hit = await searchCrossrefForDoi(node.title);
  if (hit) {
    const out = await fetchBibtexFromDoi(hit.doi);
    if (out) return { source: 'crossref-title', bibtex: out };
  }
  return { source: 'fallback', bibtex: bibtexMisc(node) };
}

/** The arXiv id bibtexFor will resolve `node` through, as far as it's known without reading its PDF. */
function knownArxivId(node: NodeRecord): string | null {
  if (node.bibtex_override?.trim().startsWith('@')) return null;
  const id = extractIdentifier(node.url);
  if (id) return arxivIdOf(id);
  return (node.pdf_sha256 && node.pdf_arxiv_id) || null;
}

/** Concatenated BibTeX for every reference node. */
export async function bibtexForAllReferences(graph: string): Promise<string> {
  const refs = listNodes(graph, { type: 'reference', limit: 1000 });
  // Every arXiv entry needs arXiv's metadata: fetch it in batches up front
  // rather than with a request per reference (the arXiv API allows one per 3.5 s).
  await prefetchArxivMeta(refs.map(knownArxivId).filter((id): id is string => id !== null));
  const out: string[] = [];
  for (let i = 0; i < refs.length; i += CONCURRENCY) {
    const chunk = refs.slice(i, i + CONCURRENCY);
    const batch = await Promise.all(chunk.map((r) => bibtexFor(graph, r)));
    out.push(...batch.map((b) => b.bibtex));
  }
  return out.join('\n\n') + (out.length ? '\n' : '');
}
