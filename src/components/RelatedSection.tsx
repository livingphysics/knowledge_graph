import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import NodeIcon from './NodeIcon';
import {
  getRelatedByType,
  typeLabel,
  type NodeType,
  type RelatedItem,
} from '@/lib/nodes';

const ORDER: NodeType[] = ['question', 'thought', 'reference'];

const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const formatDate = (ms: number) => DATE_FMT.format(new Date(ms));

const CARD_CHROME =
  'rounded-lg border border-neutral-800 [html.light_&]:border-neutral-200 overflow-hidden bg-neutral-900/40 [html.light_&]:bg-neutral-100/60';

export default function RelatedSection({ slug }: { slug: string }) {
  const groups = getRelatedByType(slug);
  const types = ORDER.filter((t) => groups[t].length > 0);
  if (types.length === 0) return null;

  return (
    <section className="mt-12 flex flex-col gap-3">
      {types.map((t) => (
        <RelatedCard key={t} type={t} items={groups[t]} />
      ))}
    </section>
  );
}

function RelatedCard({ type, items }: { type: NodeType; items: RelatedItem[] }) {
  const top = items[0];
  const rest = items.slice(1);

  if (rest.length === 0) {
    return (
      <Link
        href={`/n/${top.slug}`}
        className={`${CARD_CHROME} block px-4 py-3 hover:bg-neutral-800/60 [html.light_&]:hover:bg-neutral-200/60`}
      >
        <Header type={type} item={top} />
      </Link>
    );
  }

  return (
    <details className={`group ${CARD_CHROME}`}>
      <summary className="list-none cursor-pointer px-4 py-3 hover:bg-neutral-800/60 [html.light_&]:hover:bg-neutral-200/60">
        <Header type={type} item={top} expandable />
      </summary>
      <ul className="border-t border-neutral-800 [html.light_&]:border-neutral-200 divide-y divide-neutral-800 [html.light_&]:divide-neutral-200">
        {rest.map((n) => (
          <li key={n.slug}>
            <Link
              href={`/n/${n.slug}`}
              className="block px-4 py-3 hover:bg-neutral-800/60 [html.light_&]:hover:bg-neutral-100"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="font-medium line-clamp-2">{n.title}</div>
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
    </details>
  );
}

function Header({
  type,
  item,
  expandable = false,
}: {
  type: NodeType;
  item: RelatedItem;
  expandable?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <NodeIcon type={type} className="w-5 h-5 mt-0.5 text-neutral-400 [html.light_&]:text-neutral-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500">
            Most recent {typeLabel(type).toLowerCase()}
          </div>
          <div className="text-[11px] text-neutral-500 whitespace-nowrap">
            {formatDate(item.created_at)}
          </div>
        </div>
        <div className="font-medium line-clamp-2">{item.title}</div>
        {item.preview && (
          <p className="mt-1 text-sm text-neutral-400 [html.light_&]:text-neutral-600 line-clamp-3">
            {item.preview}
          </p>
        )}
      </div>
      {expandable && (
        <ChevronDown
          className="w-4 h-4 text-neutral-500 transition group-open:rotate-180 mt-1 shrink-0"
          strokeWidth={2}
        />
      )}
    </div>
  );
}
