import Link from 'next/link';
import { Pin } from 'lucide-react';
import NodeIcon from './NodeIcon';
import type { NodeWithPreview } from '@/lib/node-types';
import type { ViewMode } from './ViewToggle';

// Pure presentational — no server-only imports — so this works inside both the
// server home page and the client-side RecentFeed.

const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const formatDate = (ms: number) => DATE_FMT.format(new Date(ms));

export default function NodeList({
  items,
  view,
}: {
  items: NodeWithPreview[];
  view: ViewMode;
}) {
  return view === 'cards' ? <CardsList items={items} /> : <CompactList items={items} />;
}

function CardsList({ items }: { items: NodeWithPreview[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((n) => (
        <li key={n.slug}>
          <Link
            href={`/n/${n.slug}`}
            className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-neutral-800 [html.light_&]:border-neutral-200 bg-neutral-900/40 [html.light_&]:bg-neutral-100/60 hover:bg-neutral-800/60 [html.light_&]:hover:bg-neutral-200/60"
          >
            <NodeIcon
              type={n.type}
              className="w-5 h-5 mt-0.5 text-neutral-400 [html.light_&]:text-neutral-600 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div
                  className={`font-medium line-clamp-2 inline-flex items-center gap-1.5 ${
                    n.type === 'reference' ? 'italic' : ''
                  }`}
                >
                  {n.pinned_at && (
                    <Pin
                      className="w-3 h-3 text-amber-500 shrink-0 not-italic"
                      strokeWidth={2}
                      aria-label="pinned"
                    />
                  )}
                  {n.title}
                </div>
                <div className="text-[11px] text-neutral-500 whitespace-nowrap pt-0.5">
                  {formatDate(n.created_at)}
                </div>
              </div>
              {n.preview && (
                <p className="mt-1 text-sm text-neutral-400 [html.light_&]:text-neutral-600 line-clamp-3">
                  {n.preview}
                </p>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CompactList({ items }: { items: NodeWithPreview[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((n) => (
        <li key={n.slug}>
          <Link
            href={`/n/${n.slug}`}
            className="flex items-center gap-2.5 px-3 py-2 rounded hover:bg-neutral-800 [html.light_&]:hover:bg-neutral-200"
          >
            <NodeIcon
              type={n.type}
              className="w-4 h-4 text-neutral-400 [html.light_&]:text-neutral-600 shrink-0"
            />
            <span className={`truncate ${n.type === 'reference' ? 'italic' : ''}`}>{n.title}</span>
            {n.pinned_at && (
              <Pin
                className="w-3 h-3 text-amber-500 shrink-0 ml-auto"
                strokeWidth={2}
                aria-label="pinned"
              />
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
