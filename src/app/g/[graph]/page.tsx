import Link from 'next/link';
import { Pin, Network } from 'lucide-react';
import TopMenu from '@/components/TopMenu';
import BottomDock from '@/components/BottomDock';
import NodeIcon from '@/components/NodeIcon';
import NodeList from '@/components/NodeList';
import RecentFeed from '@/components/RecentFeed';
import ViewToggle, { type ViewMode } from '@/components/ViewToggle';
import GroupToggle, { type GroupMode } from '@/components/GroupToggle';
import { listNodes, typeLabel, type NodeType } from '@/lib/nodes';
import { getGraph } from '@/lib/registry';
import { gPath } from '@/lib/gpath';

export const dynamic = 'force-dynamic';

const RECENT_PAGE_SIZE = 20;
const TYPE_SECTION_LIMIT = 25;
const TYPES: NodeType[] = ['question', 'thought', 'reference'];

interface Props {
  params: Promise<{ graph: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function GraphHomePage({ params, searchParams }: Props) {
  const { graph } = await params;
  const sp = await searchParams;
  const view: ViewMode = sp.view === 'cards' ? 'cards' : 'compact';
  const group: GroupMode = sp.group === 'type' ? 'type' : 'mixed';
  const meta = getGraph(graph);
  const pinned = listNodes(graph, { pinned: true, limit: 50 });
  const recent = listNodes(graph, { pinned: false, limit: RECENT_PAGE_SIZE });
  const hasAny = pinned.length + recent.length > 0;

  // In "by type" mode, each section is that type's recent (non-pinned) notes,
  // newest first, capped — with a link to the full per-type list.
  const byType =
    group === 'type'
      ? TYPES.map((t) => ({
          type: t,
          items: listNodes(graph, { type: t, pinned: false, limit: TYPE_SECTION_LIMIT }),
        })).filter((s) => s.items.length > 0)
      : [];

  return (
    <>
      <TopMenu graph={graph} />
      <main className="max-w-3xl mx-auto px-6 pt-16 pb-32">
        <h1 className="text-4xl font-semibold mb-2">{meta?.title ?? graph}</h1>
        {meta?.description && (
          <p className="text-neutral-400 [html.light_&]:text-neutral-600 mb-8">
            {meta.description}
          </p>
        )}

        {!hasAny ? (
          <div className="rounded-lg border border-dashed border-neutral-700 [html.light_&]:border-neutral-300 p-8 text-center mt-8">
            <p className="mb-4 text-neutral-400 [html.light_&]:text-neutral-600">
              No nodes yet. Start by adding one.
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Link href={gPath(graph, '/new?type=question')} className="px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-600 flex items-center gap-2">
                <NodeIcon type="question" className="w-4 h-4" /> New Question
              </Link>
              <Link href={gPath(graph, '/new?type=thought')} className="px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-600 flex items-center gap-2">
                <NodeIcon type="thought" className="w-4 h-4" /> New Thought
              </Link>
              <Link href={gPath(graph, '/new?type=reference')} className="px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-600 flex items-center gap-2">
                <NodeIcon type="reference" className="w-4 h-4" /> New Reference
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 mb-4">
              <Link
                href={gPath(graph, '/graph')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-700 [html.light_&]:border-neutral-300 hover:bg-neutral-800 [html.light_&]:hover:bg-neutral-200 text-sm"
              >
                <Network className="w-4 h-4" strokeWidth={1.75} />
                View graph
              </Link>
              <div className="flex items-center gap-4">
                <GroupToggle value={group} />
                <ViewToggle value={view} />
              </div>
            </div>

            {pinned.length > 0 && (
              <section className="mb-6">
                <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-3 inline-flex items-center gap-1.5">
                  <Pin className="w-3 h-3" strokeWidth={2} /> Pinned
                </h2>
                <NodeList graph={graph} items={pinned} view={view} />
              </section>
            )}

            {group === 'type' ? (
              byType.map(({ type, items }) => (
                <section key={type} className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm uppercase tracking-wider text-neutral-500 inline-flex items-center gap-1.5">
                      <NodeIcon type={type} className="w-3.5 h-3.5" /> {typeLabel(type)}s
                    </h2>
                    {items.length === TYPE_SECTION_LIMIT && (
                      <Link
                        href={gPath(graph, `/list?type=${type}`)}
                        className="text-xs text-sky-400 [html.light_&]:text-sky-700 hover:underline"
                      >
                        View all →
                      </Link>
                    )}
                  </div>
                  <NodeList graph={graph} items={items} view={view} />
                </section>
              ))
            ) : (
              recent.length > 0 && (
                <section>
                  <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-3">Recent</h2>
                  <RecentFeed
                    key={view}
                    graph={graph}
                    initialItems={recent}
                    view={view}
                    initialHasMore={recent.length === RECENT_PAGE_SIZE}
                  />
                </section>
              )
            )}
          </>
        )}
      </main>
      <BottomDock graph={graph} />
    </>
  );
}
