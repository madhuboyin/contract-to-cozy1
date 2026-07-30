'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, Hammer, History, Lightbulb, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MobilePageIntro, StatusChip } from '@/components/mobile/dashboard/MobilePrimitives';
import { api } from '@/lib/api/client';
import { track } from '@/lib/analytics/events';
import type { RetroactiveCandidate } from '@/types';
import {
  getRenovationNextAction,
  renovationLifecycleLabel,
  type RenovationWorkspaceCase,
} from '@/features/renovations/renovationWorkspace';

export default function RenovationWorkspacePage() {
  const { id: propertyId } = useParams<{ id: string }>();
  const router = useRouter();
  const [cases, setCases] = useState<RenovationWorkspaceCase[]>([]);
  const [retroactiveCandidates, setRetroactiveCandidates] = useState<RetroactiveCandidate[]>([]);
  const [startingCandidateId, setStartingCandidateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [response, candidates] = await Promise.all([
        api.listRenovationCases(propertyId),
        api.getRetroactiveCandidates(propertyId),
      ]);
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Renovations could not be loaded');
      }
      setCases(response.data as RenovationWorkspaceCase[]);
      setRetroactiveCandidates(candidates);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Renovations could not be loaded');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  const startRetroactiveReview = useCallback(async (candidate: RetroactiveCandidate) => {
    if (candidate.existingRenovationCaseId) {
      router.push(`/dashboard/properties/${propertyId}/renovations/${candidate.existingRenovationCaseId}/requirements`);
      return;
    }
    setStartingCandidateId(candidate.timelineEventId);
    setError('');
    try {
      const response = await api.createRetroactiveRenovationCase(
        propertyId,
        candidate.timelineEventId,
      );
      if (!response.success) {
        throw new Error(response.message || 'Historical review could not be started');
      }
      const renovationCase = response.data as { id?: string } | undefined;
      if (!renovationCase?.id) throw new Error('Historical review could not be started');
      track('workflow_started', {
        tool: 'home-renovation-risk-advisor',
        propertyId,
        entryPoint: 'renovation_workspace',
      });
      router.push(`/dashboard/properties/${propertyId}/renovations/${renovationCase.id}/requirements`);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Historical review could not be started');
    } finally {
      setStartingCandidateId(null);
    }
  }, [propertyId, router]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    track('workflow_started', {
      tool: 'home-renovation-risk-advisor',
      propertyId,
      entryPoint: 'renovation_workspace',
    });
  }, [propertyId]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 pb-28 sm:p-6">
      <MobilePageIntro
        title="Renovations"
        subtitle="Explore, plan, approve, execute, and close out each renovation in one property record."
        action={
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-2.5 text-indigo-700">
            <Hammer className="h-5 w-5" aria-hidden="true" />
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={`/dashboard/properties/${propertyId}/renovations/explore`}>
            <Lightbulb className="mr-2 h-4 w-4" aria-hidden="true" />
            Explore a renovation
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/dashboard/properties/${propertyId}/projects`}>Projects</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/dashboard/properties/${propertyId}/materials`}>Materials</Link>
        </Button>
      </div>

      {error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>{error}</p>
          <Button variant="link" className="mt-1 h-auto p-0 text-red-800" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-14" aria-live="polite">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
          Loading renovation plans…
        </div>
      ) : null}

      {!loading && retroactiveCandidates.length > 0 ? (
        <section aria-labelledby="historical-review-heading">
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="space-y-5 p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-xl border border-amber-200 bg-white p-2 text-amber-700">
                  <History className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 id="historical-review-heading" className="font-semibold text-slate-950">
                    Review previously completed work
                  </h2>
                  <p className="mt-1 text-sm text-slate-700">
                    Turn a timeline improvement into a governed historical review. Nothing is reported to an authority automatically.
                  </p>
                </div>
              </div>

              <ol className="grid gap-2 text-xs text-slate-700 sm:grid-cols-3" aria-label="Historical review steps">
                <li className="flex gap-2 rounded-lg border border-amber-100 bg-white p-3">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                  Confirm the completed scope
                </li>
                <li className="flex gap-2 rounded-lg border border-amber-100 bg-white p-3">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                  Research permit, tax, license, and zoning evidence
                </li>
                <li className="flex gap-2 rounded-lg border border-amber-100 bg-white p-3">
                  <Hammer className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                  Track remediation and closeout
                </li>
              </ol>

              <div className="space-y-2">
                {retroactiveCandidates.map(candidate => (
                  <div
                    key={candidate.timelineEventId}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-slate-950">{candidate.eventTitle}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {new Date(candidate.occurredAt).toLocaleDateString()}
                        {candidate.suggestedRenovationLabel ? ` · ${candidate.suggestedRenovationLabel}` : ''}
                        {candidate.amount != null ? ` · $${candidate.amount.toLocaleString()}` : ''}
                      </p>
                    </div>
                    <Button
                      variant={candidate.existingRenovationCaseId ? 'outline' : 'default'}
                      disabled={startingCandidateId === candidate.timelineEventId}
                      onClick={() => void startRetroactiveReview(candidate)}
                    >
                      {startingCandidateId === candidate.timelineEventId ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : null}
                      {candidate.existingRenovationCaseId ? 'Continue review' : 'Start guided review'}
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {!loading && !error && cases.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 p-6 text-center">
            <h2 className="font-semibold">No renovation plans yet</h2>
            <p className="text-sm text-slate-600">
              Start with an idea. Comparing options does not create a plan until you explicitly select one.
            </p>
            <Button asChild>
              <Link href={`/dashboard/properties/${propertyId}/renovations/explore`}>Explore options</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!loading && cases.length > 0 ? (
        <section aria-labelledby="renovation-plans-heading" className="space-y-3">
          <h2 id="renovation-plans-heading" className="text-lg font-semibold">Renovation plans</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {cases.map(renovationCase => {
              const nextAction = getRenovationNextAction(renovationCase, propertyId);
              return (
                <Card key={renovationCase.id}>
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{renovationCase.name}</h3>
                        {renovationCase.objective ? (
                          <p className="mt-1 line-clamp-2 text-sm text-slate-600">{renovationCase.objective}</p>
                        ) : null}
                      </div>
                      <StatusChip tone="info">{renovationLifecycleLabel(renovationCase.lifecycle)}</StatusChip>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Next question</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">{nextAction.question}</p>
                    </div>
                    <Button asChild className="w-full sm:w-auto">
                      <Link href={`/dashboard/properties/${propertyId}/renovations/${renovationCase.id}`}>
                        Open plan
                        <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}
