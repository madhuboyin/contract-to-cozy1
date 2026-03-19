'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GuidanceActionModel } from '@/features/guidance/utils/guidanceMappers';
import { GuidancePrimaryCta } from './GuidancePrimaryCta';
import { GuidanceJourneyStrip } from './GuidanceJourneyStrip';
import { GuidanceStatusBadge } from './GuidanceStatusBadge';
import { GuidanceWarningBanner } from './GuidanceWarningBanner';

type GuidanceActionCardProps = {
  action: GuidanceActionModel;
  onOpenJourney?: (action: GuidanceActionModel) => void;
  compact?: boolean;
};

export function GuidanceActionCard({ action, onOpenJourney, compact = false }: GuidanceActionCardProps) {
  const warningMessage = action.blockedReason ?? action.warnings?.[0] ?? null;
  const safeTitle = action.title?.trim() ? action.title.trim() : 'Guided Next Step';
  const advisorySubtitle =
    action.explanation?.why ??
    (action.subtitle?.trim() ? action.subtitle : 'Follow the next recommended step to keep this issue on track.');
  const safeSteps = Array.isArray(action.steps) ? action.steps : [];
  const safeProgress = action.progress ?? { completedCount: 0, totalCount: safeSteps.length, percent: 0 };
  const nextStepLabel =
    action.nextStep?.label?.trim() ? action.nextStep.label : action.explanation?.nextStep ?? 'Review Next Step';

  return (
    <Card>
      <CardHeader className={compact ? 'pb-2' : undefined}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className={compact ? 'text-base' : 'text-lg'}>{safeTitle}</CardTitle>
          <div className="flex items-center gap-2">
            <GuidanceStatusBadge kind="readiness" value={action.executionReadiness} />
            <GuidanceStatusBadge kind="severity" value={action.severity ?? null} />
          </div>
        </div>
        <p className="mb-0 text-sm text-muted-foreground">{advisorySubtitle}</p>
      </CardHeader>

      <CardContent className="space-y-3">
        {warningMessage ? (
          <GuidanceWarningBanner
            title={action.executionReadiness === 'NOT_READY' ? 'Execution is blocked' : 'Context warning'}
            message={warningMessage}
          />
        ) : null}

        {action.nextStep ? (
          <GuidancePrimaryCta
            label={nextStepLabel}
            stepNumber={action.nextStep.stepOrder}
            href={action.href}
            executionReadiness={action.executionReadiness}
            blockedReason={action.blockedReason}
            className="min-h-[44px] w-full"
          />
        ) : (
          <GuidanceWarningBanner
            title="Next step unavailable"
            message="Guidance is updating. Refresh in a moment or open the full journey details."
          />
        )}

        <GuidanceJourneyStrip steps={safeSteps} />

        {action.explanation?.risk ? (
          <p className="mb-0 text-xs text-muted-foreground">{action.explanation.risk}</p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="mb-0 text-xs text-muted-foreground">
            Progress: {safeProgress.completedCount}/{safeProgress.totalCount} steps ({safeProgress.percent}
            %)
          </p>

          {onOpenJourney ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenJourney(action)}>
              View full journey
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
