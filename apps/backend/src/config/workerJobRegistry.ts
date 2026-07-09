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
  | 'HOME_INTELLIGENCE'
  | 'DIY_TEMPLATES';

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
    queueName: 'cron-trigger-queue',
    jobName: 'maintenance-reminders',
    triggerSupported: true,
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
    queueName: 'cron-trigger-queue',
    jobName: 'seasonal-checklist-generation',
    triggerSupported: true,
  },
  {
    key: 'seasonal-checklist-expiration',
    name: 'Seasonal Checklist Expiration',
    description: 'Marks expired seasonal checklists as closed at the end of each season.',
    category: 'MAINTENANCE',
    schedule: 'Daily at 1:00 AM EST',
    cronExpression: '0 1 * * *',
    type: 'cron',
    queueName: 'cron-trigger-queue',
    jobName: 'seasonal-checklist-expiration',
    triggerSupported: true,
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
    queueName: 'cron-trigger-queue',
    jobName: 'seasonal-notifications',
    triggerSupported: true,
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
    queueName: 'cron-trigger-queue',
    jobName: 'inventory-draft-cleanup',
    triggerSupported: true,
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
    key: 'severe-weather-alerts',
    name: 'Severe Weather Alerts',
    description:
      'Polls live NOAA/NWS alerts (flash flood, severe thunderstorm, tornado, high wind, excessive heat, winter storm) per property and creates incidents for active warnings.',
    category: 'RISK_SAFETY',
    schedule: 'Every 15 minutes',
    cronExpression: '*/15 * * * *',
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
  {
    key: 'provider-credential-expire',
    name: 'Provider Credential Expire',
    description:
      'Transitions approved provider credentials past their expiry date to EXPIRED and recomputes affected providers\' category eligibility.',
    category: 'RISK_SAFETY',
    schedule: 'Daily at 6:00 AM EST',
    cronExpression: '0 6 * * *',
    type: 'cron',
    triggerSupported: false,
  },
  {
    key: 'provider-credential-lapse',
    name: 'Provider Credential Lapse',
    description:
      'Detects provider credentials expiring within 30 days. Creates a homeowner-visible incident when an already-scheduled booking is at risk, otherwise a provider/admin compliance alert.',
    category: 'RISK_SAFETY',
    schedule: 'Daily at 7:00 AM EST',
    cronExpression: '0 7 * * *',
    type: 'cron',
    triggerSupported: false,
  },
  {
    key: 'provider-missing-credential-sweep',
    name: 'Provider Missing Credential Sweep',
    description:
      'Flags providers who list a service category but never submitted its required credential type.',
    category: 'RISK_SAFETY',
    schedule: 'Sundays at 6:00 AM EST',
    cronExpression: '0 6 * * 0',
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
  {
    key: 'reserve-fund-recalculation',
    name: 'Reserve Fund Recalculation',
    description:
      'Safety-net sweep for the Home Reserve / Sinking Fund Planner. The primary trigger is ' +
      'event-driven (fired when a property\'s Capital Timeline is regenerated); this sweep catches ' +
      'any funds that missed that trigger and recomputes any fund not touched in 35+ days. ' +
      'Override schedule via RESERVE_FUND_SWEEP_CRON env var.',
    category: 'FINANCIAL_MARKET',
    schedule: 'Monthly, 1st at 4:00 AM',
    cronExpression: '0 4 1 * *',
    type: 'cron',
    triggerSupported: false,
  },
  {
    key: 'reserve-fund-reconciliation',
    name: 'Reserve Fund Reconciliation',
    description:
      'Computes fuzzy expense-match suggestions for open Reserve Fund line items and notifies the ' +
      'homeowner when any exist. Suggestions are computed live (not persisted), so this runs weekly ' +
      'rather than daily to avoid re-notifying for the same still-open suggestion too often. ' +
      'Override schedule via RESERVE_FUND_RECONCILIATION_CRON env var.',
    category: 'FINANCIAL_MARKET',
    schedule: 'Sundays at 5:00 AM EST',
    cronExpression: '0 5 * * 0',
    type: 'cron',
    triggerSupported: false,
  },
  {
    key: 'reserve-fund-balance-reminder',
    name: 'Reserve Fund Balance Reminder',
    description:
      'Nudges homeowners whose Reserve Fund balance has gone 45+ days without a logged deposit or ' +
      'withdrawal — balances are entirely self-reported (no bank-linking integration exists), so a ' +
      'stale fund silently drifts from reality otherwise.',
    category: 'FINANCIAL_MARKET',
    schedule: 'Monthly, 1st at 9:00 AM EST',
    cronExpression: '0 9 1 * *',
    type: 'cron',
    triggerSupported: false,
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
  {
    key: 'shared-data-backfill',
    name: 'Shared Data Backfill',
    description:
      'Backfills shared CtC data primitives (PreferenceProfile, AssumptionSet, and Signal) for existing properties. Idempotent and safe to rerun.',
    category: 'HOME_INTELLIGENCE',
    schedule: 'Daily at 2:20 AM EST',
    cronExpression: '20 2 * * *',
    type: 'cron',
    queueName: 'cron-trigger-queue',
    jobName: 'shared-data-backfill',
    triggerSupported: true,
  },
  {
    key: 'shared-data-consistency-audit',
    name: 'Shared Data Consistency Audit',
    description:
      'Builds shared-data consistency and readiness diagnostics across properties for operational visibility.',
    category: 'HOME_INTELLIGENCE',
    schedule: 'Daily at 2:40 AM EST',
    cronExpression: '40 2 * * *',
    type: 'cron',
    queueName: 'cron-trigger-queue',
    jobName: 'shared-data-consistency-audit',
    triggerSupported: true,
  },
  {
    key: 'shared-signal-refresh',
    name: 'Shared Signal Refresh',
    description:
      'Recomputes core shared signals for existing properties with confidence and decay updates. Idempotent and safe to rerun.',
    category: 'HOME_INTELLIGENCE',
    schedule: 'Daily at 2:55 AM EST',
    cronExpression: '55 2 * * *',
    type: 'cron',
    queueName: 'cron-trigger-queue',
    jobName: 'shared-signal-refresh',
    triggerSupported: true,
  },
  {
    key: 'shared-signal-health-audit',
    name: 'Shared Signal Health Audit',
    description:
      'Builds operational signal-health diagnostics (stale, low-confidence, and interaction signal coverage).',
    category: 'HOME_INTELLIGENCE',
    schedule: 'Daily at 3:10 AM EST',
    cronExpression: '10 3 * * *',
    type: 'cron',
    queueName: 'cron-trigger-queue',
    jobName: 'shared-signal-health-audit',
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

  // ── Permit Tracker (cron + BullMQ) ────────────────────────────────────────
  {
    key: 'permit-inspection-reminders',
    name: 'Permit Inspection Reminders',
    description:
      'Sends in-app notifications to homeowners for inspection milestones scheduled within the next 3 days that have not yet been notified.',
    category: 'MAINTENANCE',
    schedule: 'Daily at 8:00 AM EST',
    cronExpression: '0 8 * * *',
    type: 'cron',
    queueName: 'cron-trigger-queue',
    jobName: 'permit-inspection-reminders',
    triggerSupported: true,
  },
  {
    key: 'permit-fetch',
    name: 'Permit History Fetch',
    description:
      'Fetches municipal permit history for a property from the configured permit-records provider.',
    category: 'MAINTENANCE',
    schedule: 'On-demand (event-driven)',
    cronExpression: '',
    type: 'bullmq',
    queueName: 'permit-fetch-queue',
    jobName: 'fetch-permit-history',
    triggerSupported: false,
  },
  {
    key: 'detect-unpermitted-work',
    name: 'Detect Unpermitted Work',
    description:
      'Cross-references a property\'s inventory/renovation records against its fetched permit history to flag work that appears to lack a matching permit.',
    category: 'MAINTENANCE',
    schedule: 'On-demand (event-driven)',
    cronExpression: '',
    type: 'bullmq',
    queueName: 'detect-unpermitted-work-queue',
    jobName: 'detect-unpermitted-work',
    triggerSupported: false,
  },
  {
    key: 'generate-permit-disclosure',
    name: 'Generate Permit Disclosure',
    description:
      'Generates a seller-facing permit disclosure export/report for a property.',
    category: 'MAINTENANCE',
    schedule: 'On-demand (event-driven)',
    cronExpression: '',
    type: 'bullmq',
    queueName: 'generate-permit-disclosure-queue',
    jobName: 'generate-permit-disclosure',
    triggerSupported: false,
  },

  // ── DIY Templates (BullMQ, event-driven) ──────────────────────────────────
  {
    key: 'generate-diy-ai-guide',
    name: 'DIY AI Guide Generation',
    description:
      'Generates an AI-authored DIY project guide (materials, steps, safety notes) via Gemini for a homeowner-requested guide.',
    category: 'DIY_TEMPLATES',
    schedule: 'On-demand (event-driven)',
    cronExpression: '',
    type: 'bullmq',
    queueName: 'diy-ai-guide-queue',
    jobName: 'GENERATE_DIY_AI_GUIDE',
    triggerSupported: false,
  },
];
