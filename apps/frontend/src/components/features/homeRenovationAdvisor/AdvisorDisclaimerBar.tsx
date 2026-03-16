'use client';

// apps/frontend/src/components/features/homeRenovationAdvisor/AdvisorDisclaimerBar.tsx
//
// Persistent, muted disclaimer bar shown below results.
// Not alarming — just informational context about estimate limitations.

import * as React from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MOBILE_TYPE_TOKENS } from '@/components/mobile/dashboard/mobileDesignTokens';

interface AdvisorDisclaimerBarProps {
  disclaimerText?: string | null;
  disclaimerVersion?: string | null;
  className?: string;
}

const DEFAULT_DISCLAIMER =
  'Estimates are based on jurisdiction-specific rules where available, and national defaults where local data is limited. Always verify requirements with your local building department before making any decisions.';

export function AdvisorDisclaimerBar({
  disclaimerText,
  disclaimerVersion,
  className,
}: AdvisorDisclaimerBarProps) {
  const text = disclaimerText || DEFAULT_DISCLAIMER;

  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3.5 py-3',
        className,
      )}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--mobile-text-muted))]" />
      <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
        {text}
        {disclaimerVersion && (
          <span className="ml-1.5 opacity-50">v{disclaimerVersion}</span>
        )}
      </p>
    </div>
  );
}
