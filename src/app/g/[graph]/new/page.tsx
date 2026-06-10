import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import TopMenu from '@/components/TopMenu';
import HomeButton from '@/components/HomeButton';
import NodeIcon from '@/components/NodeIcon';
import { createNode, typeLabel, type NodeType } from '@/lib/nodes';
import { savePdf, UploadError } from '@/lib/uploads';
import { extractArxivIdFromPdf } from '@/lib/pdf-arxiv';
import { requireAuth } from '@/lib/auth';
import { gPath } from '@/lib/gpath';
import MarkdownEditor from '@/components/MarkdownEditor';

export const dynamic = 'force-dynamic';

const VALID: NodeType[] = ['question', 'thought', 'reference'];

interface Props {
  params: Promise<{ graph: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewNodePage({ params, searchParams }: Props) {
  const { graph } = await params;
  const sp = await searchParams;
  const rawType = String(sp.type ?? 'thought');
  const type = (VALID.includes(rawType as NodeType) ? rawType : 'thought') as NodeType;
  const fromSlug = sp.from ? String(sp.from) : '';
  const initialTitle = sp.title ? String(sp.title) : '';

  const initialBody = sp.body ? String(sp.body) : '';
  const fromBlock = fromSlug ? `<!--links\n[[${fromSlug}]]\n-->\n\n` : '';
  const prefilledBody = `${fromBlock}${initialBody}`;

  async function create(formData: FormData) {
    'use server';
    await requireAuth();
    const t = String(formData.get('type') ?? '') as NodeType;
    if (!VALID.includes(t)) throw new Error('Invalid type');
    const title = String(formData.get('title') ?? '').trim();
    const body_md = String(formData.get('body_md') ?? '');
    const url = String(formData.get('url') ?? '').trim() || null;
    const linkFromSlug = String(formData.get('from') ?? '').trim() || null;
    const honeypot = String(formData.get('website') ?? '');
    if (honeypot) redirect(gPath(graph)); // bot

    const h = await headers();
    const ip =
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      h.get('x-real-ip') ||
      null;

    let pdf_sha256: string | null = null;
    let pdf_arxiv_id: string | null = null;
    if (t === 'reference') {
      const pdf = formData.get('pdf');
      if (pdf instanceof File && pdf.size > 0) {
        try {
          pdf_sha256 = await savePdf(graph, pdf);
        } catch (e) {
          if (e instanceof UploadError) throw e;
          throw new Error('Failed to save PDF');
        }
        const id = await extractArxivIdFromPdf(graph, pdf_sha256);
        pdf_arxiv_id = id ?? '';
      }
    }

    const node = createNode(graph, {
      type: t,
      title,
      body_md,
      url,
      pdf_sha256,
      pdf_arxiv_id,
      linkFromSlug,
      authorIp: ip,
    });
    redirect(gPath(graph, `/n/${node.slug}`));
  }

  return (
    <>
      <HomeButton graph={graph} />
      <TopMenu graph={graph} />
      <main className="max-w-2xl mx-auto px-6 pt-16 pb-24">
        <h1 className="text-3xl font-semibold mb-1 inline-flex items-center gap-2.5">
          New <NodeIcon type={type} className="w-6 h-6" /> {typeLabel(type)}
        </h1>
        {fromSlug && (
          <p className="text-sm text-neutral-400 [html.light_&]:text-neutral-600 mb-6">
            Will be linked from <code className="px-1 rounded bg-neutral-800 [html.light_&]:bg-neutral-200">{fromSlug}</code>
          </p>
        )}

        <form action={create} className="flex flex-col gap-4 mt-4">
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="from" value={fromSlug} />
          {/* honeypot — humans don't see this */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            className="hidden"
            aria-hidden="true"
          />

          <label className="flex flex-col gap-1">
            <span className="text-sm text-neutral-400 [html.light_&]:text-neutral-600">Title</span>
            <input
              type="text"
              name="title"
              required
              defaultValue={initialTitle}
              className="px-3 py-2 rounded bg-neutral-900 [html.light_&]:bg-white border border-neutral-700 [html.light_&]:border-neutral-300 focus:outline-none focus:border-sky-500"
            />
          </label>

          {type === 'reference' && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-neutral-400 [html.light_&]:text-neutral-600">Link (URL)</span>
                <input
                  type="url"
                  name="url"
                  placeholder="https://arxiv.org/abs/…"
                  className="px-3 py-2 rounded bg-neutral-900 [html.light_&]:bg-white border border-neutral-700 [html.light_&]:border-neutral-300 focus:outline-none focus:border-sky-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-neutral-400 [html.light_&]:text-neutral-600">
                  PDF (optional, max 30MB)
                </span>
                <input
                  type="file"
                  name="pdf"
                  accept="application/pdf,.pdf"
                  className="px-3 py-2 rounded bg-neutral-900 [html.light_&]:bg-white border border-neutral-700 [html.light_&]:border-neutral-300 text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-sky-700 file:text-white hover:file:bg-sky-600 file:cursor-pointer"
                />
              </label>
            </>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-sm text-neutral-400 [html.light_&]:text-neutral-600">
              Body (markdown — use [[other-node]] to link; autocomplete pops up)
            </span>
            <MarkdownEditor graph={graph} name="body_md" defaultValue={prefilledBody} rows={14} />
          </label>

          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 rounded bg-sky-700 hover:bg-sky-600 text-white"
            >
              Create
            </button>
            <a
              href={fromSlug ? gPath(graph, `/n/${fromSlug}`) : gPath(graph)}
              className="px-4 py-2 rounded border border-neutral-700 [html.light_&]:border-neutral-300 hover:bg-neutral-800 [html.light_&]:hover:bg-neutral-200"
            >
              Cancel
            </a>
          </div>
        </form>
      </main>
    </>
  );
}
