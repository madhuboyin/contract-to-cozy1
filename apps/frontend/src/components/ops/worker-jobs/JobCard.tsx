// apps/frontend/src/components/ops/worker-jobs/JobCard.tsx

'use client';

import { useState } from 'react';
import { CheckCircle2, ChevronDown, Clock, Loader2, Play, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WorkerJobDetail } from '@/lib/api/adminWorkerJobs';
import {
  fmtDuration,
  getHealth,
  getNextRunLabel,
  getTriggerType,
  timeAgo,
  HEALTH_BORDER,
  HEALTH_DOT,
  RUN_BAR_COLOR,
  SMOKE_CHECKLIST_JOB_KEYS,
} from './workerJobsUtils';
import { SmokeChecklistPanel } from './SmokeChecklistPanel';

export function JobCard({
  job,
  onTrigger,
  triggering,
  triggerSuccess,
}: {
  job: WorkerJobDetail;
  onTrigger: (key: string, dryRun?: boolean, propertyId?: string) => void;
  triggering: boolean;
  triggerSuccess: boolean;
}) {
  const health = getHealth(job.recentRuns);
  const lastRun = job.recentRuns[0] ?? null;
  const triggerType = getTriggerType(job);
  const nextRun = getNextRunLabel(job.cronExpression);
  const [dryRun, setDryRun] = useState(job.supportsDryRun);
  const [expanded, setExpanded] = useState(false);

  const failureCount = job.queueStats?.failed ?? null;
  const successCount = job.queueStats?.completed ?? null;

  return (
    <div
      className={`rounded-2xl border border-slate-200/80 border-l-[3px] bg-white shadow-sm ${HEALTH_BORDER[health]}`}
    >
      <div className="p-3.5">
        {/* ── Row 1: title + type chip + action ── */}
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${HEALTH_DOT[health]}`} />

          <h3 className="flex-1 truncate text-[13px] font-semibold text-slate-900">
            {job.name}
          </h3>

          {!job.effectiveEnabled && (
            <span
              className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-semibold text-white"
              title={job.disabledReason}
            >
              Disabled
            </span>
          )}

          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
              triggerType === 'Queue'
                ? 'bg-blue-50 text-blue-700'
                : triggerType === 'Event-driven'
                ? 'bg-purple-50 text-purple-700'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {triggerType}
          </span>

          {job.triggerSupported ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 shrink-0 rounded px-2.5 text-[11px] font-semibold"
              disabled={triggering}
              onClick={() => onTrigger(job.key, job.supportsDryRun ? dryRun : undefined)}
            >
              {triggering ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : triggerSuccess ? (
                <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-500" />
              ) : (
                <Play className="mr-1 h-3 w-3" />
              )}
              {triggerSuccess ? 'Queued' : dryRun && job.supportsDryRun ? 'Dry Run' : 'Run Job'}
            </Button>
          ) : null}
        </div>

        {job.triggerSupported && job.supportsDryRun && (
          <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">
            <input
              type="checkbox"
              className="h-3 w-3 rounded border-slate-300"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
            />
            Dry run (no writes/sends)
          </label>
        )}

        {/* ── Row 2: last run + counts ── */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
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

          {failureCount !== null && (
            <span className="ml-auto text-slate-500">
              <span className={failureCount > 0 ? 'font-semibold text-rose-600' : 'text-slate-400'}>
                Failures: {failureCount}
              </span>
              <span className="mx-1 text-slate-300">|</span>
              <span className="text-slate-500">Success: {successCount ?? 0}</span>
            </span>
          )}
        </div>

        {/* ── Run strip: at-a-glance recent-run history without expanding ── */}
        {job.recentRuns.length > 0 && (
          <div className="mt-2 flex gap-0.5" title={`Last ${job.recentRuns.length} run(s)`}>
            {job.recentRuns.slice(0, 8).map((run) => (
              <span
                key={run.id}
                className={`h-1.5 max-w-[20px] flex-1 rounded-full ${RUN_BAR_COLOR[run.status]}`}
                title={`${run.status} · ${timeAgo(run.finishedAt)}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Details disclosure: description, schedule, full run history ── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex h-6 w-full items-center justify-center gap-1 border-t border-slate-100 bg-slate-50/60 text-[10px] font-semibold text-slate-400 hover:text-slate-600"
      >
        Details
        <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 p-3.5">
          <p className="text-[11px] leading-[1.55] text-slate-500">{job.description}</p>
          {!job.effectiveEnabled && job.disabledReason && (
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              Disabled: {job.disabledReason}
            </p>
          )}

          {job.schedule && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {job.schedule}
              </span>
              {nextRun && (
                <span className="text-slate-400">
                  Next: <span className="font-medium text-slate-600">{nextRun}</span>
                </span>
              )}
              {job.queueStats && job.queueStats.active > 0 && (
                <span className="font-semibold text-blue-600">{job.queueStats.active} running</span>
              )}
              {job.queueStats && job.queueStats.waiting > 0 && (
                <span className="font-semibold text-amber-600">{job.queueStats.waiting} waiting</span>
              )}
            </div>
          )}

          <div className="mt-2.5 border-t border-slate-200/70 pt-2">
            <p className="mb-1 text-[11px] font-semibold tracking-normal text-slate-400">Recent runs</p>
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
                    {run.dryRun && (
                      <span className="rounded bg-slate-200 px-1 text-[10px] font-semibold text-slate-600">dry run</span>
                    )}
                    {run.trigger === 'manual' && (
                      <span className="rounded bg-slate-200 px-1 text-[10px] font-semibold text-slate-600">manual</span>
                    )}
                    {run.status === 'failed' && run.failReason && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className="max-w-[140px] truncate text-rose-500" title={run.failReason}>
                          {run.failReason}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {SMOKE_CHECKLIST_JOB_KEYS.has(job.key) && (
            <SmokeChecklistPanel
              job={job}
              triggering={triggering}
              onRunScopedLive={(propertyId) => onTrigger(job.key, false, propertyId)}
            />
          )}
        </div>
      )}
    </div>
  );
}
