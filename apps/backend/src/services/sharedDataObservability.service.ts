import { logger } from '../lib/logger';
type SharedDataLogLevel = 'INFO' | 'WARN' | 'ERROR';

type SharedDataLogInput = {
  event: string;
  level?: SharedDataLogLevel;
  propertyId?: string | null;
  toolKey?: string | null;
  signalKey?: string | null;
  assumptionSetId?: string | null;
  fallbackPath?: string | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
  error?: unknown;
};

function toErrorDetails(error: unknown): Record<string, unknown> | undefined {
  if (!error) return undefined;
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  if (typeof error === 'object') {
    return {
      value: error,
    };
  }
  return {
    value: String(error),
  };
}

export function logSharedDataEvent(input: SharedDataLogInput): void {
  const payload: Record<string, unknown> = {
    scope: 'shared-data',
    event: input.event,
    level: input.level ?? 'INFO',
    propertyId: input.propertyId ?? null,
    toolKey: input.toolKey ?? null,
    signalKey: input.signalKey ?? null,
    assumptionSetId: input.assumptionSetId ?? null,
    fallbackPath: input.fallbackPath ?? null,
    durationMs: input.durationMs ?? null,
    metadata: input.metadata ?? null,
    error: toErrorDetails(input.error) ?? null,
    loggedAt: new Date().toISOString(),
  };

  const encoded = JSON.stringify(payload);
  if ((input.level ?? 'INFO') === 'ERROR') {
    logger.error({ encoded }, '[SHARED-DATA]');
    return;
  }
  if ((input.level ?? 'INFO') === 'WARN') {
    logger.warn({ encoded }, '[SHARED-DATA]');
    return;
  }
  logger.info({ encoded }, '[SHARED-DATA]');
}

