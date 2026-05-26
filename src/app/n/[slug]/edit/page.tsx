import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import TopMenu from '@/components/TopMenu';
import HomeButton from '@/components/HomeButton';
import NodeIcon from '@/components/NodeIcon';
import { getNode, updateNode, typeLabel } from '@/lib/nodes';
import { savePdf, UploadError } from '@/lib/uploads';
import { extractArxivIdFromPdf } from '@/lib/pdf-arxiv';
import MarkdownEditor from '@/components/MarkdownEditor';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function EditNodePage({ params }: Props) {
  const { slug } = await params;
  const node = getNode(slug);
  if (!node) notFound();

  async function save(formData: FormData) {
    'use server';
    const title = String(formData.get('title') ?? '').trim();
    const body_md = String(formData.get('body_md') ?? '');
    const url = String(formData.get('url') ?? '').trim() || null;
    const honeypot = String(formData.get('website') ?? '');
    if (honeypot) redirect('/');

    const h = await headers();
    const ip =
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      h.get('x-real-ip') ||
      null;

    let pdf_sha256: string | null | undefined = undefined;
    let pdf_arxiv_id: string | null | undefined = undefined;
    let bibtex_override: string | null | undefined = undefined;
    if (node!.type === 'reference') {
      const remove = formData.get('remove_pdf') === 'on';
      if (remove) {
        pdf_sha256 = null;
        pdf_arxiv_id = null; // clear cache when PDF is removed
      }
      const pdf = formData.get('pdf');
      if (pdf instanceof File && pdf.size > 0) {
        try {
          pdf_sha256 = await savePdf(pdf);
        } catch (e) {
          if (e instanceof UploadError) throw e;
          throw new Error('Failed to save PDF');
        }
        // Re-extract arxiv id whenever the PDF changes
        const id = await extractArxivIdFromPdf(pdf_sha256);
        pdf_arxiv_id = id ?? '';
      }
      const rawOverride = String(formData.get('bibtex_override') ?? '').trim();
      bibtex_override = rawOverride.length > 0 ? rawOverride : null;
    }

    updateNode({ slug, title, body_md, url, pdf_sha256, pdf_arxiv_id, bibtex_override, authorIp: ip });
    redirect(`/n/${slug}`);
  }

  return (
    <>
      <HomeButton />
      <TopMenu />
      <main className="max-w-2xl mx-auto px-6 pt-16 pb-24">
        <h1 className="text-2xl font-semibold mb-6 inline-flex items-center gap-2">
          Editing <NodeIcon type={node.type} className="w-5 h-5" /> {typeLabel(node.type)}
        </h1>

        <form action={save} className="flex flex-col gap-4">
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
              defaultValue={node.title}
              className="px-3 py-2 rounded bg-neutral-900 [html.light_&]:bg-white border border-neutral-700 [html.light_&]:border-neutral-300 focus:outline-none focus:border-sky-500"
            />
          </label>

          {node.type === 'reference' && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-neutral-400 [html.light_&]:text-neutral-600">Link (URL)</span>
                <input
                  type="url"
                  name="url"
                  defaultValue={node.url ?? ''}
                  className="px-3 py-2 rounded bg-neutral-900 [html.light_&]:bg-white border border-neutral-700 [html.light_&]:border-neutral-300 focus:outline-none focus:border-sky-500"
                />
              </label>
              <fieldset className="flex flex-col gap-2 border border-neutral-700 [html.light_&]:border-neutral-300 rounded p-3">
                <legend className="px-1 text-sm text-neutral-400 [html.light_&]:text-neutral-600">PDF</legend>
                {node.pdf_sha256 ? (
                  <div className="text-sm text-neutral-400 [html.light_&]:text-neutral-600">
                    Currently attached:{' '}
                    <a
                      href={`/api/uploads/${node.pdf_sha256}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sky-400 [html.light_&]:text-sky-700 hover:underline"
                    >
                      {node.pdf_sha256.slice(0, 12)}.pdf
                    </a>
                  </div>
                ) : (
                  <div className="text-sm text-neutral-500">No PDF attached.</div>
                )}
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-neutral-500">
                    {node.pdf_sha256 ? 'Replace with' : 'Upload'} (max 25MB)
                  </span>
                  <input
                    type="file"
                    name="pdf"
                    accept="application/pdf,.pdf"
                    className="px-3 py-2 rounded bg-neutral-900 [html.light_&]:bg-white border border-neutral-700 [html.light_&]:border-neutral-300 text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-sky-700 file:text-white hover:file:bg-sky-600 file:cursor-pointer"
                  />
                </label>
                {node.pdf_sha256 && (
                  <label className="flex items-center gap-2 text-sm text-neutral-400 [html.light_&]:text-neutral-600">
                    <input type="checkbox" name="remove_pdf" />
                    Remove current PDF
                  </label>
                )}
              </fieldset>
              <fieldset className="flex flex-col gap-2 border border-neutral-700 [html.light_&]:border-neutral-300 rounded p-3">
                <legend className="px-1 text-sm text-neutral-400 [html.light_&]:text-neutral-600">
                  Custom BibTeX
                </legend>
                <div className="text-xs text-neutral-500">
                  Paste a BibTeX entry to use it verbatim. Otherwise we try DOI / arXiv / Crossref
                  title-search and fall back to a minimal{' '}
                  <code className="px-1 rounded bg-neutral-800 [html.light_&]:bg-neutral-200">@misc</code>
                  . Leave empty to clear an existing override.
                </div>
                <textarea
                  name="bibtex_override"
                  rows={6}
                  defaultValue={node.bibtex_override ?? ''}
                  placeholder="@article{key2024, ... }"
                  className="px-3 py-2 rounded bg-neutral-900 [html.light_&]:bg-white border border-neutral-700 [html.light_&]:border-neutral-300 font-mono text-xs focus:outline-none focus:border-sky-500"
                />
              </fieldset>
            </>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-sm text-neutral-400 [html.light_&]:text-neutral-600">
              Body (markdown — type [[ for link suggestions)
            </span>
            <MarkdownEditor name="body_md" defaultValue={node.body_md} rows={20} />
          </label>

          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 rounded bg-sky-700 hover:bg-sky-600 text-white">
              Save
            </button>
            <a
              href={`/n/${slug}`}
              className="px-4 py-2 rounded border border-neutral-700 [html.light_&]:border-neutral-300"
            >
              Cancel
            </a>
          </div>
        </form>
      </main>
    </>
  );
}
