import TopMenu from '@/components/TopMenu';
import HomeButton from '@/components/HomeButton';
import BottomDock from '@/components/BottomDock';
import GraphView from '@/components/GraphView';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ graph: string }>;
}

export default async function GraphPage({ params }: Props) {
  const { graph } = await params;
  return (
    <>
      <HomeButton graph={graph} />
      <TopMenu graph={graph} />
      <main className="fixed inset-0">
        <GraphView graph={graph} />
      </main>
      <BottomDock graph={graph} />
    </>
  );
}
