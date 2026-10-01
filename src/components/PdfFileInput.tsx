'use client';

import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { MAX_PDF_BYTES, MAX_PDF_MB } from '@/lib/limits';
import { registerPdfDropTarget } from '@/lib/pdf-drop';

/** Where an attached PDF came from. */
export type PdfOrigin = 'user' | 'drop' | 'arxiv';

export interface PdfFileInputHandle {
  /** Attach `file` (null clears) exactly as if it had been picked: validates, then calls onFile. */
  setFile(file: File | null, origin: PdfOrigin): void;
  /** The attached file if it passed validation, else null. */
  getFile(): File | null;
}

interface Props {
  name?: string;
  className?: string;
  ref?: React.Ref<PdfFileInputHandle>;
  /** Called once an attached file passes validation — or with null when it's cleared or rejected. */
  onFile?: (file: File | null, origin: PdfOrigin) => void;
  /** While mounted, receive PDFs dropped anywhere on the page (see PdfDropZone). */
  acceptDrops?: boolean;
}

/**
 * PDF file input that checks the selected file in the browser. If it's over the
 * size limit or not actually a PDF it (a) shows a native validation popup on the
 * field, (b) blocks the form from submitting via setCustomValidity, and (c) shows
 * a persistent inline message — so a bad upload never reaches the server / error
 * page. Files can also be attached programmatically (drops, arXiv downloads).
 */
export default function PdfFileInput({ name = 'pdf', className, ref, onFile, acceptDrops = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasFile, setHasFile] = useState(false);
  const validFile = useRef<File | null>(null);
  const seq = useRef(0); // lets a newer pick supersede a slower validation
  const onFileRef = useRef(onFile);
  useEffect(() => {
    onFileRef.current = onFile;
  });

  async function accept(file: File | null, origin: PdfOrigin) {
    const el = inputRef.current;
    if (!el) return;
    const n = ++seq.current;
    validFile.current = null;
    setHasFile(!!file);
    const msg = file ? await problemWith(file) : null;
    if (n !== seq.current) return;
    setError(msg);
    el.setCustomValidity(msg ?? ''); // blocks submit + drives the native bubble
    if (msg) el.reportValidity(); // pop the bubble immediately on selection
    validFile.current = msg ? null : file;
    onFileRef.current?.(validFile.current, origin);
  }

  function attach(file: File | null, origin: PdfOrigin) {
    const el = inputRef.current;
    if (!el) return;
    const dt = new DataTransfer();
    if (file) dt.items.add(file);
    el.files = dt.files;
    void accept(file, origin);
  }

  useImperativeHandle(ref, () => ({ setFile: attach, getFile: () => validFile.current }));

  useEffect(() => {
    if (!acceptDrops) return;
    return registerPdfDropTarget((file) => attach(file, 'drop'));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- attach only touches refs
  }, [acceptDrops]);

  return (
    <>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          name={name}
          accept="application/pdf,.pdf"
          onChange={(e) => void accept(e.currentTarget.files?.[0] ?? null, 'user')}
          className={`flex-1 min-w-0 ${
            className ??
            'px-3 py-2 rounded bg-neutral-900 [html.light_&]:bg-white border border-neutral-700 [html.light_&]:border-neutral-300 text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-sky-700 file:text-white hover:file:bg-sky-600 file:cursor-pointer'
          }`}
        />
        {hasFile && (
          <button
            type="button"
            onClick={() => attach(null, 'user')}
            className="px-2 py-1 rounded text-sm text-neutral-400 [html.light_&]:text-neutral-600 hover:bg-neutral-800 [html.light_&]:hover:bg-neutral-200"
          >
            Remove
          </button>
        )}
      </div>
      {error && (
        <span className="text-sm text-red-400 [html.light_&]:text-red-600">{error}</span>
      )}
    </>
  );
}

async function problemWith(file: File): Promise<string | null> {
  if (file.size > MAX_PDF_BYTES) {
    return `That PDF is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_PDF_MB} MB.`;
  }
  // Same check the server makes (uploads.ts) — a renamed non-PDF would
  // otherwise only fail after the whole form was submitted.
  const head = await file
    .slice(0, 4)
    .text()
    .catch(() => '');
  if (head !== '%PDF') return `“${file.name}” isn’t a PDF.`;
  return null;
}
