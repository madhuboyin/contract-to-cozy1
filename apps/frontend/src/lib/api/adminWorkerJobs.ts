// apps/frontend/src/lib/api/adminWorkerJobs.ts
//
// API client for the Admin Worker Jobs dashboard.

import { api } from '@/lib/api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type JobCategory =
  | 'PROPERTY_INTELLIGENCE'
  | 'RECALLS'
  | 'NOTIFICATIONS'
  | 'MAINTENANCE'
  | 'RISK_SAFETY'
  | 'NEIGHBORHOOD'
  | 'HOME_CARE'
  | 'FINANCIAL_MARKET'
  | 'HOME_INTELLIGENCE'
  | 'DIY_TEMPLATES';

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

export interface RecentRun {
  id: string;
  jobName: string;
  status: 'completed' | 'failed' | 'skipped' | 'partial';
  finishedAt: number | null;
  durationMs: number | null;
  failReason?: string;
}

export interface WorkerJobDetail {
  key: string;
  name: string;
  description: string;
  category: JobCategory;
  schedule: string;
  cronExpression: string;
  type: 'bullmq' | 'cron';
  queueName?: string;
  jobName?: string;
  triggerSupported: boolean;
  queueStats?: QueueStats;
  recentRuns: RecentRun[];
  /** Whether the worker execution policy currently allows this job to run on its normal trigger. */
  effectiveEnabled: boolean;
  /** Why effectiveEnabled is false — omitted when true. */
  disabledReason?: string;
}

export interface WorkerGovernanceStatus {
  enforceHumanPolicyApprovals: boolean;
  flags: Array<{ key: string; value: boolean; rawValue: string | undefined; malformed: boolean }>;
  runners: Array<{ key: string; name: string; effectiveEnabled: boolean; disabledReason?: string }>;
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function fetchWorkerJobs(): Promise<WorkerJobDetail[]> {
  const res = await api.get<WorkerJobDetail[]>('/api/admin/worker-jobs');
  return res.data;
}

export async function fetchWorkerGovernance(): Promise<WorkerGovernanceStatus> {
  const res = await api.get<WorkerGovernanceStatus>('/api/admin/worker-jobs/governance');
  return res.data;
}

export async function triggerWorkerJob(jobKey: string): Promise<{ queued: boolean; jobId?: string }> {
  const res = await api.post<{ queued: boolean; jobId?: string }>(
    `/api/admin/worker-jobs/${jobKey}/trigger`,
    {},
  );
  return res.data;
}
