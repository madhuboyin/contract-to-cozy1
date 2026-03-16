'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { MOBILE_CARD_RADIUS, MOBILE_TYPE_TOKENS } from '@/components/mobile/dashboard/mobileDesignTokens';
import { warningSeverityClass } from './AdvisorUtils';
import type { RenovationAdvisorSession } from '@/types';

interface AdvisorWarningsCardProps {
  warnings: RenovationAdvisorSession['warnings'];
}

export function AdvisorWarningsCard({ warnings }: AdvisorWarningsCardProps) {
  if (!warnings || warnings.length === 0) return null;

  return (
    <div
      className={cn(
        MOBILE_CARD_RADIUS,
        'border border-[hsl(var(--mobile-border-subtle))] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]'
      )}
    >
      <p className="mb-3 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
        Notices ({warnings.length})
      </p>
      <div className="space-y-2">
        {warnings.map((w, i) => (
          <div
            key={i}
            className={cn(
              'rounded-xl border px-3 py-2.5',
              warningSeverityClass(w.severity)
            )}
          >
            <p className={cn('mb-0 font-semibold', MOBILE_TYPE_TOKENS.caption)}>{w.title}</p>
            <p className={cn('mb-0 mt-0.5 opacity-90', MOBILE_TYPE_TOKENS.caption)}>{w.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
