import TopMenu from '@/components/TopMenu';
import HomeButton from '@/components/HomeButton';
import BottomDock from '@/components/BottomDock';
import GraphView from '@/components/GraphView';

export const dynamic = 'force-dynamic';

export default function GraphPage() {
  return (
    <>
      <HomeButton />
      <TopMenu />
      <main className="fixed inset-0">
        <GraphView />
      </main>
      <BottomDock />
    </>
  );
}
