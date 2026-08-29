// apps/backend/src/config/agentRuntimeControls.ts
//
// Env-configurable operational controls for the Phase 2 agent runtime
// (C2C_INTELLIGENCE_AGENTIC_EVOLUTION_IMPLEMENTATION_PLAN.md §7.2, IPD-003).
// Retention is an ops policy, not agent behavior — it deliberately does NOT
// live on the immutable AgentDefinition. Two retention clocks, mirroring the
// Ask minimization conventions (askOperationalControls.ts / askRetention).

function booleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(value.trim().toLowerCase());
}

function clampedIntegerEnv(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export interface AgentRuntimeControls {
  /** AgentRun is metadata-only, so it keeps a longer clock than the invocation tables. */
  runRetentionDays: number;
  /** Applied to both ToolInvocation and LLMInvocation — the closest thing to raw content. */
  invocationRetentionDays: number;
  /** Extra days after an AgentState's own pauseExpiresAt before the row is purged. */
  stateGraceDays: number;
  /** Days a stale/unresolved AgentRunReservation lingers before the sweep removes it. */
  reservationRetentionDays: number;
  /** How long an invocation may hold its reservation lease before another attempt may take over. */
  reservationLeaseMs: number;
  purgeBatchSize: number;
}

export const AGENT_RUNTIME_RETENTION_BOUNDS = Object.freeze({
  runRetentionDays: { min: 30, max: 365, default: 90 },
  invocationRetentionDays: { min: 7, max: 180, default: 30 },
  stateGraceDays: { min: 1, max: 30, default: 7 },
  reservationRetentionDays: { min: 1, max: 30, default: 7 },
});

export function readAgentRuntimeControls(env: NodeJS.ProcessEnv = process.env): AgentRuntimeControls {
  const b = AGENT_RUNTIME_RETENTION_BOUNDS;
  return {
    runRetentionDays: clampedIntegerEnv(env.AGENT_RUN_RETENTION_DAYS, b.runRetentionDays.default, b.runRetentionDays.min, b.runRetentionDays.max),
    invocationRetentionDays: clampedIntegerEnv(env.AGENT_INVOCATION_RETENTION_DAYS, b.invocationRetentionDays.default, b.invocationRetentionDays.min, b.invocationRetentionDays.max),
    stateGraceDays: clampedIntegerEnv(env.AGENT_STATE_GRACE_DAYS, b.stateGraceDays.default, b.stateGraceDays.min, b.stateGraceDays.max),
    reservationRetentionDays: clampedIntegerEnv(env.AGENT_RESERVATION_RETENTION_DAYS, b.reservationRetentionDays.default, b.reservationRetentionDays.min, b.reservationRetentionDays.max),
    reservationLeaseMs: clampedIntegerEnv(env.AGENT_RESERVATION_LEASE_MS, 120_000, 10_000, 600_000),
    purgeBatchSize: clampedIntegerEnv(env.AGENT_RUNTIME_PURGE_BATCH_SIZE, 500, 100, 2_000),
  };
}

export const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}
