import type { AskOperationId } from '../services/ask/askOperationRegistry';

function booleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(value.trim().toLowerCase());
}

function positiveIntegerEnv(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export interface AskOperationalControls {
  askEnabled: boolean;
  remoteGenerationEnabled: boolean;
  operationEnabled: (operationId: AskOperationId) => boolean;
  rawConversationRetentionDays: number;
  feedbackRetentionDays: number;
  executionTimeoutMs: number;
}

export function readAskOperationalControls(env: NodeJS.ProcessEnv = process.env): AskOperationalControls {
  return {
    askEnabled: booleanEnv(env.ASK_ENABLED, true),
    remoteGenerationEnabled: booleanEnv(env.ASK_REMOTE_GENERATION_ENABLED, true),
    operationEnabled: (operationId) => booleanEnv(env[`ASK_OPERATION_${operationId}_ENABLED`], true),
    rawConversationRetentionDays: positiveIntegerEnv(env.ASK_RAW_CONVERSATION_RETENTION_DAYS, 30, 365),
    feedbackRetentionDays: positiveIntegerEnv(env.ASK_FEEDBACK_RETENTION_DAYS, 365, 1_095),
    executionTimeoutMs: positiveIntegerEnv(env.ASK_EXECUTION_TIMEOUT_MS, 15_000, 120_000),
  };
}
