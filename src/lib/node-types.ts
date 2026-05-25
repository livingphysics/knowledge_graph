// DB- and fs-free leaf module. Safe to import from client components.

export type NodeType = 'question' | 'thought' | 'reference';

export interface NodeRecord {
  slug: string;
  type: NodeType;
  title: string;
  url: string | null;
  pdf_sha256: string | null;
  created_at: number;
  updated_at: number;
}

export interface RelatedItem extends NodeRecord {
  preview: string;
}

export function typeLabel(t: NodeType): string {
  return t === 'question' ? 'Question' : t === 'thought' ? 'Thought' : 'Reference';
}
