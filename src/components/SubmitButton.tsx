'use client';

import { useFormStatus } from 'react-dom';

interface Props {
  children: React.ReactNode;
  /** Label shown while the form action is in flight. */
  pendingLabel?: string;
  className?: string;
}

/**
 * Submit button that disables itself while its parent <form>'s action is
 * pending — prevents duplicate submissions from impatient double-clicks (e.g.
 * creating the same reference several times while the request lags).
 * Must be rendered inside the <form> it submits.
 */
export default function SubmitButton({ children, pendingLabel, className }: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`${className ?? ''} ${pending ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      {pending ? pendingLabel ?? 'Working…' : children}
    </button>
  );
}
