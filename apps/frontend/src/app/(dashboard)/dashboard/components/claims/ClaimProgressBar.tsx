// apps/frontend/src/app/(dashboard)/dashboard/components/claims/ClaimProgressBar.tsx
'use client';

import React, { useMemo } from 'react';

type Props = {
  /** 0..100 */
  percent: number;
  /** Optional label on the left (e.g., "Checklist") */
  label?: string;
  /** Show "xx%" text on the right */
  showPercentText?: boolean;
  /** Small/medium/large height */
  size?: 'sm' | 'md' | 'lg';
  /** Optional helper text under bar */
  helperText?: string;
  /** If true, uses more muted styling */
  muted?: boolean;
  /** Class overrides */
  className?: string;
};

export default function ClaimProgressBar({
  percent,
  label = 'Progress',
  showPercentText = true,
  size = 'md',
  helperText,
  muted = false,
  className = '',
}: Props) {
  const pct = useMemo(() => {
    const n = Number.isFinite(percent) ? percent : 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }, [percent]);

  const h = size === 'sm' ? 'h-2' : size === 'lg' ? 'h-4' : 'h-3';

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-medium text-gray-700">{label}</div>
        {showPercentText ? (
          <div className="text-xs font-semibold text-gray-900">{pct}%</div>
        ) : null}
      </div>

      <div className={`mt-2 w-full rounded-full border ${muted ? 'bg-gray-50' : 'bg-white'}`}>
        <div
          className={[
            'rounded-full transition-[width] duration-300 ease-out',
            h,
            muted ? 'bg-emerald-500/70' : 'bg-emerald-600',
          ].join(' ')}
          style={{ width: `${pct}%` }}
          aria-label={`${label} ${pct}%`}
        />
      </div>

      {helperText ? (
        <div className="mt-2 text-xs text-gray-600">{helperText}</div>
      ) : null}
    </div>
  );
}
