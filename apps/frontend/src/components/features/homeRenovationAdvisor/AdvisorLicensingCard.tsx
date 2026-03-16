'use client';

import * as React from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MOBILE_CARD_RADIUS, MOBILE_TYPE_TOKENS } from '@/components/mobile/dashboard/mobileDesignTokens';
import { formatLicenseStatus, formatLicenseCategory, confidenceColorClass, permitStatusColorClass } from './AdvisorUtils';
import type { RenovationAdvisorSession } from '@/types';

interface AdvisorLicensingCardProps {
  licensing: NonNullable<RenovationAdvisorSession['licensing']>;
}

export function AdvisorLicensingCard({ licensing }: AdvisorLicensingCardProps) {
  const confidenceClass = confidenceColorClass(licensing.confidenceLevel);
  const statusClass = permitStatusColorClass(licensing.requirementStatus);

  return (
    <div
      className={cn(
        MOBILE_CARD_RADIUS,
        'border border-[hsl(var(--mobile-border-subtle))] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]'
      )}
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">Contractor licensing</p>
        <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2.5 py-1', MOBILE_TYPE_TOKENS.chip, confidenceClass)}>
          {licensing.confidenceLevel === 'HIGH' ? 'High' : licensing.confidenceLevel === 'MEDIUM' ? 'Medium' : licensing.confidenceLevel === 'LOW' ? 'Low' : 'N/A'} confidence
        </span>
      </div>

      {/* Status badge */}
      <div className="mb-3">
        <span className={cn('inline-flex items-center rounded-full border px-3 py-1', MOBILE_TYPE_TOKENS.chip, statusClass)}>
          {formatLicenseStatus(licensing.requirementStatus)}
        </span>
      </div>

      {/* Plain language summary */}
      {licensing.plainLanguageSummary && (
        <p className={cn('mb-3 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.body)}>
          {licensing.plainLanguageSummary}
        </p>
      )}

      {/* Consequence summary */}
      {licensing.consequenceSummary && (
        <div className="mb-3 rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] px-3 py-2.5">
          <p className={cn('text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
            {licensing.consequenceSummary}
          </p>
        </div>
      )}

      {/* Applicable license categories */}
      {licensing.applicableCategories.length > 0 && (
        <div className="mb-3">
          <p className={cn('mb-1.5 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>Applicable license types</p>
          <div className="flex flex-wrap gap-1.5">
            {licensing.applicableCategories.map((cat, i) => (
              <span
                key={i}
                className={cn(
                  'inline-flex items-center rounded-full border px-2.5 py-1',
                  MOBILE_TYPE_TOKENS.chip,
                  cat.isApplicable
                    ? 'border-orange-200 bg-orange-50 text-orange-700'
                    : 'border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))] text-[hsl(var(--mobile-text-secondary))]'
                )}
              >
                {formatLicenseCategory(cat.licenseCategoryType)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Verification tool link */}
      {licensing.verificationTool.url && (
        <a
          href={licensing.verificationTool.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'mt-1 inline-flex items-center gap-1.5 text-[hsl(var(--mobile-brand-strong))]',
            MOBILE_TYPE_TOKENS.caption
          )}
        >
          {licensing.verificationTool.label ?? 'Verify contractor license'}
          <ExternalLink className="h-3 w-3" />
        </a>
      )}

      {!licensing.dataAvailable && (
        <p className={cn('text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
          Licensing data not available for this area.
        </p>
      )}

      {/* Source note */}
      {licensing.sourceMeta?.freshnessLabel && (
        <p className={cn('mt-3 text-[hsl(var(--mobile-text-muted))]', MOBILE_TYPE_TOKENS.caption)}>
          Source: {licensing.sourceMeta.sourceLabel} · {licensing.sourceMeta.freshnessLabel}
        </p>
      )}
    </div>
  );
}
