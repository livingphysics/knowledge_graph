import fs from 'node:fs';
import JSZip from 'jszip';
import { listNodes, type NodeRecord, type NodeType } from './nodes';
import { slugify } from './slug';
import { paths } from './db';

const TYPE_ORDER: NodeType[] = ['question', 'thought', 'reference'];
const TYPE_PLURAL: Record<NodeType, string> = {
  question: 'Questions',
  thought: 'Thoughts',
  reference: 'References',
};

function yamlString(s: string): string {
  // JSON quoting is valid YAML for double-quoted scalars and handles escaping safely.
  return JSON.stringify(s);
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function frontmatter(node: NodeRecord): string {
  const lines: string[] = [
    '---',
    `title: ${yamlString(node.title)}`,
    `type: ${node.type}`,
    `created: ${isoDate(node.created_at)}`,
    `updated: ${isoDate(node.updated_at)}`,
  ];
  if (node.url) lines.push(`url: ${yamlString(node.url)}`);
  lines.push('---');
  return lines.join('\n');
}

/** Strips hidden links blocks and rewrites [[slug]] / [[slug|label]] to [label](slug.qmd). */
function transformBody(body: string, slugToTitle: Map<string, string>): string {
  let out = body.replace(/<!--links[\s\S]*?-->\s*/g, '');
  out = out.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target: string, label?: string) => {
    const slug = slugify(target.trim());
    const text = (label?.trim() || slugToTitle.get(slug) || target).trim();
    return `[${text}](${slug}.qmd)`;
  });
  return out.trimEnd() + '\n';
}

function indexQmd(nodes: NodeRecord[]): string {
  const byType: Record<NodeType, NodeRecord[]> = { question: [], thought: [], reference: [] };
  for (const n of nodes) byType[n.type].push(n);

  const lines: string[] = ['# Knowledge Graph Export', ''];
  for (const t of TYPE_ORDER) {
    if (byType[t].length === 0) continue;
    lines.push(`## ${TYPE_PLURAL[t]}`, '');
    for (const n of byType[t]) {
      lines.push(`- [${n.title}](${n.slug}.qmd)`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function quartoYml(nodes: NodeRecord[]): string {
  const chapters = ['index.qmd', ...nodes.map((n) => `${n.slug}.qmd`)];
  return [
    'project:',
    '  type: book',
    '',
    'book:',
    '  title: "Knowledge Graph"',
    '  chapters:',
    ...chapters.map((c) => `    - ${c}`),
    '',
    'format:',
    '  html:',
    '    theme: cosmo',
    '  pdf:',
    '    documentclass: scrbook',
    '',
  ].join('\n');
}

function readmeMd(): string {
  return [
    '# Knowledge Graph — Quarto export',
    '',
    'This bundle is a Quarto book project. To render:',
    '',
    '```bash',
    'quarto render        # produces _book/ with HTML + PDF',
    'quarto preview       # live-reloading preview',
    '```',
    '',
    'Notes:',
    '- One `.qmd` file per node (question / thought / reference).',
    '- Wikilinks (`[[other-node]]`) were rewritten to cross-doc links (`[Other Node](other-node.qmd)`).',
    '- Comments and reactions are *not* included — this is a content export only.',
    '',
  ].join('\n');
}

/** Builds the complete Quarto bundle and returns it as a single ZIP buffer. */
export async function buildQuartoZip(): Promise<Buffer> {
  const nodes = listNodes({ limit: 10_000 });
  const slugToTitle = new Map(nodes.map((n) => [n.slug, n.title]));

  const zip = new JSZip();
  const root = zip.folder('knowledge-graph');
  if (!root) throw new Error('zip folder creation failed');

  root.file('_quarto.yml', quartoYml(nodes));
  root.file('index.qmd', indexQmd(nodes));
  root.file('README.md', readmeMd());

  for (const n of nodes) {
    let body = '';
    try {
      body = fs.readFileSync(paths.nodeFile(n.slug), 'utf8');
    } catch {}
    const qmd = `${frontmatter(n)}\n\n${transformBody(body, slugToTitle)}`;
    root.file(`${n.slug}.qmd`, qmd);
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
