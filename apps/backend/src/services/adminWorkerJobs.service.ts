// apps/backend/src/services/adminWorkerJobs.service.ts
//
// Admin Worker Jobs service — static job registry + live BullMQ queue stats.
// Phase 1: registry metadata, queue counts, last 3 BullMQ runs, manual trigger
// for recall jobs.

import { Queue } from 'bullmq';
import { connection } from './JobQueue.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export type JobCategory =
  | 'PROPERTY_INTELLIGENCE'
  | 'RECALLS'
  | 'NOTIFICATIONS'
  | 'MAINTENANCE'
  | 'RISK_SAFETY'
  | 'NEIGHBORHOOD'
  | 'HOME_CARE';

export interface JobRegistryEntry {
  key: string;
  name: string;
  description: string;
  category: JobCategory;
  schedule: string;
  cronExpression: string;
  /** bullmq = has a BullMQ queue; cron = node-cron only */
  type: 'bullmq' | 'cron';
  queueName?: string;
  jobName?: string;
  triggerSupported: boolean;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

export interface RecentRun {
  id: string;
  jobName: string;
  status: 'completed' | 'failed';
  finishedAt: number | null;
  durationMs: number | null;
  failReason?: string;
}

export interface WorkerJobDetail extends JobRegistryEntry {
  queueStats?: QueueStats;
  recentRuns: RecentRun[];
}

// ─── Static Job Registry ──────────────────────────────────────────────────────

export const JOB_REGISTRY: JobRegistryEntry[] = [
  // ── Property Intelligence (BullMQ, requires propertyId — no generic trigger) ──
  {
    key: 'property-intelligence',
    name: 'Property Intelligence',
    description:
      'Calculates risk report, financial efficiency score, and hidden asset matches per property. Enqueued automatically when a property is updated.',
    category: 'PROPERTY_INTELLIGENCE',
    schedule: 'On-demand (event-driven)',
    cronExpression: '',
    type: 'bullmq',
    queueName: 'property-intelligence-queue',
    triggerSupported: false,
  },

  // ── Recalls (BullMQ repeatable, trigger supported) ────────────────────────
  {
    key: 'recall-ingest',
    name: 'Recall Ingest',
    description:
      'Ingests the latest product safety recalls from the CPSC database and stores new recall records.',
    category: 'RECALLS',
    schedule: 'Daily at 3:00 AM EST',
    cronExpression: '0 3 * * *',
    type: 'bullmq',
    queueName: 'recall-jobs-queue',
    jobName: 'recall.ingest',
    triggerSupported: true,
  },
  {
    key: 'recall-match',
    name: 'Recall Match',
    description:
      'Matches newly ingested recalls against homeowner inventory and sends notifications for affected items.',
    category: 'RECALLS',
    schedule: 'Daily at 3:10 AM EST',
    cronExpression: '10 3 * * *',
    type: 'bullmq',
    queueName: 'recall-jobs-queue',
    jobName: 'recall.match',
    triggerSupported: true,
  },

  // ── Notifications (BullMQ, event-driven — no generic trigger) ─────────────
  {
    key: 'email-notification',
    name: 'Email Notification',
    description:
      'Sends queued email notifications (maintenance reminders, report alerts, etc.).',
    category: 'NOTIFICATIONS',
    schedule: 'On-demand (event-driven)',
    cronExpression: '',
    type: 'bullmq',
    queueName: 'email-notification-queue',
    triggerSupported: false,
  },
  {
    key: 'push-notification',
    name: 'Push Notification',
    description: 'Sends queued push notifications to mobile devices.',
    category: 'NOTIFICATIONS',
    schedule: 'On-demand (event-driven)',
    cronExpression: '',
    type: 'bullmq',
    queueName: 'push-notification-queue',
    triggerSupported: false,
  },
  {
    key: 'sms-notification',
    name: 'SMS Notification',
    description: 'Sends queued SMS messages for high-priority alerts.',
    category: 'NOTIFICATIONS',
    schedule: 'On-demand (event-driven)',
    cronExpression: '',
    type: 'bullmq',
    queueName: 'sms-notification-queue',
    triggerSupported: false,
  },
  {
    key: 'daily-email-digest',
    name: 'Daily Email Digest',
    description: 'Sends a daily summary email to homeowners with pending maintenance and alerts.',
    category: 'NOTIFICATIONS',
    schedule: 'Daily at 8:00 AM EST',
    cronExpression: '0 8 * * *',
    type: 'cron',
    triggerSupported: false,
  },

  // ── Maintenance (cron-only) ────────────────────────────────────────────────
  {
    key: 'maintenance-reminders',
    name: 'Maintenance Reminders',
    description: 'Sends maintenance reminder notifications to homeowners with upcoming or overdue tasks.',
    category: 'MAINTENANCE',
    schedule: 'Daily at 9:00 AM EST',
    cronExpression: '0 9 * * *',
    type: 'cron',
    triggerSupported: false,
  },
  {
    key: 'seasonal-checklist-generation',
    name: 'Seasonal Checklist Generation',
    description: 'Generates seasonal home maintenance checklists for all properties at the start of each season.',
    category: 'MAINTENANCE',
    schedule: 'Daily at 2:00 AM EST',
    cronExpression: '0 2 * * *',
    type: 'cron',
    triggerSupported: false,
  },
  {
    key: 'seasonal-checklist-expiration',
    name: 'Seasonal Checklist Expiration',
    description: 'Marks expired seasonal checklists as closed at the end of each season.',
    category: 'MAINTENANCE',
    schedule: 'Daily at 1:00 AM EST',
    cronExpression: '0 1 * * *',
    type: 'cron',
    triggerSupported: false,
  },
  {
    key: 'seasonal-notifications',
    name: 'Seasonal Notifications',
    description: 'Notifies homeowners of new seasonal checklists and upcoming seasonal tasks.',
    category: 'MAINTENANCE',
    schedule: 'Daily at 9:00 AM EST',
    cronExpression: '0 9 * * *',
    type: 'cron',
    triggerSupported: false,
  },
  {
    key: 'inventory-draft-cleanup',
    name: 'Inventory Draft Cleanup',
    description: 'Removes stale unfinished inventory drafts older than the configured retention window.',
    category: 'MAINTENANCE',
    schedule: 'Daily at 3:15 AM EST',
    cronExpression: '15 3 * * *',
    type: 'cron',
    triggerSupported: false,
  },

  // ── Risk & Safety (cron-only) ──────────────────────────────────────────────
  {
    key: 'coverage-lapse-incidents',
    name: 'Coverage Lapse Incidents',
    description: 'Detects properties with coverage gaps and creates incident records for follow-up.',
    category: 'RISK_SAFETY',
    schedule: 'Daily at 8:00 AM EST',
    cronExpression: '0 8 * * *',
    type: 'cron',
    triggerSupported: false,
  },
  {
    key: 'freeze-risk-incidents',
    name: 'Freeze Risk Incidents',
    description: 'Flags properties at elevated risk of pipe freeze based on temperature forecast and home profile.',
    category: 'RISK_SAFETY',
    schedule: 'Daily at 9:00 AM EST',
    cronExpression: '0 9 * * *',
    type: 'cron',
    triggerSupported: false,
  },
  {
    key: 'weekly-score-snapshots',
    name: 'Weekly Score Snapshots',
    description: 'Captures a weekly snapshot of property health and risk scores for trend tracking.',
    category: 'RISK_SAFETY',
    schedule: 'Mondays at 4:00 AM EST',
    cronExpression: '0 4 * * 1',
    type: 'cron',
    triggerSupported: false,
  },
  {
    key: 'hidden-asset-refresh',
    name: 'Hidden Asset Batch Refresh',
    description: 'Re-evaluates all properties for unrealized tax deductions, warranty coverage gaps, and untapped rebates.',
    category: 'RISK_SAFETY',
    schedule: 'Sundays at 3:00 AM EST',
    cronExpression: '0 3 * * 0',
    type: 'cron',
    triggerSupported: false,
  },

  // ── Neighborhood (cron-only) ──────────────────────────────────────────────
  {
    key: 'neighborhood-radar-refresh',
    name: 'Neighborhood Radar Refresh',
    description: 'Refreshes neighborhood event signals (permits, code violations, sales) and updates impact scores.',
    category: 'NEIGHBORHOOD',
    schedule: 'Sundays at 5:00 AM EST',
    cronExpression: '0 5 * * 0',
    type: 'cron',
    triggerSupported: false,
  },
  {
    key: 'neighborhood-change-notifications',
    name: 'Neighborhood Change Notifications',
    description: 'Alerts homeowners about significant neighborhood events that may impact their property value.',
    category: 'NEIGHBORHOOD',
    schedule: 'Daily at 6:00 AM EST',
    cronExpression: '0 6 * * *',
    type: 'cron',
    triggerSupported: false,
  },

  // ── Home Care (cron-only) ─────────────────────────────────────────────────
  {
    key: 'home-habit-generation',
    name: 'Home Habit Generation',
    description:
      'Generates personalized home care habits for all properties based on their profile, systems, and season. Deduplicates habits that are already active or snoozed.',
    category: 'HOME_CARE',
    schedule: 'Saturdays at 3:30 AM EST',
    cronExpression: '30 3 * * 6',
    type: 'cron',
    triggerSupported: false,
  },
];

// ─── Queue instances (lazy, keyed by name) ────────────────────────────────────

const queueCache = new Map<string, Queue>();

function getQueue(queueName: string): Queue {
  if (!queueCache.has(queueName)) {
    queueCache.set(queueName, new Queue(queueName, { connection }));
  }
  return queueCache.get(queueName)!;
}

// ─── Service functions ────────────────────────────────────────────────────────

async function getQueueStats(queueName: string): Promise<QueueStats> {
  const q = getQueue(queueName);
  const [waiting, active, completed, failed] = await Promise.all([
    q.getWaitingCount(),
    q.getActiveCount(),
    q.getCompletedCount(),
    q.getFailedCount(),
  ]);
  return { waiting, active, completed, failed };
}

async function getRecentRuns(queueName: string, limit = 3): Promise<RecentRun[]> {
  const q = getQueue(queueName);
  const [completed, failed] = await Promise.all([
    q.getCompleted(0, limit - 1),
    q.getFailed(0, limit - 1),
  ]);

  const runs: RecentRun[] = [
    ...completed.map((job) => ({
      id: job.id ?? '',
      jobName: job.name,
      status: 'completed' as const,
      finishedAt: job.finishedOn ?? null,
      durationMs:
        job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : null,
    })),
    ...failed.map((job) => ({
      id: job.id ?? '',
      jobName: job.name,
      status: 'failed' as const,
      finishedAt: job.finishedOn ?? null,
      durationMs:
        job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : null,
      failReason: job.failedReason ?? undefined,
    })),
  ];

  return runs
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
    .slice(0, limit);
}

export async function listWorkerJobs(): Promise<WorkerJobDetail[]> {
  return Promise.all(
    JOB_REGISTRY.map(async (job) => {
      if (job.type !== 'bullmq' || !job.queueName) {
        return { ...job, recentRuns: [] };
      }
      try {
        const [queueStats, recentRuns] = await Promise.all([
          getQueueStats(job.queueName),
          getRecentRuns(job.queueName),
        ]);
        return { ...job, queueStats, recentRuns };
      } catch {
        return { ...job, recentRuns: [] };
      }
    }),
  );
}

export async function triggerJob(jobKey: string): Promise<{ queued: boolean; jobId?: string }> {
  const entry = JOB_REGISTRY.find((j) => j.key === jobKey);
  if (!entry) throw new Error(`Unknown job key: ${jobKey}`);
  if (!entry.triggerSupported) throw new Error(`Manual trigger not supported for job: ${jobKey}`);
  if (!entry.queueName || !entry.jobName) throw new Error(`Missing queue config for job: ${jobKey}`);

  const q = getQueue(entry.queueName);
  const job = await q.add(
    entry.jobName,
    {},
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  );
  return { queued: true, jobId: job.id };
}
