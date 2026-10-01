'use client';

import { useFormStatus } from 'react-dom';

interface Props {
  children: React.ReactNode;
  /** Label shown while the form action is in flight. */
  pendingLabel?: string;
  className?: string;
  /** Disable the button for a reason other than a pending submit (e.g. a PDF still downloading). */
  busy?: boolean;
  /** Label shown while `busy`. */
  busyLabel?: string;
}

/**
 * Submit button that disables itself while its parent <form>'s action is
 * pending — prevents duplicate submissions from impatient double-clicks (e.g.
 * creating the same reference several times while the request lags).
 * Must be rendered inside the <form> it submits.
 */
export default function SubmitButton({ children, pendingLabel, className, busy = false, busyLabel }: Props) {
  const { pending } = useFormStatus();
  const disabled = pending || busy;
  return (
    <button
      type="submit"
      disabled={disabled}
      aria-disabled={disabled}
      className={`${className ?? ''} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      {pending ? pendingLabel ?? 'Working…' : busy ? busyLabel ?? 'Working…' : children}
    </button>
  );
}
