// DB- and fs-free leaf module. Safe to import from client components.

export type NodeType = 'question' | 'thought' | 'reference';

export interface NodeRecord {
  slug: string;
  type: NodeType;
  title: string;
  url: string | null;
  pdf_sha256: string | null;
  /** If set, used verbatim instead of any auto-detected BibTeX. References only. */
  bibtex_override: string | null;
  /**
   * Cached arXiv id extracted from the uploaded PDF. Cleared when the PDF changes.
   * `null` = haven't parsed yet; `''` = parsed and found no id; otherwise the id.
   */
  pdf_arxiv_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface NodeWithPreview extends NodeRecord {
  preview: string;
}
// Semantic alias — same shape, used for related-node lists.
export type RelatedItem = NodeWithPreview;

export function typeLabel(t: NodeType): string {
  return t === 'question' ? 'Question' : t === 'thought' ? 'Thought' : 'Reference';
}
