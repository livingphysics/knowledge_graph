import TopMenu from '@/components/TopMenu';
import BottomDock from '@/components/BottomDock';
import GraphView from '@/components/GraphView';

export const dynamic = 'force-dynamic';

export default function GraphPage() {
  return (
    <>
      <TopMenu />
      <main className="fixed inset-0">
        <GraphView />
      </main>
      <BottomDock />
    </>
  );
}
