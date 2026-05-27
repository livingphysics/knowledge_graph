'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export type ViewMode = 'compact' | 'cards';

export default function ViewToggle({ value }: { value: ViewMode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setView(v: ViewMode) {
    const p = new URLSearchParams(params.toString());
    if (v === 'compact') p.delete('view'); // default — keep the URL clean
    else p.set('view', v);
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div
      role="radiogroup"
      className="flex items-center gap-3 text-xs text-neutral-400 [html.light_&]:text-neutral-600"
    >
      <label className="inline-flex items-center gap-1 cursor-pointer">
        <input
          type="radio"
          name="view"
          checked={value === 'compact'}
          onChange={() => setView('compact')}
          className="accent-sky-600"
        />
        Compact
      </label>
      <label className="inline-flex items-center gap-1 cursor-pointer">
        <input
          type="radio"
          name="view"
          checked={value === 'cards'}
          onChange={() => setView('cards')}
          className="accent-sky-600"
        />
        Cards
      </label>
    </div>
  );
}
