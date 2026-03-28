'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GuidanceActionModel } from '@/features/guidance/utils/guidanceMappers';
import { formatCurrency } from '@/lib/utils/format';
import { GuidancePrimaryCta } from './GuidancePrimaryCta';
import { GuidanceJourneyStrip } from './GuidanceJourneyStrip';
import { GuidanceStatusBadge } from './GuidanceStatusBadge';
import { GuidanceWarningBanner } from './GuidanceWarningBanner';

type GuidanceActionCardProps = {
  action: GuidanceActionModel;
  onOpenJourney?: (action: GuidanceActionModel) => void;
  compact?: boolean;
};

const URGENCY_CONFIG: Record<string, { label: string; className: string }> = {
  IMMEDIATE: { label: 'Act now', className: 'text-rose-700 bg-rose-50 border border-rose-200' },
  UPCOMING:  { label: 'Upcoming', className: 'text-amber-700 bg-amber-50 border border-amber-200' },
  OPTIMIZATION: { label: 'When ready', className: 'text-slate-500 bg-slate-50 border border-slate-200' },
};

const COVERAGE_LABEL: Record<string, string> = {
  NOT_COVERED: 'Not covered by insurance',
  PARTIAL: 'Partially covered',
  COVERED: 'Covered',
};

const WARNING_TITLE: Record<string, string> = {
  NOT_READY: 'This step is blocked — complete prerequisites first',
  NEEDS_CONTEXT: 'Answer a few questions to unlock the next step',
};

export function GuidanceActionCard({ action, onOpenJourney, compact = false }: GuidanceActionCardProps) {
  const warningMessage = action.blockedReason ?? action.warnings?.[0] ?? null;
  const safeTitle = action.title?.trim() ? action.title.trim() : 'Guided Next Step';
  const showSeverityBadge = Boolean(action.severity && action.severity !== 'UNKNOWN');
  const advisorySubtitle =
    action.explanation?.why ??
    (action.subtitle?.trim() ? action.subtitle : 'Follow the next recommended step to keep this issue on track.');
  const safeSteps = Array.isArray(action.steps) ? action.steps : [];
  const safeProgress = action.progress ?? { completedCount: 0, totalCount: safeSteps.length, percent: 0 };
  const nextStepLabel =
    action.nextStep?.label?.trim() ? action.nextStep.label : action.explanation?.nextStep ?? 'Review Next Step';

  const urgency = URGENCY_CONFIG[action.priorityGroup] ?? null;
  const coverageLabel = action.coverageImpact ? COVERAGE_LABEL[action.coverageImpact] ?? null : null;
  const warningTitle = WARNING_TITLE[action.executionReadiness] ?? 'Before you continue';
  const firstMissingStep =
    action.executionReadiness === 'NEEDS_CONTEXT' && action.missingPrerequisites.length > 0
      ? action.missingPrerequisites[0].label
      : null;

  return (
    <Card>
      <CardHeader className={compact ? 'pb-2' : undefined}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {urgency ? (
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${urgency.className}`}>
                {urgency.label}
              </span>
            ) : null}
            <CardTitle className={compact ? 'text-base' : 'text-lg'}>{safeTitle}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <GuidanceStatusBadge kind="readiness" value={action.executionReadiness} />
            {showSeverityBadge ? <GuidanceStatusBadge kind="severity" value={action.severity ?? null} /> : null}
          </div>
        </div>
        {action.explanation?.what ? (
          <p className="mb-0 text-sm font-medium text-foreground">{action.explanation.what}</p>
        ) : null}
        <p className="mb-0 text-sm text-muted-foreground">{advisorySubtitle}</p>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Cost-of-delay callout — most actionable signal, shown first */}
        {action.costOfDelay ? (
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            <span className="text-xs font-semibold text-amber-800">
              Waiting could cost ~{formatCurrency(action.costOfDelay)} more
            </span>
            {coverageLabel ? (
              <span className="ml-auto text-xs text-amber-700">{coverageLabel}</span>
            ) : null}
          </div>
        ) : coverageLabel ? (
          <p className="mb-0 text-xs text-muted-foreground">{coverageLabel}</p>
        ) : null}

        {/* Funding gap callout */}
        {action.fundingGapFlag && !action.costOfDelay ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            Funding gap detected — review your budget before scheduling work.
          </div>
        ) : null}

        {warningMessage ? (
          <GuidanceWarningBanner
            title={warningTitle}
            message={warningMessage}
          />
        ) : null}

        {action.nextStep ? (
          <div className="space-y-1.5">
            <p className="mb-0 text-xs font-medium text-muted-foreground">Your next step</p>
            <GuidancePrimaryCta
              label={nextStepLabel}
              stepNumber={action.nextStep.stepOrder}
              href={action.href}
              executionReadiness={action.executionReadiness}
              blockedReason={action.blockedReason}
              missingStepLabel={firstMissingStep}
              className="min-h-[44px] w-full"
            />
          </div>
        ) : (
          <GuidanceWarningBanner
            title="Next step unavailable"
            message="We're preparing your next step. Refresh in a moment or open all steps for details."
          />
        )}

        <GuidanceJourneyStrip steps={safeSteps} />

        {action.explanation?.risk && !action.costOfDelay ? (
          <p className="mb-0 text-xs text-muted-foreground">{action.explanation.risk}</p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="mb-0 text-xs text-muted-foreground">
            Progress: {safeProgress.completedCount}/{safeProgress.totalCount} steps ({safeProgress.percent}%)
          </p>

          {onOpenJourney ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenJourney(action)}>
              See all steps
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
