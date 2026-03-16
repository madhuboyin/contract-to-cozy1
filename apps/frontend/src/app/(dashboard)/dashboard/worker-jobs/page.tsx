'use client';

// apps/frontend/src/app/(dashboard)/dashboard/worker-jobs/page.tsx
//
// Admin-only worker jobs dashboard.
// Shows all background jobs with schedule, live queue stats, last 3 runs,
// and a manual trigger button for BullMQ-backed jobs.
// Access pattern mirrors analytics-admin.

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  Loader2,
  Play,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { DashboardShell } from '@/components/DashboardShell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useWorkerJobs, useTriggerWorkerJob } from '@/hooks/useAdminWorkerJobs';
import type { WorkerJobDetail, JobCategory, QueueStats, RecentRun } from '@/lib/api/adminWorkerJobs';

// ─── Access Guard ─────────────────────────────────────────────────────────────

function AccessState({ title, description }: { title: string; description: string }) {
  return (
    <DashboardShell className="py-10">
      <Card className="rounded-[28px] border-slate-200 bg-white shadow-sm">
        <CardContent className="space-y-3 py-12 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
          <p className="mx-auto max-w-xl text-sm leading-6 text-slate-600">{description}</p>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/dashboard">Return to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </DashboardShell>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<JobCategory, string> = {
  PROPERTY_INTELLIGENCE: 'Property Intelligence',
  RECALLS: 'Recalls',
  NOTIFICATIONS: 'Notifications',
  MAINTENANCE: 'Maintenance',
  RISK_SAFETY: 'Risk & Safety',
  NEIGHBORHOOD: 'Neighborhood',
  HOME_CARE: 'Home Care',
};

const CATEGORY_ORDER: JobCategory[] = [
  'PROPERTY_INTELLIGENCE',
  'RECALLS',
  'NOTIFICATIONS',
  'MAINTENANCE',
  'RISK_SAFETY',
  'NEIGHBORHOOD',
  'HOME_CARE',
];

function fmtDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function fmtTime(ts: number | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

// ─── Queue Stats Chips ────────────────────────────────────────────────────────

function QueueStatChips({ stats }: { stats: QueueStats }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {stats.active > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
          <Activity className="h-2.5 w-2.5" />
          {stats.active} active
        </span>
      )}
      {stats.waiting > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
          <Clock className="h-2.5 w-2.5" />
          {stats.waiting} waiting
        </span>
      )}
      {stats.failed > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
          <XCircle className="h-2.5 w-2.5" />
          {stats.failed} failed
        </span>
      )}
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
        <CheckCircle2 className="h-2.5 w-2.5" />
        {stats.completed} done
      </span>
    </div>
  );
}

// ─── Recent Runs List ─────────────────────────────────────────────────────────

function RecentRunsList({ runs }: { runs: RecentRun[] }) {
  if (runs.length === 0) {
    return (
      <p className="text-[11px] text-slate-400 italic">No run history available</p>
    );
  }
  return (
    <div className="space-y-1">
      {runs.map((run) => (
        <div key={run.id} className="flex items-center gap-2 text-[11px]">
          {run.status === 'completed' ? (
            <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
          ) : (
            <XCircle className="h-3 w-3 shrink-0 text-rose-500" />
          )}
          <span className="text-slate-500">{timeAgo(run.finishedAt)}</span>
          <span className="text-slate-400">·</span>
          <span className="font-mono text-slate-600">{fmtDuration(run.durationMs)}</span>
          {run.status === 'failed' && run.failReason && (
            <>
              <span className="text-slate-400">·</span>
              <span className="truncate max-w-[160px] text-rose-600" title={run.failReason}>
                {run.failReason}
              </span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

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
  return (
    <div className="rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-sm">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-950">{job.name}</h3>
            <Badge
              variant="outline"
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                job.type === 'bullmq'
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-slate-50 text-slate-500'
              }`}
            >
              {job.type === 'bullmq' ? 'BullMQ' : 'Cron'}
            </Badge>
          </div>
          <p className="mt-1 text-[12px] text-slate-500 leading-5">{job.description}</p>
        </div>

        {/* Trigger button */}
        {job.triggerSupported ? (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 rounded-full text-xs"
            disabled={triggering}
            onClick={() => onTrigger(job.key)}
          >
            {triggering ? (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            ) : triggerSuccess ? (
              <CheckCircle2 className="mr-1.5 h-3 w-3 text-emerald-500" />
            ) : (
              <Play className="mr-1.5 h-3 w-3" />
            )}
            {triggerSuccess ? 'Queued' : 'Run now'}
          </Button>
        ) : (
          <span className="shrink-0 text-[11px] text-slate-400 mt-1">Schedule only</span>
        )}
      </div>

      {/* Schedule + queue stats */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <Clock className="h-3 w-3" />
          <span>{job.schedule}</span>
          {job.cronExpression && (
            <span className="font-mono text-slate-400">({job.cronExpression})</span>
          )}
        </div>
        {job.queueStats && (
          <QueueStatChips stats={job.queueStats} />
        )}
      </div>

      {/* Recent runs */}
      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
          Last 3 runs
        </p>
        <RecentRunsList runs={job.recentRuns} />
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
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
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
    <div className="space-y-8">
      {[1, 2, 3].map((g) => (
        <div key={g}>
          <div className="mb-3 h-3 w-28 animate-pulse rounded-full bg-slate-200" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                <div className="mt-2 h-3 w-full animate-pulse rounded bg-slate-100" />
                <div className="mt-1 h-3 w-3/4 animate-pulse rounded bg-slate-100" />
                <div className="mt-4 h-3 w-32 animate-pulse rounded bg-slate-100" />
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
  const isAdmin = !loading && user?.role === 'ADMIN';

  const jobsQ = useWorkerJobs(isAdmin);
  const trigger = useTriggerWorkerJob();

  const [triggeringKey, setTriggeringKey] = useState<string | null>(null);
  const [triggeredKey, setTriggeredKey] = useState<string | null>(null);

  if (loading) {
    return (
      <DashboardShell className="py-10">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      </DashboardShell>
    );
  }

  if (!user) {
    return (
      <AccessState
        title="Sign in required"
        description="Please sign in to access this page."
      />
    );
  }

  if (user.role !== 'ADMIN') {
    return (
      <AccessState
        title="Admin access required"
        description="This page is restricted to platform administrators."
      />
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
        alert(err?.message ?? 'Failed to trigger job. Please try again.');
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

  const totalJobs = jobs.length;
  const bullmqJobs = jobs.filter((j) => j.type === 'bullmq').length;
  const triggerable = jobs.filter((j) => j.triggerSupported).length;

  return (
    <DashboardShell className="lg:max-w-7xl lg:px-8 lg:pb-10">
      {/* Back link */}
      <div className="hidden lg:block mb-2">
        <Link
          href="/dashboard"
          className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          ← Dashboard
        </Link>
      </div>

      {/* Page header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-slate-400" />
            <h1 className="text-xl font-semibold tracking-tight text-slate-950">
              Worker Jobs
            </h1>
            <Badge variant="outline" className="rounded-full text-[11px] font-semibold border-slate-200 text-slate-500">
              Admin
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {totalJobs} jobs · {bullmqJobs} queue-backed · {triggerable} manually triggerable
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => jobsQ.refetch()}
          disabled={jobsQ.isFetching}
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${jobsQ.isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Error state */}
      {jobsQ.isError && (
        <div className="mb-6 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Failed to load worker jobs. Check that the backend is running and Redis is connected.
        </div>
      )}

      {/* Loading */}
      {jobsQ.isLoading && <PageSkeleton />}

      {/* Content */}
      {!jobsQ.isLoading && jobs.length > 0 && (
        <div className="space-y-8">
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

      {/* Note on cron-only jobs */}
      {!jobsQ.isLoading && jobs.length > 0 && (
        <p className="mt-8 text-[11px] text-slate-400 text-center">
          Cron-only jobs run on schedule via node-cron in the worker process. Manual trigger is supported only for BullMQ-backed jobs.
          Queue stats and run history are available for BullMQ queues only.
        </p>
      )}
    </DashboardShell>
  );
}
