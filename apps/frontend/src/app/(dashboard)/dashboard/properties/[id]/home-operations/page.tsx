'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ClipboardList, RefreshCw, Wrench } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  HOME_OPERATIONS_TABS,
  HomeOperationsTabPanel,
  classifyHomeOperationsTab,
  type HomeOperationsTabKey,
} from './HomeOperationsTabs';
import type { RankedHomeActionDTO } from '@/types';
import type { WorkItemListEntryDTO } from '@/types';
import { CanonicalWorkPortfolio, classifyCanonicalWorkItem } from './CanonicalWorkPortfolio';

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-full bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 motion-reduce:animate-none ${className}`}
    />
  );
}

function HomeOperationsSkeleton({
  showRecovery,
  onRetry,
}: {
  showRecovery: boolean;
  onRetry: () => void;
}) {
  return (
    <main
      aria-busy="true"
      aria-label="Loading Home Operations"
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
          {showRecovery ? 'This is taking longer than expected.' : 'Organizing your home operations…'}
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
        <SkeletonBlock className="h-9 w-full max-w-2xl" />
        {[0, 1, 2].map((index) => (
          <div key={index} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
          </div>
        ))}
      </section>
    </main>
  );
}

function tabCounts(actions: RankedHomeActionDTO[]): Record<HomeOperationsTabKey, RankedHomeActionDTO[]> {
  const byTab: Record<HomeOperationsTabKey, RankedHomeActionDTO[]> = {
    today: [], upcoming: [], waiting: [], projects: [], routines: [], completed: [],
  };
  for (const action of actions) {
    const tab = classifyHomeOperationsTab(action);
    if (tab) byTab[tab].push(action);
  }
  return byTab;
}

export default function HomeOperationsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const propertyId = (Array.isArray(params.id) ? params.id[0] : params.id) as string;
  const focusActionId = searchParams.get('focusActionId');
  const focusWorkItemId = searchParams.get('focusWorkItemId') ?? searchParams.get('workItemId');
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['home-action-plan', propertyId],
    queryFn: () => api.getHomeActions(propertyId),
    enabled: Boolean(propertyId),
    staleTime: 2 * 60 * 1000,
  });
  const workItemsQuery = useQuery({
    queryKey: ['home-operations-work-items', propertyId],
    queryFn: async () => {
      const response = await api.listWorkItems(propertyId);
      if (!response.success) throw new Error(response.message || 'Unable to load the work portfolio.');
      return response.data.items;
    },
    enabled: Boolean(propertyId) && query.isSuccess,
    staleTime: 30_000,
  });
  const reconciliationsQuery = useQuery({
    queryKey: ['home-operations-reconciliations', propertyId],
    queryFn: async () => {
      const response = await api.listHomeOperationsReconciliations(propertyId);
      if (!response.success) throw new Error(response.message || 'Unable to load synchronization status.');
      return response.data.reconciliations;
    },
    enabled: Boolean(propertyId),
    refetchInterval: 30_000,
  });
  const [showSlowLoadingRecovery, setShowSlowLoadingRecovery] = useState(false);
  const [activeTab, setActiveTab] = useState<HomeOperationsTabKey>('today');
  const [hasAppliedFocusTab, setHasAppliedFocusTab] = useState(false);

  const workItems: WorkItemListEntryDTO[] = workItemsQuery.data ?? [];
  const canonicalByTab = useMemo(() => {
    const result: Record<HomeOperationsTabKey, WorkItemListEntryDTO[]> = { today: [], upcoming: [], waiting: [], projects: [], routines: [], completed: [] };
    for (const item of workItems) {
      const tab = classifyCanonicalWorkItem(item);
      if (tab) result[tab].push(item);
    }
    return result;
  }, [workItems]);
  const advisoryByTab = useMemo(() => {
    const result = tabCounts((query.data?.actions ?? []).filter((action) => !action.workItem));
    return result;
  }, [query.data]);

  // Deep-link support: land on whichever tab actually contains the focused
  // action/work item, then scroll to it — the "focused deep link by
  // work-item ID" requirement (and the pre-existing action-id deep link)
  // both need to open on a tab that's showing the item, not just Today.
  useEffect(() => {
    if (hasAppliedFocusTab || (!focusActionId && !focusWorkItemId) || !query.data) return;
    const canonicalMatch = focusWorkItemId ? workItems.find((item) => item.id === focusWorkItemId) : null;
    if (canonicalMatch) {
      const tab = classifyCanonicalWorkItem(canonicalMatch);
      if (tab) setActiveTab(tab);
      setHasAppliedFocusTab(true);
      return;
    }
    const match = query.data.actions.find((action) =>
      (focusWorkItemId && action.workItem?.id === focusWorkItemId) ||
      (focusActionId && (
        action.id === focusActionId ||
        action.lineageId === focusActionId ||
        action.deduplication.mergedActionIds.includes(focusActionId)
      )),
    );
    if (match) {
      const tab = classifyHomeOperationsTab(match);
      if (tab) setActiveTab(tab);
    }
    setHasAppliedFocusTab(true);
  }, [focusActionId, focusWorkItemId, hasAppliedFocusTab, query.data, workItems]);

  useEffect(() => {
    if (!focusActionId && !focusWorkItemId) return;
    if (!query.data) return;
    const frame = window.requestAnimationFrame(() => {
      const id = focusWorkItemId ? `home-action-work-${focusWorkItemId}` : `home-action-${focusActionId}`;
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusActionId, focusWorkItemId, query.data, activeTab]);

  useEffect(() => {
    if (!query.isLoading) {
      setShowSlowLoadingRecovery(false);
      return;
    }
    const timer = window.setTimeout(() => setShowSlowLoadingRecovery(true), 8_000);
    return () => window.clearTimeout(timer);
  }, [query.isLoading]);

  if (query.isLoading || workItemsQuery.isLoading) {
    return <HomeOperationsSkeleton showRecovery={showSlowLoadingRecovery} onRetry={() => void Promise.all([query.refetch(), workItemsQuery.refetch()])} />;
  }

  if (query.isError || !query.data) {
    return (
      <div className="mx-auto max-w-6xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
        <p className="font-semibold text-rose-800">Home Operations is temporarily unavailable.</p>
        <Button variant="outline" className="mt-3 rounded-full" onClick={() => query.refetch()}>Try again</Button>
      </div>
    );
  }

  if (workItemsQuery.isError) {
    return (
      <div className="mx-auto max-w-6xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="font-semibold text-amber-900">Your ranked suggestions loaded, but the work portfolio did not.</p>
        <p className="mt-1 text-sm text-amber-800">No work has been removed. Retry to restore the canonical view.</p>
        <Button variant="outline" className="mt-3 rounded-full bg-white" onClick={() => workItemsQuery.refetch()}>Retry work portfolio</Button>
      </div>
    );
  }

  const feed = query.data;
  const urgentCount = feed.actions.filter((action) => action.priority === 'NOW' || action.priority === 'SOON').length;
  const refreshPlan = async () => {
    await Promise.all([query.refetch(), workItemsQuery.refetch(), reconciliationsQuery.refetch()]);
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
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">Home Operations</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Keep routine care, inspection follow-ups, and projects moving without tracking the same work twice.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-full bg-white">{feed.actions.length} ranked actions</Badge>
          <Badge variant="outline" className="rounded-full bg-white">{urgentCount} now or soon</Badge>
        </div>
      </header>

      {(reconciliationsQuery.data?.length ?? 0) > 0 ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3" role="status">
          <div>
            <p className="text-sm font-semibold text-amber-900">Finishing {reconciliationsQuery.data?.length} work update{reconciliationsQuery.data?.length === 1 ? '' : 's'}</p>
            <p className="text-xs text-amber-800">Your source activity is saved. Home Operations will keep retrying automatically.</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full border-amber-300 bg-white"
            onClick={async () => {
              const rows = reconciliationsQuery.data ?? [];
              await Promise.allSettled(rows.map((row) => api.retryHomeOperationsReconciliation(propertyId, row.id)));
              await refreshPlan();
            }}
          >
            Retry now
          </Button>
        </section>
      ) : null}

      <nav aria-label="Home Operations views" className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {HOME_OPERATIONS_TABS.map((tab) => {
          const count = canonicalByTab[tab.key].length + advisoryByTab[tab.key].length;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              aria-current={isActive ? 'page' : undefined}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
              <span className="ml-1.5 opacity-80">{count}</span>
            </button>
          );
        })}
      </nav>

      <section aria-live="polite">
        <div className="space-y-3">
          <CanonicalWorkPortfolio items={workItems} tab={activeTab} propertyId={propertyId} onChanged={refreshPlan} />
          {(advisoryByTab[activeTab].length > 0 || canonicalByTab[activeTab].length === 0) ? (
            <HomeOperationsTabPanel
              tab={activeTab}
              actions={advisoryByTab[activeTab]}
              propertyId={propertyId}
              onChanged={refreshPlan}
              focusActionId={focusActionId}
              focusWorkItemId={focusWorkItemId}
              emptyStateReason={feed.diagnostics.emptyStateReason}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}
