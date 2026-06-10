import { notFound } from 'next/navigation';
import { graphExists } from '@/lib/registry';

export const dynamic = 'force-dynamic';

export default async function GraphLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ graph: string }>;
}) {
  const { graph } = await params;
  if (!graphExists(graph)) notFound();
  return <>{children}</>;
}
