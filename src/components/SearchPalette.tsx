'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

interface Suggestion {
  slug: string;
  title: string;
  type: 'question' | 'thought' | 'reference';
}

const TYPE_DOT: Record<Suggestion['type'], string> = {
  question: 'bg-sky-500',
  thought: 'bg-amber-500',
  reference: 'bg-emerald-500',
};

export default function SearchPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Suggestion[]>([]);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setResults([]);
    setSel(0);
  }, []);

  // Global open triggers: ⌘K / Ctrl+K anywhere; "/" when not already typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing =
        el?.tagName === 'INPUT' ||
        el?.tagName === 'TEXTAREA' ||
        el?.isContentEditable === true;
      if ((e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing && !open)) {
        e.preventDefault();
        setOpen(true);
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    document.addEventListener('keydown', onKey);
    window.addEventListener('kg:open-search', onOpenEvent);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('kg:open-search', onOpenEvent);
    };
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Live results (debounced). Empty query → recent nodes (the API's default).
  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      fetch(`/api/suggest?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((data: Suggestion[]) => {
          setResults(data);
          setSel(0);
        })
        .catch(() => {});
    }, 80);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [query, open]);

  function go(s: Suggestion) {
    close();
    router.push(`/n/${s.slug}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[sel]) go(results[sel]);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 bg-black/50"
      onMouseDown={close}
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <div
        className="w-full max-w-lg rounded-xl border border-neutral-700 [html.light_&]:border-neutral-300 bg-neutral-900 [html.light_&]:bg-white shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 border-b border-neutral-800 [html.light_&]:border-neutral-200">
          <Search className="w-4 h-4 text-neutral-500 shrink-0" strokeWidth={1.75} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search questions, thoughts, references…"
            className="flex-1 bg-transparent py-3 text-sm focus:outline-none"
            aria-label="Search query"
          />
          <kbd className="text-[10px] text-neutral-500 border border-neutral-700 [html.light_&]:border-neutral-300 rounded px-1 py-0.5">
            esc
          </kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 ? (
            <li className="px-3 py-4 text-sm text-neutral-500">No matches.</li>
          ) : (
            results.map((s, i) => (
              <li key={s.slug}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    go(s);
                  }}
                  onMouseEnter={() => setSel(i)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2.5 ${
                    i === sel
                      ? 'bg-sky-800/40 [html.light_&]:bg-sky-100'
                      : 'hover:bg-neutral-800 [html.light_&]:hover:bg-neutral-100'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${TYPE_DOT[s.type]}`} />
                  <span className={`flex-1 truncate text-sm ${s.type === 'reference' ? 'italic' : ''}`}>
                    {s.title}
                  </span>
                  <span className="text-[11px] text-neutral-500 font-mono truncate max-w-[40%]">
                    {s.slug}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
