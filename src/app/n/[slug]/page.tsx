import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Network, Download, Pin, PinOff } from 'lucide-react';
import TopMenu from '@/components/TopMenu';
import HomeButton from '@/components/HomeButton';
import BottomDock from '@/components/BottomDock';
import RelatedSection from '@/components/RelatedSection';
import NodeIcon from '@/components/NodeIcon';
import DeleteButton from '@/components/DeleteButton';
import PdfPreview from '@/components/PdfPreview';
import ReactionBar from '@/components/ReactionBar';
import CommentsSection from '@/components/CommentsSection';
import { getNode, deleteNode, togglePin, typeLabel } from '@/lib/nodes';
import { renderMarkdown } from '@/lib/markdown';
import { listComments, addComment, deleteComment } from '@/lib/comments';
import { listReactions } from '@/lib/reactions';
import { requireAuth } from '@/lib/auth';

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
        <HomeButton />
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
  const comments = listComments(slug);

  // Fetch reactions with current viewer's IP so `mine` is correct in initial render.
  const reqHeaders = await headers();
  const viewerIp =
    reqHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    reqHeaders.get('x-real-ip') ||
    null;
  const reactions = listReactions(slug, viewerIp);

  async function del() {
    'use server';
    deleteNode(slug);
    redirect('/');
  }

  async function pin() {
    'use server';
    await requireAuth();
    togglePin(slug);
    revalidatePath(`/n/${slug}`);
    revalidatePath('/');
  }

  async function addCommentAction(formData: FormData) {
    'use server';
    const body = String(formData.get('body') ?? '');
    const honeypot = String(formData.get('website') ?? '');
    if (honeypot) return;
    const h = await headers();
    const ip =
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      h.get('x-real-ip') ||
      null;
    try {
      addComment(slug, body, ip);
    } catch {
      // swallow validation errors silently for v1
    }
    revalidatePath(`/n/${slug}`);
  }

  async function deleteCommentAction(formData: FormData) {
    'use server';
    const id = Number(formData.get('id'));
    if (Number.isFinite(id)) deleteComment(id);
    revalidatePath(`/n/${slug}`);
  }

  return (
    <>
      <HomeButton />
      <TopMenu />
      <main className="max-w-3xl mx-auto px-6 pt-16 pb-32">
        <div className="flex items-start gap-2 mb-3 text-sm text-neutral-400 [html.light_&]:text-neutral-600">
          <span className="flex-1 inline-flex items-center gap-1.5">
            <NodeIcon type={node.type} className="w-4 h-4 shrink-0" />
            {typeLabel(node.type)}
          </span>
          <div className="flex-1 flex items-center gap-2 flex-wrap justify-end">
            <form action={pin}>
              <button
                type="submit"
                aria-label={node.pinned_at ? 'Unpin from home' : 'Pin to home'}
                title={node.pinned_at ? 'Pinned — click to unpin' : 'Pin to home'}
                className={`px-2 py-1 rounded border inline-flex items-center gap-1.5 ${
                  node.pinned_at
                    ? 'border-amber-700/60 text-amber-400 hover:bg-amber-950/30 [html.light_&]:border-amber-400 [html.light_&]:text-amber-700 [html.light_&]:hover:bg-amber-50'
                    : 'border-neutral-700 [html.light_&]:border-neutral-300 hover:bg-neutral-800 [html.light_&]:hover:bg-neutral-200'
                }`}
              >
                {node.pinned_at ? (
                  <PinOff className="w-3.5 h-3.5" strokeWidth={1.75} />
                ) : (
                  <Pin className="w-3.5 h-3.5" strokeWidth={1.75} />
                )}
                {node.pinned_at ? 'Pinned' : 'Pin'}
              </button>
            </form>
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
            {node.type === 'reference' && (
              <a
                href={`/api/bibtex/${slug}`}
                className="px-2 py-1 rounded border border-neutral-700 [html.light_&]:border-neutral-300 hover:bg-neutral-800 [html.light_&]:hover:bg-neutral-200 inline-flex items-center gap-1.5"
                aria-label="Export BibTeX"
              >
                <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
                BibTeX
              </a>
            )}
          </div>
        </div>
        <h1
          className={`text-4xl font-semibold mb-4 ${node.type === 'reference' ? 'italic' : ''}`}
        >
          {node.title}
        </h1>
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
            <PdfPreview src={`/api/uploads/${node.pdf_sha256}`} />
          </div>
        )}
        <ReactionBar slug={slug} initial={reactions} />
        <CommentsSection
          slug={slug}
          comments={comments}
          addAction={addCommentAction}
          deleteAction={deleteCommentAction}
        />
        <RelatedSection slug={slug} />
      </main>
      <BottomDock fromSlug={slug} />
    </>
  );
}
