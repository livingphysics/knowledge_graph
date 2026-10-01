'use client';

import { LoaderCircle, X } from 'lucide-react';
import type { RefMeta } from '@/lib/ref-ids';
import type { AutofillNote } from './useReferenceAutofill';

interface Props {
  notes: AutofillNote[];
  suggestion: RefMeta | null;
  onUse: () => void;
  onDismiss: () => void;
}

/** Progress line + "possible match" card under the New Reference fields. */
export default function AutofillStatus({ notes, suggestion, onUse, onDismiss }: Props) {
  return (
    <div aria-live="polite" className="flex flex-col gap-2 text-sm">
      {notes.length > 0 && (
        <p className="flex items-center flex-wrap gap-x-1.5 text-neutral-400 [html.light_&]:text-neutral-600">
          {notes.some((n) => n.tone === 'busy') && (
            <LoaderCircle className="w-3.5 h-3.5 animate-spin shrink-0" strokeWidth={2} />
          )}
          {notes.map((n, i) => (
            <span
              key={i}
              className={n.tone === 'warn' ? 'text-amber-400 [html.light_&]:text-amber-700' : undefined}
            >
              {i > 0 && <span className="mr-1.5 text-neutral-600 [html.light_&]:text-neutral-400">·</span>}
              {n.text}
            </span>
          ))}
        </p>
      )}
      {suggestion && (
        <div className="flex items-center gap-3 rounded border border-sky-800/70 [html.light_&]:border-sky-300 bg-sky-950/30 [html.light_&]:bg-sky-50 px-3 py-2">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-neutral-400 [html.light_&]:text-neutral-600">Possible match</div>
            <div className="italic truncate" title={suggestion.title}>
              {suggestion.title}
            </div>
            <div className="text-xs text-neutral-500">
              {[suggestion.year, hostOf(suggestion.url), suggestion.arxivId && 'PDF available']
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          <button
            type="button"
            onClick={onUse}
            className="px-3 py-1 rounded bg-sky-700 hover:bg-sky-600 text-white"
          >
            Use
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss suggestion"
            className="p-1.5 rounded text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 [html.light_&]:hover:text-neutral-800 [html.light_&]:hover:bg-neutral-200"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
