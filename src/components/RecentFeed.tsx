'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import NodeList from './NodeList';
import type { NodeWithPreview } from '@/lib/node-types';
import type { ViewMode } from './ViewToggle';
import { gPath } from '@/lib/gpath';

const PAGE_SIZE = 20;

interface Props {
  graph: string;
  initialItems: NodeWithPreview[];
  view: ViewMode;
  /** Whether the server's first page already hit the end. */
  initialHasMore: boolean;
}

export default function RecentFeed({ graph, initialItems, view, initialHasMore }: Props) {
  const [items, setItems] = useState(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set(initialItems.map((n) => n.slug)));

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const res = await fetch(
        gPath(graph, `/api/nodes?pinned=false&limit=${PAGE_SIZE}&offset=${items.length}`)
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items: NodeWithPreview[]; hasMore: boolean };
      // Dedupe in case a node was added/reordered between page loads.
      const fresh = data.items.filter((n) => !seen.current.has(n.slug));
      fresh.forEach((n) => seen.current.add(n.slug));
      setItems((prev) => [...prev, ...fresh]);
      setHasMore(data.hasMore);
    } catch {
      // Leave hasMore true so the user can retry by clicking the button.
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, items.length, graph]);

  // Auto-load when the sentinel scrolls into view (pull-up infinite scroll).
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '400px' } // start fetching a bit before it's actually visible
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore, hasMore]);

  return (
    <>
      <NodeList graph={graph} items={items} view={view} />
      {hasMore && (
        <div ref={sentinelRef} className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-neutral-700 [html.light_&]:border-neutral-300 hover:bg-neutral-800 [html.light_&]:hover:bg-neutral-200 inline-flex items-center gap-2 text-sm text-neutral-300 [html.light_&]:text-neutral-700 disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
                Loading…
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" strokeWidth={1.75} />
                Show more
              </>
            )}
          </button>
        </div>
      )}
    </>
  );
}
