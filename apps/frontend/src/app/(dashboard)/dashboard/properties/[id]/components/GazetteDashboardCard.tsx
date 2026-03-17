// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/GazetteDashboardCard.tsx
//
// Property dashboard preview card for the Home Gazette.
// Follows the RefinanceRadarDashboardCard pattern exactly.

'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, FileText, Sparkles } from 'lucide-react';
import { MobileCard, StatusChip } from '@/components/mobile/dashboard/MobilePrimitives';
import { FEATURE_FLAGS } from '@/lib/featureFlags';
import { getCurrentEdition, type GazetteEditionDto } from '../tools/home-gazette/homeGazetteApi';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtWeekRange(weekStart: string, weekEnd: string): string {
  const s = new Date(weekStart);
  const e = new Date(weekEnd);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GazetteDashboardCard({ propertyId }: { propertyId: string }) {
  const toolHref = `/dashboard/properties/${propertyId}/tools/home-gazette`;

  const { data, isLoading } = useQuery({
    queryKey: ['gazette-current', propertyId],
    queryFn: () => getCurrentEdition(propertyId),
    enabled: Boolean(propertyId) && FEATURE_FLAGS.HOME_GAZETTE,
    staleTime: 10 * 60 * 1000,
  });

  // --- Loading skeleton ---
  if (isLoading) {
    return <div className="h-16 animate-pulse rounded-[22px] bg-slate-100" aria-hidden="true" />;
  }

  const edition = data as GazetteEditionDto | null;

  // --- No published edition yet (bootstrap state) ---
  if (!edition) {
    return (
      <Link href={toolHref} className="no-brand-style block">
        <MobileCard
          variant="compact"
          className="flex items-center gap-3 transition-colors hover:bg-[hsl(var(--mobile-bg-muted))]"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))]">
            <Sparkles className="h-4 w-4 text-[hsl(var(--mobile-text-muted))]" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
              Home Gazette
            </p>
            <p className="mb-0 mt-0.5 text-[12px] text-[hsl(var(--mobile-text-secondary))]">
              Your weekly home intelligence briefing is being set up
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        </MobileCard>
      </Link>
    );
  }

  // --- Skipped edition ---
  if (edition.status === 'SKIPPED') {
    return (
      <Link href={toolHref} className="no-brand-style block">
        <MobileCard
          variant="compact"
          className="flex items-center gap-3 transition-colors hover:bg-[hsl(var(--mobile-bg-muted))]"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[hsl(var(--mobile-bg-muted))]">
            <FileText className="h-4 w-4 text-[hsl(var(--mobile-text-muted))]" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
              Home Gazette
            </p>
            <p className="mb-0 mt-0.5 text-[12px] text-[hsl(var(--mobile-text-secondary))]">
              Quiet week — no significant updates to report
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        </MobileCard>
      </Link>
    );
  }

  // --- Published edition ---
  const heroHeadline =
    edition.summaryHeadline ??
    (edition.stories?.find((s) => s.isHero)?.headline) ??
    null;

  return (
    <Link href={toolHref} className="no-brand-style block">
      <MobileCard
        variant="standard"
        className="space-y-2.5 transition-colors hover:bg-[hsl(var(--mobile-bg-muted))]"
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))]">
              <FileText className="h-3.5 w-3.5 text-[hsl(var(--mobile-brand-strong))]" aria-hidden="true" />
            </div>
            <p className="mb-0 text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
              Home Gazette
            </p>
          </div>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        </div>

        {/* Status chip + week range */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="good">New this week</StatusChip>
          <span className="text-[12px] text-[hsl(var(--mobile-text-secondary))]">
            {fmtWeekRange(edition.weekStart, edition.weekEnd)}
          </span>
        </div>

        {/* Summary headline or hero headline */}
        {heroHeadline && (
          <p className="mb-0 line-clamp-2 text-[13px] leading-snug text-[hsl(var(--mobile-text-primary))]">
            {heroHeadline}
          </p>
        )}

        {/* Story count */}
        {edition.selectedCount > 0 && (
          <p className="mb-0 text-[12px] text-[hsl(var(--mobile-text-secondary))]">
            {edition.selectedCount} update{edition.selectedCount !== 1 ? 's' : ''} this week
          </p>
        )}

        {/* CTA */}
        <p className="mb-0 text-[13px] font-medium text-[hsl(var(--mobile-brand-strong))]">
          Read this week&apos;s briefing
        </p>
      </MobileCard>
    </Link>
  );
}
