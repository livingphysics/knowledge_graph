import Link from 'next/link';
import { Pin } from 'lucide-react';
import TopMenu from '@/components/TopMenu';
import BottomDock from '@/components/BottomDock';
import NodeIcon from '@/components/NodeIcon';
import NodeList from '@/components/NodeList';
import RecentFeed from '@/components/RecentFeed';
import ViewToggle, { type ViewMode } from '@/components/ViewToggle';
import { listNodes } from '@/lib/nodes';
import { getGraph } from '@/lib/registry';
import { gPath } from '@/lib/gpath';

export const dynamic = 'force-dynamic';

const RECENT_PAGE_SIZE = 20;

interface Props {
  params: Promise<{ graph: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function GraphHomePage({ params, searchParams }: Props) {
  const { graph } = await params;
  const sp = await searchParams;
  const view: ViewMode = sp.view === 'cards' ? 'cards' : 'compact';
  const meta = getGraph(graph);
  const pinned = listNodes(graph, { pinned: true, limit: 50 });
  const recent = listNodes(graph, { pinned: false, limit: RECENT_PAGE_SIZE });
  const hasAny = pinned.length + recent.length > 0;

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
            <div className="flex items-center justify-end mb-3">
              <ViewToggle value={view} />
            </div>
            {pinned.length > 0 && (
              <section className="mb-6">
                <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-3 inline-flex items-center gap-1.5">
                  <Pin className="w-3 h-3" strokeWidth={2} /> Pinned
                </h2>
                <NodeList graph={graph} items={pinned} view={view} />
              </section>
            )}
            {recent.length > 0 && (
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
            )}
          </>
        )}
      </main>
      <BottomDock graph={graph} />
    </>
  );
}
