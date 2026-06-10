import Link from 'next/link';
import { HelpCircle, Lightbulb, FileText, Plus, type LucideIcon } from 'lucide-react';
import { gPath } from '@/lib/gpath';

interface Props {
  graph: string;
  /** If present, new nodes will be pre-linked back to this slug. */
  fromSlug?: string;
}

export default function BottomDock({ graph, fromSlug }: Props) {
  const q = (type: string) =>
    gPath(graph, `/new?type=${type}${fromSlug ? `&from=${encodeURIComponent(fromSlug)}` : ''}`);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 flex justify-center pointer-events-none">
      <div className="m-4 flex gap-2 pointer-events-auto rounded-2xl bg-neutral-800/95 [html.light_&]:bg-neutral-100/95 backdrop-blur shadow-lg border border-neutral-700 [html.light_&]:border-neutral-300 px-2 py-2">
        <DockButton href={q('question')} Icon={HelpCircle} label="Question" />
        <DockButton href={q('thought')} Icon={Lightbulb} label="Thought" />
        <DockButton href={q('reference')} Icon={FileText} label="Reference" />
      </div>
    </div>
  );
}

function DockButton({ href, Icon, label }: { href: string; Icon: LucideIcon; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-neutral-700 [html.light_&]:hover:bg-neutral-200 transition"
      aria-label={`Add ${label}`}
    >
      <span className="relative inline-flex items-center">
        <Icon className="w-5 h-5" strokeWidth={1.75} />
        <Plus className="w-2.5 h-2.5 absolute -top-1 -right-1.5 text-sky-400 [html.light_&]:text-sky-700" strokeWidth={3} />
      </span>
      <span className="hidden sm:inline text-sm">{label}</span>
    </Link>
  );
}
