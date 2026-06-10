import TopMenu from '@/components/TopMenu';
import HomeButton from '@/components/HomeButton';
import NewNodeForm from '@/components/NewNodeForm';
import { handleCreateNodeForm, parseNewPageParams } from '@/lib/create-node-form';
import { gPath } from '@/lib/gpath';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ graph: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewNodePage({ params, searchParams }: Props) {
  const { graph } = await params;
  const { type, fromSlug, initialTitle, prefilledBody } = parseNewPageParams(await searchParams);

  async function create(formData: FormData) {
    'use server';
    return handleCreateNodeForm(graph, formData);
  }

  return (
    <>
      <HomeButton graph={graph} />
      <TopMenu graph={graph} />
      <main className="max-w-2xl mx-auto px-6 pt-16 pb-24">
        <NewNodeForm
          graph={graph}
          type={type}
          fromSlug={fromSlug}
          initialTitle={initialTitle}
          prefilledBody={prefilledBody}
          action={create}
          cancelHref={fromSlug ? gPath(graph, `/n/${fromSlug}`) : gPath(graph)}
          bodyRows={14}
        />
      </main>
    </>
  );
}
