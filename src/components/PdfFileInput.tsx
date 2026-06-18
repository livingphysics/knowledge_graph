'use client';

import { useRef, useState } from 'react';
import { MAX_PDF_BYTES, MAX_PDF_MB } from '@/lib/limits';

interface Props {
  name?: string;
  className?: string;
}

/**
 * PDF file input that checks the selected file's size in the browser. If it's
 * over the limit it (a) shows a native validation popup on the field, (b) blocks
 * the form from submitting via setCustomValidity, and (c) shows a persistent
 * inline message — so an oversized upload never reaches the server / error page.
 */
export default function PdfFileInput({ name = 'pdf', className }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function onChange() {
    const el = ref.current;
    if (!el) return;
    const file = el.files?.[0];
    if (file && file.size > MAX_PDF_BYTES) {
      const msg = `That PDF is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_PDF_MB} MB.`;
      setError(msg);
      el.setCustomValidity(msg); // blocks submit + drives the native bubble
      el.reportValidity(); // pop the bubble immediately on selection
    } else {
      setError(null);
      el.setCustomValidity('');
    }
  }

  return (
    <>
      <input
        ref={ref}
        type="file"
        name={name}
        accept="application/pdf,.pdf"
        onChange={onChange}
        className={
          className ??
          'px-3 py-2 rounded bg-neutral-900 [html.light_&]:bg-white border border-neutral-700 [html.light_&]:border-neutral-300 text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-sky-700 file:text-white hover:file:bg-sky-600 file:cursor-pointer'
        }
      />
      {error && (
        <span className="text-sm text-red-400 [html.light_&]:text-red-600">{error}</span>
      )}
    </>
  );
}
