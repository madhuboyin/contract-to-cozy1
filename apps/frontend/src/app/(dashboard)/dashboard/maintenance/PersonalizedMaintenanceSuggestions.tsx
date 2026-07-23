'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Settings2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { MobileSection, StatusChip } from '@/components/mobile/dashboard/MobilePrimitives';
import { PropertyContextCapturePanel } from '@/components/property-context/PropertyContextCapturePanel';
import {
  convertPersonalizationRecommendationToTask,
  getModulePersonalizationRecommendations,
  refreshPersonalization,
} from '@/lib/api/personalizationApi';
import { formatMaintenanceTaskTitle } from './taskDisplay';

const SMOKE_DETECTOR_REVIEW = 'smoke_detector_installation_review';

function suggestionStatus(code: string, priority: 'HIGH' | 'MEDIUM' | 'LOW', confirmed: boolean) {
  if (code === SMOKE_DETECTOR_REVIEW && !confirmed) {
    return { label: 'Confirmation needed', tone: 'elevated' as const };
  }
  if (priority === 'HIGH') return { label: 'High priority', tone: 'elevated' as const };
  return { label: 'Suggested', tone: 'info' as const };
}

export function PersonalizedMaintenanceSuggestions({ propertyId }: { propertyId?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addedIds, setAddedIds] = useState<Set<string>>(() => new Set());
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(() => new Set());
  const [contextCaptureFor, setContextCaptureFor] = useState<string | null>(null);
  const queryKey = ['personalization-module', propertyId, 'MAINTENANCE'];
  const recommendations = useQuery({
    queryKey,
    queryFn: () => getModulePersonalizationRecommendations(propertyId!, 'MAINTENANCE', 3),
    enabled: Boolean(propertyId),
    retry: false,
    staleTime: 30_000,
  });
  const convert = useMutation({
    mutationFn: (recommendationId: string) => convertPersonalizationRecommendationToTask(propertyId!, recommendationId),
    onSuccess: (result, recommendationId) => {
      setAddedIds((current) => new Set(current).add(recommendationId));
      queryClient.invalidateQueries({ queryKey: ['maintenance-tasks', propertyId] });
      toast({
        title: result.deduped ? 'Already in maintenance' : 'Added to maintenance',
        description: formatMaintenanceTaskTitle(result.task.title),
      });
    },
    onError: () => {
      toast({ title: 'Could not add task', description: 'Please try again.', variant: 'destructive' });
    },
  });

  const items = recommendations.data?.items ?? [];
  if (recommendations.isLoading || recommendations.isError || items.length === 0) return null;

  return (
    <MobileSection>
      <div className="mb-4 flex flex-wrap items-start gap-x-4 gap-y-2">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Suggested actions</h2>
          <p className="mt-1 text-sm text-slate-600">
            Suggestions based on your Home Record. Confirm details before adding.
          </p>
        </div>
        <div className="pt-0.5">
          <Link
            href={`/dashboard/personalization?propertyId=${encodeURIComponent(propertyId!)}`}
            className="no-brand-style inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Personalization settings
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {items.map((item) => {
          const action = item.actions.find((candidate) => candidate.type === 'CONVERT_TO_TASK');
          const added = addedIds.has(item.id);
          const isSmokeDetectorReview = item.code === SMOKE_DETECTOR_REVIEW;
          const confirmed = confirmedIds.has(item.id);
          const captureOpen = contextCaptureFor === item.id;
          const status = suggestionStatus(item.code, item.priority, confirmed);
          const actionable = item.recommendationResponse.status === 'AVAILABLE';

          return (
            <article
              key={item.id}
              className="border-b border-slate-200 p-4 last:border-b-0 sm:p-5"
            >
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                    {item.governance.safetyTier === 'SAFETY_EMERGENCY' ? (
                      <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <Sparkles className="h-5 w-5" aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                        Personalized
                      </p>
                      <StatusChip tone={status.tone}>{status.label}</StatusChip>
                    </div>
                    <div>
                      <h3 className="text-base font-semibold leading-6 text-slate-950">{item.title}</h3>
                      <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{item.summary}</p>
                    </div>
                    {item.governance.professionalBoundary ? (
                      <details className="group max-w-3xl text-sm text-slate-600">
                        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 font-medium text-slate-700 marker:content-none">
                          <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
                          Safety guidance
                          <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" />
                        </summary>
                        <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                          {item.governance.professionalBoundary}
                        </p>
                      </details>
                    ) : null}
                    {!actionable ? (
                      <div className="max-w-3xl rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700" role="status">
                        <p className="font-semibold">Recommendation withheld</p>
                        <p className="mt-1">{item.recommendationResponse.message}</p>
                        <p className="mt-1">{item.recommendationResponse.safeNextAction}</p>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="pl-[52px] md:pl-0">
                  {isSmokeDetectorReview && !confirmed ? (
                    <Button
                      type="button"
                      disabled={!actionable}
                      onClick={() => setContextCaptureFor(captureOpen ? null : item.id)}
                      className="min-h-[44px] w-full gap-2 md:w-auto"
                    >
                      {captureOpen ? 'Close confirmation' : 'Review & confirm'}
                      {!captureOpen ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
                    </Button>
                  ) : action ? (
                    <Button
                      type="button"
                      disabled={!action.enabled || added || convert.isPending}
                      onClick={() => convert.mutate(item.id)}
                      className="min-h-[44px] w-full gap-2 md:w-auto"
                    >
                      {added ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : null}
                      {added ? 'Added' : action.enabled ? 'Add maintenance task' : 'Read only'}
                      {!added && action.enabled ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
                    </Button>
                  ) : null}
                </div>
              </div>

              {captureOpen && isSmokeDetectorReview ? (
                <div className="mt-4 border-t border-slate-200 pt-4 md:ml-[52px]">
                  <PropertyContextCapturePanel
                    propertyId={propertyId!}
                    featureKey="PERSONALIZATION"
                    operationKey="REVIEW_SAFETY_DETECTOR_PROFILE"
                    onCaptured={async (result) => {
                      const confirmed = result.evaluation.requirements.every(
                        (requirement) => requirement.state === 'KNOWN',
                      );
                      setConfirmedIds((current) => {
                        const next = new Set(current);
                        if (confirmed) next.add(item.id);
                        else next.delete(item.id);
                        return next;
                      });
                      setContextCaptureFor(null);
                      await refreshPersonalization(propertyId!);
                      await queryClient.invalidateQueries({ queryKey });
                    }}
                  />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </MobileSection>
  );
}
