'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

interface Props {
  /** Server action that deletes the node. */
  action: () => Promise<void>;
  title: string;
  /** Where to go after a successful delete (the graph home). */
  redirectTo: string;
}

export default function DeleteButton({ action, title, redirectTo }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    startTransition(async () => {
      await action();
      // Navigate explicitly client-side (replace, so the back button doesn't
      // return to the now-deleted node), then refresh so the home feed drops it.
      router.replace(redirectTo);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label={`Delete ${title}`}
      className={`px-2 py-1 rounded border border-red-800/60 text-red-400 hover:bg-red-950/40 [html.light_&]:border-red-300 [html.light_&]:text-red-700 [html.light_&]:hover:bg-red-50 inline-flex items-center gap-1.5 text-sm ${
        pending ? 'opacity-60 cursor-not-allowed' : ''
      }`}
    >
      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
      {pending ? 'Deleting…' : 'Delete'}
    </button>
  );
}
