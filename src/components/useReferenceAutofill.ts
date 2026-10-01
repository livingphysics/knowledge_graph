'use client';

import { useEffect, useRef, useState } from 'react';
import { gPath } from '@/lib/gpath';
import { MAX_PDF_BYTES, MAX_PDF_MB } from '@/lib/limits';
import { takePendingPdf } from '@/lib/pdf-drop';
import { sniffPdf } from '@/lib/pdf-sniff';
import {
  arxivAbsUrl,
  arxivIdWithVersion,
  arxivPdfUrl,
  doiUrl,
  extractIdentifier,
  normalizeRefInput,
  type Identifier,
  type RefMeta,
} from '@/lib/ref-ids';
import type { PdfFileInputHandle, PdfOrigin } from './PdfFileInput';

export interface AutofillNote {
  text: string;
  tone: 'busy' | 'info' | 'warn';
}

interface Options {
  graph: string;
  /** Off for questions/thoughts: every handler becomes a no-op. */
  enabled: boolean;
  title: string;
  setTitle: (title: string) => void;
  url: string;
  setUrl: (url: string) => void;
  pdfRef: React.RefObject<PdfFileInputHandle | null>;
}

type Outcome =
  | { kind: 'found'; meta: RefMeta }
  | { kind: 'none' }
  | { kind: 'error'; message: string }
  | { kind: 'aborted' };

type Job = 'url' | 'pdf' | 'title' | 'download';

const DOWNLOAD_TIMEOUT_MS = 60_000;

/**
 * Auto-fill for the New Reference form: a committed arXiv/DOI link fills the
 * title (and attaches the arXiv PDF); a chosen or dropped PDF fills the title
 * and link; a typed title offers a one-click match. Fields the user has made
 * their own are never overwritten, and nothing here ever blocks submitting.
 */
export function useReferenceAutofill({ graph, enabled, title, setTitle, url, setUrl, pdfRef }: Options) {
  const [lookupNote, setLookupNote] = useState<AutofillNote | null>(null);
  const [pdfNote, setPdfNote] = useState<AutofillNote | null>(null);
  const [suggestion, setSuggestion] = useState<RefMeta | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const latest = useRef({ title, url });
  useEffect(() => {
    latest.current = { title, url };
  }, [title, url]);
  // What we last wrote into each field — still equal means the user hasn't edited it.
  const autoTitle = useRef<string | null>(null);
  const autoUrl = useRef<string | null>(null);
  const lastUrlKey = useRef<string | null>(null);
  const lastTitleQuery = useRef<string | null>(null);
  const submitting = useRef(false);
  // In-flight work is cancelled only when superseded or on submit — never on
  // unmount, which StrictMode simulates in dev.
  const jobs = useRef<Partial<Record<Job, AbortController>>>({});

  // A PDF dropped on another page (PdfDropZone) before navigating here. Deferred
  // so StrictMode's mount → unmount → mount doesn't take it in a discarded pass.
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => {
      const file = takePendingPdf();
      if (file) pdfRef.current?.setFile(file, 'drop');
    }, 0);
    return () => clearTimeout(t);
  }, [enabled, pdfRef]);

  function start(job: Job): AbortController {
    jobs.current[job]?.abort();
    const ctrl = new AbortController();
    jobs.current[job] = ctrl;
    return ctrl;
  }

  async function lookup(params: Record<string, string>, signal: AbortSignal): Promise<Outcome> {
    try {
      const res = await fetch(gPath(graph, `/api/lookup?${new URLSearchParams(params)}`), { signal });
      // With SITE_PASSWORD set and no session cookie, the middleware redirects to /login (HTML).
      if (res.redirected || !(res.headers.get('content-type') ?? '').includes('json')) {
        return { kind: 'error', message: 'Lookup unavailable — try reloading the page' };
      }
      const data = (await res.json()) as { found?: boolean; error?: string } & RefMeta;
      if (!res.ok) return { kind: 'error', message: data.error ?? 'Lookup failed' };
      return data.found ? { kind: 'found', meta: data } : { kind: 'none' };
    } catch {
      return signal.aborted
        ? { kind: 'aborted' }
        : { kind: 'error', message: 'Lookup failed — check your connection' };
    }
  }

  function fillTitle(next: string): boolean {
    const cur = latest.current.title.trim();
    if (cur && cur !== autoTitle.current) return false;
    autoTitle.current = next;
    latest.current.title = next;
    setTitle(next);
    return true;
  }

  function fillUrl(next: string): boolean {
    const cur = latest.current.url.trim();
    if (cur && cur !== autoUrl.current) return false;
    autoUrl.current = next;
    latest.current.url = next;
    lastUrlKey.current = keyOf(extractIdentifier(next));
    setUrl(next);
    return true;
  }

  async function attachArxivPdf(id: string): Promise<void> {
    if (pdfRef.current?.getFile()) return; // never replace a PDF someone chose
    const ctrl = start('download');
    const timer = setTimeout(() => ctrl.abort('timeout'), DOWNLOAD_TIMEOUT_MS);
    setPdfBusy(true);
    setPdfNote({ tone: 'busy', text: 'Fetching the PDF from arXiv…' });
    try {
      // arxiv.org serves PDFs with Access-Control-Allow-Origin: *, so the browser fetches directly.
      const res = await fetch(arxivPdfUrl(id), { signal: ctrl.signal });
      if (!res.ok) throw new Error(`arXiv answered ${res.status}`);
      const tooBig = { tone: 'warn', text: `The arXiv PDF is over the ${MAX_PDF_MB} MB limit` } as const;
      if ((Number(res.headers.get('content-length')) || 0) > MAX_PDF_BYTES) {
        void res.body?.cancel(); // don't download what we'd reject
        setPdfNote(tooBig);
        return;
      }
      const blob = await res.blob();
      if (submitting.current || ctrl.signal.aborted) return;
      if (blob.size > MAX_PDF_BYTES) {
        setPdfNote(tooBig);
        return;
      }
      if (pdfRef.current?.getFile()) {
        setPdfNote(null); // someone attached one while we were downloading
        return;
      }
      const file = new File([blob], `${id.replace(/\//g, '_')}.pdf`, { type: 'application/pdf' });
      pdfRef.current?.setFile(file, 'arxiv');
      setPdfNote({ tone: 'info', text: `Attached ${file.name} (${mb(file.size)} MB) from arXiv` });
    } catch {
      if (!ctrl.signal.aborted || ctrl.signal.reason === 'timeout') {
        setPdfNote({ tone: 'warn', text: 'Couldn’t download the arXiv PDF — attach it by hand' });
      }
    } finally {
      clearTimeout(timer);
      if (jobs.current.download === ctrl) setPdfBusy(false);
    }
  }

  /**
   * Link field committed (paste, blur or Enter). Returns true when it changed
   * the field or started a lookup — Enter then shouldn't submit yet.
   */
  function commitUrl(raw: string): boolean {
    if (!enabled || submitting.current) return false;
    const next = normalizeRefInput(raw);
    const changed = next !== raw;
    if (changed) {
      latest.current.url = next;
      setUrl(next);
    }
    const id = extractIdentifier(next);
    const key = keyOf(id);
    if (!id) lastUrlKey.current = null;
    if (!id || key === lastUrlKey.current) return changed;
    lastUrlKey.current = key;
    jobs.current.title?.abort(); // a real link beats a title search
    setSuggestion(null);
    if (id.kind === 'arxiv') void attachArxivPdf(arxivIdWithVersion(next) ?? id.id);

    void (async () => {
      const ctrl = start('url');
      setLookupNote({ tone: 'busy', text: `Looking up ${label(id)}…` });
      const out = await lookup({ url: next }, ctrl.signal);
      if (ctrl.signal.aborted || submitting.current) return;
      if (out.kind === 'found') {
        setLookupNote({
          tone: 'info',
          text: fillTitle(out.meta.title)
            ? `Title filled in from ${label(id)}`
            : `Found “${out.meta.title}” — kept your title`,
        });
      } else if (out.kind === 'none') {
        setLookupNote({ tone: 'warn', text: `Couldn’t find details for ${label(id)}` });
      } else if (out.kind === 'error') {
        setLookupNote({ tone: 'warn', text: out.message });
      }
    })();
    return true;
  }

  /** A PDF was attached (picked or dropped): read it, then fill in the title and link. */
  async function onFile(file: File | null, origin: PdfOrigin): Promise<void> {
    if (!enabled || submitting.current || origin === 'arxiv') return; // arXiv's PDF: already looked up
    jobs.current.pdf?.abort();
    if (!file) {
      // Removed or rejected: drop notes about it and any half-finished read.
      setPdfNote(null);
      setLookupNote(clearBusy);
      return;
    }
    jobs.current.title?.abort(); // the PDF itself beats a title search
    setSuggestion(null);
    setPdfNote(null);
    const ctrl = start('pdf');
    setLookupNote({ tone: 'busy', text: 'Reading the PDF…' });
    const sniff = await sniffPdf(file);
    if (ctrl.signal.aborted || submitting.current) return;

    let failure: string | null = null;
    for (const cand of sniff.ids.slice(0, 2)) {
      const id: Identifier = { kind: cand.kind, id: cand.id };
      setLookupNote({ tone: 'busy', text: `Found ${label(id)} in the PDF — looking it up…` });
      const params: Record<string, string> = { [cand.kind]: cand.id };
      if (!cand.trusted && sniff.titleGuess) params.verify = sniff.titleGuess;
      const out = await lookup(params, ctrl.signal);
      if (ctrl.signal.aborted || submitting.current) return;
      if (out.kind === 'found') {
        const t = fillTitle(out.meta.title);
        const u = fillUrl(out.meta.url);
        setLookupNote({ tone: 'info', text: filledText(t, u, label(id)) });
        return;
      }
      if (cand.trusted) {
        // The id is certainly this paper's, even though its details didn't load.
        const u = fillUrl(cand.kind === 'arxiv' ? arxivAbsUrl(cand.id) : doiUrl(cand.id));
        const t = sniff.titleGuess ? fillTitle(sniff.titleGuess) : false;
        const done = [u && 'link filled in', t && 'title taken from the PDF'].filter(Boolean);
        setLookupNote({
          tone: 'warn',
          text: `Couldn’t load details for ${label(id)}${done.length ? ` — ${done.join(', ')}` : ''}`,
        });
        return;
      }
      if (out.kind === 'error') {
        failure = out.message;
        break;
      }
    }

    // No usable identifier: take the PDF's own title, and offer a search match for the link.
    const guess = sniff.titleGuess;
    const t = guess ? fillTitle(guess) : false;
    const tookTitle: AutofillNote | null = t ? { tone: 'info', text: 'Title taken from the PDF' } : null;
    if (failure || !guess || guess.split(/\s+/).length < 4) {
      setLookupNote(failure ? { tone: 'warn', text: failure } : tookTitle);
      return;
    }
    setLookupNote({ tone: 'busy', text: 'Searching for this paper…' });
    const out = await lookup({ title: guess }, ctrl.signal);
    if (ctrl.signal.aborted || submitting.current) return;
    if (out.kind === 'found') setSuggestion(out.meta);
    setLookupNote(out.kind === 'error' ? { tone: 'warn', text: out.message } : tookTitle);
  }

  /** Title field blurred: if it's a typed title with no link or PDF yet, look for the paper. */
  function commitTitle(value: string): void {
    if (!enabled || submitting.current) return;
    const typed = value.trim();
    if (!typed || typed === autoTitle.current || typed === lastTitleQuery.current) return;
    if (latest.current.url.trim() || pdfRef.current?.getFile()) return;
    if (typed.split(/\s+/).length < 4) return; // too short to match reliably
    lastTitleQuery.current = typed;

    void (async () => {
      const ctrl = start('title');
      setLookupNote({ tone: 'busy', text: 'Searching for this title…' });
      const out = await lookup({ title: typed }, ctrl.signal);
      if (ctrl.signal.aborted || submitting.current) return;
      if (latest.current.url.trim() || pdfRef.current?.getFile()) {
        setLookupNote(null); // a link or PDF arrived meanwhile — that wins
        return;
      }
      if (out.kind === 'found') {
        setSuggestion(out.meta);
        setLookupNote(null);
      } else if (out.kind === 'none') {
        setLookupNote({ tone: 'info', text: 'No matching paper found' });
      } else if (out.kind === 'error') {
        setLookupNote({ tone: 'warn', text: out.message });
      }
    })();
  }

  /** "Use" on the suggestion: an explicit choice, so it replaces both fields. */
  function applySuggestion(): void {
    const s = suggestion;
    if (!s) return;
    setSuggestion(null);
    autoTitle.current = s.title;
    latest.current.title = s.title;
    setTitle(s.title);
    autoUrl.current = s.url;
    latest.current.url = s.url;
    lastUrlKey.current = keyOf(extractIdentifier(s.url));
    setUrl(s.url);
    setLookupNote({ tone: 'info', text: 'Filled in the title and link' });
    if (s.arxivId) void attachArxivPdf(s.arxivId);
  }

  /** From the form's submit handler: freeze auto-fill so nothing changes under the duplicate check. */
  function beginSubmit(): void {
    submitting.current = true;
    for (const ctrl of Object.values(jobs.current)) ctrl?.abort();
    setLookupNote(clearBusy);
  }

  /** The submit was called off (duplicate-title confirm declined). */
  function cancelSubmit(): void {
    submitting.current = false;
  }

  return {
    notes: [lookupNote, pdfNote].filter((n): n is AutofillNote => n !== null),
    suggestion,
    pdfBusy,
    commitUrl,
    commitTitle,
    onFile,
    applySuggestion,
    dismissSuggestion: () => setSuggestion(null),
    beginSubmit,
    cancelSubmit,
  };
}

function clearBusy(note: AutofillNote | null): AutofillNote | null {
  return note?.tone === 'busy' ? null : note;
}

function keyOf(id: Identifier | null): string | null {
  return id ? `${id.kind}:${id.id}` : null;
}

function label(id: Identifier): string {
  return id.kind === 'arxiv' ? `arXiv:${id.id}` : `DOI ${id.id}`;
}

function filledText(title: boolean, link: boolean, source: string): string {
  if (title && link) return `Filled in the title and link from ${source}`;
  if (title) return `Filled in the title from ${source}`;
  if (link) return `Filled in the link from ${source}`;
  return `Found ${source} — kept what you typed`;
}

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}
