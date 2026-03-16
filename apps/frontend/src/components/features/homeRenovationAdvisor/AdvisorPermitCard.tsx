'use client';

import * as React from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MOBILE_CARD_RADIUS, MOBILE_TYPE_TOKENS } from '@/components/mobile/dashboard/mobileDesignTokens';
import {
  formatPermitStatus,
  formatPermitType,
  formatInspectionStage,
  formatMoneyRange,
  formatDayRange,
  confidenceColorClass,
  permitStatusColorClass,
} from './AdvisorUtils';
import type { RenovationAdvisorSession } from '@/types';

interface AdvisorPermitCardProps {
  permit: NonNullable<RenovationAdvisorSession['permit']>;
}

export function AdvisorPermitCard({ permit }: AdvisorPermitCardProps) {
  const statusClass = permitStatusColorClass(permit.requirementStatus);
  const confidenceClass = confidenceColorClass(permit.confidenceLevel);
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div
      className={cn(
        MOBILE_CARD_RADIUS,
        'border border-[hsl(var(--mobile-border-subtle))] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]'
      )}
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">Permit requirements</p>
        <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2.5 py-1', MOBILE_TYPE_TOKENS.chip, confidenceClass)}>
          {permit.confidenceLevel === 'HIGH' ? 'High' : permit.confidenceLevel === 'MEDIUM' ? 'Medium' : permit.confidenceLevel === 'LOW' ? 'Low' : 'N/A'} confidence
        </span>
      </div>

      {/* Status badge */}
      <div className="mb-3">
        <span className={cn('inline-flex items-center rounded-full border px-3 py-1', MOBILE_TYPE_TOKENS.chip, statusClass)}>
          {formatPermitStatus(permit.requirementStatus)}
        </span>
      </div>

      {/* Summary */}
      {permit.summary && (
        <p className={cn('mb-3 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
          {permit.summary}
        </p>
      )}

      {/* Cost + timeline */}
      {permit.dataAvailable && (permit.costRange.min != null || permit.costRange.max != null || permit.timelineRangeDays.min != null) && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          {(permit.costRange.min != null || permit.costRange.max != null) && (
            <div className="rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2.5">
              <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>Permit cost est.</p>
              <p className="mb-0 mt-1 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
                {formatMoneyRange(permit.costRange.min, permit.costRange.max)}
              </p>
            </div>
          )}
          {(permit.timelineRangeDays.min != null || permit.timelineRangeDays.max != null) && (
            <div className="rounded-2xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2.5">
              <p className={cn('mb-0 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>Timeline est.</p>
              <p className="mb-0 mt-1 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
                {formatDayRange(permit.timelineRangeDays.min, permit.timelineRangeDays.max)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Expandable details */}
      {permit.dataAvailable && (permit.permitTypes.length > 0 || permit.inspectionStages.length > 0) && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={cn('mb-2 text-[hsl(var(--mobile-brand-strong))]', MOBILE_TYPE_TOKENS.caption)}
          >
            {expanded ? 'Hide details ↑' : 'Show permit types + inspection stages ↓'}
          </button>

          {expanded && (
            <div className="space-y-3">
              {permit.permitTypes.length > 0 && (
                <div>
                  <p className={cn('mb-1.5 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>Permit types</p>
                  <div className="flex flex-wrap gap-1.5">
                    {permit.permitTypes.map((pt, i) => (
                      <span
                        key={i}
                        className={cn(
                          'inline-flex items-center rounded-full border px-2.5 py-1',
                          MOBILE_TYPE_TOKENS.chip,
                          pt.isRequired
                            ? 'border-orange-200 bg-orange-50 text-orange-700'
                            : 'border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] text-[hsl(var(--mobile-text-secondary))]'
                        )}
                      >
                        {formatPermitType(pt.permitType)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {permit.inspectionStages.length > 0 && (
                <div>
                  <p className={cn('mb-1.5 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>Inspection stages</p>
                  <div className="flex flex-wrap gap-1.5">
                    {permit.inspectionStages.map((s, i) => (
                      <span
                        key={i}
                        className={cn(
                          'inline-flex items-center rounded-full border px-2.5 py-1',
                          MOBILE_TYPE_TOKENS.chip,
                          'border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] text-[hsl(var(--mobile-text-secondary))]'
                        )}
                      >
                        {formatInspectionStage(s.inspectionStageType)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Application portal link */}
      {permit.applicationPortal.url && (
        <a
          href={permit.applicationPortal.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'mt-3 inline-flex items-center gap-1.5 text-[hsl(var(--mobile-brand-strong))]',
            MOBILE_TYPE_TOKENS.caption
          )}
        >
          {permit.applicationPortal.label ?? 'Permit application portal'}
          <ExternalLink className="h-3 w-3" />
        </a>
      )}

      {/* Data unavailable */}
      {!permit.dataAvailable && (
        <p className={cn('text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
          Permit data not available for this area.
        </p>
      )}

      {/* Source note */}
      {permit.sourceMeta.freshnessLabel && (
        <p className={cn('mt-3 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
          Source: {permit.sourceMeta.sourceLabel} · {permit.sourceMeta.freshnessLabel}
        </p>
      )}
    </div>
  );
}
