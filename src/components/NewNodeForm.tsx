'use client';

import { useRef } from 'react';
import NodeIcon from './NodeIcon';
import MarkdownEditor from './MarkdownEditor';
import CancelBackButton from './CancelBackButton';
import SubmitButton from './SubmitButton';
import PdfFileInput from './PdfFileInput';
import { typeLabel, type NodeType } from '@/lib/node-types';
import { gPath } from '@/lib/gpath';
import { MAX_PDF_MB } from '@/lib/limits';

interface Props {
  graph: string;
  type: NodeType;
  fromSlug: string;
  initialTitle: string;
  prefilledBody: string;
  action: (formData: FormData) => Promise<void>;
  /** If set, Cancel renders as a link to this href; otherwise it's a history-back button (modal). */
  cancelHref?: string;
  bodyRows?: number;
  inModal?: boolean;
}

export default function NewNodeForm({
  graph,
  type,
  fromSlug,
  initialTitle,
  prefilledBody,
  action,
  cancelHref,
  bodyRows = 14,
  inModal = false,
}: Props) {
  // Guards for the duplicate-title confirmation gate:
  //  - confirmedRef: set once we've decided to proceed, so the re-fired submit passes through.
  //  - checkingRef: blocks re-entry while the existence check is in flight (double-click).
  const confirmedRef = useRef(false);
  const checkingRef = useRef(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (confirmedRef.current) {
      confirmedRef.current = false;
      return; // let this (programmatic) submit through to the server action
    }
    if (checkingRef.current) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    const form = e.currentTarget;
    const titleEl = form.elements.namedItem('title') as HTMLInputElement | null;
    const title = (titleEl?.value ?? '').trim();
    if (!title) return; // native `required` validation handles the empty case

    checkingRef.current = true;
    let proceed = true;
    try {
      const res = await fetch(gPath(graph, `/api/exists?title=${encodeURIComponent(title)}`));
      if (res.ok) {
        const data = (await res.json()) as { exists: boolean; existingTitle: string | null };
        if (data.exists) {
          proceed = window.confirm(
            `An entry called “${data.existingTitle ?? title}” already exists. Create a duplicate anyway?`
          );
        }
      }
    } catch {
      // If the check fails, don't block creation — fall through and submit.
    } finally {
      checkingRef.current = false;
    }

    if (proceed) {
      confirmedRef.current = true;
      form.requestSubmit();
    }
  }

  return (
    <>
      <h1
        className={`${inModal ? 'text-2xl' : 'text-3xl'} font-semibold mb-1 inline-flex items-center gap-2.5`}
      >
        New <NodeIcon type={type} className={inModal ? 'w-5 h-5' : 'w-6 h-6'} /> {typeLabel(type)}
      </h1>
      {fromSlug && (
        <p className="text-sm text-neutral-400 [html.light_&]:text-neutral-600 mb-4">
          Will be linked from{' '}
          <code className="px-1 rounded bg-neutral-800 [html.light_&]:bg-neutral-200">{fromSlug}</code>
        </p>
      )}

      <form action={action} onSubmit={onSubmit} className="flex flex-col gap-4 mt-4">
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="from" value={fromSlug} />
        {/* honeypot — humans don't see this */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          className="hidden"
          aria-hidden="true"
        />

        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-400 [html.light_&]:text-neutral-600">Title</span>
          <input
            type="text"
            name="title"
            required
            autoFocus={inModal}
            defaultValue={initialTitle}
            className="px-3 py-2 rounded bg-neutral-900 [html.light_&]:bg-white border border-neutral-700 [html.light_&]:border-neutral-300 focus:outline-none focus:border-sky-500"
          />
        </label>

        {type === 'reference' && (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-neutral-400 [html.light_&]:text-neutral-600">Link (URL)</span>
              <input
                type="url"
                name="url"
                placeholder="https://arxiv.org/abs/…"
                className="px-3 py-2 rounded bg-neutral-900 [html.light_&]:bg-white border border-neutral-700 [html.light_&]:border-neutral-300 focus:outline-none focus:border-sky-500"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-neutral-400 [html.light_&]:text-neutral-600">
                PDF (optional, max {MAX_PDF_MB}MB)
              </span>
              <PdfFileInput name="pdf" />
            </label>
          </>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-400 [html.light_&]:text-neutral-600">
            Body (markdown — use [[other-node]] to link; autocomplete pops up)
          </span>
          <MarkdownEditor graph={graph} name="body_md" defaultValue={prefilledBody} rows={bodyRows} />
        </label>

        <div className="flex gap-2">
          <SubmitButton
            pendingLabel="Creating…"
            className="px-4 py-2 rounded bg-sky-700 hover:bg-sky-600 text-white"
          >
            Create
          </SubmitButton>
          {cancelHref ? (
            <a
              href={cancelHref}
              className="px-4 py-2 rounded border border-neutral-700 [html.light_&]:border-neutral-300 hover:bg-neutral-800 [html.light_&]:hover:bg-neutral-200"
            >
              Cancel
            </a>
          ) : (
            <CancelBackButton />
          )}
        </div>
      </form>
    </>
  );
}
