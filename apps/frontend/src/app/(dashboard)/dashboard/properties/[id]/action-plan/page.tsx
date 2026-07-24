'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ClipboardList, RefreshCw, Wrench } from 'lucide-react';
import { api } from '@/lib/api/client';
import {
  ActionCard,
  CoverageCorrectionGroupCard,
  CriticalWeatherActionCard,
  EnvironmentActionCard,
  SeasonalChecklistActionCard,
  groupAttentionActions,
} from '@/components/home/UnifiedHomeSurface';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-full bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 motion-reduce:animate-none ${className}`}
    />
  );
}

function ActionPlanSkeleton({
  showRecovery,
  onRetry,
}: {
  showRecovery: boolean;
  onRetry: () => void;
}) {
  return (
    <main
      aria-busy="true"
      aria-label="Loading prioritized action plan"
      className="mx-auto w-full max-w-6xl space-y-6 pb-16"
    >
      <div className="flex items-center justify-between gap-3">
        <SkeletonBlock className="h-10 w-32" />
        <SkeletonBlock className="h-10 w-48" />
      </div>

      <header className="overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-br from-white to-teal-50/50 p-6 shadow-sm md:p-8">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-100 text-teal-700">
            <ClipboardList className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <SkeletonBlock className="h-3 w-28" />
            <SkeletonBlock className="mt-3 h-8 w-64 max-w-full" />
            <SkeletonBlock className="mt-4 h-3 w-full max-w-3xl" />
            <SkeletonBlock className="mt-2 h-3 w-4/5 max-w-2xl" />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <SkeletonBlock className="h-7 w-32" />
          <SkeletonBlock className="h-7 w-32" />
          <SkeletonBlock className="h-7 w-28" />
        </div>
      </header>

      <div className="flex min-h-12 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm font-medium text-slate-600" role="status" aria-live="polite">
          {showRecovery ? 'This is taking longer than expected.' : 'Organizing your next actions…'}
        </p>
        {showRecovery ? (
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={onRetry}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
            <Button asChild variant="ghost" className="rounded-full">
              <Link href="/dashboard">Back to Home</Link>
            </Button>
          </div>
        ) : null}
      </div>

      <section aria-hidden="true" className="space-y-3">
        <SkeletonBlock className="h-6 w-72 max-w-full" />
        <SkeletonBlock className="h-4 w-[28rem] max-w-full" />
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            {index === 0 ? (
              <div className="absolute inset-x-0 top-0 h-1 animate-pulse bg-gradient-to-r from-transparent via-teal-400 to-transparent motion-reduce:animate-none" />
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <SkeletonBlock className="h-6 w-16" />
              <SkeletonBlock className="h-4 w-24" />
            </div>
            <SkeletonBlock className="mt-4 h-6 w-3/5" />
            <SkeletonBlock className="mt-3 h-4 w-full" />
            <SkeletonBlock className="mt-2 h-4 w-4/5" />
            <div className="mt-5 flex flex-wrap gap-2">
              <SkeletonBlock className="h-10 w-40" />
              <SkeletonBlock className="h-10 w-28" />
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}

export default function PrioritizedActionPlanPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const propertyId = (Array.isArray(params.id) ? params.id[0] : params.id) as string;
  const focusActionId = searchParams.get('focusActionId');
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['home-action-plan', propertyId],
    queryFn: () => api.getHomeActions(propertyId),
    enabled: Boolean(propertyId),
    staleTime: 2 * 60 * 1000,
  });
  const [showSlowLoadingRecovery, setShowSlowLoadingRecovery] = useState(false);

  useEffect(() => {
    if (!focusActionId || !query.data) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`home-action-${focusActionId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusActionId, query.data]);

  useEffect(() => {
    if (!query.isLoading) {
      setShowSlowLoadingRecovery(false);
      return;
    }

    const timer = window.setTimeout(() => setShowSlowLoadingRecovery(true), 8_000);
    return () => window.clearTimeout(timer);
  }, [query.isLoading]);

  if (query.isLoading) {
    return (
      <ActionPlanSkeleton
        showRecovery={showSlowLoadingRecovery}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="mx-auto max-w-6xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
        <p className="font-semibold text-rose-800">The prioritized action plan is temporarily unavailable.</p>
        <Button variant="outline" className="mt-3 rounded-full" onClick={() => query.refetch()}>Try again</Button>
      </div>
    );
  }

  const feed = query.data;
  const entries = groupAttentionActions(feed.actions);
  const urgentCount = feed.actions.filter((action) => action.priority === 'NOW' || action.priority === 'SOON').length;
  const refreshPlan = async () => {
    await query.refetch();
    await queryClient.invalidateQueries({ queryKey: ['unified-home', propertyId] });
  };

  return (
    <main className="mx-auto w-full max-w-6xl animate-in space-y-6 fade-in duration-300 motion-reduce:animate-none pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" className="rounded-full">
          <Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" />Back to Home</Link>
        </Button>
        <Button asChild variant="outline" className="rounded-full">
          <Link href={`/dashboard/properties/${propertyId}/fix`}><Wrench className="mr-2 h-4 w-4" />Open Resolution Center</Link>
        </Button>
      </div>

      <header className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-white to-teal-50/50 p-6 shadow-sm md:p-8">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-teal-100 p-3 text-teal-700"><ClipboardList className="h-5 w-5" /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Plan & Projects</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">Prioritized Action Plan</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Your complete ranked next-action list. Actions that become managed repair, provider, incident, or execution cases continue in Resolution Center.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-full bg-white">{feed.actions.length} ranked actions</Badge>
          <Badge variant="outline" className="rounded-full bg-white">{entries.length} grouped topics</Badge>
          <Badge variant="outline" className="rounded-full bg-white">{urgentCount} now or soon</Badge>
        </div>
      </header>

      <section aria-labelledby="ranked-actions-heading" className="space-y-3">
        <div>
          <h2 id="ranked-actions-heading" className="text-xl font-semibold text-slate-950">Ranked actions and supporting details</h2>
          <p className="text-sm text-slate-500">Priority, evidence, confidence, timing, and the next supported move.</p>
        </div>
        {entries.length === 0 ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
            No action currently needs your attention.
          </div>
        ) : entries.map((entry) => {
          const actions = entry.kind === 'COVERAGE_CORRECTION_GROUP' ? entry.actions : [entry.action];
          const isFocused = Boolean(focusActionId && actions.some((action) =>
            action.id === focusActionId ||
            action.lineageId === focusActionId ||
            action.deduplication.mergedActionIds.includes(focusActionId),
          ));
          const anchorId = isFocused && focusActionId
            ? `home-action-${focusActionId}`
            : `home-action-${actions[0]?.id ?? 'unknown'}`;
          const entryKey = entry.kind === 'COVERAGE_CORRECTION_GROUP'
            ? `coverage-plan-group:${entry.actions.map((action) => action.id).join(':')}`
            : entry.action.id;

          return (
            <div
              id={anchorId}
              key={entryKey}
              className={`scroll-mt-28 rounded-2xl transition-shadow ${isFocused ? 'ring-2 ring-teal-500 ring-offset-4 ring-offset-white' : ''}`}
            >
              {entry.kind === 'ACTION' ? (
                <ActionCard
                  action={entry.action}
                  propertyId={propertyId}
                  showSupportingDetails
                  onChanged={refreshPlan}
                />
              ) : entry.kind === 'CRITICAL_WEATHER' ? (
                <CriticalWeatherActionCard
                  action={entry.action}
                  propertyId={propertyId}
                  showSupportingDetails
                />
              ) : entry.kind === 'ENVIRONMENT' ? (
                <EnvironmentActionCard
                  action={entry.action}
                  propertyId={propertyId}
                  onChanged={refreshPlan}
                />
              ) : entry.kind === 'SEASONAL_CHECKLIST' ? (
                <SeasonalChecklistActionCard
                  action={entry.action}
                  propertyId={propertyId}
                  showSupportingDetails
                />
              ) : (
                <CoverageCorrectionGroupCard
                  actions={entry.actions}
                  subjects={entry.subjects}
                  propertyId={propertyId}
                  showSupportingDetails
                />
              )}
            </div>
          );
        })}
      </section>
    </main>
  );
}
