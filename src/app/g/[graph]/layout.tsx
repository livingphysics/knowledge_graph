import { notFound } from 'next/navigation';
import PdfDropZone from '@/components/PdfDropZone';
import { graphExists } from '@/lib/registry';

export const dynamic = 'force-dynamic';

export default async function GraphLayout({
  children,
  modal,
  params,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
  params: Promise<{ graph: string }>;
}) {
  const { graph } = await params;
  if (!graphExists(graph)) notFound();
  return (
    <>
      {children}
      {modal}
      <PdfDropZone graph={graph} />
    </>
  );
}
