'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Radar, TrendingDown, TrendingUp } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  MobileCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { getNeighborhoodRadarSummary } from '../tools/neighborhood-change-radar/neighborhoodRadarApi';
import type { NeighborhoodOverallEffect } from '@/types';

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

type EffectTone = 'good' | 'elevated' | 'danger' | 'info';

const EFFECT_TONE: Record<NeighborhoodOverallEffect, EffectTone> = {
  HIGHLY_POSITIVE: 'good',
  MODERATELY_POSITIVE: 'good',
  MIXED: 'elevated',
  NEUTRAL: 'info',
  MODERATELY_NEGATIVE: 'danger',
  HIGHLY_NEGATIVE: 'danger',
};

const EFFECT_LABEL: Record<NeighborhoodOverallEffect, string> = {
  HIGHLY_POSITIVE: 'Positive',
  MODERATELY_POSITIVE: 'Positive',
  MIXED: 'Mixed',
  NEUTRAL: 'Neutral',
  MODERATELY_NEGATIVE: 'Negative',
  HIGHLY_NEGATIVE: 'Negative',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NeighborhoodRadarDashboardCard({
  propertyId,
}: {
  propertyId: string;
}) {
  const toolHref = `/dashboard/properties/${propertyId}/tools/neighborhood-change-radar`;

  const { data: summary, isLoading } = useQuery({
    queryKey: ['neighborhood-radar-summary', propertyId],
    queryFn: () => getNeighborhoodRadarSummary(propertyId),
    staleTime: 10 * 60 * 1000,
  });

  // --- Loading skeleton ---
  if (isLoading) {
    return (
      <div className="h-24 animate-pulse rounded-[22px] bg-slate-100" aria-hidden="true" />
    );
  }

  // --- Empty state ---
  if (!summary || summary.meaningfulChangeCount === 0) {
    return (
      <Link href={toolHref} className="no-brand-style block">
        <MobileCard
          variant="compact"
          className="flex items-center gap-3 transition-colors hover:bg-[hsl(var(--mobile-bg-muted))]"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))]">
            <Radar className="h-4 w-4 text-[hsl(var(--mobile-text-muted))]" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
              Neighborhood Change Radar
            </p>
            <p className="mb-0 mt-0.5 text-[12px] text-[hsl(var(--mobile-text-secondary))]">
              No major changes detected right now
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        </MobileCard>
      </Link>
    );
  }

  // --- Active state ---
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
              <Radar className="h-3.5 w-3.5 text-[hsl(var(--mobile-brand-strong))]" aria-hidden="true" />
            </div>
            <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
              Neighborhood Change Radar
            </p>
          </div>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        </div>

        {/* Count + effect */}
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-[hsl(var(--mobile-text-primary))]">
            {summary.meaningfulChangeCount}
          </span>
          <span className="text-[13px] text-[hsl(var(--mobile-text-secondary))]">
            meaningful {summary.meaningfulChangeCount === 1 ? 'change' : 'changes'} nearby
          </span>
          {summary.overallSentiment && (
            <StatusChip tone={EFFECT_TONE[summary.overallSentiment]}>
              {EFFECT_LABEL[summary.overallSentiment]}
            </StatusChip>
          )}
        </div>

        {/* Top signal */}
        {summary.mostImportantEvent && (
          <p className="mb-0 text-[13px] leading-snug text-[hsl(var(--mobile-text-secondary))]">
            Top signal: {summary.mostImportantEvent.title}
          </p>
        )}

        {/* Themes */}
        {(summary.topPositiveThemes.length > 0 || summary.topNegativeThemes.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {summary.topPositiveThemes.slice(0, 2).map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
              >
                <TrendingUp className="h-2.5 w-2.5" aria-hidden="true" />
                {t}
              </span>
            ))}
            {summary.topNegativeThemes.slice(0, 2).map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700"
              >
                <TrendingDown className="h-2.5 w-2.5" aria-hidden="true" />
                {t}
              </span>
            ))}
          </div>
        )}

        {/* CTA row */}
        <p className="mb-0 text-[13px] font-medium text-[hsl(var(--mobile-brand-strong))]">
          View neighborhood changes
        </p>
      </MobileCard>
    </Link>
  );
}
