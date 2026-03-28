'use client';

import React from 'react';
import { CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScenarioInputCard } from '@/components/mobile/dashboard/MobilePrimitives';
import { recordGuidanceToolStatus } from '@/lib/api/guidanceApi';

type Props = {
  propertyId: string | null | undefined;
  guidanceStepKey: string | null | undefined;
  guidanceJourneyId?: string | null;
  /** Human-readable label for what was completed (used in CTA text). */
  actionLabel?: string;
  /** Optional extra data to persist with the completion. */
  producedData?: Record<string, unknown>;
};

/**
 * Renders a proof-aware guidance card when a journey routes to this page.
 * Completion is no longer a manual "mark done" action; we only allow
 * progress pings here, while completion should come from real tool evidence.
 */
export function GuidanceStepCompletionCard({
  propertyId,
  guidanceStepKey,
  guidanceJourneyId,
  actionLabel = 'Mark step complete',
  producedData,
}: Props) {
  const [completing, setCompleting] = React.useState(false);
  const [completed, setCompleted] = React.useState(false);

  if (!propertyId || !guidanceStepKey) return null;

  async function handleMarkInProgress() {
    if (!propertyId || !guidanceStepKey) return;
    setCompleting(true);
    try {
      await recordGuidanceToolStatus(propertyId, {
        stepKey: guidanceStepKey,
        journeyId: guidanceJourneyId ?? undefined,
        sourceToolKey: 'frontend',
        status: 'IN_PROGRESS',
        producedData: {
          progressNotedAt: new Date().toISOString(),
          proofType: 'progress_checkpoint',
          proofId: `${guidanceStepKey}:in_progress`,
          actionLabel,
          ...producedData,
        },
      });
      setCompleted(true);
    } catch (e) {
      console.error('[GuidanceStepCompletionCard] progress update failed', e);
    } finally {
      setCompleting(false);
    }
  }

  return (
    <ScenarioInputCard
      title="Guidance Step"
      subtitle={
        completed
          ? 'Progress recorded. This step will auto-complete when proof-backed business evidence is captured.'
          : 'Guidance progress is tracked here. Step completion is proof-based and will update automatically from real tool actions.'
      }
    >
      {completed ? (
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <CheckCircle className="h-4 w-4" />
          Progress recorded for this guidance step.
        </div>
      ) : (
        <Button
          className="min-h-[44px] w-full"
          onClick={handleMarkInProgress}
          disabled={completing}
        >
          {completing ? 'Saving…' : 'Record progress'}
        </Button>
      )}
    </ScenarioInputCard>
  );
}
