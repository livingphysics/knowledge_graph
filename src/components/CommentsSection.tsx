import { Trash2 } from 'lucide-react';
import type { Comment } from '@/lib/comments';

const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function relativeDate(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 86_400_000 * 7) return `${Math.floor(diff / 86_400_000)}d ago`;
  return DATE_FMT.format(new Date(ms));
}

interface Props {
  comments: Comment[];
  /** Server actions passed in from the page; both implement (formData: FormData) => Promise<void> */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addAction: (formData: FormData) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deleteAction: (formData: FormData) => Promise<any>;
}

export default function CommentsSection({ comments, addAction, deleteAction }: Props) {
  return (
    <section className="mt-12">
      <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-3">
        Comments ({comments.length})
      </h2>

      {comments.length === 0 ? (
        <p className="text-sm text-neutral-500 mb-4">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-2 mb-6">
          {comments.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-neutral-800 [html.light_&]:border-neutral-200 bg-neutral-900/40 [html.light_&]:bg-neutral-100/60 px-3 py-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-neutral-500" title={DATE_FMT.format(new Date(c.created_at))}>
                    {relativeDate(c.created_at)}
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words mt-0.5">{c.body}</p>
                </div>
                <form action={deleteAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <button
                    type="submit"
                    aria-label="Delete comment"
                    title="Delete comment"
                    className="p-1 rounded text-neutral-500 hover:text-red-400 hover:bg-red-950/40 [html.light_&]:hover:bg-red-50 [html.light_&]:hover:text-red-700"
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={addAction} className="flex flex-col gap-2">
        {/* honeypot */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          className="hidden"
          aria-hidden="true"
        />
        <textarea
          name="body"
          rows={3}
          maxLength={4000}
          required
          placeholder="Add a comment…"
          className="px-3 py-2 rounded bg-neutral-900 [html.light_&]:bg-white border border-neutral-700 [html.light_&]:border-neutral-300 text-sm focus:outline-none focus:border-sky-500"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            className="px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-600 text-white text-sm"
          >
            Post comment
          </button>
        </div>
      </form>
    </section>
  );
}
