'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { FileUp } from 'lucide-react';
import { gPath } from '@/lib/gpath';
import { activePdfDropTarget, isPdfFile, stashPendingPdf } from '@/lib/pdf-drop';

// Pages with a form whose unsaved text a drop must never navigate away from.
const FORM_ROUTE_RE = /\/(new|edit)\/?$/;

/**
 * Drop a PDF anywhere on a graph page. If a PDF field is on screen (New
 * Reference, editing a reference) it gets the file; otherwise this opens New
 * Reference with the PDF attached — linked from the current note when on one.
 */
export default function PdfDropZone({ graph }: { graph: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);
  const [overlay, setOverlay] = useState<'attach' | 'create' | null>(null);

  useEffect(() => {
    let internalDrag = false; // dragging something from this page (Chrome reports Files for <img>)
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    const isFileDrag = (e: DragEvent) =>
      !internalDrag && !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
    const mode = () =>
      activePdfDropTarget() ? 'attach' : FORM_ROUTE_RE.test(pathRef.current) ? null : 'create';

    function onDragStart() {
      internalDrag = true;
    }
    function onDragEnd() {
      internalDrag = false;
    }
    function onDragOver(e: DragEvent) {
      if (!isFileDrag(e)) return;
      // Always claim external file drags: otherwise the browser opens the PDF
      // itself, throwing away whatever form is on screen.
      e.preventDefault();
      const m = mode();
      e.dataTransfer!.dropEffect = m ? 'copy' : 'none';
      setOverlay(m);
      // Safari never reports where a dragleave went, so hide on a timer that
      // each dragover (fired continuously while over the page) re-arms.
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setOverlay(null), 150);
    }
    function onDrop(e: DragEvent) {
      if (!isFileDrag(e)) {
        internalDrag = false;
        return;
      }
      e.preventDefault();
      clearTimeout(hideTimer);
      setOverlay(null);
      const file = Array.from(e.dataTransfer!.files).find(isPdfFile);
      if (!file) return;
      const target = activePdfDropTarget();
      if (target) {
        target(file);
        return;
      }
      if (FORM_ROUTE_RE.test(pathRef.current)) return;
      stashPendingPdf(file);
      const from = pathRef.current.match(/\/n\/([^/]+)\/?$/)?.[1];
      router.push(
        gPath(graph, `/new?type=reference${from ? `&from=${encodeURIComponent(from)}` : ''}`)
      );
    }

    window.addEventListener('dragstart', onDragStart);
    window.addEventListener('dragend', onDragEnd);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragstart', onDragStart);
      window.removeEventListener('dragend', onDragEnd);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
      clearTimeout(hideTimer);
    };
  }, [graph, router]);

  if (!overlay) return null;
  return (
    <div className="fixed inset-0 z-[60] pointer-events-none flex items-center justify-center bg-black/50 p-6">
      <div className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-sky-500 bg-neutral-900/95 [html.light_&]:bg-white/95 px-8 py-6 text-lg shadow-2xl">
        <FileUp className="w-6 h-6 text-sky-400 [html.light_&]:text-sky-700" strokeWidth={1.75} />
        {overlay === 'attach' ? 'Drop to attach this PDF' : 'Drop a PDF to add it as a reference'}
      </div>
    </div>
  );
}
