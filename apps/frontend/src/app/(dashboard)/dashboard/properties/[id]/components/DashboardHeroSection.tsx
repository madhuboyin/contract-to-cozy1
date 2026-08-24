'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, Loader2, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useGuidance } from '@/features/guidance/hooks/useGuidance';
import { GuidanceActionModel } from '@/features/guidance/utils/guidanceMappers';
import { GuidancePrimaryCta } from '@/components/guidance/GuidancePrimaryCta';
import { GuidanceStatusBadge } from '@/components/guidance/GuidanceStatusBadge';
import { GuidanceDrawer } from '@/components/guidance/GuidanceDrawer';
import { api } from '@/lib/api/client';

// ---------------------------------------------------------------------------
// Hero selector
// ---------------------------------------------------------------------------

const DOMAIN_LABELS: Partial<Record<GuidanceActionModel['issueDomain'], string>> = {
  SAFETY: 'Safety',
  MAINTENANCE: 'Maintenance',
  INSURANCE: 'Coverage',
  FINANCIAL: 'Financial',
  ASSET_LIFECYCLE: 'Systems',
  CLAIMS: 'Claims',
  WEATHER: 'Weather',
  NEIGHBORHOOD: 'Neighborhood',
  ENERGY: 'Energy',
  DOCUMENTATION: 'Documents',
  MARKET_VALUE: 'Market',
  COMPLIANCE: 'Compliance',
  OTHER: 'Home',
};

function isHeroEligible(action: GuidanceActionModel): boolean {
  const executable = action.executionReadiness !== 'NOT_READY';
  const actionable = executable && action.nextStep !== null && action.href !== null;
  const isCompleted =
    action.progress.totalCount > 0 && action.progress.completedCount >= action.progress.totalCount;

  if (isCompleted) return false;
  if (!actionable) return false;
  if (action.priorityGroup === 'OPTIMIZATION' && action.priorityBucket === 'LOW') return false;
  return true;
}

/**
 * Presentation-only hero selector. Input order is canonical Home Action rank;
 * this function may skip ineligible cards but never assigns another score.
 */
export function selectHeroAction(actions: GuidanceActionModel[]): GuidanceActionModel | null {
  return actions.find(isHeroEligible) ?? null;
}

function toDomainLabel(action: GuidanceActionModel): string {
  return DOMAIN_LABELS[action.issueDomain] ?? 'Home';
}

function clampCopy(copy: string, maxLength = 120): string {
  const normalized = copy.trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function toFallbackObservation(action: GuidanceActionModel): string | null {
  const reason = action.explanation?.why?.trim() || action.subtitle?.trim();
  if (!reason) return null;

  const domainLabel = toDomainLabel(action);
  if (action.priorityGroup === 'OPTIMIZATION') {
    return clampCopy(`Opportunity in ${domainLabel}: ${reason}`);
  }
  if (action.priorityGroup === 'UPCOMING') {
    return clampCopy(`${domainLabel} worth planning soon: ${reason}`);
  }
  return clampCopy(`Monitoring ${domainLabel}: ${reason}`);
}

function deriveFallbackObservations(actions: GuidanceActionModel[], max = 2): string[] {
  if (actions.length === 0) return [];

  const observations: string[] = [];
  const seen = new Set<string>();

  for (const action of actions) {
    const observation = toFallbackObservation(action);
    if (!observation) continue;
    const key = observation.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    observations.push(observation);
    if (observations.length >= max) break;
  }

  return observations;
}

function isAttentionCandidate(action: GuidanceActionModel): boolean {
  const isCompleted =
    action.progress.totalCount > 0 && action.progress.completedCount >= action.progress.totalCount;

  if (isCompleted) return false;
  if (action.executionReadiness === 'NOT_READY') return false;
  if (action.nextStep === null) return false;
  if (action.priorityGroup === 'IMMEDIATE') return true;
  if (action.priorityBucket === 'HIGH') return true;
  if (action.severity === 'CRITICAL' || action.severity === 'HIGH' || action.severity === 'MEDIUM') {
    return true;
  }
  return (action.costOfDelay ?? 0) >= 250;
}

// ---------------------------------------------------------------------------
// Shared severity helpers
// ---------------------------------------------------------------------------

function severityDotClass(severity: GuidanceActionModel['severity']): string {
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'bg-rose-500';
  if (severity === 'MEDIUM') return 'bg-amber-400';
  return 'bg-slate-300';
}

// ---------------------------------------------------------------------------
// Hero fallback (no urgent actions)
// ---------------------------------------------------------------------------

function HeroFallbackCard({
  observations,
  propertyId,
}: {
  observations: string[];
  propertyId: string;
}) {
  return (
    <Card className="border-border shadow-sm">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </span>
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">Your home looks stable today</p>
            <p className="text-sm text-muted-foreground">
              No urgent actions detected. Your home intelligence is tracking signals in the background.
            </p>
          </div>
        </div>

        {observations.length > 0 ? (
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <p className="text-[11px] font-medium tracking-normal text-muted-foreground">
              Light opportunities
            </p>
            <ul className="mt-2 space-y-1.5">
              {observations.map((observation) => (
                <li key={observation} className="text-xs text-muted-foreground">
                  {observation}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Button asChild variant="outline" className="min-h-[40px] w-full sm:w-auto">
          <Link href={`/dashboard/properties/${propertyId}/status-board`}>
            Review home signals
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function GuidanceUnavailableCard({ propertyId }: { propertyId: string }) {
  return (
    <Card className="border-border">
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-amber-50">
            <AlertCircle className="h-4 w-4 text-amber-600" />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Home guidance is temporarily unavailable</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              We couldn&apos;t load your latest action ranking right now. You can still review current signals below.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="min-h-[40px] w-full sm:w-auto">
          <Link href={`/dashboard/properties/${propertyId}/status-board`}>
            Open status board
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Hero action card — Level 1 prominence
// ---------------------------------------------------------------------------

function heroAccentClass(severity: GuidanceActionModel['severity']): string {
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'border-l-4 border-l-rose-400';
  if (severity === 'MEDIUM') return 'border-l-4 border-l-amber-400';
  return 'border-l-4 border-l-slate-300';
}

type HeroActionCardProps = {
  action: GuidanceActionModel;
  onOpenJourney?: (action: GuidanceActionModel) => void;
};

function buildHeroImpactSummary(action: GuidanceActionModel): string | null {
  if (action.costOfDelay && action.costOfDelay > 0) {
    return `Potential cost of delay: ~$${Math.round(action.costOfDelay).toLocaleString()}.`;
  }

  if (action.coverageImpact === 'NOT_COVERED') {
    return 'Coverage impact: this item appears not covered right now.';
  }

  if (action.coverageImpact === 'PARTIAL') {
    return 'Coverage impact: this item may only be partially covered.';
  }

  if (action.fundingGapFlag) {
    return 'Funding pressure detected for this action path.';
  }

  if (action.financialImpactScore && action.financialImpactScore > 0) {
    return `Estimated financial impact score: ${Math.round(action.financialImpactScore)}.`;
  }

  if (action.priorityGroup === 'IMMEDIATE') {
    return 'Time-sensitive: completing this soon reduces near-term downside.';
  }

  return null;
}

function HeroActionCard({ action, onOpenJourney }: HeroActionCardProps) {
  const safeTitle = action.title?.trim() || 'Priority action';
  const safeWhy =
    action.explanation?.why?.trim() ||
    action.subtitle?.trim() ||
    'This action has been identified as the highest-priority item for your home.';
  const safeRisk = action.explanation?.risk?.trim() || null;
  const safeWhat = action.explanation?.what?.trim() || null;
  const nextStepLabel =
    action.nextStep?.label?.trim() || action.explanation?.nextStep?.trim() || 'Review Next Step';

  // Only show "Why am I seeing this?" when explanation.what adds context beyond the why text
  const showExplain = safeWhat && safeWhat !== safeWhy;
  const impactSummary = buildHeroImpactSummary(action);

  return (
    <Card className={cn('shadow-md', heroAccentClass(action.severity))}>
      <CardContent className="space-y-4 p-4 sm:p-6">
        {/* Label row */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="border-slate-200 bg-slate-50 text-xs font-medium text-slate-600"
          >
            <Zap className="mr-1 h-3 w-3 text-slate-500" />
            Top Priority
          </Badge>
          {action.severity ? (
            <GuidanceStatusBadge kind="severity" value={action.severity} />
          ) : null}
          <GuidanceStatusBadge kind="readiness" value={action.executionReadiness} />
        </div>

        {/* Title + why + explainability */}
        <div className="space-y-2">
          <h2 className="text-lg font-bold leading-snug text-foreground sm:text-xl">{safeTitle}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{safeWhy}</p>
          {safeRisk ? (
            <p className="text-xs leading-relaxed text-muted-foreground/75">{safeRisk}</p>
          ) : null}
          {impactSummary ? (
            <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
              <p className="text-[11px] font-medium tracking-normal text-muted-foreground">
                Impact
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{impactSummary}</p>
            </div>
          ) : null}
          {/* Explainability: Why am I seeing this? */}
          {showExplain ? (
            <details className="mt-1 group">
              <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden text-[11px] text-muted-foreground/60 transition-colors hover:text-muted-foreground">
                <span className="underline underline-offset-2 decoration-dotted">Why am I seeing this?</span>
              </summary>
              <p className="mt-2 border-l-2 border-muted pl-3 text-xs leading-relaxed text-muted-foreground">
                {safeWhat}
              </p>
            </details>
          ) : (
            <p className="text-[11px] text-muted-foreground/60">
              More explainability details appear as additional home context is captured.
            </p>
          )}
        </div>

        {/* Primary CTA */}
        <GuidancePrimaryCta
          label={nextStepLabel}
          stepNumber={action.nextStep?.stepOrder ?? null}
          href={action.href}
          executionReadiness={action.executionReadiness}
          blockedReason={action.blockedReason}
          className="min-h-[44px] w-full sm:w-auto"
        />

        {/* Journey progress link */}
        {onOpenJourney ? (
          <button
            type="button"
            onClick={() => onOpenJourney(action)}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            View full journey ({action.progress.completedCount}/{action.progress.totalCount} steps)
          </button>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Attention item row — compact, scannable, shows what/why/urgency/next step
// ---------------------------------------------------------------------------

function urgencyLabel(action: GuidanceActionModel): string | null {
  if (action.priorityGroup === 'IMMEDIATE') return 'Urgent';
  if (action.priorityGroup === 'UPCOMING') return 'Soon';
  return null;
}

function AttentionItemRow({
  action,
  onOpenJourney,
}: {
  action: GuidanceActionModel;
  onOpenJourney?: (a: GuidanceActionModel) => void;
}) {
  const safeTitle = action.title?.trim() || 'Needs attention';
  const safeWhy = action.explanation?.why?.trim() || action.subtitle?.trim() || null;
  const safeRisk = action.explanation?.risk?.trim() || null;
  const urgency = urgencyLabel(action);
  const costChip =
    !urgency && action.costOfDelay && action.costOfDelay > 0
      ? `~$${action.costOfDelay.toLocaleString()} cost of delay`
      : null;
  const timingLabel =
    action.priorityGroup === 'IMMEDIATE'
      ? 'Best this week'
      : action.priorityGroup === 'UPCOMING'
        ? 'Plan this month'
        : 'Keep on radar';
  const ctaLabel =
    action.nextStep?.label?.trim() || action.explanation?.nextStep?.trim() || 'Review';
  const isExecutable = action.href !== null && action.executionReadiness !== 'NOT_READY';

  return (
    <div className="rounded-xl border border-border/80 bg-background p-3.5">
      <div className="flex items-start gap-3">
      {/* Severity dot */}
      <span
        className={cn(
          'mt-[7px] h-2 w-2 shrink-0 rounded-full',
          severityDotClass(action.severity),
        )}
      />

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-semibold text-foreground">{safeTitle}</p>
          {urgency ? (
            <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
              {urgency}
            </span>
          ) : costChip ? (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              {costChip}
            </span>
          ) : null}
        </div>
        {safeWhy ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{safeWhy}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px] text-muted-foreground/80">
          <span className="inline-flex items-center gap-1">
            <Clock3 className="h-3 w-3" />
            {timingLabel}
          </span>
        </div>
        {/* Explainability: What&apos;s the risk? */}
        {safeRisk ? (
          <details className="mt-1">
            <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden text-[11px] text-muted-foreground/60 transition-colors hover:text-muted-foreground">
              <span className="underline underline-offset-2 decoration-dotted">What&apos;s the risk?</span>
            </summary>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{safeRisk}</p>
          </details>
        ) : null}
      </div>

      {/* CTA */}
      <div className="shrink-0 pt-0.5">
        {isExecutable ? (
          <Button asChild size="sm" variant="outline" className="h-10 min-h-[44px] gap-1 px-2.5 text-xs">
            <Link href={action.href!}>
              {ctaLabel}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        ) : onOpenJourney ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-10 min-h-[44px] px-2.5 text-xs"
            onClick={() => onOpenJourney(action)}
          >
            Details
          </Button>
        ) : null}
      </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Today's Attention — items below the hero, trimmed and clarified
// ---------------------------------------------------------------------------

type TodayAttentionSectionProps = {
  actions: GuidanceActionModel[];
  onOpenJourney?: (action: GuidanceActionModel) => void;
};

function TodayAttentionSection({ actions, onOpenJourney }: TodayAttentionSectionProps) {
  if (actions.length === 0) return null;

  return (
    <section className="space-y-3 rounded-xl border border-border/70 bg-background/95 p-3.5 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">Today&apos;s attention</p>
          <p className="text-xs text-muted-foreground">Highest-value items to keep your home on track.</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
          <AlertCircle className="h-3 w-3" />
          {actions.length} item{actions.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="space-y-2">
        {actions.map((action) => (
          <AttentionItemRow
            key={action.journeyId}
            action={action}
            onOpenJourney={onOpenJourney}
          />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// DashboardHeroSection — exported entry point
// ---------------------------------------------------------------------------

type DashboardHeroSectionProps = {
  propertyId: string;
  /** Max additional actions to show below the hero. Defaults to 2. */
  attentionLimit?: number;
};

export function DashboardHeroSection({
  propertyId,
  attentionLimit = 3,
}: DashboardHeroSectionProps) {
  const [drawerAction, setDrawerAction] = useState<GuidanceActionModel | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [canonicalJourneyOrder, setCanonicalJourneyOrder] = useState<string[] | null>(null);
  const [canonicalFeedFailed, setCanonicalFeedFailed] = useState(false);

  const guidance = useGuidance(propertyId);

  useEffect(() => {
    let active = true;
    setCanonicalJourneyOrder(null);
    setCanonicalFeedFailed(false);
    void api.getHomeActions(propertyId)
      .then((feed) => {
        if (!active) return;
        setCanonicalJourneyOrder([
          ...new Set(feed.actions.map((action) => action.relatedJourneyId).filter((id): id is string => Boolean(id))),
        ]);
      })
      .catch(() => {
        if (!active) return;
        setCanonicalJourneyOrder([]);
        setCanonicalFeedFailed(true);
      });
    return () => { active = false; };
  }, [propertyId]);

  const canonicalGuidanceActions = useMemo(() => {
    if (canonicalJourneyOrder === null) return [];
    const byJourneyId = new Map(guidance.actions.map((action) => [action.journeyId, action]));
    return canonicalJourneyOrder
      .map((journeyId) => byJourneyId.get(journeyId))
      .filter((action): action is GuidanceActionModel => Boolean(action));
  }, [canonicalJourneyOrder, guidance.actions]);

  const { heroAction, attentionActions, fallbackObservations } = useMemo(() => {
    const hero = selectHeroAction(canonicalGuidanceActions);
    if (!hero) {
      return {
        heroAction: null,
        attentionActions: [],
        fallbackObservations: deriveFallbackObservations(canonicalGuidanceActions, 2),
      };
    }

    const attention = canonicalGuidanceActions
      .filter((a) => a.journeyId !== hero.journeyId)
      .filter(isAttentionCandidate)
      .slice(0, attentionLimit);

    return { heroAction: hero, attentionActions: attention, fallbackObservations: [] };
  }, [canonicalGuidanceActions, attentionLimit]);

  const handleOpenJourney = (action: GuidanceActionModel) => {
    setDrawerAction(action);
    setDrawerOpen(true);
  };

  if (guidance.isLoading || canonicalJourneyOrder === null) {
    return (
      <section className="space-y-3">
        <Card className="border-border">
          <CardContent className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading your home intelligence…
            </div>
            <div className="h-5 w-1/3 animate-pulse rounded bg-muted/50" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-muted/40" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted/30" />
            <div className="h-9 w-full animate-pulse rounded bg-muted/45 sm:w-44" />
          </CardContent>
        </Card>
        <div className="rounded-xl border border-border/70 bg-background/95 p-3.5 sm:p-4">
          <div className="h-4 w-32 animate-pulse rounded bg-muted/40" />
          <div className="mt-2 h-14 animate-pulse rounded-lg bg-muted/30" />
        </div>
      </section>
    );
  }

  if (canonicalFeedFailed || (guidance.isError && guidance.actions.length === 0)) {
    return <GuidanceUnavailableCard propertyId={propertyId} />;
  }

  return (
    <section className="space-y-3">
      {heroAction ? (
        <HeroActionCard
          action={heroAction}
          onOpenJourney={handleOpenJourney}
        />
      ) : (
        <HeroFallbackCard observations={fallbackObservations} propertyId={propertyId} />
      )}

      <TodayAttentionSection
        actions={attentionActions}
        onOpenJourney={handleOpenJourney}
      />

      <GuidanceDrawer
        propertyId={propertyId}
        action={drawerAction}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </section>
  );
}
