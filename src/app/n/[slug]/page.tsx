import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Network } from 'lucide-react';
import TopMenu from '@/components/TopMenu';
import BottomDock from '@/components/BottomDock';
import RelatedSection from '@/components/RelatedSection';
import NodeIcon from '@/components/NodeIcon';
import DeleteButton from '@/components/DeleteButton';
import { getNode, deleteNode, typeLabel } from '@/lib/nodes';
import { renderMarkdown } from '@/lib/markdown';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function NodePage({ params }: Props) {
  const { slug } = await params;
  const node = getNode(slug);
  if (!node) {
    return (
      <>
        <TopMenu />
        <main className="max-w-3xl mx-auto px-6 pt-16 pb-32">
          <h1 className="text-3xl font-semibold mb-2">Node not found</h1>
          <p className="text-neutral-400 [html.light_&]:text-neutral-600 mb-6">
            <code className="px-1 py-0.5 rounded bg-neutral-800 [html.light_&]:bg-neutral-200">
              {slug}
            </code>{' '}
            doesn&apos;t exist yet. You can create it.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Link
              href={`/new?type=question&title=${encodeURIComponent(slug)}`}
              className="px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-600 flex items-center gap-2"
            >
              <NodeIcon type="question" className="w-4 h-4" /> Create as Question
            </Link>
            <Link
              href={`/new?type=thought&title=${encodeURIComponent(slug)}`}
              className="px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-600 flex items-center gap-2"
            >
              <NodeIcon type="thought" className="w-4 h-4" /> Create as Thought
            </Link>
            <Link
              href={`/new?type=reference&title=${encodeURIComponent(slug)}`}
              className="px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-600 flex items-center gap-2"
            >
              <NodeIcon type="reference" className="w-4 h-4" /> Create as Reference
            </Link>
          </div>
        </main>
      </>
    );
  }

  const html = await renderMarkdown(node.body_md || '_(empty)_');

  async function del() {
    'use server';
    deleteNode(slug);
    redirect('/');
  }

  return (
    <>
      <TopMenu />
      <main className="max-w-3xl mx-auto px-6 pt-16 pb-32">
        <div className="flex items-center justify-between mb-3 text-sm text-neutral-400 [html.light_&]:text-neutral-600">
          <span className="inline-flex items-center gap-1.5">
            <NodeIcon type={node.type} className="w-4 h-4" />
            {typeLabel(node.type)}
          </span>
          <div className="flex items-center gap-2">
            <Link
              href={`/graph?focus=${encodeURIComponent(slug)}`}
              className="px-2 py-1 rounded border border-neutral-700 [html.light_&]:border-neutral-300 hover:bg-neutral-800 [html.light_&]:hover:bg-neutral-200 inline-flex items-center gap-1.5"
              aria-label="View in graph"
            >
              <Network className="w-3.5 h-3.5" strokeWidth={1.75} />
              Graph
            </Link>
            <Link
              href={`/n/${slug}/edit`}
              className="px-2 py-1 rounded border border-neutral-700 [html.light_&]:border-neutral-300 hover:bg-neutral-800 [html.light_&]:hover:bg-neutral-200"
            >
              Edit
            </Link>
            <DeleteButton action={del} title={node.title} />
          </div>
        </div>
        <h1 className="text-4xl font-semibold mb-4">{node.title}</h1>
        {node.url && (
          <a
            href={node.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block mb-4 text-sky-400 [html.light_&]:text-sky-700 break-all"
          >
            {node.url}
          </a>
        )}
        <article className="prose-body" dangerouslySetInnerHTML={{ __html: html }} />
        {node.pdf_sha256 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wider text-neutral-500">Attached PDF</span>
              <a
                href={`/api/uploads/${node.pdf_sha256}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-sky-400 [html.light_&]:text-sky-700 hover:underline"
              >
                Open in new tab ↗
              </a>
            </div>
            <iframe
              src={`/api/uploads/${node.pdf_sha256}#view=FitH`}
              title={`${node.title} (PDF)`}
              className="w-full h-[80vh] rounded border border-neutral-800 [html.light_&]:border-neutral-200 bg-white"
            />
          </div>
        )}
        <RelatedSection slug={slug} />
      </main>
      <BottomDock fromSlug={slug} />
    </>
  );
}
