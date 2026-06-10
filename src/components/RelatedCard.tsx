'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import NodeIcon from './NodeIcon';
import { typeLabel, type NodeType, type RelatedItem } from '@/lib/node-types';
import { gPath } from '@/lib/gpath';

const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const formatDate = (ms: number) => DATE_FMT.format(new Date(ms));

const CARD_CHROME =
  'rounded-lg border border-neutral-800 [html.light_&]:border-neutral-200 overflow-hidden bg-neutral-900/40 [html.light_&]:bg-neutral-100/60';

interface Props {
  graph: string;
  type: NodeType;
  items: RelatedItem[];
}

export default function RelatedCard({ graph, type, items }: Props) {
  const top = items[0];
  const rest = items.slice(1);
  const [open, setOpen] = useState(false);

  // Only one related item → no need to expand; whole card is just a link.
  if (rest.length === 0) {
    return (
      <Link
        href={gPath(graph, `/n/${top.slug}`)}
        className={`${CARD_CHROME} block px-4 py-3 hover:bg-neutral-800/60 [html.light_&]:hover:bg-neutral-200/60`}
      >
        <Header type={type} item={top} />
      </Link>
    );
  }

  // Multi-item → header is a Link, chevron is a separate toggle button.
  return (
    <div className={CARD_CHROME}>
      <div className="flex items-stretch">
        <Link
          href={gPath(graph, `/n/${top.slug}`)}
          className="flex-1 min-w-0 px-4 py-3 hover:bg-neutral-800/60 [html.light_&]:hover:bg-neutral-200/60"
        >
          <Header type={type} item={top} />
        </Link>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? 'Collapse related list' : 'Expand related list'}
          className="px-3 flex items-center text-neutral-500 hover:bg-neutral-800/60 [html.light_&]:hover:bg-neutral-200/60"
        >
          <ChevronDown
            className={`w-4 h-4 transition ${open ? 'rotate-180' : ''}`}
            strokeWidth={2}
          />
        </button>
      </div>
      {open && (
        <ul className="border-t border-neutral-800 [html.light_&]:border-neutral-200 divide-y divide-neutral-800 [html.light_&]:divide-neutral-200">
          {rest.map((n) => (
            <li key={n.slug}>
              <Link
                href={gPath(graph, `/n/${n.slug}`)}
                className="block px-4 py-3 hover:bg-neutral-800/60 [html.light_&]:hover:bg-neutral-100"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className={`font-medium line-clamp-2 ${n.type === 'reference' ? 'italic' : ''}`}>
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
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Header({ type, item }: { type: NodeType; item: RelatedItem }) {
  return (
    <div className="flex items-start gap-3">
      <NodeIcon
        type={type}
        className="w-5 h-5 mt-0.5 text-neutral-400 [html.light_&]:text-neutral-600 shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500">
            Most recent {typeLabel(type).toLowerCase()}
          </div>
          <div className="text-[11px] text-neutral-500 whitespace-nowrap">
            {formatDate(item.created_at)}
          </div>
        </div>
        <div className={`font-medium line-clamp-2 ${type === 'reference' ? 'italic' : ''}`}>
          {item.title}
        </div>
        {item.preview && (
          <p className="mt-1 text-sm text-neutral-400 [html.light_&]:text-neutral-600 line-clamp-3">
            {item.preview}
          </p>
        )}
      </div>
    </div>
  );
}
