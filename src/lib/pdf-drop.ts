// Client-side hand-off for PDFs dropped anywhere on a graph page (PdfDropZone).
// Module-level state survives client-side navigation, which is how a PDF dropped
// on, say, the graph home reaches the New Reference modal that opens next.

type DropTarget = (file: File) => void;

const targets: DropTarget[] = [];
let pending: { file: File; at: number } | null = null;
// A stash that nobody claimed (e.g. the navigation failed) mustn't resurface in
// some later, unrelated New Reference form.
const PENDING_TTL_MS = 15_000;

/** Route dropped PDFs to `fn` while it's registered (latest wins). Returns the unregister function. */
export function registerPdfDropTarget(fn: DropTarget): () => void {
  targets.push(fn);
  return () => {
    const i = targets.lastIndexOf(fn);
    if (i !== -1) targets.splice(i, 1);
  };
}

export function activePdfDropTarget(): DropTarget | null {
  return targets[targets.length - 1] ?? null;
}

export function stashPendingPdf(file: File): void {
  pending = { file, at: Date.now() };
}

/** The PDF dropped just before navigating here, if any. Single-use. */
export function takePendingPdf(): File | null {
  const p = pending;
  pending = null;
  return p && Date.now() - p.at < PENDING_TTL_MS ? p.file : null;
}

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}
