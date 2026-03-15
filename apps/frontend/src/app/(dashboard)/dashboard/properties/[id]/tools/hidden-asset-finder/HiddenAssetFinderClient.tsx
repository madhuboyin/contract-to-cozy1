'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useToast } from '@/components/ui/use-toast';
import {
  EmptyStateCard,
  MetricRow,
  MobileCard,
  MobileFilterSurface,
  MobilePageContainer,
  MobilePageIntro,
  MobileSection,
  MobileSectionHeader,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import HomeToolsRail from '../../components/HomeToolsRail';
import type {
  HiddenAssetCategory,
  HiddenAssetConfidenceLevel,
  HiddenAssetMatchDTO,
  HiddenAssetMatchSummaryDTO,
} from '@/types';
import {
  getHiddenAssetMatches,
  refreshHiddenAssetMatches,
  updateHiddenAssetMatchStatus,
} from './hiddenAssetApi';

// ============================================================================
// CONSTANTS / DISPLAY CONFIG
// ============================================================================

const CATEGORY_LABEL: Record<HiddenAssetCategory, string> = {
  TAX_EXEMPTION: 'Tax Exemption',
  REBATE: 'Rebate',
  UTILITY_INCENTIVE: 'Utility Incentive',
  INSURANCE_DISCOUNT: 'Insurance Discount',
  ENERGY_CREDIT: 'Energy Credit',
  LOCAL_GRANT: 'Local Grant',
  HISTORIC_BENEFIT: 'Historic Benefit',
  STORM_RESILIENCE: 'Storm Resilience',
};

const ALL_CATEGORIES: HiddenAssetCategory[] = [
  'TAX_EXEMPTION',
  'REBATE',
  'UTILITY_INCENTIVE',
  'INSURANCE_DISCOUNT',
  'ENERGY_CREDIT',
  'LOCAL_GRANT',
  'HISTORIC_BENEFIT',
  'STORM_RESILIENCE',
];

type ConfidenceTone = 'good' | 'elevated' | 'info';

const CONFIDENCE_TONE: Record<HiddenAssetConfidenceLevel, ConfidenceTone> = {
  HIGH: 'good',
  MEDIUM: 'elevated',
  LOW: 'info',
};

// ============================================================================
// HELPERS
// ============================================================================

function formatValueRange(
  min: number | null,
  max: number | null,
  currency = 'USD',
): string | null {
  if (min == null && max == null) return null;
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  if (min != null && max != null) return `${fmt(min)} – ${fmt(max)}`;
  if (min != null) return `From ${fmt(min)}`;
  return `Up to ${fmt(max!)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

// ============================================================================
// SKELETON
// ============================================================================

function HiddenAssetSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-24 rounded-[22px] bg-gray-100" />
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-20 rounded-[22px] bg-gray-100" />
      ))}
    </div>
  );
}

// ============================================================================
// SUMMARY CARD
// ============================================================================

function HiddenAssetSummaryCard({
  summary,
  onRefresh,
  isRefreshing,
}: {
  summary: HiddenAssetMatchSummaryDTO;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const valueRange = formatValueRange(null, null); // summary has no total value — omit
  return (
    <MobileCard variant="standard">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--mobile-text-secondary))]">
            Benefits Overview
          </p>
          <MetricRow
            label="Potential opportunities"
            value={String(summary.totalMatches)}
          />
          <MetricRow
            label="High-confidence matches"
            value={String(summary.highConfidenceCount)}
          />
          <MetricRow
            label="Last scanned"
            value={summary.lastScanAt ? formatDate(summary.lastScanAt) : 'Not yet scanned'}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="shrink-0 gap-1.5 rounded-full"
        >
          {isRefreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {isRefreshing ? 'Scanning…' : 'Re-scan'}
        </Button>
      </div>
    </MobileCard>
  );
}

// ============================================================================
// MATCH CARD
// ============================================================================

function HiddenAssetMatchCard({
  match,
  onClick,
}: {
  match: HiddenAssetMatchDTO;
  onClick: () => void;
}) {
  const valueStr = formatValueRange(
    match.estimatedValueMin,
    match.estimatedValueMax,
    match.currency,
  );
  const snippet =
    match.matchReasons && match.matchReasons.length > 0
      ? match.matchReasons[0]
      : match.description;

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full text-left"
    >
      <MobileCard
        variant="standard"
        className="transition-colors hover:bg-[hsl(var(--mobile-bg-muted))]"
      >
        {/* Category + confidence */}
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <StatusChip tone="info">{CATEGORY_LABEL[match.category]}</StatusChip>
          <StatusChip tone={CONFIDENCE_TONE[match.confidenceLevel]}>
            {match.eligibilityLabel}
          </StatusChip>
        </div>

        {/* Name */}
        <p className="mb-1 text-base font-semibold leading-tight">{match.programName}</p>

        {/* Snippet */}
        {snippet && (
          <p className="mb-2 line-clamp-2 text-sm leading-[1.45] text-[hsl(var(--mobile-text-secondary))]">
            {snippet}
          </p>
        )}

        {/* Footer row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[hsl(var(--mobile-text-secondary))]">
          {valueStr && (
            <span className="font-semibold text-[hsl(var(--foreground))]">{valueStr}</span>
          )}
          {match.lastVerifiedAt && (
            <span>Verified {formatDate(match.lastVerifiedAt)}</span>
          )}
          {match.sourceLabel && <span>{match.sourceLabel}</span>}
        </div>

        {/* Freshness warning */}
        {match.freshnessNote && (
          <div className="mt-2 flex items-start gap-1.5 rounded-xl border border-amber-200/70 bg-amber-50/80 px-2.5 py-1.5">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
            <p className="text-[11px] leading-snug text-amber-700">{match.freshnessNote}</p>
          </div>
        )}
      </MobileCard>
    </button>
  );
}

// ============================================================================
// MATCH DETAIL SHEET
// ============================================================================

function HiddenAssetDetailSheet({
  match,
  open,
  onOpenChange,
  onDismiss,
  onClaim,
  isUpdating,
}: {
  match: HiddenAssetMatchDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDismiss: () => void;
  onClaim: () => void;
  isUpdating: boolean;
}) {
  if (!match) return null;

  const valueStr = formatValueRange(
    match.estimatedValueMin,
    match.estimatedValueMax,
    match.currency,
  );

  const canAct =
    match.status !== 'DISMISSED' && match.status !== 'CLAIMED' && !isUpdating;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="pr-8 text-base">{match.programName}</SheetTitle>
          <SheetDescription className="sr-only">
            Details for {match.programName}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col overflow-y-auto px-5 py-5 space-y-5">
          {/* Category + confidence */}
          <div className="flex flex-wrap gap-2">
            <StatusChip tone="info">{CATEGORY_LABEL[match.category]}</StatusChip>
            <StatusChip tone={CONFIDENCE_TONE[match.confidenceLevel]}>
              {match.eligibilityLabel}
            </StatusChip>
          </div>

          {/* Description */}
          {match.description && (
            <div className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--mobile-text-secondary))]">
                About this program
              </h3>
              <p className="text-sm leading-[1.5] text-[hsl(var(--foreground))]">
                {match.description}
              </p>
            </div>
          )}

          {/* Why this may apply */}
          {match.matchReasons && match.matchReasons.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--mobile-text-secondary))]">
                Why this may apply
              </h3>
              <ul className="space-y-1.5">
                {match.matchReasons.map((reason, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm leading-[1.45]">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--mobile-brand-border))]" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Estimated value */}
          {valueStr && (
            <div className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--mobile-text-secondary))]">
                Potential value
              </h3>
              <p className="text-sm font-semibold">{valueStr}</p>
              <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">
                Estimates only — actual benefit depends on your eligibility and program rules.
              </p>
            </div>
          )}

          {/* Dates */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--mobile-text-secondary))]">
              Program dates
            </h3>
            <div className="space-y-1 text-sm">
              {match.lastVerifiedAt && (
                <p>
                  <span className="text-[hsl(var(--mobile-text-secondary))]">Last verified: </span>
                  {formatDate(match.lastVerifiedAt)}
                </p>
              )}
              {match.expiresAt && (
                <p>
                  <span className="text-[hsl(var(--mobile-text-secondary))]">Expires: </span>
                  {formatDate(match.expiresAt)}
                </p>
              )}
              {!match.lastVerifiedAt && !match.expiresAt && (
                <p className="text-[hsl(var(--mobile-text-secondary))]">No date information available.</p>
              )}
            </div>
          </div>

          {/* Eligibility notes */}
          {match.eligibilityNotes && (
            <div className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--mobile-text-secondary))]">
                Eligibility notes
              </h3>
              <p className="text-sm leading-[1.5] text-[hsl(var(--foreground))]">
                {match.eligibilityNotes}
              </p>
            </div>
          )}

          {/* Official source */}
          {match.sourceUrl && (
            <div>
              <a
                href={match.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[hsl(var(--mobile-border-subtle))] px-3 py-2 text-sm font-medium hover:bg-[hsl(var(--mobile-bg-muted))]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {match.sourceLabel ?? 'View official source'}
              </a>
            </div>
          )}

          {/* Freshness note */}
          {match.freshnessNote && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200/70 bg-amber-50/80 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-xs leading-snug text-amber-700">{match.freshnessNote}</p>
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-xs leading-snug text-[hsl(var(--mobile-text-secondary))]">
            This is a potential match based on your property details. Verify eligibility directly
            with the program administrator before taking action.
          </p>
        </div>

        {/* Footer actions */}
        {canAct && (
          <div className="border-t px-5 py-3 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={onDismiss}
              disabled={isUpdating}
            >
              Dismiss
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={onClaim}
              disabled={isUpdating}
            >
              {isUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Mark as Claimed'}
            </Button>
          </div>
        )}
        {match.status === 'DISMISSED' && (
          <div className="border-t px-5 py-3">
            <p className="text-center text-xs text-[hsl(var(--mobile-text-secondary))]">
              You dismissed this match.
            </p>
          </div>
        )}
        {match.status === 'CLAIMED' && (
          <div className="border-t px-5 py-3">
            <p className="text-center text-xs text-green-700">
              Marked as claimed on {formatDate(match.claimedAt)}.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// FILTER CHIP STRIP
// ============================================================================

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex min-h-[32px] items-center rounded-full px-3 text-[11px] font-medium transition-colors',
        active
          ? 'border border-slate-900 bg-slate-900 text-white'
          : 'border border-[hsl(var(--mobile-border-subtle))] text-slate-600 hover:border-slate-300/70',
      )}
    >
      {label}
    </button>
  );
}

// ============================================================================
// MAIN CLIENT COMPONENT
// ============================================================================

export default function HiddenAssetFinderClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [categoryFilter, setCategoryFilter] = useState<HiddenAssetCategory | null>(null);
  const [confidenceFilter, setConfidenceFilter] = useState<HiddenAssetConfidenceLevel | null>(
    null,
  );
  const [selectedMatch, setSelectedMatch] = useState<HiddenAssetMatchDTO | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // ---- Query ----
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['hidden-assets', propertyId, categoryFilter, confidenceFilter],
    queryFn: () =>
      getHiddenAssetMatches(propertyId, {
        category: categoryFilter ?? undefined,
        confidenceLevel: confidenceFilter ?? undefined,
      }),
    enabled: !!propertyId,
  });

  // ---- Refresh mutation ----
  const refreshMutation = useMutation({
    mutationFn: () => refreshHiddenAssetMatches(propertyId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['hidden-assets', propertyId] });
      toast({
        title: 'Scan complete',
        description: `Found ${result.matchesFound} potential benefit${result.matchesFound !== 1 ? 's' : ''} for this property.`,
      });
    },
    onError: () =>
      toast({ title: 'Scan failed. Please try again.', variant: 'destructive' }),
  });

  // ---- Status mutation ----
  const statusMutation = useMutation({
    mutationFn: ({
      matchId,
      status,
    }: {
      matchId: string;
      status: 'VIEWED' | 'DISMISSED' | 'CLAIMED';
    }) => updateHiddenAssetMatchStatus(matchId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hidden-assets', propertyId] });
    },
    onError: () =>
      toast({ title: 'Could not update status.', variant: 'destructive' }),
  });

  function openDetail(match: HiddenAssetMatchDTO) {
    setSelectedMatch(match);
    setDetailOpen(true);
    // Fire-and-forget: mark as VIEWED if not already acted on
    if (match.status === 'DETECTED') {
      statusMutation.mutate({ matchId: match.id, status: 'VIEWED' });
    }
  }

  function handleDismiss() {
    if (!selectedMatch) return;
    statusMutation.mutate(
      { matchId: selectedMatch.id, status: 'DISMISSED' },
      { onSuccess: () => setDetailOpen(false) },
    );
  }

  function handleClaim() {
    if (!selectedMatch) return;
    statusMutation.mutate(
      { matchId: selectedMatch.id, status: 'CLAIMED' },
      {
        onSuccess: () => {
          setDetailOpen(false);
          toast({ title: 'Marked as claimed.' });
        },
      },
    );
  }

  const matches = data?.matches ?? [];
  const summary = data?.summary;

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-7xl lg:px-8 lg:pb-10">
      {/* Back button */}
      <Button
        variant="ghost"
        className="min-h-[44px] w-fit px-0 text-muted-foreground"
        asChild
      >
        <Link href={`/dashboard/properties/${propertyId}`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to property
        </Link>
      </Button>

      {/* Page intro */}
      <MobilePageIntro
        eyebrow="Home Tool"
        title="Hidden Asset Finder"
        subtitle="Find potential rebates, tax benefits, discounts, and grants tied to your home."
      />

      {/* Filter surface: tool rail + filters */}
      <MobileFilterSurface>
        <HomeToolsRail propertyId={propertyId} />

        {/* Category filter chips */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {ALL_CATEGORIES.map((cat) => (
            <FilterChip
              key={cat}
              label={CATEGORY_LABEL[cat]}
              active={categoryFilter === cat}
              onClick={() => setCategoryFilter((prev) => (prev === cat ? null : cat))}
            />
          ))}
        </div>

        {/* Confidence filter chips */}
        <div className="flex flex-wrap gap-1.5">
          {(['HIGH', 'MEDIUM', 'LOW'] as HiddenAssetConfidenceLevel[]).map((level) => (
            <FilterChip
              key={level}
              label={
                level === 'HIGH'
                  ? 'Likely eligible'
                  : level === 'MEDIUM'
                    ? 'Possibly eligible'
                    : 'Worth verifying'
              }
              active={confidenceFilter === level}
              onClick={() =>
                setConfidenceFilter((prev) => (prev === level ? null : level))
              }
            />
          ))}
        </div>
      </MobileFilterSurface>

      {/* Summary card (shown once data loads) */}
      {summary && (
        <HiddenAssetSummaryCard
          summary={summary}
          onRefresh={() => refreshMutation.mutate()}
          isRefreshing={refreshMutation.isPending}
        />
      )}

      {/* Refresh CTA if no summary yet */}
      {!summary && !isLoading && !isError && (
        <Button
          variant="outline"
          className="w-full gap-2 rounded-full"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
        >
          {refreshMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {refreshMutation.isPending ? 'Scanning property…' : 'Scan for Benefits'}
        </Button>
      )}

      {/* Content states */}
      {isLoading ? (
        <HiddenAssetSkeleton />
      ) : isError ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200/70 bg-red-50/85 p-3">
          <div className="flex-1 text-sm text-red-600">
            Could not load benefits data. Please try again.
          </div>
          <button
            onClick={() => refetch()}
            className="shrink-0 text-sm font-medium text-red-700 hover:text-red-900"
          >
            Retry
          </button>
        </div>
      ) : matches.length === 0 ? (
        <EmptyStateCard
          title="No benefits detected yet"
          description="Run a scan to check for potential tax exemptions, rebates, discounts, and other programs that may apply to this home. Results depend on available property details."
          action={
            <Button
              variant="outline"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              className="gap-2"
            >
              {refreshMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {refreshMutation.isPending ? 'Scanning…' : 'Scan for Benefits'}
            </Button>
          }
        />
      ) : (
        <MobileSection>
          <MobileSectionHeader
            title="Programs worth verifying"
            subtitle={`${matches.length} potential match${matches.length !== 1 ? 'es' : ''} found`}
          />
          <div className="space-y-2">
            {matches.map((match) => (
              <HiddenAssetMatchCard
                key={match.id}
                match={match}
                onClick={() => openDetail(match)}
              />
            ))}
          </div>
          <p className="pt-1 text-xs leading-snug text-[hsl(var(--mobile-text-secondary))]">
            Results are based on your property details and publicly available program data.
            Verify eligibility with each program&apos;s official source before applying.
          </p>
        </MobileSection>
      )}

      {/* Detail sheet */}
      <HiddenAssetDetailSheet
        match={selectedMatch}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onDismiss={handleDismiss}
        onClaim={handleClaim}
        isUpdating={statusMutation.isPending}
      />
    </MobilePageContainer>
  );
}
