'use client';

import { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Worker is copied into /public by the postinstall script.
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface Props {
  src: string;
  /** Hard cap on the viewer height (CSS value). Default ~80vh. */
  maxHeight?: string;
}

export default function PdfPreview({ src, maxHeight = '80vh' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="rounded border border-neutral-800 [html.light_&]:border-neutral-200 bg-neutral-900/40 [html.light_&]:bg-neutral-100 overflow-y-auto"
      style={{ maxHeight }}
    >
      {error ? (
        <div className="p-6 text-sm text-center text-neutral-400 [html.light_&]:text-neutral-600">
          Couldn&apos;t render PDF: {error}.{' '}
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-400 [html.light_&]:text-sky-700 hover:underline"
          >
            Open in a new tab ↗
          </a>
        </div>
      ) : (
        <Document
          file={src}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          onLoadError={(e) => setError(e.message)}
          loading={
            <div className="p-6 text-sm text-neutral-500 text-center">Loading PDF…</div>
          }
          error={
            <div className="p-6 text-sm text-red-400 text-center">Failed to load PDF.</div>
          }
        >
          {width !== null &&
            Array.from({ length: numPages }, (_, i) => (
              <div key={`page-${i + 1}`} className="flex justify-center my-2">
                <Page
                  pageNumber={i + 1}
                  width={width - 8 /* small inset for scrollbar/border */}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  loading={
                    <div className="py-10 text-sm text-neutral-500">Rendering page {i + 1}…</div>
                  }
                />
              </div>
            ))}
        </Document>
      )}
    </div>
  );
}
