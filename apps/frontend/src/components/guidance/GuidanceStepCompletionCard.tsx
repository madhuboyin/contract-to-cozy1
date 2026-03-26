'use client';

import React from 'react';
import { CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScenarioInputCard } from '@/components/mobile/dashboard/MobilePrimitives';
import { recordGuidanceToolCompletion } from '@/lib/api/guidanceApi';

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
 * Renders a "Step complete?" card when a guidance journey has routed the user
 * to this tool page. The card is only shown when `guidanceStepKey` is present
 * in the URL — i.e. when the page was reached via a guidance step link.
 *
 * Clicking the button calls `recordGuidanceToolCompletion` which marks the
 * step done in the backend without requiring the caller to know the step ID.
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

  async function handleComplete() {
    if (!propertyId || !guidanceStepKey) return;
    setCompleting(true);
    try {
      await recordGuidanceToolCompletion(propertyId, {
        stepKey: guidanceStepKey,
        journeyId: guidanceJourneyId ?? undefined,
        producedData: {
          completedAt: new Date().toISOString(),
          ...producedData,
        },
      });
      setCompleted(true);
    } catch (e) {
      console.error('[GuidanceStepCompletionCard] completion failed', e);
    } finally {
      setCompleting(false);
    }
  }

  return (
    <ScenarioInputCard
      title="Guidance Step"
      subtitle={
        completed
          ? 'Step recorded. Return to your guidance journey to continue.'
          : 'Once you have reviewed the information above, mark this guidance step complete.'
      }
    >
      {completed ? (
        <div className="flex items-center gap-2 text-sm text-green-700">
          <CheckCircle className="h-4 w-4" />
          Step marked complete.
        </div>
      ) : (
        <Button
          className="min-h-[44px] w-full"
          onClick={handleComplete}
          disabled={completing}
        >
          {completing ? 'Saving…' : actionLabel}
        </Button>
      )}
    </ScenarioInputCard>
  );
}
