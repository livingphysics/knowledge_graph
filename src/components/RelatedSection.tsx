import RelatedCard from './RelatedCard';
import { getRelatedByType, type NodeType } from '@/lib/nodes';

const ORDER: NodeType[] = ['question', 'thought', 'reference'];

export default function RelatedSection({ graph, slug }: { graph: string; slug: string }) {
  const groups = getRelatedByType(graph, slug);
  const types = ORDER.filter((t) => groups[t].length > 0);
  if (types.length === 0) return null;

  return (
    <section className="mt-12 flex flex-col gap-3">
      {types.map((t) => (
        <RelatedCard key={t} graph={graph} type={t} items={groups[t]} />
      ))}
    </section>
  );
}
