import type { AskOperationId } from '../services/ask/askOperationRegistry';

function booleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(value.trim().toLowerCase());
}

function positiveIntegerEnv(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function ratioEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

export interface AskOperationalControls {
  askEnabled: boolean;
  remoteGenerationEnabled: boolean;
  localRoutingEnabled: boolean;
  resultSynthesisEnabled: boolean;
  localRoutingMinimumConfidence: number;
  routingAmbiguityMargin: number;
  operationEnabled: (operationId: AskOperationId) => boolean;
  skillEnabled: (skillId: string) => boolean;
  rawConversationRetentionDays: number;
  feedbackRetentionDays: number;
  executionTimeoutMs: number;
}

export function readAskOperationalControls(env: NodeJS.ProcessEnv = process.env): AskOperationalControls {
  return {
    askEnabled: booleanEnv(env.ASK_ENABLED, true),
    remoteGenerationEnabled: booleanEnv(env.ASK_REMOTE_GENERATION_ENABLED, true),
    localRoutingEnabled: booleanEnv(env.ASK_LOCAL_ROUTING_ENABLED, true),
    resultSynthesisEnabled: booleanEnv(env.ASK_RESULT_SYNTHESIS_ENABLED, false),
    localRoutingMinimumConfidence: ratioEnv(env.ASK_LOCAL_ROUTING_MIN_CONFIDENCE, 0.42),
    routingAmbiguityMargin: ratioEnv(env.ASK_ROUTING_AMBIGUITY_MARGIN, 0.1),
    operationEnabled: (operationId) => booleanEnv(env[`ASK_OPERATION_${operationId}_ENABLED`], true),
    skillEnabled: (skillId) => {
      const envId = skillId.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
      return booleanEnv(env[`ASK_SKILL_${envId}_ENABLED`], true)
        && !booleanEnv(env[`ASK_SKILL_${envId}_KILL_SWITCH`], false);
    },
    rawConversationRetentionDays: positiveIntegerEnv(env.ASK_RAW_CONVERSATION_RETENTION_DAYS, 30, 365),
    feedbackRetentionDays: positiveIntegerEnv(env.ASK_FEEDBACK_RETENTION_DAYS, 365, 1_095),
    executionTimeoutMs: positiveIntegerEnv(env.ASK_EXECUTION_TIMEOUT_MS, 15_000, 120_000),
  };
}
