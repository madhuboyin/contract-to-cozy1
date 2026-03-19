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
  const warningMessage = action.blockedReason ?? action.warnings[0] ?? null;
  const advisorySubtitle = action.explanation?.why ?? action.subtitle;

  return (
    <Card>
      <CardHeader className={compact ? 'pb-2' : undefined}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className={compact ? 'text-base' : 'text-lg'}>{action.title}</CardTitle>
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
            label={action.nextStep.label}
            stepNumber={action.nextStep.stepOrder}
            href={action.href}
            executionReadiness={action.executionReadiness}
            blockedReason={action.blockedReason}
            className="min-h-[44px] w-full"
          />
        ) : null}

        <GuidanceJourneyStrip steps={action.steps} />

        {action.explanation?.risk ? (
          <p className="mb-0 text-xs text-muted-foreground">{action.explanation.risk}</p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="mb-0 text-xs text-muted-foreground">
            Progress: {action.progress.completedCount}/{action.progress.totalCount} steps ({action.progress.percent}
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
