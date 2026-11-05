import { Counter, Histogram } from 'prom-client';
import { LLM_MODEL_CONFIG } from '../../config/ai-constants';
import { randomUUID } from 'node:crypto';
import { AICircuitOpenError, withTimeout } from '../../lib/aiResilience';
import {
  InMemoryAIGovernanceStore,
  RedisAIGovernanceStore,
  ResilientAIGovernanceStore,
  type CircuitConfig,
} from '../../lib/aiGovernanceStore';
import { logger } from '../../lib/logger';
import { sourceRegistryEntry } from '../intelligence/sourceRegistry';

export type GovernedAIModelTier = 'FAST' | 'ADVANCED';

export function resolveGovernedAIModel(tier: GovernedAIModelTier, env: NodeJS.ProcessEnv = process.env): string {
  return tier === 'ADVANCED'
    ? env.GEMINI_ADVANCED_MODEL || LLM_MODEL_CONFIG.ADVANCED_MODEL
    : env.GEMINI_MODEL || LLM_MODEL_CONFIG.DEFAULT_MODEL;
}

export class AIRequestGovernanceError extends Error {
  constructor(public readonly code: 'AI_DISABLED' | 'AI_ROUTE_DISABLED' | 'AI_RATE_LIMITED' | 'AI_STRUCTURE_REQUIRED' | 'AI_SOURCE_UNREGISTERED', message: string) {
    super(message);
    this.name = 'AIRequestGovernanceError';
  }
}

const requestTotal = new Counter({ name: 'ai_request_total', help: 'Governed AI requests.', labelNames: ['route', 'model', 'outcome'] });
const requestDuration = new Histogram({ name: 'ai_request_duration_seconds', help: 'Governed AI request duration.', labelNames: ['route', 'model', 'outcome'] });
const requestTokens = new Counter({ name: 'ai_request_tokens_total', help: 'Governed AI tokens.', labelNames: ['route', 'model', 'kind'] });
const estimatedCostUsd = new Counter({ name: 'ai_request_estimated_cost_usd_total', help: 'Estimated governed AI request cost in USD using operator-configured token rates.', labelNames: ['route', 'model'] });

export interface AIRequestHealthSnapshot {
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  lastAttemptAt: Date;
  lastSuccessAt: Date | null;
  consecutiveFailures: number;
  message: string | null;
}

/**
 * What the admin source-health view shows for one AI route (owner decision AI-HEALTH-1). Health is one shared record per route, written when a
 * request finishes and read where source health is assembled; nothing is published to individual properties. While the shared store is
 * unavailable the reading is this process's own last observation, labelled LOCAL_LAST_KNOWN, or no snapshot at all, never a guess.
 */
export interface AIRouteHealthReading {
  snapshot: AIRequestHealthSnapshot | null;
  source: 'SHARED' | 'LOCAL_LAST_KNOWN';
  sharedUnavailable: boolean;
}

export async function getAIRouteHealth(routeId: string): Promise<AIRouteHealthReading> {
  const reading = await store().readRouteHealth(routeId);
  const health = reading.health;
  return {
    snapshot: health ? {
      status: health.status,
      lastAttemptAt: new Date(health.lastAttemptAtMs),
      lastSuccessAt: health.lastSuccessAtMs === null ? null : new Date(health.lastSuccessAtMs),
      consecutiveFailures: health.consecutiveFailures,
      message: health.message,
    } : null,
    source: reading.source,
    sharedUnavailable: reading.sharedUnavailable,
  };
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

// ── Shared state (Findings Implementation Plan Phase 5; owner decision AI-GOV-1) ───────────────────────────────────────────────────
// Rate windows and circuit state live in Redis so every backend and worker process shares one aggregate limit and one circuit. When Redis is
// not configured (no REDIS_HOST) or this is a test run, state is per-process, exactly as before. When Redis is configured but fails or is slow,
// a short-lived, stricter per-process fallback serves requests and is counted in ai_governance_degraded_total; deterministic Ask operations
// never depend on this layer.
let governanceStore: ResilientAIGovernanceStore | null = null;

function isTestRun(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === 'test' || Boolean(env.NODE_TEST_CONTEXT);
}

function createDefaultGovernanceStore(env: NodeJS.ProcessEnv = process.env): ResilientAIGovernanceStore {
  const local = new InMemoryAIGovernanceStore();
  const useRedis = Boolean(env.REDIS_HOST) && !isTestRun(env);
  // Loaded only when used: importing the Redis client module must not matter to a process that runs without Redis.
  const shared = useRedis
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ? new RedisAIGovernanceStore((require('../../lib/redis') as typeof import('../../lib/redis')).redis)
    : local;
  logger.info({ mode: useRedis ? 'REDIS_SHARED' : 'PER_PROCESS' }, '[AI-GOVERNANCE] state store selected');
  return new ResilientAIGovernanceStore(shared, local, {
    commandTimeoutMs: positiveInt(env.AI_GOVERNANCE_STORE_TIMEOUT_MS, 300),
    retryAfterFailureMs: positiveInt(env.AI_GOVERNANCE_STORE_RETRY_MS, 5_000),
  });
}

function store(): ResilientAIGovernanceStore {
  if (!governanceStore) governanceStore = createDefaultGovernanceStore();
  return governanceStore;
}

/** Test seam: install a store (or null to reselect the default on next use). */
export function setAIGovernanceStoreForTests(next: ResilientAIGovernanceStore | null): void {
  governanceStore = next;
}

/** While the shared store is unavailable the fallback enforces a stricter limit, because it only sees this process's traffic. */
export function fallbackRateLimit(limit: number, env: NodeJS.ProcessEnv = process.env): number {
  const fraction = Number(env.AI_GOVERNANCE_FALLBACK_LIMIT_FRACTION);
  const applied = Number.isFinite(fraction) && fraction > 0 && fraction <= 1 ? fraction : 0.5;
  return Math.max(1, Math.floor(limit * applied));
}

function circuitConfig(env: NodeJS.ProcessEnv, timeoutMs: number): CircuitConfig {
  return {
    failureThreshold: positiveInt(env.AI_CIRCUIT_FAILURE_THRESHOLD, 3),
    openMs: positiveInt(env.AI_CIRCUIT_OPEN_MS, 30_000),
    probeTtlMs: positiveInt(env.AI_CIRCUIT_PROBE_TTL_MS, Math.max(30_000, timeoutMs * 2)),
  };
}

async function runThroughCircuit<T>(routeId: string, config: CircuitConfig, work: () => Promise<T>): Promise<T> {
  const permit = await store().circuitAcquire(routeId, config, randomUUID());
  if (permit.decision === 'DENY') throw new AICircuitOpenError(routeId, permit.retryAfterMs);
  try {
    const value = await work();
    await store().circuitRecord(routeId, 'SUCCESS', config, permit);
    return value;
  } catch (error) {
    await store().circuitRecord(routeId, 'FAILURE', config, permit);
    throw error;
  }
}

function routeEnvKey(routeId: string): string {
  return `AI_ROUTE_${routeId.replace(/^ai:/, '').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}_ENABLED`;
}

function routeRateLimitEnvKey(routeId: string): string {
  return `AI_ROUTE_${routeId.replace(/^ai:/, '').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}_RATE_LIMIT_PER_MINUTE`;
}

async function assertAllowed(routeId: string, env: NodeJS.ProcessEnv): Promise<void> {
  if (!sourceRegistryEntry(routeId)) throw new AIRequestGovernanceError('AI_SOURCE_UNREGISTERED', `AI route ${routeId} is not registered.`);
  if (env.AI_REQUESTS_ENABLED === 'false') throw new AIRequestGovernanceError('AI_DISABLED', 'AI requests are disabled.');
  if (env[routeEnvKey(routeId)] === 'false') throw new AIRequestGovernanceError('AI_ROUTE_DISABLED', `AI route ${routeId} is disabled.`);
  const limit = positiveInt(env[routeRateLimitEnvKey(routeId)], positiveInt(env.AI_REQUEST_RATE_LIMIT_PER_MINUTE, 60));
  const reading = await store().incrementRateWindow(routeId, 60_000);
  const effectiveLimit = reading.degraded ? fallbackRateLimit(limit, env) : limit;
  if (reading.count > effectiveLimit) throw new AIRequestGovernanceError('AI_RATE_LIMITED', `AI route ${routeId} exceeded its request limit.`);
}


function usageFrom(result: unknown): { prompt: number; completion: number } {
  if (!result || typeof result !== 'object') return { prompt: 0, completion: 0 };
  const top = result as Record<string, unknown>;
  const response = top.response && typeof top.response === 'object' ? top.response as Record<string, unknown> : {};
  const usage = (top.usageMetadata ?? response.usageMetadata) as Record<string, unknown> | undefined;
  return {
    prompt: typeof usage?.promptTokenCount === 'number' ? usage.promptTokenCount : 0,
    completion: typeof usage?.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : 0,
  };
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function executeGovernedAIRequest<T>(input: {
  routeId: string;
  model: string;
  structuredOutputRequired?: boolean;
  structuredOutputConfigured?: boolean;
  timeoutMs?: number;
  maxAttempts?: number;
  work: () => Promise<T>;
  env?: NodeJS.ProcessEnv;
}): Promise<T> {
  const env = input.env ?? process.env;
  await assertAllowed(input.routeId, env);
  if (input.structuredOutputRequired && !input.structuredOutputConfigured) {
    throw new AIRequestGovernanceError('AI_STRUCTURE_REQUIRED', `${input.routeId} requires provider-enforced structured output.`);
  }
  const registered = sourceRegistryEntry(input.routeId)!;
  const maxAttempts = Math.min(3, input.maxAttempts ?? positiveInt(env.AI_REQUEST_MAX_ATTEMPTS, registered.retryPolicy.maxAttempts));
  const timeoutMs = input.timeoutMs ?? positiveInt(env.AI_REQUEST_TIMEOUT_MS, 10_000);
  const unhealthyThreshold = positiveInt(env.AI_CIRCUIT_FAILURE_THRESHOLD, 3);
  const backoffMs = positiveInt(env.AI_REQUEST_RETRY_BACKOFF_MS, registered.retryPolicy.backoffMs || 250);
  const startedAt = Date.now();
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const value = await runThroughCircuit(input.routeId, circuitConfig(env, timeoutMs), () => withTimeout(input.work, { timeoutMs, operation: input.routeId }));
      const usage = usageFrom(value);
      requestTotal.inc({ route: input.routeId, model: input.model, outcome: 'success' });
      requestDuration.observe({ route: input.routeId, model: input.model, outcome: 'success' }, (Date.now() - startedAt) / 1000);
      if (usage.prompt) requestTokens.inc({ route: input.routeId, model: input.model, kind: 'prompt' }, usage.prompt);
      if (usage.completion) requestTokens.inc({ route: input.routeId, model: input.model, kind: 'completion' }, usage.completion);
      const promptRate = Number(env.AI_PROMPT_USD_PER_MILLION_TOKENS ?? 0);
      const completionRate = Number(env.AI_COMPLETION_USD_PER_MILLION_TOKENS ?? 0);
      const estimatedCost = ((usage.prompt * promptRate) + (usage.completion * completionRate)) / 1_000_000;
      if (Number.isFinite(estimatedCost) && estimatedCost > 0) estimatedCostUsd.inc({ route: input.routeId, model: input.model }, estimatedCost);
      await store().recordRouteHealth(input.routeId, 'SUCCESS', unhealthyThreshold, null);
      logger.info({ routeId: input.routeId, model: input.model, attempt, ...usage, estimatedCostUsd: estimatedCost }, '[AI-GOVERNANCE] request completed');
      return value;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await pause(backoffMs * attempt);
    }
  }
  requestTotal.inc({ route: input.routeId, model: input.model, outcome: 'failure' });
  requestDuration.observe({ route: input.routeId, model: input.model, outcome: 'failure' }, (Date.now() - startedAt) / 1000);
  logger.warn({ err: lastError, routeId: input.routeId, model: input.model }, '[AI-GOVERNANCE] request exhausted retry policy');
  await store().recordRouteHealth(input.routeId, 'FAILURE', unhealthyThreshold, lastError instanceof Error ? lastError.message.slice(0, 500) : 'AI provider request failed.');
  throw lastError;
}

export function resetAIRequestGovernanceForTests(): void {
  // Tests always run against fresh per-process state, never against a shared store.
  const local = new InMemoryAIGovernanceStore();
  governanceStore = new ResilientAIGovernanceStore(local, local, { commandTimeoutMs: 300, retryAfterFailureMs: 5_000 });
}
