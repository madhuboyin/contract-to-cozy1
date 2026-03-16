'use client';

import * as React from 'react';
import { AlertTriangle, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MOBILE_CARD_RADIUS, MOBILE_TYPE_TOKENS } from '@/components/mobile/dashboard/mobileDesignTokens';
import { warningSeverityClass } from './AdvisorUtils';
import type { RenovationAdvisorSession } from '@/types';

type Warning = RenovationAdvisorSession['warnings'][number];

interface AdvisorWarningsCardProps {
  warnings: Warning[];
}

const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

function severityIcon(w: Warning) {
  const urgentNow = w.urgency === 'IMMEDIATE' || w.urgency === 'HIGH';
  if (w.severity === 'CRITICAL') {
    return <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />;
  }
  if (w.severity === 'WARNING' && urgentNow) {
    return <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />;
  }
  if (w.severity === 'WARNING') {
    return <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />;
  }
  return <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />;
}

export function AdvisorWarningsCard({ warnings }: AdvisorWarningsCardProps) {
  if (!warnings || warnings.length === 0) return null;

  const sorted = [...warnings].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2),
  );

  const criticalCount = sorted.filter((w) => w.severity === 'CRITICAL').length;

  return (
    <div
      className={cn(
        MOBILE_CARD_RADIUS,
        'border border-[hsl(var(--mobile-border-subtle))] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]',
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
          Notices
        </p>
        {criticalCount > 0 && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
              MOBILE_TYPE_TOKENS.chip,
              'border-red-200 bg-red-50 text-red-700',
            )}
          >
            <XCircle className="h-2.5 w-2.5" />
            {criticalCount} critical
          </span>
        )}
      </div>
      <div className="space-y-2">
        {sorted.map((w, i) => (
          <div
            key={`${w.code}-${i}`}
            className={cn(
              'flex items-start gap-2.5 rounded-xl border px-3 py-2.5',
              warningSeverityClass(w.severity),
            )}
          >
            {severityIcon(w)}
            <div className="min-w-0">
              <p className={cn('mb-0 font-semibold', MOBILE_TYPE_TOKENS.caption)}>{w.title}</p>
              <p className={cn('mb-0 mt-0.5 opacity-90', MOBILE_TYPE_TOKENS.caption)}>
                {w.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
