'use client';

// apps/frontend/src/app/(dashboard)/dashboard/worker-jobs/page.tsx
//
// Admin-only worker jobs operations console.
// Optimized for status scanning, failure identification, and job re-runs.

import React, { useState, useCallback } from 'react';
import {
  CheckCircle2,
  Clock,
  Cpu,
  Loader2,
  Play,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useWorkerJobs, useTriggerWorkerJob } from '@/hooks/useAdminWorkerJobs';
import type { WorkerJobDetail, JobCategory, RecentRun } from '@/lib/api/adminWorkerJobs';
import { AdminAccessState, AdminConsoleShell, AdminRouteState, useAdminOnlineStatus } from '@/components/ops/AdminConsoleShell';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<JobCategory, string> = {
  PROPERTY_INTELLIGENCE: 'Property Intelligence',
  RECALLS: 'Recalls',
  NOTIFICATIONS: 'Notifications',
  MAINTENANCE: 'Maintenance',
  RISK_SAFETY: 'Risk & Safety',
  NEIGHBORHOOD: 'Neighborhood',
  HOME_CARE: 'Home Care',
  FINANCIAL_MARKET: 'Financial Market',
  HOME_INTELLIGENCE: 'Home Intelligence',
};

const CATEGORY_ORDER: JobCategory[] = [
  'PROPERTY_INTELLIGENCE',
  'RECALLS',
  'NOTIFICATIONS',
  'MAINTENANCE',
  'RISK_SAFETY',
  'NEIGHBORHOOD',
  'HOME_CARE',
  'FINANCIAL_MARKET',
  'HOME_INTELLIGENCE',
];

function fmtDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function timeAgo(ts: number | null): string {
  if (!ts) return '—';
  const diffMs = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

function fmtRefreshedAt(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Derive next-run label from a simple 5-part cron expression. */
function getNextRunLabel(cronExpr: string): string | null {
  if (!cronExpr) return null;
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minuteStr, hourStr, , , dowStr] = parts;
  const minute = parseInt(minuteStr, 10);
  const hour = parseInt(hourStr, 10);
  if (isNaN(minute) || isNaN(hour)) return null;

  const now = new Date();
  const next = new Date();
  next.setSeconds(0, 0);
  next.setMinutes(minute);
  next.setHours(hour);

  if (dowStr === '*') {
    // Daily
    if (next <= now) next.setDate(next.getDate() + 1);
  } else {
    // Weekly
    const targetDow = parseInt(dowStr, 10);
    if (isNaN(targetDow)) return null;
    const curDow = now.getDay();
    let diff = targetDow - curDow;
    if (diff < 0 || (diff === 0 && next <= now)) diff += 7;
    next.setDate(next.getDate() + diff);
  }

  const diffMs = next.getTime() - now.getTime();
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffMin = Math.floor((diffMs % 3_600_000) / 60_000);

  if (diffH === 0) return `in ${diffMin}m`;
  if (diffH < 24) return diffMin > 0 ? `in ${diffH}h ${diffMin}m` : `in ${diffH}h`;
  const days = Math.floor(diffH / 24);
  return `in ${days}d`;
}

/** Derive human-readable trigger type label. */
function getTriggerType(job: WorkerJobDetail): string {
  if (job.type === 'cron') return 'Cron';
  if (!job.cronExpression) return 'Event-driven';
  return 'Queue';
}

/** Derive health status from recent runs. */
type HealthStatus = 'healthy' | 'warning' | 'failing' | 'idle';

function getHealth(runs: RecentRun[]): HealthStatus {
  if (runs.length === 0) return 'idle';
  const failed = runs.filter((r) => r.status === 'failed').length;
  if (failed === 0) return 'healthy';
  if (failed === runs.length) return 'failing';
  return 'warning';
}

const HEALTH_DOT: Record<HealthStatus, string> = {
  healthy: 'bg-emerald-400',
  warning: 'bg-amber-400',
  failing: 'bg-rose-500',
  idle: 'bg-slate-300',
};

const HEALTH_BORDER: Record<HealthStatus, string> = {
  healthy: 'border-l-emerald-400',
  warning: 'border-l-amber-400',
  failing: 'border-l-rose-500',
  idle: 'border-l-slate-200',
};

// ─── Job Card ─────────────────────────────────────────────────────────────────

function JobCard({
  job,
  onTrigger,
  triggering,
  triggerSuccess,
}: {
  job: WorkerJobDetail;
  onTrigger: (key: string) => void;
  triggering: boolean;
  triggerSuccess: boolean;
}) {
  const health = getHealth(job.recentRuns);
  const lastRun = job.recentRuns[0] ?? null;
  const triggerType = getTriggerType(job);
  const nextRun = getNextRunLabel(job.cronExpression);

  const failureCount = job.queueStats?.failed ?? null;
  const successCount = job.queueStats?.completed ?? null;

  return (
    <div
      className={`rounded-2xl border border-slate-200/80 border-l-[3px] bg-white shadow-sm ${HEALTH_BORDER[health]}`}
    >
      <div className="p-4">
        {/* ── Row 1: title + type chip + action ── */}
        <div className="flex items-center gap-2">
          {/* Health dot */}
          <span className={`h-2 w-2 shrink-0 rounded-full ${HEALTH_DOT[health]}`} />

          {/* Job name */}
          <h3 className="flex-1 truncate text-[13px] font-semibold text-slate-900">
            {job.name}
          </h3>

          {/* Type chip */}
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
              triggerType === 'Queue'
                ? 'bg-blue-50 text-blue-700'
                : triggerType === 'Event-driven'
                ? 'bg-purple-50 text-purple-700'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {triggerType}
          </span>

          {/* Run Job button */}
          {job.triggerSupported ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 shrink-0 rounded px-2.5 text-[11px] font-semibold"
              disabled={triggering}
              onClick={() => onTrigger(job.key)}
            >
              {triggering ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : triggerSuccess ? (
                <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-500" />
              ) : (
                <Play className="mr-1 h-3 w-3" />
              )}
              {triggerSuccess ? 'Queued' : 'Run Job'}
            </Button>
          ) : null}
        </div>

        {/* ── Row 2: description ── */}
        <p className="mt-1.5 line-clamp-2 text-[11px] leading-[1.55] text-slate-500">
          {job.description}
        </p>

        {/* ── Row 3: last run + counts ── */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
          {/* Last run */}
          <span className="flex items-center gap-1">
            <span className="font-medium text-slate-600">Last run:</span>
            {lastRun ? (
              <>
                {lastRun.status === 'completed' ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                ) : (
                  <XCircle className="h-3 w-3 text-rose-500" />
                )}
                <span
                  className={
                    lastRun.status === 'failed' ? 'text-rose-600 font-semibold' : 'text-emerald-700'
                  }
                >
                  {lastRun.status === 'completed' ? 'Success' : 'Failed'}
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500">{timeAgo(lastRun.finishedAt)}</span>
              </>
            ) : (
              <span className="text-slate-400">Never run</span>
            )}
          </span>

          {/* Failure / success counts (queue jobs only) */}
          {failureCount !== null && (
            <span className="text-slate-500">
              <span className={failureCount > 0 ? 'font-semibold text-rose-600' : 'text-slate-400'}>
                Failures: {failureCount}
              </span>
              <span className="mx-1 text-slate-300">|</span>
              <span className="text-slate-500">Success: {successCount ?? 0}</span>
            </span>
          )}
        </div>

        {/* ── Row 4: schedule + next run ── */}
        {job.schedule && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              {job.schedule}
            </span>
            {nextRun && (
              <span className="text-slate-400">
                Next: <span className="font-medium text-slate-600">{nextRun}</span>
              </span>
            )}
            {/* Active indicator */}
            {job.queueStats && job.queueStats.active > 0 && (
              <span className="font-semibold text-blue-600">
                {job.queueStats.active} running
              </span>
            )}
            {job.queueStats && job.queueStats.waiting > 0 && (
              <span className="font-semibold text-amber-600">
                {job.queueStats.waiting} waiting
              </span>
            )}
          </div>
        )}

        {/* ── Row 5: recent runs (secondary) ── */}
        <div className="mt-3 border-t border-slate-100 pt-2.5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
            Recent runs
          </p>
          {job.recentRuns.length === 0 ? (
            <p className="text-[11px] text-slate-400">No recent runs</p>
          ) : (
            <div className="space-y-0.5">
              {job.recentRuns.map((run) => (
                <div key={run.id} className="flex items-center gap-1.5 text-[11px]">
                  {run.status === 'completed' ? (
                    <CheckCircle2 className="h-2.5 w-2.5 shrink-0 text-emerald-500" />
                  ) : (
                    <XCircle className="h-2.5 w-2.5 shrink-0 text-rose-500" />
                  )}
                  <span className={run.status === 'failed' ? 'font-medium text-rose-600' : 'text-slate-500'}>
                    {run.status === 'completed' ? 'Success' : 'Failed'}
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-400">{timeAgo(run.finishedAt)}</span>
                  <span className="text-slate-300">·</span>
                  <span className="font-mono text-slate-400">{fmtDuration(run.durationMs)}</span>
                  {run.status === 'failed' && run.failReason && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span
                        className="max-w-[140px] truncate text-rose-500"
                        title={run.failReason}
                      >
                        {run.failReason}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Category Section ─────────────────────────────────────────────────────────

function CategorySection({
  category,
  jobs,
  triggeringKey,
  triggeredKey,
  onTrigger,
}: {
  category: JobCategory;
  jobs: WorkerJobDetail[];
  triggeringKey: string | null;
  triggeredKey: string | null;
  onTrigger: (key: string) => void;
}) {
  return (
    <div>
      <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        {CATEGORY_LABELS[category]}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {jobs.map((job) => (
          <JobCard
            key={job.key}
            job={job}
            onTrigger={onTrigger}
            triggering={triggeringKey === job.key}
            triggerSuccess={triggeredKey === job.key}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="space-y-7">
      {[1, 2, 3].map((g) => (
        <div key={g}>
          <div className="mb-2 h-2.5 w-24 animate-pulse rounded-full bg-slate-200" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-slate-200 border-l-[3px] border-l-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-slate-200" />
                  <div className="h-3.5 flex-1 animate-pulse rounded bg-slate-200" />
                </div>
                <div className="mt-2 h-2.5 w-full animate-pulse rounded bg-slate-100" />
                <div className="mt-1 h-2.5 w-4/5 animate-pulse rounded bg-slate-100" />
                <div className="mt-3 h-2.5 w-2/3 animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WorkerJobsPage() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const isOnline = useAdminOnlineStatus();
  const isAdmin = !loading && user?.role === 'ADMIN';

  const jobsQ = useWorkerJobs(isAdmin);
  const trigger = useTriggerWorkerJob();

  const [triggeringKey, setTriggeringKey] = useState<string | null>(null);
  const [triggeredKey, setTriggeredKey] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<number | null>(null);

  const handleRefresh = useCallback(() => {
    jobsQ.refetch().then(() => setLastRefreshed(Date.now()));
  }, [jobsQ]);

  // Set lastRefreshed on initial data load
  React.useEffect(() => {
    if (jobsQ.data && !lastRefreshed) setLastRefreshed(Date.now());
  }, [jobsQ.data, lastRefreshed]);

  if (loading) {
    return (
      <AdminConsoleShell title="Worker Jobs" subtitle="Loading queue health and operations controls.">
        <AdminRouteState
          state="loading"
          title="Loading worker operations"
          description="Fetching queue status and recent run telemetry."
        />
      </AdminConsoleShell>
    );
  }

  if (!user) {
    return (
      <AdminAccessState title="Sign in required" description="Please sign in to access this page." />
    );
  }

  if (user.role !== 'ADMIN') {
    return (
      <AdminAccessState
        title="Admin access required"
        description="This page is restricted to platform administrators."
      />
    );
  }

  if (!isOnline) {
    return (
      <AdminConsoleShell title="Worker Jobs" subtitle="Monitor queue health, failures, and manual reruns.">
        <AdminRouteState
          state="offline"
          title="You're offline"
          description="Reconnect to monitor jobs and trigger queue actions."
        />
      </AdminConsoleShell>
    );
  }

  function handleTrigger(jobKey: string) {
    setTriggeringKey(jobKey);
    setTriggeredKey(null);
    trigger.mutate(jobKey, {
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
    });
  }

  const jobs: WorkerJobDetail[] = jobsQ.data ?? [];

  const byCategory = CATEGORY_ORDER.reduce<Record<string, WorkerJobDetail[]>>(
    (acc, cat) => {
      acc[cat] = jobs.filter((j) => j.category === cat);
      return acc;
    },
    {} as Record<string, WorkerJobDetail[]>,
  );

  // Summary counts
  const failing = jobs.filter((j) => getHealth(j.recentRuns) === 'failing').length;
  const warning = jobs.filter((j) => getHealth(j.recentRuns) === 'warning').length;

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
          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
            <Cpu className="h-3 w-3" />
            {jobs.length} jobs
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
            {jobs.filter((j) => j.triggerSupported).length} triggerable
          </span>
          {failing > 0 ? (
            <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600">
              {failing} failing
            </span>
          ) : null}
          {warning > 0 ? (
            <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
              {warning} warning
            </span>
          ) : null}
          {failing === 0 && warning === 0 ? (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              All healthy
            </span>
          ) : null}
          {lastRefreshed ? (
            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
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

      {/* Empty */}
      {!jobsQ.isLoading && !jobsQ.isError && jobs.length === 0 ? (
        <AdminRouteState
          state="empty"
          title="No worker jobs available"
          description="No registered worker jobs were returned for this environment."
        />
      ) : null}

      {/* Content */}
      {!jobsQ.isLoading && !jobsQ.isError && jobs.length > 0 && (
        <div className="space-y-7">
          {CATEGORY_ORDER.filter((cat) => byCategory[cat]?.length > 0).map((cat) => (
            <CategorySection
              key={cat}
              category={cat}
              jobs={byCategory[cat]}
              triggeringKey={triggeringKey}
              triggeredKey={triggeredKey}
              onTrigger={handleTrigger}
            />
          ))}
        </div>
      )}

      {/* Footer note */}
      {!jobsQ.isLoading && !jobsQ.isError && jobs.length > 0 && (
        <p className="mt-8 text-[10px] text-slate-400 text-center">
          Cron jobs run on schedule via node-cron. Queue stats and run history available for BullMQ-backed jobs only. Run Job available for recall jobs only.
        </p>
      )}
    </AdminConsoleShell>
  );
}
