'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export type ViewMode = 'compact' | 'cards';

export default function ViewToggle({ value }: { value: ViewMode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const isCompact = value === 'compact';

  function setView(v: ViewMode) {
    const p = new URLSearchParams(params.toString());
    if (v === 'compact') p.delete('view'); // default — keep the URL clean
    else p.set('view', v);
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs text-neutral-400 [html.light_&]:text-neutral-600">
      <span>Compact</span>
      <button
        type="button"
        role="switch"
        aria-checked={isCompact}
        aria-label="Toggle compact view"
        onClick={() => setView(isCompact ? 'cards' : 'compact')}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
          isCompact
            ? 'bg-sky-700 border-sky-600'
            : 'bg-neutral-700 border-neutral-600 [html.light_&]:bg-neutral-300 [html.light_&]:border-neutral-400'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
            isCompact ? 'translate-x-[18px]' : 'translate-x-[2px]'
          }`}
        />
      </button>
    </label>
  );
}
