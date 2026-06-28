'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

interface Props {
  /** DELETE endpoint for this node, e.g. /g/<graph>/api/nodes/<slug>. */
  deleteUrl: string;
  /** Where to go after a successful delete (the graph home). */
  redirectTo: string;
  title: string;
}

export default function DeleteButton({ deleteUrl, redirectTo, title }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(deleteUrl, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Delete failed: ${data.error ?? res.status}`);
        setBusy(false);
        return;
      }
      // Replace (not push) so the back button doesn't return to the deleted node,
      // then refresh so the home feed/graph drop it.
      router.replace(redirectTo);
      router.refresh();
    } catch {
      alert('Delete failed: network error');
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={`Delete ${title}`}
      className={`px-2 py-1 rounded border border-red-800/60 text-red-400 hover:bg-red-950/40 [html.light_&]:border-red-300 [html.light_&]:text-red-700 [html.light_&]:hover:bg-red-50 inline-flex items-center gap-1.5 text-sm ${
        busy ? 'opacity-60 cursor-not-allowed' : ''
      }`}
    >
      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
      {busy ? 'Deleting…' : 'Delete'}
    </button>
  );
}
