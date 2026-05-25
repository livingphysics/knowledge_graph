'use client';

import { Trash2 } from 'lucide-react';

interface Props {
  action: () => Promise<void>;
  title: string;
}

export default function DeleteButton({ action, title }: Props) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Delete "${title}"? This cannot be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="px-2 py-1 rounded border border-red-800/60 text-red-400 hover:bg-red-950/40 [html.light_&]:border-red-300 [html.light_&]:text-red-700 [html.light_&]:hover:bg-red-50 inline-flex items-center gap-1.5 text-sm"
        aria-label={`Delete ${title}`}
      >
        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
        Delete
      </button>
    </form>
  );
}
