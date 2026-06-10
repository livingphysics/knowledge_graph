import NodeIcon from './NodeIcon';
import MarkdownEditor from './MarkdownEditor';
import CancelBackButton from './CancelBackButton';
import { typeLabel, type NodeType } from '@/lib/node-types';

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
  graph: _graph,
  type,
  fromSlug,
  initialTitle,
  prefilledBody,
  action,
  cancelHref,
  bodyRows = 14,
  inModal = false,
}: Props) {
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

      <form action={action} className="flex flex-col gap-4 mt-4">
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
                PDF (optional, max 30MB)
              </span>
              <input
                type="file"
                name="pdf"
                accept="application/pdf,.pdf"
                className="px-3 py-2 rounded bg-neutral-900 [html.light_&]:bg-white border border-neutral-700 [html.light_&]:border-neutral-300 text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-sky-700 file:text-white hover:file:bg-sky-600 file:cursor-pointer"
              />
            </label>
          </>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-400 [html.light_&]:text-neutral-600">
            Body (markdown — use [[other-node]] to link; autocomplete pops up)
          </span>
          <MarkdownEditor graph={_graph} name="body_md" defaultValue={prefilledBody} rows={bodyRows} />
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            className="px-4 py-2 rounded bg-sky-700 hover:bg-sky-600 text-white"
          >
            Create
          </button>
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
