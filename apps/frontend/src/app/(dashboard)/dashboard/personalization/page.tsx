'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lightbulb, Network, RefreshCw, RotateCcw, ThumbsDown } from 'lucide-react';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import {
  answerProfileQuestion,
  enableOptionalPersonalizationProfile,
  getPersonalizationContextMap,
  getPersonalization,
  resetOptionalPersonalizationProfile,
  refreshPersonalization,
  sendRecommendationFeedback,
} from '@/lib/api/personalizationApi';
import {
  EmptyStateCard,
  MobilePageContainer,
  MobileSection,
  MobileSectionHeader,
  StatusChip,
  SummaryCard,
} from '@/components/mobile/dashboard/MobilePrimitives';

type PersonalizationFeedbackReason = 'ALREADY_DONE' | 'TOO_EXPENSIVE' | 'NOT_APPLICABLE' | 'BAD_TIMING' | 'WRONG_PROFILE' | 'OTHER';

const PERSONALIZATION_FEEDBACK_REASONS: Array<{ code: PersonalizationFeedbackReason; label: string; type: 'DISMISSED' | 'NOT_RELEVANT' }> = [
  { code: 'ALREADY_DONE', label: 'Already handled', type: 'NOT_RELEVANT' },
  { code: 'NOT_APPLICABLE', label: "Doesn't apply", type: 'NOT_RELEVANT' },
  { code: 'WRONG_PROFILE', label: 'Wrong home details', type: 'NOT_RELEVANT' },
  { code: 'TOO_EXPENSIVE', label: 'Too expensive', type: 'NOT_RELEVANT' },
  { code: 'BAD_TIMING', label: 'Not now', type: 'DISMISSED' },
  { code: 'OTHER', label: 'Another reason', type: 'NOT_RELEVANT' },
];

function ProfileQuestionCard({
  propertyId,
  question,
  onSaved,
}: {
  propertyId: string;
  question: NonNullable<Awaited<ReturnType<typeof getPersonalization>>['nextQuestion']>;
  onSaved: () => Promise<unknown>;
}) {
  const [integerValue, setIntegerValue] = useState('');
  const answer = useMutation({
    mutationFn: ({ action, answerJson }: { action: 'ANSWERED' | 'SKIPPED' | 'SNOOZED'; answerJson?: unknown }) =>
      answerProfileQuestion(propertyId, question.id, action, answerJson),
    onSuccess: onSaved,
  });

  const submitBoolean = (value: boolean) => {
    answer.mutate({ action: 'ANSWERED', answerJson: { value } });
  };

  return (
    <SummaryCard title={question.prompt} subtitle={question.whyAsked}>
      <div className="space-y-3">
        <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">{question.privacyNote}</p>
        <div className="flex flex-wrap gap-2">
          {question.answerSchema.type === 'integer' ? (
            <>
              <input
                type="number"
                min={question.answerSchema.min ?? 1}
                max={question.answerSchema.max ?? 25}
                value={integerValue}
                onChange={(event) => setIntegerValue(event.target.value)}
                aria-label="Household size"
                className="min-h-[44px] w-28 rounded-xl border px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={!integerValue || answer.isPending}
                onClick={() => answer.mutate({ action: 'ANSWERED', answerJson: { value: Number(integerValue) } })}
                className="min-h-[44px] rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Save
              </button>
            </>
          ) : question.answerSchema.type === 'select_with_detail' ? (
            <>
              <button type="button" onClick={() => answer.mutate({ action: 'ANSWERED', answerJson: { hasPet: true, petType: 'DOG' } })} className="min-h-[44px] rounded-xl border px-4 py-2 text-sm font-semibold">Dog</button>
              <button type="button" onClick={() => answer.mutate({ action: 'ANSWERED', answerJson: { hasPet: true, petType: 'CAT' } })} className="min-h-[44px] rounded-xl border px-4 py-2 text-sm font-semibold">Cat</button>
              <button type="button" onClick={() => answer.mutate({ action: 'ANSWERED', answerJson: { hasPet: false } })} className="min-h-[44px] rounded-xl border px-4 py-2 text-sm font-semibold">No pet</button>
            </>
          ) : question.answerSchema.type === 'multi_select' ? (
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
          <button type="button" onClick={() => answer.mutate({ action: 'SKIPPED' })} className="min-h-[44px] px-3 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-secondary))]">Skip</button>
          <button type="button" onClick={() => answer.mutate({ action: 'SNOOZED' })} className="min-h-[44px] px-3 py-2 text-sm font-semibold text-[hsl(var(--mobile-text-secondary))]">Ask later</button>
        </div>
      </div>
    </SummaryCard>
  );
}

export default function PersonalizationPage() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { selectedPropertyId } = usePropertyContext();
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);
  const propertyId = selectedPropertyId || searchParams.get('propertyId') || undefined;
  const queryKey = ['personalization', propertyId];

  const personalizationQuery = useQuery({
    queryKey,
    queryFn: () => getPersonalization(propertyId!),
    enabled: Boolean(propertyId),
    staleTime: 30_000,
  });
  const personalization = personalizationQuery.data;
  const contextMapQuery = useQuery({
    queryKey: ['personalization-context-map', propertyId],
    queryFn: () => getPersonalizationContextMap(propertyId!),
    enabled: Boolean(propertyId && personalization?.capabilities.canViewSensitiveEvidence),
    staleTime: 30_000,
  });

  const refresh = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey }),
    queryClient.invalidateQueries({ queryKey: ['personalization-context-map', propertyId] }),
  ]);
  const optIn = useMutation({ mutationFn: () => enableOptionalPersonalizationProfile(propertyId!), onSuccess: refresh });
  const reset = useMutation({ mutationFn: () => resetOptionalPersonalizationProfile(propertyId!), onSuccess: refresh });
  const feedback = useMutation({
    mutationFn: ({ recommendationId, type, reasonCode }: { recommendationId: string; type: 'DISMISSED' | 'NOT_RELEVANT'; reasonCode: PersonalizationFeedbackReason }) =>
      sendRecommendationFeedback(propertyId!, recommendationId, type, reasonCode),
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

      {personalizationQuery.isLoading ? (
        <SummaryCard title="Loading guidance" subtitle="Checking this home's current signals"><div /></SummaryCard>
      ) : personalizationQuery.isError ? (
        <EmptyStateCard title="Guidance unavailable" description="Personalized guidance could not be loaded for this home." />
      ) : personalization && !personalization.available ? (
        <>
          <EmptyStateCard title="Guidance temporarily paused" description="Property guidance and optional profile collection are currently unavailable." />
          {personalization.profileEnabled && personalization.capabilities.canManageSensitiveProfile ? (
            <SummaryCard title="Your profile control" subtitle="You can still remove optional household details while guidance is paused.">
              <button type="button" disabled={reset.isPending} onClick={resetWithConfirmation} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-60">
                <RotateCcw className="h-4 w-4" /> {reset.isPending ? 'Removing…' : 'Remove optional profile'}
              </button>
            </SummaryCard>
          ) : null}
        </>
      ) : personalization ? (
        <>
          {!personalization.profileEnabled && personalization.capabilities.canManageSensitiveProfile ? (
            <SummaryCard title="Improve your recommendations" subtitle="Optional household details can make future guidance more relevant.">
              <div className="space-y-4 text-sm text-[hsl(var(--mobile-text-secondary))]">
                <p>Property-based guidance is already available. If you choose, you can add a small household profile. We do not infer family, health, income, or pet details.</p>
                <button type="button" disabled={optIn.isPending} onClick={() => optIn.mutate()} className="min-h-[44px] rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-4 py-2 font-semibold text-white disabled:opacity-60">
                  {optIn.isPending ? 'Enabling…' : 'Improve my recommendations'}
                </button>
              </div>
            </SummaryCard>
          ) : null}
          {personalization.nextQuestion ? (
            <MobileSection>
              <MobileSectionHeader title="One optional question" subtitle="Answer only what you are comfortable sharing" />
              <ProfileQuestionCard propertyId={propertyId} question={personalization.nextQuestion} onSaved={refresh} />
            </MobileSection>
          ) : null}
          {personalization.rankingContext.profileApplied ? (
            <SummaryCard title="Recommendations adjusted" subtitle="Your optional answers changed the order, not the safety or eligibility rules.">
              <ul className="space-y-1 text-sm text-[hsl(var(--mobile-text-secondary))]">
                {personalization.rankingContext.reasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </SummaryCard>
          ) : null}
          <MobileSection>
            <MobileSectionHeader
              title="Top suggestions"
              subtitle="At most three, ranked by current relevance"
              action={personalization.capabilities.canAct ? (
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
              {personalization.recommendations.length === 0 ? (
                <EmptyStateCard title="Nothing needs attention" description="No reviewed personalization rule currently matches this home." />
              ) : personalization.recommendations.map((recommendation) => {
                const explanation = recommendation.explanations[0];
                const why = explanation?.reasonCodes[0]?.params?.message;
                const factSummary = explanation?.reasonCodes[0]?.params?.factSummary;
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
                      {factSummary ? <p className="text-sm font-medium">Why this home: {factSummary}</p> : null}
                      {recommendation.rankingReasons.map((reason) => (
                        <p key={reason} className="text-xs text-[hsl(var(--mobile-text-secondary))]">Owner preference: {reason}</p>
                      ))}
                      {personalization.capabilities.canGiveFeedback ? (
                        feedbackFor === recommendation.id ? (
                          <div className="space-y-2" aria-label="Why is this suggestion not useful?">
                            <p className="text-sm font-medium">What made this suggestion less useful?</p>
                            <div className="flex flex-wrap gap-2">
                              {PERSONALIZATION_FEEDBACK_REASONS.map((reason) => (
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
          {personalization.capabilities.canViewSensitiveEvidence ? (
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
          {personalization.profileEnabled && personalization.capabilities.canManageSensitiveProfile ? (
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
