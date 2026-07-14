'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lightbulb, Network, RefreshCw, RotateCcw, ThumbsDown } from 'lucide-react';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import {
  answerPilotQuestion,
  enableOptionalPersonalizationProfile,
  getPersonalizationContextMap,
  getPilotPersonalization,
  resetOptionalPersonalizationProfile,
  refreshPersonalization,
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

type PilotFeedbackReason = 'ALREADY_DONE' | 'TOO_EXPENSIVE' | 'NOT_APPLICABLE' | 'BAD_TIMING' | 'WRONG_PROFILE' | 'OTHER';

const PILOT_FEEDBACK_REASONS: Array<{ code: PilotFeedbackReason; label: string; type: 'DISMISSED' | 'NOT_RELEVANT' }> = [
  { code: 'ALREADY_DONE', label: 'Already handled', type: 'NOT_RELEVANT' },
  { code: 'NOT_APPLICABLE', label: "Doesn't apply", type: 'NOT_RELEVANT' },
  { code: 'WRONG_PROFILE', label: 'Wrong home details', type: 'NOT_RELEVANT' },
  { code: 'TOO_EXPENSIVE', label: 'Too expensive', type: 'NOT_RELEVANT' },
  { code: 'BAD_TIMING', label: 'Not now', type: 'DISMISSED' },
  { code: 'OTHER', label: 'Another reason', type: 'NOT_RELEVANT' },
];

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
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);
  const propertyId = selectedPropertyId || searchParams.get('propertyId') || undefined;
  const queryKey = ['personalization-pilot', propertyId];

  const pilotQuery = useQuery({
    queryKey,
    queryFn: () => getPilotPersonalization(propertyId!),
    enabled: Boolean(propertyId),
    staleTime: 30_000,
  });
  const pilot = pilotQuery.data;
  const contextMapQuery = useQuery({
    queryKey: ['personalization-context-map', propertyId],
    queryFn: () => getPersonalizationContextMap(propertyId!),
    enabled: Boolean(propertyId && pilot?.capabilities.canViewSensitiveEvidence),
    staleTime: 30_000,
  });

  const refresh = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey }),
    queryClient.invalidateQueries({ queryKey: ['personalization-context-map', propertyId] }),
  ]);
  const optIn = useMutation({ mutationFn: () => enableOptionalPersonalizationProfile(propertyId!), onSuccess: refresh });
  const reset = useMutation({ mutationFn: () => resetOptionalPersonalizationProfile(propertyId!), onSuccess: refresh });
  const feedback = useMutation({
    mutationFn: ({ recommendationId, type, reasonCode }: { recommendationId: string; type: 'DISMISSED' | 'NOT_RELEVANT'; reasonCode: PilotFeedbackReason }) =>
      sendPilotFeedback(propertyId!, recommendationId, type, reasonCode),
    onSuccess: async () => {
      setFeedbackFor(null);
      await refresh();
    },
  });
  const recompute = useMutation({
    mutationFn: () => refreshPersonalization(propertyId!),
    onSuccess: refresh,
  });
  const resetWithConfirmation = () => {
    if (window.confirm('Remove your optional household profile? Property-based home guidance will remain available.')) {
      reset.mutate();
    }
  };

  if (!propertyId) {
    return (
      <MobilePageContainer className="space-y-7 py-3 lg:max-w-5xl">
        <EmptyStateCard title="Select a property" description="Personalization needs a selected home." />
      </MobilePageContainer>
    );
  }

  return (
    <MobilePageContainer className="space-y-7 py-3 lg:max-w-5xl lg:px-8 lg:pb-10">
      <MobileSection>
        <Link href={`/dashboard?propertyId=${encodeURIComponent(propertyId)}`} className="no-brand-style inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--mobile-brand-strong))]">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
        <MobileSectionHeader title="Personalized home guidance" subtitle="Explainable suggestions based on your home" />
      </MobileSection>

      {pilotQuery.isLoading ? (
        <SummaryCard title="Loading guidance" subtitle="Checking this home's current signals"><div /></SummaryCard>
      ) : pilotQuery.isError ? (
        <EmptyStateCard title="Guidance unavailable" description="Personalized guidance could not be loaded for this home." />
      ) : pilot && !pilot.available ? (
        <>
          <EmptyStateCard title="Guidance temporarily paused" description="Property guidance and optional profile collection are currently unavailable." />
          {pilot.profileEnabled && pilot.capabilities.canManageSensitiveProfile ? (
            <SummaryCard title="Your profile control" subtitle="You can still remove optional household details while guidance is paused.">
              <button type="button" disabled={reset.isPending} onClick={resetWithConfirmation} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-60">
                <RotateCcw className="h-4 w-4" /> {reset.isPending ? 'Removing…' : 'Remove optional profile'}
              </button>
            </SummaryCard>
          ) : null}
        </>
      ) : pilot ? (
        <>
          {!pilot.profileEnabled && pilot.capabilities.canManageSensitiveProfile ? (
            <SummaryCard title="Improve your recommendations" subtitle="Optional household details can make future guidance more relevant.">
              <div className="space-y-4 text-sm text-[hsl(var(--mobile-text-secondary))]">
                <p>Property-based guidance is already available. If you choose, you can add a small household profile. We do not infer family, health, income, or pet details.</p>
                <button type="button" disabled={optIn.isPending} onClick={() => optIn.mutate()} className="min-h-[44px] rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-4 py-2 font-semibold text-white disabled:opacity-60">
                  {optIn.isPending ? 'Enabling…' : 'Improve my recommendations'}
                </button>
              </div>
            </SummaryCard>
          ) : null}
          {pilot.nextQuestion ? (
            <MobileSection>
              <MobileSectionHeader title="One optional question" subtitle="Answer only what you are comfortable sharing" />
              <PilotQuestionCard propertyId={propertyId} question={pilot.nextQuestion} onSaved={refresh} />
            </MobileSection>
          ) : null}
          <MobileSection>
            <MobileSectionHeader
              title="Top suggestions"
              subtitle="At most three, ranked by current relevance"
              action={pilot.capabilities.canAct ? (
                <button
                  type="button"
                  disabled={recompute.isPending}
                  onClick={() => recompute.mutate()}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  {recompute.isPending ? 'Refreshing…' : 'Refresh'}
                </button>
              ) : undefined}
            />
            <div className="space-y-3">
              {pilot.recommendations.length === 0 ? (
                <EmptyStateCard title="Nothing needs attention" description="No reviewed personalization rule currently matches this home." />
              ) : pilot.recommendations.map((recommendation) => {
                const explanation = recommendation.explanations[0];
                const why = explanation?.reasonCodes[0]?.params?.message;
                return (
                  <SummaryCard key={recommendation.id} title={explanation?.headline || 'Home suggestion'} subtitle={recommendation.definition.targetModule}>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Lightbulb className="h-4 w-4" aria-hidden="true" />
                        <StatusChip tone={recommendation.priorityBand === 'HIGH' ? 'elevated' : 'info'}>
                          {recommendation.priorityBand || 'RELEVANT'}
                        </StatusChip>
                      </div>
                      <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">
                        {why || 'Suggested because a reviewed maintenance rule matched the property history available to ContractToCozy.'}
                      </p>
                      {pilot.capabilities.canGiveFeedback ? (
                        feedbackFor === recommendation.id ? (
                          <div className="space-y-2" aria-label="Why is this suggestion not useful?">
                            <p className="text-sm font-medium">What made this suggestion less useful?</p>
                            <div className="flex flex-wrap gap-2">
                              {PILOT_FEEDBACK_REASONS.map((reason) => (
                                <button
                                  key={reason.code}
                                  type="button"
                                  disabled={feedback.isPending}
                                  onClick={() => feedback.mutate({ recommendationId: recommendation.id, type: reason.type, reasonCode: reason.code })}
                                  className="min-h-[44px] rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-60"
                                >
                                  {reason.label}
                                </button>
                              ))}
                              <button type="button" disabled={feedback.isPending} onClick={() => setFeedbackFor(null)} className="min-h-[44px] px-3 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-secondary))] disabled:opacity-60">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" disabled={feedback.isPending} onClick={() => setFeedbackFor(recommendation.id)} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-60">
                            <ThumbsDown className="h-4 w-4" /> Not relevant
                          </button>
                        )
                      ) : null}
                    </div>
                  </SummaryCard>
                );
              })}
            </div>
          </MobileSection>
          {pilot.capabilities.canViewSensitiveEvidence ? (
            <MobileSection>
              <MobileSectionHeader
                title="What personalization knows"
                subtitle="A read-only view of property signals, optional facts, and current outputs"
              />
              {contextMapQuery.isLoading ? (
                <SummaryCard title="Loading your context map" subtitle="Collecting the current property records"><div /></SummaryCard>
              ) : contextMapQuery.isError ? (
                <EmptyStateCard title="Context map unavailable" description="Your suggestions still work. Try this transparency view again later." />
              ) : contextMapQuery.data ? (
                <SummaryCard
                  title="Your context map"
                  subtitle={`${contextMapQuery.data.summary.PROFILE_FACT} explicit profile facts · ${contextMapQuery.data.summary.DERIVED_TRAIT} property signals · ${contextMapQuery.data.summary.RECOMMENDATION} active suggestions`}
                >
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Network className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                      <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">
                        {contextMapQuery.data.consent
                          ? 'Your optional household profile is connected to this property. Explicit answers stay separate from property-derived maintenance signals and reviewed recommendations.'
                          : 'Property-based guidance and its current signals are available without a household profile. Optional household details are collected only if you enable them.'}
                      </p>
                    </div>
                    {contextMapQuery.data.nodes.filter((node) => node.type === 'DERIVED_TRAIT').length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-sm font-semibold">Current property signals</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {contextMapQuery.data.nodes.filter((node) => node.type === 'DERIVED_TRAIT').map((node) => (
                            <div key={node.id} className="rounded-xl border p-3">
                              <p className="text-sm font-semibold">{node.label}</p>
                              {node.detail ? <p className="mt-1 text-xs text-[hsl(var(--mobile-text-secondary))]">{node.detail}</p> : null}
                              <p className="mt-1 text-xs text-[hsl(var(--mobile-text-secondary))]">Property record</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">No current property signals are available.</p>
                    )}
                    {contextMapQuery.data.nodes.filter((node) => node.type === 'PROFILE_FACT').length > 0 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {contextMapQuery.data.nodes.filter((node) => node.type === 'PROFILE_FACT').map((node) => (
                          <div key={node.id} className="rounded-xl border p-3">
                            <p className="text-sm font-semibold">{node.label}</p>
                            {node.detail ? <p className="mt-1 text-xs text-[hsl(var(--mobile-text-secondary))]">{node.detail}</p> : null}
                            <p className="mt-1 text-xs text-[hsl(var(--mobile-text-secondary))]">Explicit answer</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">No optional household facts have been saved. Property guidance does not require them.</p>
                    )}
                    <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">
                      Current-state only. No inferred household relationships, retained timeline, or future simulation.
                    </p>
                  </div>
                </SummaryCard>
              ) : null}
            </MobileSection>
          ) : null}
          {pilot.profileEnabled && pilot.capabilities.canManageSensitiveProfile ? (
            <MobileSection>
              <SummaryCard title="Your control" subtitle="Reset removes optional household details. Property-based guidance remains available.">
                <button type="button" disabled={reset.isPending} onClick={resetWithConfirmation} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-60">
                  <RotateCcw className="h-4 w-4" /> {reset.isPending ? 'Removing…' : 'Remove optional profile'}
                </button>
              </SummaryCard>
            </MobileSection>
          ) : null}
        </>
      ) : null}
    </MobilePageContainer>
  );
}
