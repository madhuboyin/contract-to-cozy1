// apps/frontend/src/components/ops/worker-jobs/workerJobsUtils.ts
//
// Shared labels, formatters, and health derivation for the Worker Jobs
// admin console (apps/frontend/src/app/(dashboard)/dashboard/worker-jobs).

import type { WorkerJobDetail, JobCategory, RecentRun } from '@/lib/api/adminWorkerJobs';

// W6: the 4 lowest-risk jobs (one per customerJob domain) wired end-to-end
// for controlled smoke validation — see docs/product/ContractToCozy_W6_Smoke_Runbook.md.
export const SMOKE_CHECKLIST_JOB_KEYS = new Set([
  'permit-inspection-reminders',
  'new-home-warranty-deadlines',
  'mortgage-rate-ingest',
  'shared-data-consistency-audit',
]);

export const CATEGORY_LABELS: Record<JobCategory, string> = {
  PROPERTY_INTELLIGENCE: 'Property Intelligence',
  RECALLS: 'Recalls',
  NOTIFICATIONS: 'Notifications',
  MAINTENANCE: 'Maintenance',
  RISK_SAFETY: 'Risk & Safety',
  NEIGHBORHOOD: 'Neighborhood',
  HOME_CARE: 'Home Care',
  FINANCIAL_MARKET: 'Financial Market',
  HOME_INTELLIGENCE: 'Home Intelligence',
  DIY_TEMPLATES: 'DIY Templates',
};

export const CATEGORY_ORDER: JobCategory[] = [
  'PROPERTY_INTELLIGENCE',
  'RECALLS',
  'NOTIFICATIONS',
  'MAINTENANCE',
  'RISK_SAFETY',
  'NEIGHBORHOOD',
  'HOME_CARE',
  'FINANCIAL_MARKET',
  'HOME_INTELLIGENCE',
  'DIY_TEMPLATES',
];

export function fmtDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export function timeAgo(ts: number | null): string {
  if (!ts) return '—';
  const diffMs = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

export function fmtRefreshedAt(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Derive next-run label from a simple 5-part cron expression. */
export function getNextRunLabel(cronExpr: string): string | null {
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
export function getTriggerType(job: WorkerJobDetail): string {
  if (job.type === 'cron') return 'Cron';
  if (!job.cronExpression) return 'Event-driven';
  return 'Queue';
}

/** Derive health status from recent runs. */
export type HealthStatus = 'healthy' | 'warning' | 'failing' | 'idle';

export const HEALTH_ORDER: HealthStatus[] = ['failing', 'warning', 'healthy', 'idle'];

export const HEALTH_LABELS: Record<HealthStatus, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  failing: 'Failing',
  idle: 'Idle',
};

export function getHealth(runs: RecentRun[]): HealthStatus {
  if (runs.length === 0) return 'idle';
  const failed = runs.filter((r) => r.status === 'failed').length;
  if (failed === 0) return 'healthy';
  if (failed === runs.length) return 'failing';
  return 'warning';
}

export const HEALTH_DOT: Record<HealthStatus, string> = {
  healthy: 'bg-emerald-400',
  warning: 'bg-amber-400',
  failing: 'bg-rose-500',
  idle: 'bg-slate-300',
};

export const HEALTH_BORDER: Record<HealthStatus, string> = {
  healthy: 'border-l-emerald-400',
  warning: 'border-l-amber-400',
  failing: 'border-l-rose-500',
  idle: 'border-l-slate-200',
};

/** Filter-pill / badge background+text pairing for each health state. */
export const HEALTH_SOFT: Record<HealthStatus, string> = {
  healthy: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  failing: 'bg-rose-50 text-rose-600',
  idle: 'bg-slate-100 text-slate-500',
};

/** Mini "run strip" bar color per recent-run status. */
export const RUN_BAR_COLOR: Record<RecentRun['status'], string> = {
  completed: 'bg-emerald-400',
  failed: 'bg-rose-500',
  skipped: 'bg-amber-400',
  partial: 'bg-amber-400',
};

/**
 * Label + text color per recent-run status. 'skipped' (policy-gated tick, or
 * a lease held by another in-flight run) and 'partial' (some items in the
 * run failed, others succeeded) are distinct from 'failed' and must not
 * collapse into the same "Failed" text a reader would mistake for a full
 * run failure — only RUN_BAR_COLOR distinguished them before this.
 */
export const RUN_STATUS_STYLE: Record<RecentRun['status'], { label: string; textClass: string }> = {
  completed: { label: 'Success', textClass: 'text-emerald-700' },
  failed: { label: 'Failed', textClass: 'font-semibold text-rose-600' },
  partial: { label: 'Partial', textClass: 'text-amber-600' },
  skipped: { label: 'Skipped', textClass: 'text-amber-600' },
};
