import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { Plus, Network } from 'lucide-react';
import { listGraphs, createGraph } from '@/lib/registry';
import { listNodes } from '@/lib/nodes';
import { rateLimit } from '@/lib/ratelimit';
import { ipHash } from '@/lib/nodes';
import { gPath } from '@/lib/gpath';
import { siteTitle, siteDescription } from '@/lib/site';
import ThemeToggle from '@/components/ThemeToggle';
import SubmitButton from '@/components/SubmitButton';

export const dynamic = 'force-dynamic';

const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

async function createGraphAction(formData: FormData) {
  'use server';
  const honeypot = String(formData.get('website') ?? '');
  if (honeypot) redirect('/'); // bot

  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  if (!title) redirect('/');

  // Open creation, but rate-limit per IP so a bot can't script thousands.
  const h = await headers();
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'no-ip';
  if (!rateLimit(`graph-create:${ipHash(ip)}`, 5, 60 * 60 * 1000)) {
    redirect('/?error=rate');
  }

  const { meta } = createGraph({ title, description });
  revalidatePath('/');
  redirect(gPath(meta.name));
}

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PortalPage({ searchParams }: Props) {
  const sp = await searchParams;
  const rateLimited = sp.error === 'rate';
  const graphs = listGraphs();

  return (
    <main className="max-w-3xl mx-auto px-6 pt-16 pb-24">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h1 className="text-4xl font-semibold">{siteTitle()}</h1>
        <ThemeToggle />
      </div>
      <p className="text-neutral-400 [html.light_&]:text-neutral-600 mb-10">{siteDescription()}</p>

      <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-3">
        Graphs ({graphs.length})
      </h2>

      {graphs.length === 0 ? (
        <p className="text-neutral-400 [html.light_&]:text-neutral-600 mb-8">
          No graphs yet. Create the first one below.
        </p>
      ) : (
        <ul className="flex flex-col gap-2 mb-10">
          {graphs.map((g) => {
            const count = listNodes(g.name, { limit: 100000 }).length;
            return (
              <li key={g.name}>
                <Link
                  href={gPath(g.name)}
                  className="flex items-start gap-3 px-4 py-3 rounded-lg border border-neutral-800 [html.light_&]:border-neutral-200 bg-neutral-900/40 [html.light_&]:bg-neutral-100/60 hover:bg-neutral-800/60 [html.light_&]:hover:bg-neutral-200/60"
                >
                  <Network className="w-5 h-5 mt-0.5 text-neutral-400 [html.light_&]:text-neutral-600 shrink-0" strokeWidth={1.75} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="font-medium truncate">{g.title}</div>
                      <div className="text-[11px] text-neutral-500 whitespace-nowrap">
                        {count} {count === 1 ? 'node' : 'nodes'} · {DATE_FMT.format(new Date(g.created_at))}
                      </div>
                    </div>
                    {g.description && (
                      <p className="mt-1 text-sm text-neutral-400 [html.light_&]:text-neutral-600 line-clamp-2">
                        {g.description}
                      </p>
                    )}
                    <div className="mt-1 text-[11px] font-mono text-neutral-500">/g/{g.name}</div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <section className="rounded-lg border border-neutral-800 [html.light_&]:border-neutral-200 p-4">
        <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-3 inline-flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" strokeWidth={2} /> New graph
        </h2>
        {rateLimited && (
          <div className="text-sm text-red-400 mb-3">
            Too many graphs created recently — please wait a bit and try again.
          </div>
        )}
        <form action={createGraphAction} className="flex flex-col gap-3">
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
          <label className="flex flex-col gap-1">
            <span className="text-sm text-neutral-400 [html.light_&]:text-neutral-600">Title</span>
            <input
              type="text"
              name="title"
              required
              placeholder="e.g. Emergence reading group"
              className="px-3 py-2 rounded bg-neutral-900 [html.light_&]:bg-white border border-neutral-700 [html.light_&]:border-neutral-300 focus:outline-none focus:border-sky-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-neutral-400 [html.light_&]:text-neutral-600">Description (optional)</span>
            <input
              type="text"
              name="description"
              className="px-3 py-2 rounded bg-neutral-900 [html.light_&]:bg-white border border-neutral-700 [html.light_&]:border-neutral-300 focus:outline-none focus:border-sky-500"
            />
          </label>
          <div>
            <SubmitButton pendingLabel="Creating…" className="px-4 py-2 rounded bg-sky-700 hover:bg-sky-600 text-white">
              Create graph
            </SubmitButton>
          </div>
        </form>
      </section>
    </main>
  );
}
