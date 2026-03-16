'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { MOBILE_CARD_RADIUS, MOBILE_TYPE_TOKENS } from '@/components/mobile/dashboard/mobileDesignTokens';
import {
  formatRenovationType,
  formatRiskLevel,
  formatConfidence,
  formatPermitStatus,
  formatLicenseStatus,
  formatMoneyRange,
  riskColorClass,
  confidenceColorClass,
  permitStatusColorClass,
} from './AdvisorUtils';
import type { RenovationAdvisorSession } from '@/types';

interface AdvisorSummaryCardProps {
  session: RenovationAdvisorSession;
  onRerun: () => void;
  isRerunning: boolean;
}

export function AdvisorSummaryCard({ session, onRerun, isRerunning }: AdvisorSummaryCardProps) {
  const riskColors = riskColorClass(session.overallRiskLevel);
  const confidenceClass = confidenceColorClass(session.overallConfidence);

  const permitStatus = session.permit?.requirementStatus ?? 'UNKNOWN';
  const licenseStatus = session.licensing?.requirementStatus ?? 'UNKNOWN';
  const monthlyTaxMin = session.taxImpact?.monthlyTaxIncreaseRange?.min ?? null;
  const monthlyTaxMax = session.taxImpact?.monthlyTaxIncreaseRange?.max ?? null;

  return (
    <div
      className={cn(
        MOBILE_CARD_RADIUS,
        'border border-[hsl(var(--mobile-border-subtle))] bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.06)]'
      )}
    >
      {/* Header row */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('mb-0 text-[11px] font-medium uppercase tracking-[0.12em] text-[hsl(var(--mobile-text-muted))]')}>
            Renovation check
          </p>
          <h2 className="mb-0 mt-0.5 text-base font-semibold leading-tight text-[hsl(var(--mobile-text-primary))]">
            {formatRenovationType(session.renovationType)}
          </h2>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {/* Risk level chip */}
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
              MOBILE_TYPE_TOKENS.chip,
              riskColors.text,
              riskColors.bg,
              riskColors.border
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', riskColors.dot)} />
            {formatRiskLevel(session.overallRiskLevel)}
          </span>
          {/* Confidence chip */}
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2.5 py-1',
              MOBILE_TYPE_TOKENS.chip,
              confidenceClass
            )}
          >
            {formatConfidence(session.overallConfidence)}
          </span>
        </div>
      </div>

      {/* Summary text */}
      {session.overallSummary && (
        <p className={cn('mb-3 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
          {session.overallSummary}
        </p>
      )}

      {/* 3-row outcome summary */}
      <div className="mb-3 space-y-2 rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] p-3">
        {/* Permit row */}
        <div className="flex items-center justify-between gap-2">
          <span className={cn('text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>Permit</span>
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2 py-0.5',
              MOBILE_TYPE_TOKENS.chip,
              permitStatusColorClass(permitStatus)
            )}
          >
            {formatPermitStatus(permitStatus)}
          </span>
        </div>

        {/* Tax row */}
        <div className="flex items-center justify-between gap-2">
          <span className={cn('text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>Tax impact</span>
          <span className={cn('font-medium text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.body)}>
            {monthlyTaxMin == null && monthlyTaxMax == null
              ? session.taxImpact?.dataAvailable === false
                ? 'Data unavailable'
                : 'See tax details'
              : `${formatMoneyRange(monthlyTaxMin, monthlyTaxMax)}/mo`}
          </span>
        </div>

        {/* Licensing row */}
        <div className="flex items-center justify-between gap-2">
          <span className={cn('text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>Contractor license</span>
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2 py-0.5',
              MOBILE_TYPE_TOKENS.chip,
              permitStatusColorClass(licenseStatus)
            )}
          >
            {formatLicenseStatus(licenseStatus)}
          </span>
        </div>
      </div>

      {/* Low-confidence / unsupported area notice */}
      {session.uiMeta?.unsupportedArea && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <p className={cn('text-amber-700', MOBILE_TYPE_TOKENS.caption)}>
            Limited local data available. Estimates use national fallback rules.
          </p>
        </div>
      )}
      {!session.uiMeta?.unsupportedArea && session.uiMeta?.lowConfidenceAreas?.length > 0 && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <p className={cn('text-amber-700', MOBILE_TYPE_TOKENS.caption)}>
            Some estimates for your area use fallback rules when local data is limited.
          </p>
        </div>
      )}

      {/* Re-run action */}
      <button
        type="button"
        onClick={onRerun}
        disabled={isRerunning}
        className={cn(
          'inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl',
          'border border-[hsl(var(--mobile-border-subtle))] bg-white px-4 py-2',
          'text-sm font-semibold text-[hsl(var(--mobile-text-primary))]',
          'hover:bg-[hsl(var(--mobile-bg-muted))] transition-colors',
          'disabled:opacity-50'
        )}
      >
        Re-run check
      </button>
    </div>
  );
}
