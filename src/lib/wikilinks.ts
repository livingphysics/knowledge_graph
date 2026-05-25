import { slugify } from './slug';

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export interface ParsedWikilink {
  slug: string;
  label: string;
  raw: string;
}

export function parseWikilinks(md: string): ParsedWikilink[] {
  const out: ParsedWikilink[] = [];
  for (const m of md.matchAll(WIKILINK_RE)) {
    const target = m[1].trim();
    const label = (m[2] ?? target).trim();
    out.push({ slug: slugify(target), label, raw: m[0] });
  }
  return out;
}

export function uniqueSlugsFromMarkdown(md: string): string[] {
  return Array.from(new Set(parseWikilinks(md).map((l) => l.slug)));
}
