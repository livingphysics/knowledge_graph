// Client-only. Reads a PDF in the browser (pdf.js, already shipped for the
// preview) to find an arXiv id / DOI and a best-guess title, so the New
// Reference form can fill itself in before anything is uploaded.

import { arxivIdFromFilename, matchArxivInText, matchDoiInText } from './ref-ids';

/** Copied into /public by the postinstall script; also used by PdfPreviewImpl. */
export const PDF_WORKER_SRC = '/pdf.worker.min.mjs';

export interface PdfIdCandidate {
  kind: 'arxiv' | 'doi';
  id: string;
  /**
   * false = weak evidence (a DOI in the body text may belong to a cited paper;
   * a filename may lie) — the lookup must match the PDF's own title.
   */
  trusted: boolean;
}

export interface PdfSniff {
  /** Strongest evidence first. */
  ids: PdfIdCandidate[];
  titleGuess: string | null;
}

interface TextRun {
  str: string;
  transform: number[];
}

export async function sniffPdf(file: File): Promise<PdfSniff> {
  const ids: PdfIdCandidate[] = [];
  let titleGuess: string | null = null;
  try {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({
      // pdf.js transfers (empties) the buffer it's given; arrayBuffer() makes a fresh one.
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
      disableFontFace: true,
    }).promise;
    try {
      const { info, metadata } = await doc.getMetadata();
      const pages: TextRun[][] = [];
      for (let i = 1; i <= Math.min(2, doc.numPages); i++) {
        const content = await (await doc.getPage(i)).getTextContent();
        pages.push(content.items.flatMap((it) => ('str' in it ? [it] : [])));
      }
      const textOf = (runs: TextRun[] = []) => runs.map((r) => r.str).join(' ');

      // arXiv stamps its id on page 1 of every paper it serves.
      const arxiv = matchArxivInText(pages.map(textOf).join(' '));
      if (arxiv) ids.push({ kind: 'arxiv', id: arxiv, trusted: true });
      // A DOI in the document's own metadata is about this document. (The
      // regex over the raw XMP also catches DOIs written as attributes.)
      const metaDoi = matchDoiInText(`${JSON.stringify(info ?? {})} ${metadata?.getRaw() ?? ''}`);
      if (metaDoi) ids.push({ kind: 'doi', id: metaDoi, trusted: true });
      const textDoi = matchDoiInText(textOf(pages[0]));
      if (textDoi && textDoi !== metaDoi) ids.push({ kind: 'doi', id: textDoi, trusted: false });

      const infoTitle = (info as { Title?: unknown } | null)?.Title;
      titleGuess =
        plausibleTitle(infoTitle) ??
        plausibleTitle(metadata?.get('dc:title')) ??
        largestText(pages[0] ?? []);
    } finally {
      await doc.destroy();
    }
  } catch {
    // Unreadable or encrypted — nothing to auto-fill beyond what the filename says.
  }

  const fromName = arxivIdFromFilename(file.name);
  if (fromName && !ids.some((c) => c.kind === 'arxiv' && c.id === fromName)) {
    ids.push({ kind: 'arxiv', id: fromName, trusted: false });
  }
  ids.sort((a, b) => Number(b.trusted) - Number(a.trusted));
  return { ids, titleGuess: titleGuess ?? titleFromFilename(file.name) };
}

/**
 * pdf.js, imported on demand in the browser. Next resolves `typeof window` at
 * build time, so the server bundle never even references pdf.js — whose browser
 * build touches DOM globals and warns when loaded in Node.
 */
async function loadPdfjs() {
  if (typeof window !== 'undefined') {
    const { pdfjs } = await import('react-pdf');
    // react-pdf's import sets a relative 'pdf.worker.mjs', which 404s on /g/<graph>/new.
    pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
    return pdfjs;
  }
  throw new Error('sniffPdf runs in the browser only');
}

/** Metadata titles are often junk ("pone.0000217 1..8", "Microsoft Word - draft3.docx"). */
function plausibleTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const title = raw.replace(/\s+/g, ' ').trim();
  if (title.split(' ').length < 3 || title.length > 300) return null;
  if (/\.(pdf|docx?|tex|dvi|ps|indd)\b/i.test(title)) return null;
  if (/^(microsoft\s+\w+\s+-|untitled)/i.test(title)) return null;
  return title;
}

/**
 * The paper title is usually the largest text on page 1. Rotated runs are
 * skipped — on arXiv PDFs the largest text is the id stamped sideways in the
 * margin. Consecutive runs of (about) the top size are joined, so a title set
 * on two lines comes back whole.
 */
function largestText(runs: TextRun[]): string | null {
  const sized = runs
    .filter((r) => r.str.trim() && Math.abs(r.transform[1]) < 0.01 && Math.abs(r.transform[2]) < 0.01)
    .filter((r) => !matchArxivInText(r.str) && !matchDoiInText(r.str))
    .map((r) => ({ str: r.str, size: Math.hypot(r.transform[2], r.transform[3]) }));
  if (sized.length === 0) return null;
  const max = Math.max(...sized.map((r) => r.size));
  const start = sized.findIndex((r) => r.size >= max - 0.5);
  const parts: string[] = [];
  for (let i = start; i < sized.length && sized[i].size >= max - 0.5; i++) parts.push(sized[i].str);
  const title = parts
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s*∗†‡§¶]+$/, '') // trailing footnote marks
    .trim()
    .slice(0, 300);
  return title.split(' ').length >= 2 ? title : null;
}

/** "smith_2020_deep-learning.pdf" → "smith 2020 deep learning". Not for arXiv-style names. */
function titleFromFilename(name: string): string | null {
  if (arxivIdFromFilename(name)) return null;
  let base = name.replace(/\.pdf$/i, '').replace(/_+/g, ' ');
  if (!base.includes(' ')) base = base.replace(/-+/g, ' ');
  base = base.replace(/\s+/g, ' ').trim();
  return /[a-z]{3}/i.test(base) ? base : null;
}
