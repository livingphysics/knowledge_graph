import fs from 'node:fs';
import { paths } from './db';
import { matchArxivInText } from './ref-ids';

/**
 * Extracts an arXiv id from the watermark / running header of an uploaded PDF.
 * Returns the bare id (no version, no "arXiv:" prefix), or null if not found.
 *
 * Scans only the first 2 pages — arXiv stamps the id in the left margin of
 * page 1 (and a copy survives in the cross-reference dictionary of most files).
 */
export async function extractArxivIdFromPdf(graph: string, sha256: string): Promise<string | null> {
  let buf: Buffer;
  try {
    buf = fs.readFileSync(paths.uploadFile(graph, sha256));
  } catch {
    return null;
  }

  try {
    // Dynamic import: pdfjs-dist legacy build is the Node-compatible entry.
    // Loading it eagerly at top-level breaks SSR for unrelated pages.
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buf),
      // Don't try to fetch fonts from network; we only need text positions.
      useWorkerFetch: false,
      isEvalSupported: false,
      disableFontFace: true,
    });
    const doc = await loadingTask.promise;
    const limit = Math.min(2, doc.numPages);
    for (let i = 1; i <= limit; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((it: any) => ('str' in it ? it.str : ''))
        .join(' ');
      const id = matchArxivInText(text);
      if (id) {
        await doc.cleanup();
        await doc.destroy();
        return id;
      }
    }
    await doc.cleanup();
    await doc.destroy();
  } catch {
    return null;
  }
  return null;
}
