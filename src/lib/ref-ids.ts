// DB- and fs-free leaf module. Safe to import from client components.
//
// arXiv / DOI identifier helpers shared by the BibTeX resolver, the server-side
// PDF arXiv-id extraction, the /api/lookup route and the New Reference auto-fill.

export interface Identifier {
  kind: 'doi' | 'arxiv';
  id: string;
}

/** What /api/lookup returns for a resolved reference. */
export interface RefMeta {
  title: string;
  /** Canonical link for the Link field: the arXiv abstract page, else doi.org. */
  url: string;
  /** Set when the paper is on arXiv (its PDF can then be fetched in the browser). */
  arxivId: string | null;
  year: number | null;
  /** 'exact' = resolved from an identifier; 'title' = fuzzy title search (only ever suggested). */
  match: 'exact' | 'title';
}

// Covers both arXiv ID forms:
//   2007–present: "2401.12345" (4 digits dot 4-5 digits)
//   pre-2007:     "cs.AI/0601001", "hep-th/9711200" (archive[.subject class] slash 7 digits)
const ARXIV_ID_RE = /^(?:\d{4}\.\d{4,5}|[a-zA-Z-]+(?:\.[A-Z]{2})?\/\d{7})$/;
const ARXIV_ID_WITH_VERSION_RE = /^(?:\d{4}\.\d{4,5}|[a-zA-Z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/;

// In PDF text. The stamp arXiv prints in the left margin of page 1 carries the
// primary category in brackets ("arXiv:1706.03762v7 [cs.CL] 2 Aug 2023"); prefer
// it over a bare "arXiv:…" mention, which may just be a citation.
const ARXIV_STAMP_RE = /arXiv\s*:\s*(\d{4}\.\d{4,5})(?:v\d+)?\s*\[[a-zA-Z.-]+\]/;
const ARXIV_RE_NEW = /arXiv\s*:\s*(\d{4}\.\d{4,5})(?:v\d+)?/;
const ARXIV_RE_OLD = /arXiv\s*:\s*([a-zA-Z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?/;

// DOI syntax is "10." + registrant code + "/" + suffix. In free text the suffix
// runs to the next whitespace or quote; trailing punctuation is almost never part of it.
const DOI_RE = /^10\.\d{4,9}\/\S+$/;
const DOI_IN_TEXT_RE = /\b(10\.\d{4,9}\/[^\s"'<>]+)/;

export function isArxivId(s: string): boolean {
  return ARXIV_ID_RE.test(s);
}

export function isDoi(s: string): boolean {
  return DOI_RE.test(s);
}

export function stripArxivVersion(id: string): string {
  return id.replace(/v\d+$/, '');
}

export const arxivAbsUrl = (id: string) => `https://arxiv.org/abs/${id}`;
export const arxivPdfUrl = (id: string) => `https://arxiv.org/pdf/${id}`;
export const doiUrl = (doi: string) => `https://doi.org/${doi}`;

/** Year an arXiv paper was first submitted, from the YYMM its id encodes. */
export function arxivYear(id: string): number | null {
  const m = id.match(/^(\d{2})\d{2}\./) ?? id.match(/\/(\d{2})\d{5}$/);
  if (!m) return null;
  const yy = Number(m[1]);
  return yy >= 91 ? 1900 + yy : 2000 + yy; // arXiv started in 1991
}

/** arXiv's own DataCite DOIs ("10.48550/arXiv.2106.09685") → the arXiv id, else null. */
export function arxivIdFromDoi(doi: string): string | null {
  const m = doi.match(/^10\.48550\/arxiv\.(.+)$/i);
  return m && isArxivId(stripArxivVersion(m[1])) ? stripArxivVersion(m[1]) : null;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** The arXiv id in an arxiv.org URL, version suffix kept ("2401.12345v2"), or null. */
export function arxivIdWithVersion(url: string): string | null {
  const m = url.match(/arxiv\.org\/(?:abs|pdf|html)\/([a-zA-Z\-.\/0-9]+)/i);
  if (!m) return null;
  return m[1].replace(/\/+$/, '').replace(/\.pdf$/i, '');
}

/** Extracts a DOI or arXiv id from a URL, or null if neither pattern matches. */
export function extractIdentifier(url: string | null | undefined): Identifier | null {
  if (!url) return null;
  // DOI in URL: https://doi.org/10.x/y, https://dx.doi.org/..., or "doi:..."
  const doiInHost = url.match(/doi\.org\/(10\.\d{4,9}\/[^\s?#]+)/i);
  if (doiInHost) return { kind: 'doi', id: safeDecode(doiInHost[1]) };

  // arXiv: arxiv.org/abs/2401.12345, arxiv.org/abs/cs.AI/0601001, arxiv.org/pdf/...
  const arxiv = arxivIdWithVersion(url);
  if (arxiv) return { kind: 'arxiv', id: stripArxivVersion(arxiv) };

  // Bare DOI in path (e.g., https://link.springer.com/article/10.x/y)
  const bareDoi = url.match(/(10\.\d{4,9}\/[^\s?#]+)/);
  if (bareDoi) return { kind: 'doi', id: bareDoi[1] };

  return null;
}

/**
 * Turns what someone typed into the Link field into a URL when it's a bare
 * identifier: "1706.03762", "arXiv:1706.03762v2", "hep-th/9711200" → arxiv.org/abs/…;
 * "10.1371/journal.pone.0000217", "doi:10.…" → doi.org/…; "arxiv.org/abs/…" gains
 * its https://. Anything else is returned trimmed but otherwise untouched.
 */
export function normalizeRefInput(input: string): string {
  const s = input.trim();
  if (!s || /^https?:\/\//i.test(s)) return s;
  if (/^(?:www\.)?(?:arxiv\.org|(?:dx\.)?doi\.org)\//i.test(s)) return `https://${s}`;
  const arxiv = s.replace(/^arxiv\s*:\s*/i, '');
  if (ARXIV_ID_WITH_VERSION_RE.test(arxiv)) return arxivAbsUrl(arxiv);
  const doi = s.replace(/^doi\s*:\s*/i, '');
  if (isDoi(doi)) return doiUrl(doi);
  return s;
}

/** The arXiv id (no version) mentioned in PDF text, preferring arXiv's own page-1 stamp. */
export function matchArxivInText(text: string): string | null {
  const m = text.match(ARXIV_STAMP_RE) ?? text.match(ARXIV_RE_NEW) ?? text.match(ARXIV_RE_OLD);
  return m ? m[1] : null;
}

/** The first DOI in free text (PDF text, XMP, info dict), minus trailing punctuation. */
export function matchDoiInText(text: string): string | null {
  const m = text.match(DOI_IN_TEXT_RE);
  return m ? m[1].replace(/[.,;:)\]}]+$/, '') : null;
}

/** arXiv download names: "2401.12345v2.pdf", or "2401.12345v2 (1).pdf" for a repeat download. */
export function arxivIdFromFilename(name: string): string | null {
  const m = name.match(/^(\d{4}\.\d{4,5})(?:v\d+)?(?:\s*\(\d+\))?\.pdf$/i);
  return m ? m[1] : null;
}
