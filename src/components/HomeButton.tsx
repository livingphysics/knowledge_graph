import Link from 'next/link';
import { Home } from 'lucide-react';
import { gPath } from '@/lib/gpath';

export default function HomeButton({ graph }: { graph: string }) {
  return (
    <Link
      href={gPath(graph)}
      aria-label="Graph home"
      className="fixed top-3 left-3 z-40 w-10 h-10 flex items-center justify-center rounded-lg bg-neutral-800/90 hover:bg-neutral-700 border border-neutral-700 [html.light_&]:bg-neutral-100/95 [html.light_&]:hover:bg-neutral-200 [html.light_&]:border-neutral-300"
    >
      <Home className="w-5 h-5" strokeWidth={1.75} />
    </Link>
  );
}
