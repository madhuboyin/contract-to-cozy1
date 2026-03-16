'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { MOBILE_CARD_RADIUS, MOBILE_TYPE_TOKENS } from '@/components/mobile/dashboard/mobileDesignTokens';
import { formatMoneyRange, formatTaxTrigger, confidenceColorClass } from './AdvisorUtils';
import type { RenovationAdvisorSession } from '@/types';

interface AdvisorTaxCardProps {
  taxImpact: NonNullable<RenovationAdvisorSession['taxImpact']>;
}

export function AdvisorTaxCard({ taxImpact }: AdvisorTaxCardProps) {
  const confidenceClass = confidenceColorClass(taxImpact.confidenceLevel);

  return (
    <div
      className={cn(
        MOBILE_CARD_RADIUS,
        'border border-[hsl(var(--mobile-border-subtle))] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]'
      )}
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">Property tax impact</p>
        <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2.5 py-1', MOBILE_TYPE_TOKENS.chip, confidenceClass)}>
          {taxImpact.confidenceLevel === 'HIGH' ? 'High' : taxImpact.confidenceLevel === 'MEDIUM' ? 'Medium' : taxImpact.confidenceLevel === 'LOW' ? 'Low' : 'N/A'} confidence
        </span>
      </div>

      {/* Plain language summary */}
      {taxImpact.plainLanguageSummary && (
        <p className={cn('mb-3 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
          {taxImpact.plainLanguageSummary}
        </p>
      )}

      {/* Tax metrics grid */}
      {taxImpact.dataAvailable && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2.5">
            <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>Monthly tax increase</p>
            <p className="mb-0 mt-1 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
              {formatMoneyRange(taxImpact.monthlyTaxIncreaseRange.min, taxImpact.monthlyTaxIncreaseRange.max)}
            </p>
          </div>
          <div className="rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2.5">
            <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>Annual tax increase</p>
            <p className="mb-0 mt-1 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
              {formatMoneyRange(taxImpact.annualTaxIncreaseRange.min, taxImpact.annualTaxIncreaseRange.max)}
            </p>
          </div>
          <div className="col-span-2 rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2.5">
            <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>Assessed value increase est.</p>
            <p className="mb-0 mt-1 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
              {formatMoneyRange(taxImpact.assessedValueIncreaseRange.min, taxImpact.assessedValueIncreaseRange.max)}
            </p>
          </div>
        </div>
      )}

      {/* Reassessment info */}
      {taxImpact.reassessmentTriggerType && taxImpact.reassessmentTriggerType !== 'UNKNOWN' && (
        <div className="mb-3 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2.5">
          <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>Reassessment trigger</p>
          <p className={cn('mb-0 mt-0.5 text-[hsl(var(--mobile-text-primary))]', MOBILE_TYPE_TOKENS.body)}>
            {formatTaxTrigger(taxImpact.reassessmentTriggerType)}
          </p>
          {taxImpact.reassessmentTimelineSummary && (
            <p className={cn('mb-0 mt-1 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
              {taxImpact.reassessmentTimelineSummary}
            </p>
          )}
        </div>
      )}

      {!taxImpact.dataAvailable && (
        <p className={cn('text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
          Tax impact data not available for this area.
        </p>
      )}

      {/* Source note */}
      {taxImpact.sourceMeta.freshnessLabel && (
        <p className={cn('mt-2 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
          Source: {taxImpact.sourceMeta.sourceLabel} · {taxImpact.sourceMeta.freshnessLabel}
        </p>
      )}
    </div>
  );
}
