import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import type { Root, Text, Parent } from 'mdast';
import { slugify } from './slug';
import { getDb } from './db';

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

function remarkWikilinks(graph: string, existingSlugs: Set<string>) {
  return () => (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent: Parent | null) => {
      if (!parent || index == null) return;
      const value = node.value;
      if (!value.includes('[[')) return;

      const parts: Parent['children'] = [];
      let last = 0;
      WIKILINK_RE.lastIndex = 0;
      for (const m of value.matchAll(WIKILINK_RE)) {
        const start = m.index!;
        if (start > last) {
          parts.push({ type: 'text', value: value.slice(last, start) } as Text);
        }
        const target = m[1].trim();
        const label = (m[2] ?? target).trim();
        const slug = slugify(target);
        const missing = !existingSlugs.has(slug);
        parts.push({
          type: 'link',
          url: `/g/${graph}/n/${slug}`,
          data: {
            hProperties: {
              className: `wikilink${missing ? ' missing' : ''}`,
              'data-slug': slug,
            },
          },
          children: [{ type: 'text', value: label } as Text],
        } as any);
        last = start + m[0].length;
      }
      if (last < value.length) {
        parts.push({ type: 'text', value: value.slice(last) } as Text);
      }
      if (parts.length > 0) {
        parent.children.splice(index, 1, ...parts);
        return index + parts.length;
      }
    });
  };
}

export async function renderMarkdown(graph: string, md: string): Promise<string> {
  const db = getDb(graph);
  const rows = db.prepare('SELECT slug FROM nodes').all() as { slug: string }[];
  const existing = new Set(rows.map((r) => r.slug));

  const cleaned = md.replace(/<!--[\s\S]*?-->/g, '');

  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkWikilinks(graph, existing))
    .use(remarkRehype)
    .use(rehypeKatex)
    .use(rehypeStringify)
    .process(cleaned);
  return String(file);
}
