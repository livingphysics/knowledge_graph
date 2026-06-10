import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createNode, type NodeType } from './nodes';
import { savePdf, UploadError } from './uploads';
import { extractArxivIdFromPdf } from './pdf-arxiv';
import { requireAuth } from './auth';
import { gPath } from './gpath';

// NOTE: deliberately not a 'use server' module. These helpers are called from
// inline server actions defined in the /new page and its modal twin, so the
// graph always comes from the route params — never from client-supplied data.

export const VALID_TYPES: NodeType[] = ['question', 'thought', 'reference'];

export interface NewPageParams {
  type: NodeType;
  fromSlug: string;
  initialTitle: string;
  prefilledBody: string;
}

/** Shared searchParams → form-prefill parsing for the full page and the modal. */
export function parseNewPageParams(
  sp: Record<string, string | string[] | undefined>
): NewPageParams {
  const rawType = String(sp.type ?? 'thought');
  const type = (VALID_TYPES.includes(rawType as NodeType) ? rawType : 'thought') as NodeType;
  const fromSlug = sp.from ? String(sp.from) : '';
  const initialTitle = sp.title ? String(sp.title) : '';
  const initialBody = sp.body ? String(sp.body) : '';
  const fromBlock = fromSlug ? `<!--links\n[[${fromSlug}]]\n-->\n\n` : '';
  return { type, fromSlug, initialTitle, prefilledBody: `${fromBlock}${initialBody}` };
}

/** The full create flow: auth, validation, optional PDF, insert, redirect to the node. */
export async function handleCreateNodeForm(graph: string, formData: FormData): Promise<void> {
  await requireAuth();
  const type = String(formData.get('type') ?? '') as NodeType;
  if (!VALID_TYPES.includes(type)) throw new Error('Invalid type');
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
  if (type === 'reference') {
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
    type,
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
