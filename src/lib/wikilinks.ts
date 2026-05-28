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

const HIDDEN_LINKS_RE = /<!--links\s*([\s\S]*?)-->/;

/** Add `[[targetSlug]]` to the hidden links block of `body`, creating the block if needed. */
export function addLinkToMarkdown(body: string, targetSlug: string): string {
  const back = `[[${targetSlug}]]`;
  if (body.includes(back)) return body;
  if (HIDDEN_LINKS_RE.test(body)) {
    return body.replace(HIDDEN_LINKS_RE, (_, inner: string) => {
      const trimmed = inner.trim();
      const sep = trimmed.length ? '\n' : '';
      return `<!--links\n${trimmed}${sep}${back}\n-->`;
    });
  }
  const prefix = body.length === 0 ? '' : body.endsWith('\n') ? '\n' : '\n\n';
  return `${body}${prefix}<!--links\n${back}\n-->\n`;
}

/**
 * Rewrites every wikilink whose target resolves to `oldSlug` so it points at `newSlug`.
 * Handles all three forms:
 *   [[old-slug]]            → [[new-slug]]
 *   [[old-slug|Label]]      → [[new-slug|Label]]
 *   [[Old Title]]           → [[new-slug|Old Title]]   (preserves the readable text)
 */
export function renameWikilinkTarget(body: string, oldSlug: string, newSlug: string): string {
  return body.replace(WIKILINK_RE, (match, target: string, label?: string) => {
    const t = target.trim();
    if (slugify(t) !== oldSlug) return match;
    if (label != null) return `[[${newSlug}|${label}]]`;
    if (t === oldSlug) return `[[${newSlug}]]`;
    return `[[${newSlug}|${t}]]`;
  });
}

/** Remove every occurrence of `[[targetSlug]]` from `body`. Cleans up emptied hidden blocks. */
export function removeLinkFromMarkdown(body: string, targetSlug: string): string {
  const escaped = targetSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match [[slug]] or [[slug|label]] anywhere
  const re = new RegExp(`\\[\\[${escaped}(\\|[^\\]]+)?\\]\\]\\s*`, 'g');
  let result = body.replace(re, '');
  // If the hidden links block is now empty (only whitespace), drop it entirely.
  result = result.replace(/<!--links\s*-->\s*/g, '');
  return result;
}
