'use client';

import { useRouter } from 'next/navigation';

/** Cancel button for the modal variant of the new-node form — just closes (history back). */
export default function CancelBackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="px-4 py-2 rounded border border-neutral-700 [html.light_&]:border-neutral-300 hover:bg-neutral-800 [html.light_&]:hover:bg-neutral-200"
    >
      Cancel
    </button>
  );
}
