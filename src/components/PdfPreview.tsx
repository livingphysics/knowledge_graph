'use client';

import dynamic from 'next/dynamic';

interface Props {
  src: string;
  maxHeight?: string;
}

// Load the react-pdf-backed impl client-side only. pdfjs-dist touches browser
// globals during module init, which throws on the server.
const Impl = dynamic(() => import('./PdfPreviewImpl'), {
  ssr: false,
  loading: () => (
    <div className="rounded border border-neutral-800 [html.light_&]:border-neutral-200 bg-neutral-900/40 [html.light_&]:bg-neutral-100 p-6 text-sm text-neutral-500 text-center">
      Loading PDF viewer…
    </div>
  ),
});

export default function PdfPreview(props: Props) {
  return <Impl {...props} />;
}
