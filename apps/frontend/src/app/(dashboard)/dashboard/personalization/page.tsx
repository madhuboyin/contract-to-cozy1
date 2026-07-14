'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lightbulb, RotateCcw, ThumbsDown } from 'lucide-react';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import {
  answerPilotQuestion,
  getPilotPersonalization,
  optInPilotPersonalization,
  resetPilotPersonalization,
  sendPilotFeedback,
} from '@/lib/api/personalizationPilotApi';
import {
  EmptyStateCard,
  MobilePageContainer,
  MobileSection,
  MobileSectionHeader,
  StatusChip,
  SummaryCard,
} from '@/components/mobile/dashboard/MobilePrimitives';

function PilotQuestionCard({
  propertyId,
  question,
  onSaved,
}: {
  propertyId: string;
  question: NonNullable<Awaited<ReturnType<typeof getPilotPersonalization>>['nextQuestion']>;
  onSaved: () => Promise<unknown>;
}) {
  const answer = useMutation({
    mutationFn: ({ action, answerJson }: { action: 'ANSWERED' | 'SKIPPED' | 'SNOOZED'; answerJson?: unknown }) =>
      answerPilotQuestion(propertyId, question.id, action, answerJson),
    onSuccess: onSaved,
  });

  const submitBoolean = (value: boolean) => {
    const answerJson = question.targetTable === 'HOUSEHOLD_GOAL' ? { present: value } : { value };
    answer.mutate({ action: 'ANSWERED', answerJson });
  };

  return (
    <SummaryCard title={question.prompt} subtitle={question.whyAsked}>
      <div className="space-y-3">
        <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">{question.privacyNote}</p>
        <div className="flex flex-wrap gap-2">
          {question.targetTable === 'PET_PROFILE' ? (
            <>
              <button type="button" onClick={() => answer.mutate({ action: 'ANSWERED', answerJson: { hasPet: true, petType: 'DOG' } })} className="min-h-[44px] rounded-xl border px-4 py-2 text-sm font-semibold">Dog</button>
              <button type="button" onClick={() => answer.mutate({ action: 'ANSWERED', answerJson: { hasPet: true, petType: 'CAT' } })} className="min-h-[44px] rounded-xl border px-4 py-2 text-sm font-semibold">Cat</button>
              <button type="button" onClick={() => answer.mutate({ action: 'ANSWERED', answerJson: { hasPet: false } })} className="min-h-[44px] rounded-xl border px-4 py-2 text-sm font-semibold">No pet</button>
            </>
          ) : question.targetTable === 'HOUSEHOLD_MEMBER_SUMMARY' ? (
            <>
              <button type="button" onClick={() => answer.mutate({ action: 'ANSWERED', answerJson: { hasChildren: true, hasSeniors: false } })} className="min-h-[44px] rounded-xl border px-4 py-2 text-sm font-semibold">Children</button>
              <button type="button" onClick={() => answer.mutate({ action: 'ANSWERED', answerJson: { hasChildren: false, hasSeniors: true } })} className="min-h-[44px] rounded-xl border px-4 py-2 text-sm font-semibold">Seniors</button>
              <button type="button" onClick={() => answer.mutate({ action: 'ANSWERED', answerJson: { hasChildren: false, hasSeniors: false } })} className="min-h-[44px] rounded-xl border px-4 py-2 text-sm font-semibold">Neither</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => submitBoolean(true)} className="min-h-[44px] rounded-xl border px-4 py-2 text-sm font-semibold">Yes</button>
              <button type="button" onClick={() => submitBoolean(false)} className="min-h-[44px] rounded-xl border px-4 py-2 text-sm font-semibold">No</button>
            </>
          )}
          <button type="button" onClick={() => answer.mutate({ action: 'SNOOZED' })} className="min-h-[44px] px-3 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-secondary))]">Ask later</button>
        </div>
      </div>
    </SummaryCard>
  );
}

export default function PersonalizationPilotPage() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { selectedPropertyId } = usePropertyContext();
  const propertyId = selectedPropertyId || searchParams.get('propertyId') || undefined;
  const queryKey = ['personalization-pilot', propertyId];

  const pilotQuery = useQuery({
    queryKey,
    queryFn: () => getPilotPersonalization(propertyId!),
    enabled: Boolean(propertyId),
    staleTime: 30_000,
  });

  const refresh = async () => queryClient.invalidateQueries({ queryKey });
  const optIn = useMutation({ mutationFn: () => optInPilotPersonalization(propertyId!), onSuccess: refresh });
  const reset = useMutation({ mutationFn: () => resetPilotPersonalization(propertyId!), onSuccess: refresh });
  const feedback = useMutation({
    mutationFn: (recommendationId: string) => sendPilotFeedback(propertyId!, recommendationId, 'NOT_RELEVANT'),
    onSuccess: refresh,
  });

  if (!propertyId) {
    return (
      <MobilePageContainer className="space-y-7 py-3 lg:max-w-5xl">
        <EmptyStateCard title="Select a property" description="Personalization needs a selected home." />
      </MobilePageContainer>
    );
  }

  const pilot = pilotQuery.data;
  return (
    <MobilePageContainer className="space-y-7 py-3 lg:max-w-5xl lg:px-8 lg:pb-10">
      <MobileSection>
        <Link href={`/dashboard?propertyId=${encodeURIComponent(propertyId)}`} className="no-brand-style inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--mobile-brand-strong))]">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
        <MobileSectionHeader title="Home guidance pilot" subtitle="A small, explainable set of suggestions based on your home" />
      </MobileSection>

      {pilotQuery.isLoading ? (
        <SummaryCard title="Loading guidance" subtitle="Checking this home's current signals"><div /></SummaryCard>
      ) : pilotQuery.isError ? (
        <EmptyStateCard title="Pilot unavailable" description="This pilot is not enabled for this account yet." />
      ) : !pilot?.optedIn ? (
        <SummaryCard title="Help us prioritize what matters" subtitle="The pilot creates a home guidance profile only after you opt in.">
          <div className="space-y-4 text-sm text-[hsl(var(--mobile-text-secondary))]">
            <p>We use property maintenance history and answers you choose to provide. We do not infer family, health, income, or pet details.</p>
            <button type="button" disabled={optIn.isPending} onClick={() => optIn.mutate()} className="min-h-[44px] rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-4 py-2 font-semibold text-white disabled:opacity-60">
              {optIn.isPending ? 'Turning on…' : 'Join the pilot'}
            </button>
          </div>
        </SummaryCard>
      ) : (
        <>
          {pilot.nextQuestion ? (
            <MobileSection>
              <MobileSectionHeader title="One optional question" subtitle="Answer only what you are comfortable sharing" />
              <PilotQuestionCard propertyId={propertyId} question={pilot.nextQuestion} onSaved={refresh} />
            </MobileSection>
          ) : null}
          <MobileSection>
            <MobileSectionHeader title="Top suggestions" subtitle="At most three, ranked by current relevance" />
            <div className="space-y-3">
              {pilot.recommendations.length === 0 ? (
                <EmptyStateCard title="Nothing needs attention" description="No reviewed pilot rule currently matches this home." />
              ) : pilot.recommendations.map((recommendation) => {
                const explanation = recommendation.explanations[0];
                return (
                  <SummaryCard key={recommendation.id} title={explanation?.headline || 'Home suggestion'} subtitle={recommendation.definition.targetModule}>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Lightbulb className="h-4 w-4" aria-hidden="true" />
                        <StatusChip tone={recommendation.priorityBand === 'HIGH' ? 'elevated' : 'info'}>
                          {recommendation.priorityBand || 'RELEVANT'}
                        </StatusChip>
                      </div>
                      <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">Suggested because a reviewed maintenance rule matched the property history available to ContractToCozy.</p>
                      <button type="button" disabled={feedback.isPending} onClick={() => feedback.mutate(recommendation.id)} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-60">
                        <ThumbsDown className="h-4 w-4" /> Not relevant
                      </button>
                    </div>
                  </SummaryCard>
                );
              })}
            </div>
          </MobileSection>
          <MobileSection>
            <SummaryCard title="Your control" subtitle="Reset removes the pilot household profile and its recommendations.">
              <button type="button" disabled={reset.isPending} onClick={() => reset.mutate()} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-60">
                <RotateCcw className="h-4 w-4" /> {reset.isPending ? 'Resetting…' : 'Reset personalization'}
              </button>
            </SummaryCard>
          </MobileSection>
        </>
      )}
    </MobilePageContainer>
  );
}
