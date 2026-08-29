// apps/backend/src/config/workerExecutionPolicy.ts
//
// Single execution-policy decision point for all background worker jobs and
// runners, shared by the scheduler, the manual cron-trigger queue, and
// long-running pollers (apps/workers/src/worker.ts and src/runners/*).
//
// Why this exists: in the only available environment (no dev/staging), every
// registry cron job with a schedule starts automatically the moment a build
// deploys — there was no master switch, no grouped outbound/external/mutating
// policy, and no per-job override. See docs/product/
// ContractToCozy_Worker_Module_Audit_and_Implementation_Plan.md (WKR-004).
//
// Beta defaults below intentionally gate off external-provider calls and
// mutating sweeps until explicitly reviewed — flip the corresponding
// WORKER_*_ENABLED flag to "true" (exact lowercase string) once a job group
// has been checked out for this environment.

export type WorkerImpact = 'READ_ONLY' | 'INTERNAL_WRITE' | 'HOMEOWNER_STATE' | 'OUTBOUND' | 'DESTRUCTIVE';
export type CustomerJob = 'STAY_AHEAD' | 'DECIDE' | 'MAJOR_MOMENT' | 'PLATFORM_OPERATIONS';
export type WorkerTriggerType = 'scheduled' | 'manual' | 'poller';

export interface WorkerExecutionPolicy {
  impact: WorkerImpact;
  customerJob: CustomerJob;
  defaultEnabledInBeta: boolean;
  /** Defaults to true. Set false when manual execution is approved but cron activation is not. */
  defaultScheduledEnabled?: boolean;
  supportsDryRun: boolean;
  supportsPropertyScope: boolean;
  externalProvider?: string;
  humanApprovalClass?: 'NONE' | 'HIGH_IMPACT_MANUAL';
  /** Broad, scheduled, all/many-property mutation, cleanup, or backfill sweep. */
  broadSweep?: boolean;
}

export const WORKER_FLAG_KEYS = {
  automationEnabled: 'WORKER_AUTOMATION_ENABLED',
  outboundNotificationsEnabled: 'WORKER_OUTBOUND_NOTIFICATIONS_ENABLED',
  externalIngestEnabled: 'WORKER_EXTERNAL_INGEST_ENABLED',
  mutatingSweepsEnabled: 'WORKER_MUTATING_SWEEPS_ENABLED',
  manualTriggersEnabled: 'WORKER_MANUAL_TRIGGERS_ENABLED',
  enforceManualTriggerApprovals: 'ENFORCE_WORKER_MANUAL_TRIGGER_APPROVALS',
} as const;

// Beta defaults — Section 7.1 of the worker audit.
const FLAG_DEFAULTS: Record<string, boolean> = {
  [WORKER_FLAG_KEYS.automationEnabled]: true,
  [WORKER_FLAG_KEYS.outboundNotificationsEnabled]: false,
  [WORKER_FLAG_KEYS.externalIngestEnabled]: false,
  [WORKER_FLAG_KEYS.mutatingSweepsEnabled]: false,
  [WORKER_FLAG_KEYS.manualTriggersEnabled]: true,
  [WORKER_FLAG_KEYS.enforceManualTriggerApprovals]: false,
};

export interface FlagDiagnostic {
  key: string;
  rawValue: string | undefined;
  resolved: boolean;
  malformed: boolean;
}

/**
 * Fail-safe boolean flag read: only the exact strings "true"/"false" are
 * honored. Anything else (missing, "1", "yes", mis-cased, ...) falls back to
 * the flag's beta default instead of silently enabling a hazardous
 * capability, and is reported as malformed for startup diagnostics.
 */
export function readWorkerFlag(key: string, env: NodeJS.ProcessEnv = process.env): FlagDiagnostic {
  const raw = env[key];
  if (raw === 'true') return { key, rawValue: raw, resolved: true, malformed: false };
  if (raw === 'false') return { key, rawValue: raw, resolved: false, malformed: false };
  return { key, rawValue: raw, resolved: FLAG_DEFAULTS[key] ?? false, malformed: raw !== undefined };
}

function flag(key: string, env?: NodeJS.ProcessEnv): boolean {
  return readWorkerFlag(key, env).resolved;
}

export function isWorkerAutomationEnabled(env?: NodeJS.ProcessEnv): boolean {
  return flag(WORKER_FLAG_KEYS.automationEnabled, env);
}
export function areWorkerOutboundNotificationsEnabled(env?: NodeJS.ProcessEnv): boolean {
  return flag(WORKER_FLAG_KEYS.outboundNotificationsEnabled, env);
}
export function isWorkerExternalIngestEnabled(env?: NodeJS.ProcessEnv): boolean {
  return flag(WORKER_FLAG_KEYS.externalIngestEnabled, env);
}
export function areWorkerMutatingSweepsEnabled(env?: NodeJS.ProcessEnv): boolean {
  return flag(WORKER_FLAG_KEYS.mutatingSweepsEnabled, env);
}
export function areWorkerManualTriggersEnabled(env?: NodeJS.ProcessEnv): boolean {
  return flag(WORKER_FLAG_KEYS.manualTriggersEnabled, env);
}
export function areWorkerManualTriggerApprovalsEnforced(env?: NodeJS.ProcessEnv): boolean {
  return flag(WORKER_FLAG_KEYS.enforceManualTriggerApprovals, env);
}

/**
 * Per-job override key: WORKER_JOB_<NORMALIZED_KEY>_ENABLED. Takes
 * precedence over every group default. Only the exact lowercase strings
 * "true"/"false" are honored.
 */
export function normalizeJobEnvKey(jobKey: string): string {
  return `WORKER_JOB_${jobKey.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_ENABLED`;
}

const LEGACY_JOB_ENV_BASES: Readonly<Record<string, readonly string[]>> = {
  'home-briefing-delivery': ['WORKER_JOB_HOME_GAZETTE_GENERATION'],
};

export function legacyJobEnvKeys(jobKey: string, suffix: string): string[] {
  return (LEGACY_JOB_ENV_BASES[jobKey] ?? []).map((base) => `${base}_${suffix}`);
}

export interface JobOverride {
  value: boolean | undefined;
  malformed: boolean;
  envKey: string;
}

export function getJobOverride(jobKey: string, env: NodeJS.ProcessEnv = process.env): JobOverride {
  const envKey = normalizeJobEnvKey(jobKey);
  const candidates = [envKey, ...legacyJobEnvKeys(jobKey, 'ENABLED')];
  for (const candidate of candidates) {
    const raw = env[candidate];
    if (raw === 'true') return { value: true, malformed: false, envKey: candidate };
    if (raw === 'false') return { value: false, malformed: false, envKey: candidate };
    if (raw !== undefined) return { value: undefined, malformed: true, envKey: candidate };
  }
  return { value: undefined, malformed: false, envKey };
}

export interface WorkerExecutionDecision {
  allowed: boolean;
  reason: string;
}

/**
 * A reviewed property-scoped dry run validates a launch-closed job without
 * activating its scheduled or real manual execution paths.
 */
export function evaluateScopedDryRunExecution(
  jobKey: string,
  policy: WorkerExecutionPolicy,
  hasPropertyScope: boolean,
  env: NodeJS.ProcessEnv = process.env,
): WorkerExecutionDecision {
  if (!policy.supportsDryRun) {
    return { allowed: false, reason: `dry-run not supported for ${jobKey}` };
  }
  if (!policy.supportsPropertyScope || !hasPropertyScope) {
    return {
      allowed: false,
      reason: `property-scoped dry-run required for ${jobKey}`,
    };
  }
  if (!areWorkerManualTriggersEnabled(env)) {
    return {
      allowed: false,
      reason: `${WORKER_FLAG_KEYS.manualTriggersEnabled}=false`,
    };
  }
  if (
    policy.humanApprovalClass === 'HIGH_IMPACT_MANUAL'
    && areWorkerManualTriggerApprovalsEnforced(env)
  ) {
    return {
      allowed: false,
      reason: 'ENFORCE_WORKER_MANUAL_TRIGGER_APPROVALS=true and no approval workflow is wired for this high-impact job',
    };
  }
  return {
    allowed: true,
    reason: 'reviewed property-scoped dry-run bypasses activation gates',
  };
}

/**
 * Single scheduler/manual/poller decision function (WKR-004).
 *
 * Precedence:
 *   1. Per-job override (WORKER_JOB_<KEY>_ENABLED) wins outright, including
 *      over the manual-trigger-approval gate below.
 *   2. High-impact manual triggers are blocked while
 *      ENFORCE_WORKER_MANUAL_TRIGGER_APPROVALS=true, because no human
 *      approval workflow exists yet to satisfy the gate (see W7).
 *   3. Manual triggers require WORKER_MANUAL_TRIGGERS_ENABLED; scheduled/
 *      poller execution requires WORKER_AUTOMATION_ENABLED.
 *   4. The job's own defaultEnabledInBeta.
 *   5. Group hazard flags matching the job's shape:
 *        externalProvider set        -> WORKER_EXTERNAL_INGEST_ENABLED
 *        broadSweep or DESTRUCTIVE   -> WORKER_MUTATING_SWEEPS_ENABLED
 *        impact OUTBOUND             -> WORKER_OUTBOUND_NOTIFICATIONS_ENABLED
 *
 * Note: impact OUTBOUND is reserved for jobs whose entire effect *is*
 * sending (digests, email/push/sms delivery workers). Jobs that create
 * canonical homeowner state and *also* notify (e.g. maintenance reminders,
 * seasonal notifications) are HOMEOWNER_STATE — they keep running under
 * WORKER_AUTOMATION_ENABLED and instead thread
 * areWorkerOutboundNotificationsEnabled() into NotificationService.create's
 * `transportEnabled` so in-app creation and lifecycle/dedup logic still run
 * while only the outbound send is suppressed.
 */
export function evaluateWorkerExecution(
  jobKey: string,
  triggerType: WorkerTriggerType,
  policy: WorkerExecutionPolicy,
  env: NodeJS.ProcessEnv = process.env,
): WorkerExecutionDecision {
  const override = getJobOverride(jobKey, env);
  if (override.value !== undefined) {
    return { allowed: override.value, reason: `per-job override ${override.envKey}=${override.value}` };
  }

  if (
    triggerType === 'manual' &&
    policy.humanApprovalClass === 'HIGH_IMPACT_MANUAL' &&
    areWorkerManualTriggerApprovalsEnforced(env)
  ) {
    return {
      allowed: false,
      reason: 'ENFORCE_WORKER_MANUAL_TRIGGER_APPROVALS=true and no approval workflow is wired for this high-impact job',
    };
  }

  if (triggerType === 'manual') {
    if (!areWorkerManualTriggersEnabled(env)) {
      return { allowed: false, reason: `${WORKER_FLAG_KEYS.manualTriggersEnabled}=false` };
    }
  } else if (!isWorkerAutomationEnabled(env)) {
    return { allowed: false, reason: `${WORKER_FLAG_KEYS.automationEnabled}=false` };
  }

  if (!policy.defaultEnabledInBeta) {
    return { allowed: false, reason: 'defaultEnabledInBeta=false' };
  }

  if (triggerType !== 'manual' && policy.defaultScheduledEnabled === false) {
    return { allowed: false, reason: 'defaultScheduledEnabled=false' };
  }

  if (policy.externalProvider && !isWorkerExternalIngestEnabled(env)) {
    return {
      allowed: false,
      reason: `${WORKER_FLAG_KEYS.externalIngestEnabled}=false (external provider: ${policy.externalProvider})`,
    };
  }

  if ((policy.broadSweep || policy.impact === 'DESTRUCTIVE') && !areWorkerMutatingSweepsEnabled(env)) {
    return { allowed: false, reason: `${WORKER_FLAG_KEYS.mutatingSweepsEnabled}=false` };
  }

  if (policy.impact === 'OUTBOUND' && !areWorkerOutboundNotificationsEnabled(env)) {
    return {
      allowed: false,
      reason: `${WORKER_FLAG_KEYS.outboundNotificationsEnabled}=false`,
    };
  }

  return { allowed: true, reason: 'policy allows execution' };
}

export function collectWorkerFlagDiagnostics(env: NodeJS.ProcessEnv = process.env): FlagDiagnostic[] {
  return Object.values(WORKER_FLAG_KEYS).map((key) => readWorkerFlag(key, env));
}
