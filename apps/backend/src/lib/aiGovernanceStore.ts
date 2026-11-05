/**
 * Shared state for governed AI requests (Findings Implementation Plan, Phase 5A/5B).
 *
 * Rate windows and circuit state used to live in each process's memory, so N backend and worker processes allowed roughly N times the
 * intended throughput and opened and closed their circuits independently. This module is the storage port for that state:
 *
 *   - `AIGovernanceStore` is the narrow interface the policy code uses. Policy (limits, thresholds, error mapping) stays in
 *     aiRequestGovernance.service.ts and is testable without Redis.
 *   - `InMemoryAIGovernanceStore` implements it for one process. It is the test double AND the local fallback while Redis is unavailable.
 *   - `RedisAIGovernanceStore` implements it across processes with atomic Lua scripts, so a transition happens exactly once and a probe has
 *     exactly one winner.
 *   - `ResilientAIGovernanceStore` applies the owner's AI-GOV-1 outage ruling: when the shared store fails or is slow, use a bounded,
 *     stricter per-process fallback for a short time, say so in metrics, and never claim cross-process enforcement while it is active.
 *
 * Keys carry only a version prefix and a registered route id (for example `ai:ask`). No user text, property id, user id or credential is ever
 * part of a key or a metric label. A provider failure only controls optional AI availability; it never authorizes a request or changes
 * canonical state.
 *
 * Deviation from the old per-process breaker, stated so it is not a surprise: a request admitted while the circuit was CLOSED whose result
 * arrives after the circuit opened is ignored. The old breaker let such a late success close an open circuit.
 */
import { Counter } from 'prom-client';
import { logger } from './logger';

export type SharedCircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitConfig {
  failureThreshold: number;
  openMs: number;
  /** How long one half-open probe may hold the lease before another process may take over a dead probe's slot. */
  probeTtlMs: number;
}

export type CircuitAcquire =
  | { decision: 'ALLOW' }
  | { decision: 'PROBE'; token: string }
  | { decision: 'DENY'; retryAfterMs: number };

export interface CircuitRecordResult {
  /** False when the completion was ignored: a stale probe claimant, or a closed-state request that finished after the circuit moved on. */
  applied: boolean;
  state: SharedCircuitState;
}

export interface AIGovernanceStore {
  readonly kind: 'REDIS' | 'MEMORY';
  /** Counts one request in the route's fixed window and returns the count including this one. The window starts at its first request. */
  incrementRateWindow(routeId: string, windowMs: number): Promise<number>;
  /** Decides whether a request may run. `token` is a fresh random value the store keeps only if it grants the half-open probe. */
  circuitAcquire(routeId: string, config: CircuitConfig, token: string): Promise<CircuitAcquire>;
  /** Records the outcome. Pass the probe token when the request was granted PROBE, otherwise null. */
  circuitRecord(routeId: string, outcome: 'SUCCESS' | 'FAILURE', config: CircuitConfig, token: string | null): Promise<CircuitRecordResult>;
}

// ── Pure circuit transitions ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface CircuitRecord {
  state: SharedCircuitState;
  failures: number;
  opensAtMs: number;
  probeToken: string | null;
  probeExpiresAtMs: number;
}

export const closedCircuit = (): CircuitRecord => ({ state: 'CLOSED', failures: 0, opensAtMs: 0, probeToken: null, probeExpiresAtMs: 0 });

/** Decides admission and returns the next record. The Redis Lua script below implements exactly these rules. */
export function transitionAcquire(record: CircuitRecord, nowMs: number, config: CircuitConfig, token: string): { next: CircuitRecord; result: CircuitAcquire } {
  if (record.state === 'OPEN') {
    if (nowMs < record.opensAtMs) return { next: record, result: { decision: 'DENY', retryAfterMs: record.opensAtMs - nowMs } };
    return {
      next: { state: 'HALF_OPEN', failures: 0, opensAtMs: record.opensAtMs, probeToken: token, probeExpiresAtMs: nowMs + config.probeTtlMs },
      result: { decision: 'PROBE', token },
    };
  }
  if (record.state === 'HALF_OPEN') {
    if (record.probeToken && nowMs < record.probeExpiresAtMs) {
      return { next: record, result: { decision: 'DENY', retryAfterMs: record.probeExpiresAtMs - nowMs } };
    }
    return { next: { ...record, probeToken: token, probeExpiresAtMs: nowMs + config.probeTtlMs }, result: { decision: 'PROBE', token } };
  }
  return { next: record, result: { decision: 'ALLOW' } };
}

export function transitionRecord(
  record: CircuitRecord,
  outcome: 'SUCCESS' | 'FAILURE',
  nowMs: number,
  config: CircuitConfig,
  token: string | null,
): { next: CircuitRecord; result: CircuitRecordResult } {
  if (token !== null) {
    if (record.state !== 'HALF_OPEN' || record.probeToken !== token) return { next: record, result: { applied: false, state: record.state } };
    if (outcome === 'SUCCESS') return { next: closedCircuit(), result: { applied: true, state: 'CLOSED' } };
    return {
      next: { state: 'OPEN', failures: 0, opensAtMs: nowMs + config.openMs, probeToken: null, probeExpiresAtMs: 0 },
      result: { applied: true, state: 'OPEN' },
    };
  }
  if (record.state !== 'CLOSED') return { next: record, result: { applied: false, state: record.state } };
  if (outcome === 'SUCCESS') return { next: closedCircuit(), result: { applied: true, state: 'CLOSED' } };
  const failures = record.failures + 1;
  if (failures >= config.failureThreshold) {
    return {
      next: { state: 'OPEN', failures: 0, opensAtMs: nowMs + config.openMs, probeToken: null, probeExpiresAtMs: 0 },
      result: { applied: true, state: 'OPEN' },
    };
  }
  return { next: { ...record, failures }, result: { applied: true, state: 'CLOSED' } };
}

// ── In-memory implementation (test double and local fallback) ───────────────────────────────────────────────────────────────────────

export class InMemoryAIGovernanceStore implements AIGovernanceStore {
  readonly kind = 'MEMORY' as const;
  private readonly rateWindows = new Map<string, { startedAt: number; count: number }>();
  private readonly circuits = new Map<string, CircuitRecord>();

  constructor(private readonly now: () => number = Date.now) {}

  async incrementRateWindow(routeId: string, windowMs: number): Promise<number> {
    const now = this.now();
    const window = this.rateWindows.get(routeId);
    if (!window || now - window.startedAt >= windowMs) {
      this.rateWindows.set(routeId, { startedAt: now, count: 1 });
      return 1;
    }
    window.count += 1;
    return window.count;
  }

  async circuitAcquire(routeId: string, config: CircuitConfig, token: string): Promise<CircuitAcquire> {
    const { next, result } = transitionAcquire(this.circuits.get(routeId) ?? closedCircuit(), this.now(), config, token);
    this.circuits.set(routeId, next);
    return result;
  }

  async circuitRecord(routeId: string, outcome: 'SUCCESS' | 'FAILURE', config: CircuitConfig, token: string | null): Promise<CircuitRecordResult> {
    const { next, result } = transitionRecord(this.circuits.get(routeId) ?? closedCircuit(), outcome, this.now(), config, token);
    this.circuits.set(routeId, next);
    return result;
  }

  /** For tests: the current record, or the closed default. */
  snapshot(routeId: string): CircuitRecord {
    return { ...(this.circuits.get(routeId) ?? closedCircuit()) };
  }
}

// ── Redis implementation ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The part of an ioredis client this store uses, so tests can substitute a double and the real client satisfies it. */
export interface RedisEvalClient {
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
}

/** Fixed window parity with the old in-memory window: the window starts at its first request and expires on its own. */
export const RATE_WINDOW_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return count
`;

/** Redis TIME is the one clock for every process, so host clock skew cannot reopen or hold a circuit. Mirrors transitionAcquire. */
export const CIRCUIT_ACQUIRE_LUA = `
local key = KEYS[1]
local token = ARGV[1]
local probeTtl = tonumber(ARGV[2])
local keyTtl = tonumber(ARGV[3])
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local state = redis.call('HGET', key, 'state')
if not state then state = 'CLOSED' end
if state == 'OPEN' then
  local opensAt = tonumber(redis.call('HGET', key, 'opensAtMs') or '0')
  if now < opensAt then return {'DENY', opensAt - now} end
  redis.call('HSET', key, 'state', 'HALF_OPEN', 'failures', 0, 'probeToken', token, 'probeExpiresAtMs', now + probeTtl)
  redis.call('PEXPIRE', key, keyTtl)
  return {'PROBE', 0}
end
if state == 'HALF_OPEN' then
  local probeToken = redis.call('HGET', key, 'probeToken')
  local expires = tonumber(redis.call('HGET', key, 'probeExpiresAtMs') or '0')
  if probeToken and probeToken ~= '' and now < expires then return {'DENY', expires - now} end
  redis.call('HSET', key, 'probeToken', token, 'probeExpiresAtMs', now + probeTtl)
  redis.call('PEXPIRE', key, keyTtl)
  return {'PROBE', 0}
end
return {'ALLOW', 0}
`;

/** Mirrors transitionRecord. A probe completion applies only if its token is still the current lease holder. */
export const CIRCUIT_RECORD_LUA = `
local key = KEYS[1]
local outcome = ARGV[1]
local token = ARGV[2]
local threshold = tonumber(ARGV[3])
local openMs = tonumber(ARGV[4])
local keyTtl = tonumber(ARGV[5])
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local state = redis.call('HGET', key, 'state')
if not state then state = 'CLOSED' end
if token ~= '' then
  local current = redis.call('HGET', key, 'probeToken')
  if state ~= 'HALF_OPEN' or current ~= token then return {0, state} end
  if outcome == 'SUCCESS' then
    redis.call('DEL', key)
    return {1, 'CLOSED'}
  end
  redis.call('HSET', key, 'state', 'OPEN', 'failures', 0, 'opensAtMs', now + openMs)
  redis.call('HDEL', key, 'probeToken', 'probeExpiresAtMs')
  redis.call('PEXPIRE', key, keyTtl)
  return {1, 'OPEN'}
end
if state ~= 'CLOSED' then return {0, state} end
if outcome == 'SUCCESS' then
  redis.call('DEL', key)
  return {1, 'CLOSED'}
end
local failures = tonumber(redis.call('HGET', key, 'failures') or '0') + 1
if failures >= threshold then
  redis.call('HSET', key, 'state', 'OPEN', 'failures', 0, 'opensAtMs', now + openMs)
  redis.call('HDEL', key, 'probeToken', 'probeExpiresAtMs')
  redis.call('PEXPIRE', key, keyTtl)
  return {1, 'OPEN'}
end
redis.call('HSET', key, 'state', 'CLOSED', 'failures', failures)
redis.call('PEXPIRE', key, keyTtl)
return {1, 'CLOSED'}
`;

/** Stale-key expiry: an idle route's circuit key disappears on its own, which is the same as a closed circuit. */
const circuitKeyTtlMs = (config: CircuitConfig): number => Math.max(config.openMs * 10, 3_600_000);

export class RedisAIGovernanceStore implements AIGovernanceStore {
  readonly kind = 'REDIS' as const;

  constructor(private readonly client: RedisEvalClient, private readonly prefix = 'ai:gov:v1:') {}

  private key(kind: 'rate' | 'circuit', routeId: string): string {
    return `${this.prefix}${kind}:${routeId}`;
  }

  async incrementRateWindow(routeId: string, windowMs: number): Promise<number> {
    const count = await this.client.eval(RATE_WINDOW_LUA, 1, this.key('rate', routeId), Math.max(1, Math.floor(windowMs)));
    return Number(count);
  }

  async circuitAcquire(routeId: string, config: CircuitConfig, token: string): Promise<CircuitAcquire> {
    const reply = await this.client.eval(CIRCUIT_ACQUIRE_LUA, 1, this.key('circuit', routeId), token, config.probeTtlMs, circuitKeyTtlMs(config)) as [string, number];
    if (reply[0] === 'PROBE') return { decision: 'PROBE', token };
    if (reply[0] === 'DENY') return { decision: 'DENY', retryAfterMs: Math.max(0, Number(reply[1])) };
    return { decision: 'ALLOW' };
  }

  async circuitRecord(routeId: string, outcome: 'SUCCESS' | 'FAILURE', config: CircuitConfig, token: string | null): Promise<CircuitRecordResult> {
    const reply = await this.client.eval(
      CIRCUIT_RECORD_LUA, 1, this.key('circuit', routeId), outcome, token ?? '', config.failureThreshold, config.openMs, circuitKeyTtlMs(config),
    ) as [number, SharedCircuitState];
    return { applied: Number(reply[0]) === 1, state: reply[1] };
  }
}

// ── Outage behaviour (AI-GOV-1) ─────────────────────────────────────────────────────────────────────────────────────────────────────

const degradedTotal = new Counter({
  name: 'ai_governance_degraded_total',
  help: 'Governed-AI shared-state operations served by the per-process fallback because the shared store failed or timed out',
  labelNames: ['component', 'reason'] as const,
});

export type GovernanceComponent = 'rate' | 'circuit';

export interface ResilientOptions {
  /** A shared-store call that takes longer than this counts as a failure, so a Redis stall cannot stall an AI request. */
  commandTimeoutMs: number;
  /** After a failure, serve from the fallback for this long before trying the shared store again. */
  retryAfterFailureMs: number;
  now?: () => number;
}

export interface RateReading {
  count: number;
  /** True when this reading came from the per-process fallback, so the caller must apply its stricter limit. */
  degraded: boolean;
}

export interface CircuitPermit {
  decision: CircuitAcquire['decision'];
  retryAfterMs: number;
  /** Which store granted this permit; the outcome is recorded against the same store. */
  source: 'SHARED' | 'LOCAL';
  token: string | null;
}

const withDeadline = <T>(work: Promise<T>, ms: number): Promise<T> => new Promise<T>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`AI governance store call exceeded ${ms}ms`)), ms);
  if (typeof timer.unref === 'function') timer.unref();
  work.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
});

export class ResilientAIGovernanceStore {
  private degradedUntil = 0;
  private readonly now: () => number;

  constructor(
    private readonly shared: AIGovernanceStore,
    private readonly local: AIGovernanceStore,
    private readonly options: ResilientOptions,
  ) {
    this.now = options.now ?? Date.now;
  }

  /** True while the per-process fallback is serving requests. */
  isDegraded(): boolean {
    return this.now() < this.degradedUntil;
  }

  private fail(component: GovernanceComponent, error: unknown): void {
    this.degradedUntil = this.now() + this.options.retryAfterFailureMs;
    const reason = error instanceof Error && /exceeded \d+ms/.test(error.message) ? 'TIMEOUT' : 'ERROR';
    degradedTotal.inc({ component, reason });
    logger.warn({ err: error, component, retryAfterMs: this.options.retryAfterFailureMs }, '[AI-GOVERNANCE] shared state unavailable; using the per-process fallback (cross-process limits are not enforced while it is active)');
  }

  async incrementRateWindow(routeId: string, windowMs: number): Promise<RateReading> {
    if (!this.isDegraded()) {
      try {
        return { count: await withDeadline(this.shared.incrementRateWindow(routeId, windowMs), this.options.commandTimeoutMs), degraded: false };
      } catch (error) {
        this.fail('rate', error);
      }
    } else {
      degradedTotal.inc({ component: 'rate', reason: 'FALLBACK_ACTIVE' });
    }
    return { count: await this.local.incrementRateWindow(routeId, windowMs), degraded: true };
  }

  async circuitAcquire(routeId: string, config: CircuitConfig, token: string): Promise<CircuitPermit> {
    if (!this.isDegraded()) {
      try {
        const result = await withDeadline(this.shared.circuitAcquire(routeId, config, token), this.options.commandTimeoutMs);
        return toPermit(result, 'SHARED');
      } catch (error) {
        this.fail('circuit', error);
      }
    } else {
      degradedTotal.inc({ component: 'circuit', reason: 'FALLBACK_ACTIVE' });
    }
    return toPermit(await this.local.circuitAcquire(routeId, config, token), 'LOCAL');
  }

  /** Never throws: a failure to record must not mask the request's own result. A permit from one store is only ever recorded to that store. */
  async circuitRecord(routeId: string, outcome: 'SUCCESS' | 'FAILURE', config: CircuitConfig, permit: CircuitPermit): Promise<CircuitRecordResult | null> {
    const token = permit.decision === 'PROBE' ? permit.token : null;
    try {
      if (permit.source === 'LOCAL') return await this.local.circuitRecord(routeId, outcome, config, token);
      if (this.isDegraded()) return null;
      return await withDeadline(this.shared.circuitRecord(routeId, outcome, config, token), this.options.commandTimeoutMs);
    } catch (error) {
      if (permit.source === 'SHARED') this.fail('circuit', error);
      return null;
    }
  }
}

function toPermit(result: CircuitAcquire, source: 'SHARED' | 'LOCAL'): CircuitPermit {
  if (result.decision === 'PROBE') return { decision: 'PROBE', retryAfterMs: 0, source, token: result.token };
  if (result.decision === 'DENY') return { decision: 'DENY', retryAfterMs: result.retryAfterMs, source, token: null };
  return { decision: 'ALLOW', retryAfterMs: 0, source, token: null };
}
