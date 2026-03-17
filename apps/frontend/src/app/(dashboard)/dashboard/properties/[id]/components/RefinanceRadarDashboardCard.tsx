// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/RefinanceRadarDashboardCard.tsx
//
// Preview card for the Mortgage Refinance Radar, placed on the property dashboard.
// Follows the NeighborhoodRadarDashboardCard pattern exactly.

'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BarChart2, ChevronRight } from 'lucide-react';
import { MobileCard, StatusChip } from '@/components/mobile/dashboard/MobilePrimitives';
import {
  getRadarStatus,
  type RadarStatusAvailable,
} from '../tools/mortgage-refinance-radar/mortgageRefinanceRadarApi';
import { FEATURE_FLAGS } from '@/lib/featureFlags';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RefinanceRadarDashboardCard({
  propertyId,
}: {
  propertyId: string;
}) {
  const toolHref = `/dashboard/properties/${propertyId}/tools/mortgage-refinance-radar`;

  const { data, isLoading } = useQuery({
    queryKey: ['refinance-radar-status', propertyId],
    queryFn: () => getRadarStatus(propertyId),
    enabled: Boolean(propertyId) && FEATURE_FLAGS.MORTGAGE_REFINANCE_RADAR,
    staleTime: 10 * 60 * 1000,
  });

  // --- Loading skeleton ---
  if (isLoading) {
    return (
      <div className="h-16 animate-pulse rounded-[22px] bg-slate-100" aria-hidden="true" />
    );
  }

  // --- Unavailable state (no mortgage or rate data yet) ---
  if (!data || !data.available) {
    return (
      <Link href={toolHref} className="no-brand-style block">
        <MobileCard
          variant="compact"
          className="flex items-center gap-3 transition-colors hover:bg-[hsl(var(--mobile-bg-muted))]"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))]">
            <BarChart2 className="h-4 w-4 text-[hsl(var(--mobile-text-muted))]" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
              Mortgage Refinance Radar
            </p>
            <p className="mb-0 mt-0.5 text-[12px] text-[hsl(var(--mobile-text-secondary))]">
              {data?.available === false && (data as { reason?: string }).reason === 'MISSING_MORTGAGE_DATA'
                ? 'Add mortgage details to enable refinance monitoring'
                : 'Mortgage monitoring not yet available'}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        </MobileCard>
      </Link>
    );
  }

  const available = data as RadarStatusAvailable;
  const isOpen = available.radarState === 'OPEN';

  // --- Monitoring state (data available but no opportunity) ---
  if (!isOpen) {
    return (
      <Link href={toolHref} className="no-brand-style block">
        <MobileCard
          variant="compact"
          className="flex items-center gap-3 transition-colors hover:bg-[hsl(var(--mobile-bg-muted))]"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))]">
            <BarChart2 className="h-4 w-4 text-[hsl(var(--mobile-text-muted))]" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
              Mortgage Refinance Radar
            </p>
            <p className="mb-0 mt-0.5 text-[12px] text-[hsl(var(--mobile-text-secondary))]">
              No strong refinance opportunity right now
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        </MobileCard>
      </Link>
    );
  }

  // --- Opportunity detected ---
  return (
    <Link href={toolHref} className="no-brand-style block">
      <MobileCard
        variant="standard"
        className="space-y-2.5 transition-colors hover:bg-[hsl(var(--mobile-bg-muted))]"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))]">
              <BarChart2 className="h-3.5 w-3.5 text-[hsl(var(--mobile-brand-strong))]" aria-hidden="true" />
            </div>
            <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
              Mortgage Refinance Radar
            </p>
          </div>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2">
          <StatusChip tone="good">Refinance opportunity detected</StatusChip>
        </div>

        {/* Rate comparison + savings */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          <span>
            <span className="text-[hsl(var(--mobile-text-secondary))]">Your rate: </span>
            <span className="font-semibold text-[hsl(var(--mobile-text-primary))]">
              {available.currentRatePct.toFixed(3)}%
            </span>
          </span>
          <span>
            <span className="text-[hsl(var(--mobile-text-secondary))]">Market: </span>
            <span className="font-semibold text-[hsl(var(--mobile-text-primary))]">
              {available.marketRatePct.toFixed(3)}%
            </span>
          </span>
          {available.monthlySavings > 0 && (
            <span>
              <span className="text-[hsl(var(--mobile-text-secondary))]">Est. savings: </span>
              <span className="font-semibold text-emerald-600">
                ${Math.round(available.monthlySavings).toLocaleString()}/mo
              </span>
            </span>
          )}
        </div>

        {/* CTA */}
        <p className="mb-0 text-[13px] font-medium text-[hsl(var(--mobile-brand-strong))]">
          View refinance details
        </p>
      </MobileCard>
    </Link>
  );
}
