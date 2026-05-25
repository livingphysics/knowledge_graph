import Link from 'next/link';
import TopMenu from '@/components/TopMenu';
import BottomDock from '@/components/BottomDock';
import NodeIcon from '@/components/NodeIcon';
import { listNodes, typeLabel, type NodeType } from '@/lib/nodes';

export const dynamic = 'force-dynamic';

const VALID: NodeType[] = ['question', 'thought', 'reference'];

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
          <ul className="flex flex-col gap-1">
            {nodes.map((n) => (
              <li key={n.slug}>
                <Link
                  href={`/n/${n.slug}`}
                  className="flex items-center gap-2.5 px-3 py-2 rounded hover:bg-neutral-800 [html.light_&]:hover:bg-neutral-200"
                >
                  <NodeIcon type={n.type} className="w-4 h-4 text-neutral-400 [html.light_&]:text-neutral-600 shrink-0" />
                  <span className="truncate">{n.title}</span>
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
