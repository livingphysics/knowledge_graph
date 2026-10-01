import {
  arxivAbsUrl,
  arxivIdFromDoi,
  arxivYear,
  doiUrl,
  extractIdentifier,
  normalizeRefInput,
  type RefMeta,
} from './ref-ids';
import {
  fetchArxivMeta,
  fetchOpenAlexByDoi,
  fetchOpenAlexByTitle,
  searchCrossrefForDoi,
  titleSimilarity,
  type OpenAlexWork,
} from './bibtex';

// Metadata lookup behind the New Reference auto-fill. Built on the throttled
// fetchers in bibtex.ts, so lookups and BibTeX export share one rate budget
// per provider.
//
// arXiv ids are resolved through arXiv's own API only: OpenAlex has mis-merged
// records for some arXiv DOIs (10.48550/arXiv.2106.09685 carries another
// paper's title), and a confidently wrong title is worse than none.

export interface LookupInput {
  url?: string | null;
  arxiv?: string | null;
  doi?: string | null;
  title?: string | null;
  /**
   * Title guessed from a PDF. When set, an identifier-based result must closely
   * match it — guards against an id that the PDF merely cites.
   */
  verifyHint?: string | null;
}

// An interactive lookup won't queue behind more than this on the shared arXiv
// throttle (e.g. while an "export all" is running) — it gives up instead.
const ARXIV_MAX_WAIT_MS = 4000;
const VERIFY_MIN_SIMILARITY = 0.7;

/**
 * Resolves a link / arXiv id / DOI to its title and canonical URL, or — given
 * only a title — finds the best-matching paper (`match: 'title'`). Null when
 * nothing (trustworthy) is found. An explicit identifier never falls back to
 * fuzzy title search.
 */
export async function lookupReference(input: LookupInput): Promise<RefMeta | null> {
  let arxivId = input.arxiv ?? null;
  let doi = input.doi ?? null;
  const fromUrl = input.url ? extractIdentifier(normalizeRefInput(input.url)) : null;
  if (fromUrl?.kind === 'arxiv') arxivId = fromUrl.id;
  if (fromUrl?.kind === 'doi') doi = fromUrl.id;
  // arXiv's own DataCite DOIs (10.48550/arXiv.<id>) are arXiv papers.
  if (!arxivId && doi) {
    arxivId = arxivIdFromDoi(doi);
    if (arxivId) doi = null;
  }

  if (arxivId || doi) {
    const meta = arxivId ? await lookupArxiv(arxivId) : await lookupDoi(doi as string);
    if (!meta) return null;
    if (
      input.verifyHint &&
      titleSimilarity(input.verifyHint, meta.title, 'max') < VERIFY_MIN_SIMILARITY
    ) {
      return null;
    }
    return meta;
  }
  return input.title ? lookupTitle(input.title) : null;
}

async function lookupArxiv(id: string): Promise<RefMeta | null> {
  const ax = await fetchArxivMeta(id, { maxWaitMs: ARXIV_MAX_WAIT_MS });
  const title = cleanTitle(ax?.title);
  if (!ax || !title) return null;
  return {
    title,
    url: arxivAbsUrl(id),
    arxivId: id,
    year: ax.year ? Number(ax.year) : arxivYear(id),
    match: 'exact',
  };
}

async function lookupDoi(doi: string): Promise<RefMeta | null> {
  const work = await fetchOpenAlexByDoi(doi);
  const title = cleanTitle(work?.title ?? work?.display_name);
  if (!work || !title) return null;
  return { title, url: doiUrl(doi), arxivId: null, year: work.publication_year ?? null, match: 'exact' };
}

async function lookupTitle(title: string): Promise<RefMeta | null> {
  const work = await fetchOpenAlexByTitle(title);
  const oaTitle = cleanTitle(work?.title ?? work?.display_name);
  if (work && oaTitle) {
    // Prefer the arXiv page (its PDF can be attached). OpenAlex's own `doi` and
    // year for arXiv-only works are sometimes junk (1706.03762 → 10.65215/…, 2025).
    const arxivId = arxivIdOf(work);
    const doi = stripDoiPrefix(work.doi);
    const url = arxivId ? arxivAbsUrl(arxivId) : doi ? doiUrl(doi) : null;
    if (url) {
      const year = (arxivId && arxivYear(arxivId)) || work.publication_year || null;
      return { title: oaTitle, url, arxivId, year, match: 'title' };
    }
  }
  const hit = await searchCrossrefForDoi(title);
  const crTitle = cleanTitle(hit?.title);
  if (!hit || !crTitle) return null;
  const arxivId = arxivIdFromDoi(hit.doi);
  return {
    title: crTitle,
    url: arxivId ? arxivAbsUrl(arxivId) : doiUrl(hit.doi),
    arxivId,
    year: arxivId ? arxivYear(arxivId) : null,
    match: 'title',
  };
}

/** The arXiv id of an OpenAlex work: from its arXiv DOI or an arxiv.org landing page. */
function arxivIdOf(work: OpenAlexWork): string | null {
  const doi = stripDoiPrefix(work.doi);
  const fromDoi = doi ? arxivIdFromDoi(doi) : null;
  if (fromDoi) return fromDoi;
  for (const loc of work.locations ?? []) {
    const id = loc.landing_page_url ? extractIdentifier(loc.landing_page_url) : null;
    if (id?.kind === 'arxiv') return id.id;
  }
  return null;
}

function stripDoiPrefix(doi: string | null | undefined): string | null {
  return (doi ?? '').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '') || null;
}

/** Titles can carry markup (OpenAlex/Crossref <i>, <sub>…; arXiv XML entities) and stray whitespace. */
function cleanTitle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const title = raw
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return title || null;
}
