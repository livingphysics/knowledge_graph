'use client';

import { useEffect, useRef, useState } from 'react';
import { gPath } from '@/lib/gpath';

interface Suggestion {
  slug: string;
  title: string;
  type: 'question' | 'thought' | 'reference';
}

interface Active {
  query: string;
  /** Index in the textarea value where the [[ ends (i.e., where the query begins). */
  start: number;
}

interface Props {
  graph: string;
  name: string;
  defaultValue?: string;
  rows?: number;
  className?: string;
}

const TYPE_DOT: Record<Suggestion['type'], string> = {
  question: 'bg-sky-500',
  thought: 'bg-amber-500',
  reference: 'bg-emerald-500',
};

export default function MarkdownEditor({ graph, name, defaultValue, rows = 14, className }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);

  function checkCursor() {
    const ta = ref.current;
    if (!ta) return;
    const caret = ta.selectionStart;
    const text = ta.value;
    const before = text.slice(0, caret);
    const lastOpen = before.lastIndexOf('[[');
    if (lastOpen === -1) {
      setActive(null);
      return;
    }
    const between = before.slice(lastOpen + 2);
    if (between.includes(']]') || between.includes('\n')) {
      setActive(null);
      return;
    }
    setActive({ query: between, start: lastOpen + 2 });
    setSelectedIdx(0);
  }

  useEffect(() => {
    if (!active) {
      setSuggestions([]);
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      fetch(gPath(graph, `/api/suggest?q=${encodeURIComponent(active.query)}`), {
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : []))
        .then((data: Suggestion[]) => setSuggestions(data))
        .catch(() => {});
    }, 80);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [active?.query, graph]);

  function insert(slug: string) {
    const ta = ref.current;
    if (!ta || !active) return;
    const text = ta.value;
    const caret = ta.selectionStart;
    // Replace text from `active.start` (just after `[[`) up to the caret with `slug]]`.
    const before = text.slice(0, active.start);
    const after = text.slice(caret);
    // If the user's cursor is already past `]]`, don't add a duplicate.
    const closing = after.startsWith(']]') ? '' : ']]';
    const next = `${before}${slug}${closing}${after}`;
    const newCaret = (before + slug + closing).length;
    ta.value = next;
    ta.setSelectionRange(newCaret, newCaret);
    // Fire input event so any external listeners (and React's value sync) update.
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    setActive(null);
    ta.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!active || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insert(suggestions[selectedIdx].slug);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setActive(null);
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        onInput={checkCursor}
        onSelect={checkCursor}
        onClick={checkCursor}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setActive(null), 120)}
        className={
          className ??
          'px-3 py-2 rounded bg-neutral-900 [html.light_&]:bg-white border border-neutral-700 [html.light_&]:border-neutral-300 font-mono text-sm focus:outline-none focus:border-sky-500 w-full'
        }
      />
      {active && suggestions.length > 0 && (
        <div className="absolute z-30 left-0 right-0 -bottom-2 translate-y-full max-h-64 overflow-y-auto rounded-lg border border-neutral-700 [html.light_&]:border-neutral-300 bg-neutral-900/97 [html.light_&]:bg-white/97 backdrop-blur shadow-xl">
          <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-neutral-500 border-b border-neutral-800 [html.light_&]:border-neutral-200">
            [[{active.query || '…'}
          </div>
          {suggestions.map((s, i) => (
            <button
              key={s.slug}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                insert(s.slug);
              }}
              onMouseEnter={() => setSelectedIdx(i)}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 ${
                i === selectedIdx
                  ? 'bg-sky-800/40 [html.light_&]:bg-sky-100'
                  : 'hover:bg-neutral-800 [html.light_&]:hover:bg-neutral-100'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${TYPE_DOT[s.type]} shrink-0`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{s.title}</div>
                <div className="text-[11px] text-neutral-500 truncate font-mono">{s.slug}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
