'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { SmilePlus } from 'lucide-react';

interface ReactionCount {
  emoji: string;
  count: number;
  mine: boolean;
}

interface Props {
  slug: string;
  initial: ReactionCount[];
}

export default function ReactionBar({ slug, initial }: Props) {
  const [reactions, setReactions] = useState(initial);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setPickerOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPickerOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  function toggle(emoji: string) {
    const prev = reactions;
    setReactions((rs) =>
      rs.map((r) =>
        r.emoji === emoji
          ? { ...r, count: r.mine ? r.count - 1 : r.count + 1, mine: !r.mine }
          : r
      )
    );
    startTransition(async () => {
      try {
        const res = await fetch('/api/reactions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slug, emoji }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { reactions: ReactionCount[] };
        if (data.reactions) setReactions(data.reactions);
      } catch {
        setReactions(prev);
      }
    });
  }

  function pick(emoji: string) {
    toggle(emoji);
    setPickerOpen(false);
  }

  const visible = reactions.filter((r) => r.count > 0);

  return (
    <div ref={wrapRef} className="relative mt-4 flex flex-wrap gap-1.5">
      {visible.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => toggle(r.emoji)}
          aria-pressed={r.mine}
          aria-label={`React with ${r.emoji}`}
          className={`px-2.5 py-1 rounded-full border text-sm inline-flex items-center gap-1.5 transition ${
            r.mine
              ? 'bg-sky-900/40 border-sky-600 [html.light_&]:bg-sky-100 [html.light_&]:border-sky-400'
              : 'bg-neutral-900/60 border-neutral-700 hover:bg-neutral-800 [html.light_&]:bg-white [html.light_&]:border-neutral-300 [html.light_&]:hover:bg-neutral-100'
          }`}
        >
          <span className="leading-none">{r.emoji}</span>
          <span className="text-xs text-neutral-400 [html.light_&]:text-neutral-600">
            {r.count}
          </span>
        </button>
      ))}

      <button
        type="button"
        onClick={() => setPickerOpen((o) => !o)}
        aria-label="Add reaction"
        aria-expanded={pickerOpen}
        className="px-2 py-1 rounded-full border border-dashed border-neutral-700 hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300 [html.light_&]:border-neutral-300 [html.light_&]:hover:bg-neutral-100 [html.light_&]:hover:text-neutral-700 inline-flex items-center"
      >
        <SmilePlus className="w-4 h-4" strokeWidth={1.75} />
      </button>

      {pickerOpen && (
        <div
          role="menu"
          className="absolute bottom-full mb-2 left-0 z-30 px-1.5 py-1.5 rounded-lg bg-neutral-900/97 [html.light_&]:bg-white/97 border border-neutral-700 [html.light_&]:border-neutral-300 backdrop-blur shadow-xl flex gap-0.5"
        >
          {reactions.map((r) => (
            <button
              key={r.emoji}
              type="button"
              onClick={() => pick(r.emoji)}
              aria-label={`React with ${r.emoji}`}
              className={`w-9 h-9 rounded text-lg leading-none flex items-center justify-center transition hover:bg-neutral-800 [html.light_&]:hover:bg-neutral-100 ${
                r.mine
                  ? 'bg-sky-900/40 ring-1 ring-sky-600 [html.light_&]:bg-sky-100 [html.light_&]:ring-sky-400'
                  : ''
              }`}
            >
              {r.emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
