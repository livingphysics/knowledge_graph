import Link from 'next/link';
import TopMenu from '@/components/TopMenu';
import BottomDock from '@/components/BottomDock';
import NodeIcon from '@/components/NodeIcon';
import { listNodes } from '@/lib/nodes';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const recent = listNodes({ limit: 20 });

  return (
    <>
      <TopMenu />
      <main className="max-w-3xl mx-auto px-6 pt-16 pb-32">
        <h1 className="text-4xl font-semibold mb-2">Knowledge Graph</h1>
        <p className="text-neutral-400 [html.light_&]:text-neutral-600 mb-8">
          A collaborative graph of questions, thoughts, and references. Anyone can contribute.
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
            <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-3">Recent</h2>
            <ul className="flex flex-col gap-2">
              {recent.map((n) => (
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
          </>
        )}
      </main>
      <BottomDock />
    </>
  );
}
