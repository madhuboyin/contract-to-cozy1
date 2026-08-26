import { Counter, Histogram } from 'prom-client';
import { LLM_MODEL_CONFIG } from '../../config/ai-constants';
import { AICircuitBreaker, withTimeout } from '../../lib/aiResilience';
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

const circuits = new Map<string, AICircuitBreaker>();
const rateWindows = new Map<string, { startedAt: number; count: number }>();
export interface AIRequestHealthSnapshot {
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  lastAttemptAt: Date;
  lastSuccessAt: Date | null;
  consecutiveFailures: number;
  message: string | null;
}
const routeHealth = new Map<string, AIRequestHealthSnapshot>();
const emittedRouteHealth = new Map<string, AIRequestHealthSnapshot['status']>();

export function getAIRequestHealthSnapshot(routeId: string): AIRequestHealthSnapshot | null {
  const snapshot = routeHealth.get(routeId);
  return snapshot ? { ...snapshot } : null;
}

async function publishRouteHealthIfChanged(routeId: string, snapshot: AIRequestHealthSnapshot): Promise<void> {
  if (emittedRouteHealth.get(routeId) === snapshot.status) return;
  try {
    const [{ allPropertyIds, emitSourceHealthChangesForProperties }] = await Promise.all([
      import('../intelligence/sourceHealthImpact.service'),
    ]);
    const propertyIds = await allPropertyIds();
    await emitSourceHealthChangesForProperties({
      propertyIds,
      sourceType: 'AI_SOURCE',
      sourceEntityId: routeId,
      sourceRevision: `${snapshot.status}:${snapshot.lastAttemptAt.toISOString()}`,
      health: snapshot.status === 'HEALTHY' ? 'CURRENT' : snapshot.status === 'DEGRADED' ? 'DEGRADED' : 'UNAVAILABLE',
    });
    emittedRouteHealth.set(routeId, snapshot.status);
  } catch (err) {
    // Keep the emitted-status cursor unchanged. The next request on this
    // route retries the durable PropertyChange/recompute publication even
    // when provider health itself did not change again.
    logger.error({ err, routeId, status: snapshot.status }, '[AI-GOVERNANCE] source-health publication pending retry');
  }
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function routeEnvKey(routeId: string): string {
  return `AI_ROUTE_${routeId.replace(/^ai:/, '').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}_ENABLED`;
}

function routeRateLimitEnvKey(routeId: string): string {
  return `AI_ROUTE_${routeId.replace(/^ai:/, '').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}_RATE_LIMIT_PER_MINUTE`;
}

function assertAllowed(routeId: string, env: NodeJS.ProcessEnv): void {
  if (!sourceRegistryEntry(routeId)) throw new AIRequestGovernanceError('AI_SOURCE_UNREGISTERED', `AI route ${routeId} is not registered.`);
  if (env.AI_REQUESTS_ENABLED === 'false') throw new AIRequestGovernanceError('AI_DISABLED', 'AI requests are disabled.');
  if (env[routeEnvKey(routeId)] === 'false') throw new AIRequestGovernanceError('AI_ROUTE_DISABLED', `AI route ${routeId} is disabled.`);
  const now = Date.now();
  const limit = positiveInt(env[routeRateLimitEnvKey(routeId)], positiveInt(env.AI_REQUEST_RATE_LIMIT_PER_MINUTE, 60));
  const window = rateWindows.get(routeId);
  if (!window || now - window.startedAt >= 60_000) {
    rateWindows.set(routeId, { startedAt: now, count: 1 });
  } else {
    if (window.count >= limit) throw new AIRequestGovernanceError('AI_RATE_LIMITED', `AI route ${routeId} exceeded its request limit.`);
    window.count += 1;
  }
}

function circuit(routeId: string, env: NodeJS.ProcessEnv): AICircuitBreaker {
  const existing = circuits.get(routeId);
  if (existing) return existing;
  const created = new AICircuitBreaker(routeId, {
    failureThreshold: positiveInt(env.AI_CIRCUIT_FAILURE_THRESHOLD, 3),
    openMs: positiveInt(env.AI_CIRCUIT_OPEN_MS, 30_000),
  });
  circuits.set(routeId, created);
  return created;
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
  assertAllowed(input.routeId, env);
  if (input.structuredOutputRequired && !input.structuredOutputConfigured) {
    throw new AIRequestGovernanceError('AI_STRUCTURE_REQUIRED', `${input.routeId} requires provider-enforced structured output.`);
  }
  const registered = sourceRegistryEntry(input.routeId)!;
  const maxAttempts = Math.min(3, input.maxAttempts ?? positiveInt(env.AI_REQUEST_MAX_ATTEMPTS, registered.retryPolicy.maxAttempts));
  const timeoutMs = input.timeoutMs ?? positiveInt(env.AI_REQUEST_TIMEOUT_MS, 10_000);
  const backoffMs = positiveInt(env.AI_REQUEST_RETRY_BACKOFF_MS, registered.retryPolicy.backoffMs || 250);
  const startedAt = Date.now();
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const value = await circuit(input.routeId, env).execute(() => withTimeout(input.work, { timeoutMs, operation: input.routeId }));
      const usage = usageFrom(value);
      requestTotal.inc({ route: input.routeId, model: input.model, outcome: 'success' });
      requestDuration.observe({ route: input.routeId, model: input.model, outcome: 'success' }, (Date.now() - startedAt) / 1000);
      if (usage.prompt) requestTokens.inc({ route: input.routeId, model: input.model, kind: 'prompt' }, usage.prompt);
      if (usage.completion) requestTokens.inc({ route: input.routeId, model: input.model, kind: 'completion' }, usage.completion);
      const promptRate = Number(env.AI_PROMPT_USD_PER_MILLION_TOKENS ?? 0);
      const completionRate = Number(env.AI_COMPLETION_USD_PER_MILLION_TOKENS ?? 0);
      const estimatedCost = ((usage.prompt * promptRate) + (usage.completion * completionRate)) / 1_000_000;
      if (Number.isFinite(estimatedCost) && estimatedCost > 0) estimatedCostUsd.inc({ route: input.routeId, model: input.model }, estimatedCost);
      const healthySnapshot: AIRequestHealthSnapshot = { status: 'HEALTHY', lastAttemptAt: new Date(), lastSuccessAt: new Date(), consecutiveFailures: 0, message: null };
      routeHealth.set(input.routeId, healthySnapshot);
      await publishRouteHealthIfChanged(input.routeId, healthySnapshot);
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
  const previous = routeHealth.get(input.routeId);
  const consecutiveFailures = (previous?.consecutiveFailures ?? 0) + 1;
  const failedSnapshot: AIRequestHealthSnapshot = {
    status: consecutiveFailures >= positiveInt(env.AI_CIRCUIT_FAILURE_THRESHOLD, 3) ? 'UNHEALTHY' : 'DEGRADED',
    lastAttemptAt: new Date(), lastSuccessAt: previous?.lastSuccessAt ?? null, consecutiveFailures,
    message: lastError instanceof Error ? lastError.message.slice(0, 500) : 'AI provider request failed.',
  };
  routeHealth.set(input.routeId, failedSnapshot);
  await publishRouteHealthIfChanged(input.routeId, failedSnapshot);
  throw lastError;
}

export function resetAIRequestGovernanceForTests(): void {
  circuits.clear();
  rateWindows.clear();
  routeHealth.clear();
  emittedRouteHealth.clear();
}
