'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useGuidance } from '@/features/guidance/hooks/useGuidance';
import { GuidanceActionModel } from '@/features/guidance/utils/guidanceMappers';
import { GuidancePrimaryCta } from '@/components/guidance/GuidancePrimaryCta';
import { GuidanceStatusBadge } from '@/components/guidance/GuidanceStatusBadge';
import { GuidanceActionCard } from '@/components/guidance/GuidanceActionCard';
import { GuidanceDrawer } from '@/components/guidance/GuidanceDrawer';

// ---------------------------------------------------------------------------
// Hero selector
// ---------------------------------------------------------------------------

/**
 * Deterministic hero selector — picks the single strongest actionable item.
 *
 * Priority order:
 *  1. IMMEDIATE group + executable (not NOT_READY) + has a next step
 *  2. HIGH priority bucket + executable + has a next step
 *  3. Any actionable (not NOT_READY) + has a next step
 *  4. Any top action (even if blocked) — never leaves the hero empty
 */
export function selectHeroAction(actions: GuidanceActionModel[]): GuidanceActionModel | null {
  if (actions.length === 0) return null;

  const withNextStep = actions.filter((a) => a.nextStep !== null);
  const executable = withNextStep.filter((a) => a.executionReadiness !== 'NOT_READY');

  const immediate = executable.filter((a) => a.priorityGroup === 'IMMEDIATE');
  if (immediate.length > 0) return immediate[0];

  const highBucket = executable.filter((a) => a.priorityBucket === 'HIGH');
  if (highBucket.length > 0) return highBucket[0];

  if (executable.length > 0) return executable[0];
  if (withNextStep.length > 0) return withNextStep[0];

  return actions[0];
}

// ---------------------------------------------------------------------------
// Hero fallback (no urgent actions)
// ---------------------------------------------------------------------------

function HeroFallbackCard() {
  return (
    <Card className="border-border">
      <CardContent className="flex items-start gap-4 p-5">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        </span>
        <div className="space-y-1">
          <p className="text-base font-semibold text-foreground">Your home looks stable today</p>
          <p className="text-sm text-muted-foreground">
            No urgent actions detected. Your home intelligence is tracking signals in the background.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Hero action card
// ---------------------------------------------------------------------------

function heroAccentClass(severity: GuidanceActionModel['severity']): string {
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'border-l-4 border-l-rose-400';
  if (severity === 'MEDIUM') return 'border-l-4 border-l-amber-400';
  return 'border-l-4 border-l-slate-300';
}

type HeroActionCardProps = {
  action: GuidanceActionModel;
  propertyId: string;
  onOpenJourney?: (action: GuidanceActionModel) => void;
};

function HeroActionCard({ action, onOpenJourney }: HeroActionCardProps) {
  const safeTitle = action.title?.trim() || 'Priority Action';
  const safeWhy =
    action.explanation?.why?.trim() ||
    action.subtitle?.trim() ||
    'This action has been identified as the highest-priority item for your home.';
  const safeRisk = action.explanation?.risk?.trim() || null;
  const nextStepLabel =
    action.nextStep?.label?.trim() || action.explanation?.nextStep?.trim() || 'Review Next Step';

  return (
    <Card className={cn('shadow-sm', heroAccentClass(action.severity))}>
      <CardContent className="space-y-4 p-5">
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

        {/* Title + why */}
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold leading-snug text-foreground">{safeTitle}</h2>
          <p className="text-sm text-muted-foreground">{safeWhy}</p>
          {safeRisk ? (
            <p className="text-xs text-muted-foreground/80">{safeRisk}</p>
          ) : null}
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
// Today's attention — remaining actions below the hero
// ---------------------------------------------------------------------------

type TodayAttentionSectionProps = {
  actions: GuidanceActionModel[];
  propertyId: string;
  onOpenJourney?: (action: GuidanceActionModel) => void;
};

function TodayAttentionSection({ actions, onOpenJourney }: TodayAttentionSectionProps) {
  if (actions.length === 0) return null;

  return (
    <section className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Also needs attention
      </p>
      <div className="space-y-2">
        {actions.map((action) => (
          <GuidanceActionCard
            key={action.journeyId}
            action={action}
            compact
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
  /** How many additional actions to show below the hero. Defaults to 2. */
  attentionLimit?: number;
};

export function DashboardHeroSection({
  propertyId,
  attentionLimit = 2,
}: DashboardHeroSectionProps) {
  const [drawerAction, setDrawerAction] = useState<GuidanceActionModel | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const guidance = useGuidance(propertyId);

  const { heroAction, attentionActions } = useMemo(() => {
    const hero = selectHeroAction(guidance.actions);
    const heroId = hero?.journeyId;
    const attention = guidance.actions
      .filter((a) => a.journeyId !== heroId)
      .slice(0, attentionLimit);
    return { heroAction: hero, attentionActions: attention };
  }, [guidance.actions, attentionLimit]);

  const handleOpenJourney = (action: GuidanceActionModel) => {
    setDrawerAction(action);
    setDrawerOpen(true);
  };

  if (guidance.isLoading) {
    return (
      <Card className="border-border">
        <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your home intelligence…
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      {heroAction ? (
        <HeroActionCard
          action={heroAction}
          propertyId={propertyId}
          onOpenJourney={handleOpenJourney}
        />
      ) : (
        <HeroFallbackCard />
      )}

      <TodayAttentionSection
        actions={attentionActions}
        propertyId={propertyId}
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
