'use client';

// apps/frontend/src/components/features/homeRenovationAdvisor/AdvisorRetroactiveBar.tsx
//
// Context banner shown at the top of the advisor when the session is in
// RETROACTIVE_COMPLIANCE flow. Explains the purpose clearly without alarm.

import * as React from 'react';
import { History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MOBILE_CARD_RADIUS, MOBILE_TYPE_TOKENS } from '@/components/mobile/dashboard/mobileDesignTokens';

interface AdvisorRetroactiveBarProps {
  renovationLabel?: string;
}

export function AdvisorRetroactiveBar({ renovationLabel }: AdvisorRetroactiveBarProps) {
  return (
    <div
      className={cn(
        MOBILE_CARD_RADIUS,
        'flex items-start gap-3 border border-amber-200 bg-amber-50 p-3.5',
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-amber-300 bg-white">
        <History className="h-4 w-4 text-amber-700" />
      </div>
      <div className="min-w-0">
        <p className={cn('mb-0 font-semibold text-amber-800', MOBILE_TYPE_TOKENS.body)}>
          Retroactive compliance review
        </p>
        <p className={cn('mb-0 mt-0.5 text-amber-700', MOBILE_TYPE_TOKENS.caption)}>
          {renovationLabel
            ? `This ${renovationLabel} was already completed. CtC is helping you check for permit, tax, and licensing gaps that could matter at resale or during future inspections.`
            : 'This renovation was already completed. Use this check to identify any compliance gaps that could matter at resale or during future inspections.'}
        </p>
      </div>
    </div>
  );
}
