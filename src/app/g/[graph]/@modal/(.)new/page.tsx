import ModalShell from '@/components/ModalShell';
import NewNodeForm from '@/components/NewNodeForm';
import { handleCreateNodeForm, parseNewPageParams } from '@/lib/create-node-form';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ graph: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Intercepted version of /g/[graph]/new: when reached via client-side
 * navigation (the + buttons), it renders as a popup card over the current
 * page. A hard refresh of the same URL falls through to the full page.
 */
export default async function NewNodeModal({ params, searchParams }: Props) {
  const { graph } = await params;
  const { type, fromSlug, initialTitle, prefilledBody } = parseNewPageParams(await searchParams);

  async function create(formData: FormData) {
    'use server';
    return handleCreateNodeForm(graph, formData);
  }

  return (
    <ModalShell>
      <NewNodeForm
        graph={graph}
        type={type}
        fromSlug={fromSlug}
        initialTitle={initialTitle}
        prefilledBody={prefilledBody}
        action={create}
        bodyRows={10}
        inModal
      />
    </ModalShell>
  );
}
