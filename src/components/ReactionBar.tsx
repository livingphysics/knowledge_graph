'use client';

import { useState, useTransition } from 'react';

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
  const [, startTransition] = useTransition();

  function toggle(emoji: string) {
    // Optimistic: bump or undo locally.
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
        setReactions(prev); // rollback
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-1.5 mt-4">
      {reactions.map((r) => (
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
          {r.count > 0 && (
            <span className="text-xs text-neutral-400 [html.light_&]:text-neutral-600">
              {r.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
