'use client';

// apps/frontend/src/app/(dashboard)/dashboard/worker-jobs/page.tsx
//
// Admin-only worker jobs operations console.
// Optimized for status scanning, failure identification, and job re-runs.

import React, { useCallback, useMemo, useState } from 'react';
import { Cpu, RefreshCw } from 'lucide-react';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  useWorkerJobs,
  useTriggerWorkerJob,
  useWorkerGovernance,
} from '@/hooks/useAdminWorkerJobs';
import type { WorkerJobDetail, JobCategory } from '@/lib/api/adminWorkerJobs';
import { AdminConsoleShell, AdminRouteState } from '@/components/ops/AdminConsoleShell';
import { CategorySection } from '@/components/ops/worker-jobs/CategorySection';
import { JobsToolbar } from '@/components/ops/worker-jobs/JobsToolbar';
import { PageSkeleton } from '@/components/ops/worker-jobs/PageSkeleton';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  fmtRefreshedAt,
  getHealth,
  HealthStatus,
} from '@/components/ops/worker-jobs/workerJobsUtils';

export default function WorkerJobsPage() {
  const guard = useAdminGuard({
    title: 'Worker Jobs',
    subtitle: 'Monitor queue health, failures, and manual reruns.',
  });
  const { toast } = useToast();

  const jobsQ = useWorkerJobs(guard.isAdmin);
  const governanceQ = useWorkerGovernance(guard.isAdmin);
  const trigger = useTriggerWorkerJob();

  const [triggeringKey, setTriggeringKey] = useState<string | null>(null);
  const [triggeredKey, setTriggeredKey] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const [healthFilter, setHealthFilter] = useState<HealthStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<JobCategory | 'all'>('all');
  const [view, setView] = useState<'cards' | 'list'>('cards');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<JobCategory>>(new Set());

  const handleRefresh = useCallback(() => {
    jobsQ.refetch().then(() => setLastRefreshed(Date.now()));
  }, [jobsQ]);

  // Set lastRefreshed on initial data load
  React.useEffect(() => {
    if (jobsQ.data && !lastRefreshed) setLastRefreshed(Date.now());
  }, [jobsQ.data, lastRefreshed]);

  const allJobs: WorkerJobDetail[] = useMemo(() => jobsQ.data ?? [], [jobsQ.data]);

  const availableCategories = useMemo(
    () => CATEGORY_ORDER.filter((c) => allJobs.some((j) => j.category === c)),
    [allJobs],
  );

  // Search + category filtered (health filter excluded) — drives the
  // faceted counts shown on the health pills themselves.
  const searchedAndCategoryFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allJobs.filter((j) => {
      if (categoryFilter !== 'all' && j.category !== categoryFilter) return false;
      if (q && !j.name.toLowerCase().includes(q) && !j.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allJobs, search, categoryFilter]);

  const healthCounts = useMemo(() => {
    const counts: Record<HealthStatus, number> = { healthy: 0, warning: 0, failing: 0, idle: 0 };
    searchedAndCategoryFiltered.forEach((j) => counts[getHealth(j.recentRuns)]++);
    return counts;
  }, [searchedAndCategoryFiltered]);

  const filteredJobs = useMemo(() => {
    if (healthFilter === 'all') return searchedAndCategoryFiltered;
    return searchedAndCategoryFiltered.filter((j) => getHealth(j.recentRuns) === healthFilter);
  }, [searchedAndCategoryFiltered, healthFilter]);

  const byCategory = useMemo(() => {
    const acc: Record<string, WorkerJobDetail[]> = {};
    CATEGORY_ORDER.forEach((cat) => {
      acc[cat] = filteredJobs.filter((j) => j.category === cat);
    });
    return acc;
  }, [filteredJobs]);

  const visibleCategories = CATEGORY_ORDER.filter((cat) => byCategory[cat]?.length > 0);
  const allCollapsed = visibleCategories.length > 0 && visibleCategories.every((c) => collapsedCategories.has(c));

  function toggleCategoryCollapsed(cat: JobCategory) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function toggleCollapseAll() {
    setCollapsedCategories(allCollapsed ? new Set() : new Set(visibleCategories));
  }

  if (guard.status !== 'ready') return guard.node;

  function handleTrigger(jobKey: string, dryRun?: boolean, propertyId?: string) {
    setTriggeringKey(jobKey);
    setTriggeredKey(null);
    trigger.mutate(
      { jobKey, dryRun, propertyId },
      {
        onSuccess: () => {
          setTriggeringKey(null);
          setTriggeredKey(jobKey);
          setTimeout(() => setTriggeredKey(null), 3000);
        },
        onError: (err: any) => {
          setTriggeringKey(null);
          toast({
            title: 'Unable to queue job',
            description: err?.message ?? 'Failed to trigger job. Please try again.',
            variant: 'destructive',
          });
        },
      },
    );
  }

  // Summary counts (over all jobs, unaffected by filters)
  const failing = allJobs.filter((j) => getHealth(j.recentRuns) === 'failing').length;
  const warning = allJobs.filter((j) => getHealth(j.recentRuns) === 'warning').length;

  return (
    <AdminConsoleShell
      title="Worker Jobs"
      subtitle="Monitor queue health, identify failures quickly, and trigger supported jobs with minimal navigation friction."
      actions={
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded px-3 text-xs"
          onClick={handleRefresh}
          disabled={jobsQ.isFetching}
        >
          <RefreshCw className={`mr-1.5 h-3 w-3 ${jobsQ.isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      }
      chips={
        <>
          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
            <Cpu className="h-3 w-3" />
            {allJobs.length} jobs
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
            {allJobs.filter((j) => j.triggerSupported).length} triggerable
          </span>
          {failing > 0 ? (
            <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
              {failing} failing
            </span>
          ) : null}
          {warning > 0 ? (
            <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600">
              {warning} warning
            </span>
          ) : null}
          {failing === 0 && warning === 0 ? (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              All healthy
            </span>
          ) : null}
          {lastRefreshed ? (
            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
              Refreshed {fmtRefreshedAt(lastRefreshed)}
            </span>
          ) : null}
        </>
      }
    >

      {/* Error */}
      {jobsQ.isError ? (
        <AdminRouteState
          state="error"
          title="Failed to load worker jobs"
          description="Check backend and Redis connectivity, then retry."
          action={
            <Button variant="outline" size="sm" className="rounded-full" onClick={handleRefresh}>
              Retry
            </Button>
          }
        />
      ) : null}

      {/* Loading */}
      {jobsQ.isLoading ? <PageSkeleton /> : null}

      {/* Empty (no jobs registered at all) */}
      {!jobsQ.isLoading && !jobsQ.isError && allJobs.length === 0 ? (
        <AdminRouteState
          state="empty"
          title="No worker jobs available"
          description="No registered worker jobs were returned for this environment."
        />
      ) : null}

      {/* Content */}
      {!jobsQ.isLoading && !jobsQ.isError && allJobs.length > 0 && (
        <>
          <JobsToolbar
            search={search}
            onSearchChange={setSearch}
            healthFilter={healthFilter}
            onHealthFilterChange={setHealthFilter}
            healthCounts={healthCounts}
            totalCount={searchedAndCategoryFiltered.length}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            availableCategories={availableCategories}
            view={view}
            onViewChange={setView}
            allCollapsed={allCollapsed}
            onToggleCollapseAll={toggleCollapseAll}
          />

          {visibleCategories.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-slate-400">
              No jobs match “{search || CATEGORY_LABELS[categoryFilter as JobCategory] || healthFilter}”. Try clearing a filter.
            </p>
          ) : (
            <div className="space-y-6">
              {visibleCategories.map((cat) => (
                <CategorySection
                  key={cat}
                  category={cat}
                  jobs={byCategory[cat]}
                  view={view}
                  collapsed={collapsedCategories.has(cat)}
                  onToggleCollapsed={() => toggleCategoryCollapsed(cat)}
                  triggeringKey={triggeringKey}
                  triggeredKey={triggeredKey}
                  onTrigger={handleTrigger}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Governance flags summary (WKR-004/WKR-005) */}
      {governanceQ.data && (
        <div className="mt-8 rounded-xl border border-slate-200/80 bg-slate-50 p-3">
          <p className="mb-1.5 text-[11px] font-semibold text-slate-500">Worker execution policy</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                governanceQ.data.enforceHumanPolicyApprovals
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              ENFORCE_HUMAN_POLICY_APPROVALS={String(governanceQ.data.enforceHumanPolicyApprovals)}
            </span>
            {governanceQ.data.flags.map((f) => (
              <span
                key={f.key}
                className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                  f.malformed
                    ? 'bg-rose-100 text-rose-700'
                    : f.value
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-slate-200 text-slate-600'
                }`}
                title={f.malformed ? `Malformed raw value "${f.rawValue}" — using default` : undefined}
              >
                {f.key}={String(f.value)}
                {f.malformed ? ' ⚠' : ''}
              </span>
            ))}
          </div>
          {governanceQ.data.runners.some((r) => !r.effectiveEnabled) && (
            <p className="mt-1.5 text-[11px] text-slate-500">
              Runners disabled: {governanceQ.data.runners.filter((r) => !r.effectiveEnabled).map((r) => r.name).join(', ')}
            </p>
          )}
        </div>
      )}

      {/* Footer note */}
      {!jobsQ.isLoading && !jobsQ.isError && allJobs.length > 0 && (
        <p className="mt-4 text-center text-[11px] text-slate-400">
          Cron jobs run on schedule via node-cron. Queue stats and run history available for BullMQ-backed jobs only. Run Job available for recall jobs only.
        </p>
      )}
    </AdminConsoleShell>
  );
}
