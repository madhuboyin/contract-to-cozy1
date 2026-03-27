// apps/backend/src/config/workerJobRegistry.ts
//
// Single source of truth for all background worker jobs.
//
// IMPORTANT — when adding a new job to apps/workers/src/worker.ts:
//   1. Add an entry to JOB_REGISTRY below (this file)
//   2. Add the handler to CRON_HANDLERS in apps/workers/src/worker.ts
//   3. If it's a new category, add it to the JobCategory union type here
//      AND to CATEGORY_ORDER in apps/frontend/.../worker-jobs/page.tsx
//
// The worker reads cron expressions from this registry at startup.
// A handler with no registry entry will log a warning at startup.
// A registry entry with no handler will also log a warning and not run.

export type JobCategory =
  | 'PROPERTY_INTELLIGENCE'
  | 'RECALLS'
  | 'NOTIFICATIONS'
  | 'MAINTENANCE'
  | 'RISK_SAFETY'
  | 'NEIGHBORHOOD'
  | 'HOME_CARE'
  | 'FINANCIAL_MARKET'
  | 'HOME_INTELLIGENCE';

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

export const JOB_REGISTRY: JobRegistryEntry[] = [
  // ── Property Intelligence (BullMQ, event-driven) ──────────────────────────
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

  // ── Recalls (BullMQ repeatable) ───────────────────────────────────────────
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

  // ── Notifications (BullMQ, event-driven) ──────────────────────────────────
  {
    key: 'email-notification',
    name: 'Email Notification',
    description: 'Sends queued email notifications (maintenance reminders, report alerts, etc.).',
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

  // ── Maintenance (cron) ────────────────────────────────────────────────────
  {
    key: 'maintenance-reminders',
    name: 'Maintenance Reminders',
    description:
      'Sends maintenance reminder notifications to homeowners with upcoming or overdue tasks.',
    category: 'MAINTENANCE',
    schedule: 'Daily at 9:00 AM EST',
    cronExpression: '0 9 * * *',
    type: 'cron',
    triggerSupported: false,
  },
  {
    key: 'seasonal-checklist-generation',
    name: 'Seasonal Checklist Generation',
    description:
      'Generates seasonal home maintenance checklists for all properties at the start of each season.',
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
    description:
      'Notifies homeowners of new seasonal checklists and upcoming seasonal tasks.',
    category: 'MAINTENANCE',
    schedule: 'Daily at 9:00 AM EST',
    cronExpression: '0 9 * * *',
    type: 'cron',
    triggerSupported: false,
  },
  {
    key: 'inventory-draft-cleanup',
    name: 'Inventory Draft Cleanup',
    description:
      'Removes stale unfinished inventory drafts older than the configured retention window. Schedule overridable via INVENTORY_DRAFT_CLEANUP_CRON env var.',
    category: 'MAINTENANCE',
    schedule: 'Daily at 3:15 AM EST',
    cronExpression: '15 3 * * *',
    type: 'cron',
    triggerSupported: false,
  },

  // ── Risk & Safety (cron) ──────────────────────────────────────────────────
  {
    key: 'coverage-lapse-incidents',
    name: 'Coverage Lapse Incidents',
    description:
      'Detects properties with coverage gaps and creates incident records for follow-up.',
    category: 'RISK_SAFETY',
    schedule: 'Daily at 8:00 AM EST',
    cronExpression: '0 8 * * *',
    type: 'cron',
    triggerSupported: false,
  },
  {
    key: 'freeze-risk-incidents',
    name: 'Freeze Risk Incidents',
    description:
      'Flags properties at elevated risk of pipe freeze based on temperature forecast and home profile.',
    category: 'RISK_SAFETY',
    schedule: 'Daily at 9:00 AM EST',
    cronExpression: '0 9 * * *',
    type: 'cron',
    triggerSupported: false,
  },
  {
    key: 'weekly-score-snapshots',
    name: 'Weekly Score Snapshots',
    description:
      'Captures a weekly snapshot of property health and risk scores for trend tracking.',
    category: 'RISK_SAFETY',
    schedule: 'Mondays at 4:00 AM EST',
    cronExpression: '0 4 * * 1',
    type: 'cron',
    triggerSupported: false,
  },
  {
    key: 'hidden-asset-refresh',
    name: 'Hidden Asset Batch Refresh',
    description:
      'Re-evaluates all properties for unrealized tax deductions, warranty coverage gaps, and untapped rebates.',
    category: 'RISK_SAFETY',
    schedule: 'Sundays at 3:00 AM EST',
    cronExpression: '0 3 * * 0',
    type: 'cron',
    triggerSupported: false,
  },

  // ── Neighborhood (cron) ───────────────────────────────────────────────────
  {
    key: 'neighborhood-radar-refresh',
    name: 'Neighborhood Radar Refresh',
    description:
      'Refreshes neighborhood event signals (permits, code violations, sales) and updates impact scores.',
    category: 'NEIGHBORHOOD',
    schedule: 'Sundays at 5:00 AM EST',
    cronExpression: '0 5 * * 0',
    type: 'cron',
    triggerSupported: false,
  },
  {
    key: 'neighborhood-change-notifications',
    name: 'Neighborhood Change Notifications',
    description:
      'Alerts homeowners about significant neighborhood events that may impact their property value.',
    category: 'NEIGHBORHOOD',
    schedule: 'Daily at 6:00 AM EST',
    cronExpression: '0 6 * * *',
    type: 'cron',
    triggerSupported: false,
  },

  // ── Financial Market (cron) ───────────────────────────────────────────────
  {
    key: 'mortgage-rate-ingest',
    name: 'Mortgage Rate Ingest',
    description:
      'Fetches the weekly Freddie Mac PMMS 30-year and 15-year fixed mortgage rates from the ' +
      'St. Louis Fed FRED API and stores them as MortgageRateSnapshot records. ' +
      'Requires FRED_API_KEY env var; falls back to MORTGAGE_RATE_30YR_FALLBACK / ' +
      'MORTGAGE_RATE_15YR_FALLBACK if set. Safe to re-run — deduplicates on (source, date).',
    category: 'FINANCIAL_MARKET',
    schedule: 'Thursdays at 5:00 PM EST (after PMMS release)',
    cronExpression: '0 17 * * 4',
    type: 'cron',
    queueName: 'cron-trigger-queue',
    jobName: 'mortgage-rate-ingest',
    triggerSupported: true,
  },

  // ── Home Intelligence (cron) ──────────────────────────────────────────────
  {
    key: 'home-gazette-generation',
    name: 'Home Gazette Generation',
    description:
      'Generates the weekly Home Gazette edition for every active property. ' +
      'Collects signals, ranks candidates, assembles edition, runs AI editorial enrichment, ' +
      'and publishes or skips each edition based on available signals. Idempotent — safe to re-run. ' +
      'Override schedule via HOME_GAZETTE_GENERATION_CRON env var.',
    category: 'HOME_INTELLIGENCE',
    schedule: 'Mondays at 6:00 AM EST',
    cronExpression: '0 6 * * 1',
    type: 'cron',
    queueName: 'cron-trigger-queue',
    jobName: 'home-gazette-generation',
    triggerSupported: true,
  },

  // ── Guidance Engine (cron) ────────────────────────────────────────────────
  {
    key: 'expire-guidance-signals',
    name: 'Expire Guidance Signals',
    description:
      'Archives ACTIVE GuidanceSignal records whose expiresAt timestamp has passed (e.g. freeze-risk signals after the 36-hour weather window).',
    category: 'RISK_SAFETY',
    schedule: 'Daily at 1:30 AM EST',
    cronExpression: '30 1 * * *',
    type: 'cron',
    triggerSupported: false,
  },

  // ── Home Care (cron) ──────────────────────────────────────────────────────
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
