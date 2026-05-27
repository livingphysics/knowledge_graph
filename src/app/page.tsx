import Link from 'next/link';
import TopMenu from '@/components/TopMenu';
import BottomDock from '@/components/BottomDock';
import NodeIcon from '@/components/NodeIcon';
import ViewToggle, { type ViewMode } from '@/components/ViewToggle';
import { listNodes } from '@/lib/nodes';
import { siteTitle, siteDescription } from '@/lib/site';

export const dynamic = 'force-dynamic';

const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const formatDate = (ms: number) => DATE_FMT.format(new Date(ms));

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HomePage({ searchParams }: Props) {
  const sp = await searchParams;
  const view: ViewMode = sp.view === 'cards' ? 'cards' : 'compact';
  const recent = listNodes({ limit: 20 });

  return (
    <>
      <TopMenu />
      <main className="max-w-3xl mx-auto px-6 pt-16 pb-32">
        <h1 className="text-4xl font-semibold mb-2">{siteTitle()}</h1>
        <p className="text-neutral-400 [html.light_&]:text-neutral-600 mb-8">
          {siteDescription()}
        </p>

        {recent.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-700 [html.light_&]:border-neutral-300 p-8 text-center">
            <p className="mb-4 text-neutral-400 [html.light_&]:text-neutral-600">
              No nodes yet. Start by adding one.
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Link href="/new?type=question" className="px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-600 flex items-center gap-2">
                <NodeIcon type="question" className="w-4 h-4" /> New Question
              </Link>
              <Link href="/new?type=thought" className="px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-600 flex items-center gap-2">
                <NodeIcon type="thought" className="w-4 h-4" /> New Thought
              </Link>
              <Link href="/new?type=reference" className="px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-600 flex items-center gap-2">
                <NodeIcon type="reference" className="w-4 h-4" /> New Reference
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3 gap-3">
              <h2 className="text-sm uppercase tracking-wider text-neutral-500">Recent</h2>
              <ViewToggle value={view} />
            </div>
            {view === 'cards' ? (
              <ul className="flex flex-col gap-2">
                {recent.map((n) => (
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
            ) : (
              <ul className="flex flex-col gap-2">
                {recent.map((n) => (
                  <li key={n.slug}>
                    <Link
                      href={`/n/${n.slug}`}
                      className="flex items-center gap-2.5 px-3 py-2 rounded hover:bg-neutral-800 [html.light_&]:hover:bg-neutral-200"
                    >
                      <NodeIcon
                        type={n.type}
                        className="w-4 h-4 text-neutral-400 [html.light_&]:text-neutral-600 shrink-0"
                      />
                      <span className="truncate">{n.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
      <BottomDock />
    </>
  );
}
