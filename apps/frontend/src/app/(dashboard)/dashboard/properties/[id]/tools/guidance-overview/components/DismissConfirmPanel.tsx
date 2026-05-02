'use client';

import { cn } from '@/lib/utils';

export function DismissConfirmPanel({
  isPending,
  onConfirm,
  onCancel,
  className,
}: {
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  className?: string;
}) {
  return (
    <div
      role="alertdialog"
      aria-labelledby="dismiss-confirm-heading"
      className={cn('rounded-2xl border border-rose-100 bg-rose-50 p-3 text-sm', className)}
    >
      <p id="dismiss-confirm-heading" className="font-medium text-rose-900">Remove this journey?</p>
      <p className="mt-0.5 text-rose-700">This issue will no longer appear in your guidance.</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={onConfirm}
          className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
        >
          {isPending ? 'Removing…' : 'Yes, remove'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
