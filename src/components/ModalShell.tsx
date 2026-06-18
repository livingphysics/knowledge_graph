'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

/**
 * Overlay card used by intercepted routes (e.g. /new opening as a popup).
 * Backdrop click, the ✕ button, and Escape all close it via history-back,
 * which returns to the page the user was on.
 */
export default function ModalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') router.back();
    }
    document.addEventListener('keydown', onKey);
    // Lock background scroll while the modal is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [router]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 overflow-y-auto"
      onMouseDown={() => router.back()}
      role="dialog"
      aria-modal="true"
    >
      <div className="min-h-full flex items-start justify-center p-4 pt-[6vh] pb-10">
        <div
          className="relative w-full max-w-2xl rounded-xl border border-neutral-700 [html.light_&]:border-neutral-300 bg-neutral-900 [html.light_&]:bg-white shadow-2xl p-6"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Close"
            className="absolute top-3 right-3 p-1.5 rounded text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 [html.light_&]:hover:text-neutral-800 [html.light_&]:hover:bg-neutral-200"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}
