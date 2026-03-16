'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { MOBILE_CARD_RADIUS, MOBILE_TYPE_TOKENS } from '@/components/mobile/dashboard/mobileDesignTokens';
import type { RenovationAdvisorSession } from '@/types';

interface AdvisorAssumptionsCardProps {
  assumptions: RenovationAdvisorSession['assumptions'];
}

export function AdvisorAssumptionsCard({ assumptions }: AdvisorAssumptionsCardProps) {
  const [expanded, setExpanded] = React.useState(false);

  if (!assumptions || assumptions.length === 0) return null;

  const visible = assumptions.filter((a) => a.isUserVisible);
  if (visible.length === 0) return null;

  return (
    <div
      className={cn(
        MOBILE_CARD_RADIUS,
        'border border-[hsl(var(--mobile-border-subtle))] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]'
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2"
        aria-expanded={expanded}
      >
        <p className="text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
          Assumptions used ({visible.length})
        </p>
        <span className={cn('text-[hsl(var(--mobile-brand-strong))]', MOBILE_TYPE_TOKENS.caption)}>
          {expanded ? '↑ Hide' : '↓ Show'}
        </span>
      </button>

      {!expanded && (
        <p className={cn('mt-1 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
          Some estimates use fallback assumptions. Tap to see what was assumed.
        </p>
      )}

      {expanded && (
        <div className="mt-3 space-y-2">
          {visible.map((a, i) => (
            <div
              key={i}
              className="rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2.5"
            >
              <p className={cn('mb-0 font-medium text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.caption)}>
                {a.assumptionLabel}
              </p>
              {(a.assumptionValueText != null || a.assumptionValueNumber != null) && (
                <p className={cn('mb-0 mt-0.5 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
                  {a.assumptionValueText ??
                    (a.assumptionValueNumber != null
                      ? `${a.assumptionValueNumber}${a.assumptionUnit ? ` ${a.assumptionUnit}` : ''}`
                      : '')}
                </p>
              )}
              {a.rationale && (
                <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
                  {a.rationale}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
