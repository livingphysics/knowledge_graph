import Link from 'next/link';
import TopMenu from '@/components/TopMenu';
import HomeButton from '@/components/HomeButton';
import BottomDock from '@/components/BottomDock';
import NodeIcon from '@/components/NodeIcon';
import { listNodes, typeLabel, type NodeType } from '@/lib/nodes';

export const dynamic = 'force-dynamic';

const VALID: NodeType[] = ['question', 'thought', 'reference'];

const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const formatDate = (ms: number) => DATE_FMT.format(new Date(ms));

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ListPage({ searchParams }: Props) {
  const sp = await searchParams;
  const rawType = sp.type ? String(sp.type) : '';
  const type = VALID.includes(rawType as NodeType) ? (rawType as NodeType) : undefined;
  const nodes = listNodes({ type, limit: 500 });

  return (
    <>
      <HomeButton />
      <TopMenu />
      <main className="max-w-3xl mx-auto px-6 pt-16 pb-32">
        <h1 className="text-3xl font-semibold mb-6 inline-flex items-center gap-2.5">
          {type ? (
            <>
              <NodeIcon type={type} className="w-6 h-6" /> All {typeLabel(type)}s
            </>
          ) : (
            'All nodes'
          )}
        </h1>
        {nodes.length === 0 ? (
          <p className="text-neutral-400 [html.light_&]:text-neutral-600">No nodes yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {nodes.map((n) => (
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
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <BottomDock />
    </>
  );
}
