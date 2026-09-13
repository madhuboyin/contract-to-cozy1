import type { AskOperationId } from '../services/ask/askOperationRegistry';
import { getSkillDefinition } from '../services/skills/skillRegistry';
import type { SkillConsumer, SkillDomain } from '../services/skills/skill.contract';

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
  semanticRetrievalEnabled: boolean;
  embeddingRetrievalEnabled: boolean;
  constrainedClassifierEnabled: boolean;
  semanticResponseValidatorEnabled: boolean;
  resultSynthesisEnabled: boolean;
  askConversationalCaptureEnabled: boolean;
  askProactiveContinuationEnabled: boolean;
  accountRoleEligibilityEnabled: boolean;
  audiencePolicyEnabled: boolean;
  audienceDiscoveryEnabled: boolean;
  audiencePresentationEnabled: boolean;
  localRoutingMinimumConfidence: number;
  routingAmbiguityMargin: number;
  operationEnabled: (operationId: AskOperationId) => boolean;
  consumerEnabled: (consumer: SkillConsumer) => boolean;
  domainEnabled: (domain: SkillDomain) => boolean;
  skillEnabled: (skillId: string) => boolean;
  adapterEnabled: (adapterId: string) => boolean;
  contextProviderEnabled: (providerId: string) => boolean;
  rawConversationRetentionDays: number;
  feedbackRetentionDays: number;
  executionTimeoutMs: number;
}

export function readAskOperationalControls(env: NodeJS.ProcessEnv = process.env): AskOperationalControls {
  return {
    askEnabled: booleanEnv(env.ASK_ENABLED, true)
      && !booleanEnv(env.ASK_KILL_SWITCH, false),
    remoteGenerationEnabled: booleanEnv(env.ASK_REMOTE_GENERATION_ENABLED, true),
    localRoutingEnabled: booleanEnv(env.ASK_LOCAL_ROUTING_ENABLED, true),
    semanticRetrievalEnabled: booleanEnv(env.ASK_SEMANTIC_RETRIEVAL_ENABLED, true)
      && !booleanEnv(env.ASK_SEMANTIC_RETRIEVAL_KILL_SWITCH, false),
    embeddingRetrievalEnabled: booleanEnv(env.ASK_EMBEDDING_RETRIEVAL_ENABLED, true)
      && !booleanEnv(env.ASK_EMBEDDING_RETRIEVAL_KILL_SWITCH, false),
    constrainedClassifierEnabled: booleanEnv(env.ASK_CONSTRAINED_CLASSIFIER_ENABLED, true)
      && !booleanEnv(env.ASK_CONSTRAINED_CLASSIFIER_KILL_SWITCH, false),
    semanticResponseValidatorEnabled: booleanEnv(env.ASK_SEMANTIC_RESPONSE_VALIDATOR_ENABLED, true)
      && !booleanEnv(env.ASK_SEMANTIC_RESPONSE_VALIDATOR_KILL_SWITCH, false),
    resultSynthesisEnabled: booleanEnv(env.ASK_RESULT_SYNTHESIS_ENABLED, false)
      && !booleanEnv(env.ASK_RESULT_SYNTHESIS_KILL_SWITCH, false),
    // Ask Cozy Stage 3, Phase 3 (implementation plan §22). Defaults off,
    // unlike most flags here that default on -- this gates a genuinely new,
    // unproven capability (LLM-driven writes-by-proposal from ordinary
    // conversation), not a refactor of already-shipped behavior.
    askConversationalCaptureEnabled: booleanEnv(env.ASK_CONVERSATIONAL_CAPTURE_ENABLED, false)
      && !booleanEnv(env.ASK_CONVERSATIONAL_CAPTURE_KILL_SWITCH, false),
    // Ask Cozy Stage 3, Phase 5 (implementation plan §22, "Remove once all
    // three producers are migrated"). Defaults on, unlike the conversational-
    // capture flag above -- this isn't a new, unproven capability being
    // introduced behind a gate; two of the three producers already create
    // these continuations in production today. Its real value is the kill
    // switch: an instant way to stop Ask continuations (and the
    // PROACTIVE_INSIGHT block they carry) from being attached to monitor
    // notifications, without a redeploy, if something goes wrong with that
    // specific mechanism after this phase ships. Every producer degrades to
    // its plain pre-existing domain-URL notification when this is off,
    // through the same catch-and-fall-back path already used for any other
    // continuation-creation failure.
    askProactiveContinuationEnabled: booleanEnv(env.ASK_PROACTIVE_CONTINUATION_ENABLED, true)
      && !booleanEnv(env.ASK_PROACTIVE_CONTINUATION_KILL_SWITCH, false),
    accountRoleEligibilityEnabled: booleanEnv(env.ASK_ACCOUNT_ROLE_ELIGIBILITY_ENABLED, true)
      && !booleanEnv(env.ASK_ACCOUNT_ROLE_ELIGIBILITY_KILL_SWITCH, false),
    audiencePolicyEnabled: booleanEnv(env.ASK_AUDIENCE_POLICY_ENABLED, true)
      && !booleanEnv(env.ASK_AUDIENCE_POLICY_KILL_SWITCH, false),
    audienceDiscoveryEnabled: booleanEnv(env.ASK_AUDIENCE_DISCOVERY_ENABLED, true)
      && !booleanEnv(env.ASK_AUDIENCE_DISCOVERY_KILL_SWITCH, false),
    audiencePresentationEnabled: booleanEnv(env.ASK_AUDIENCE_PRESENTATION_ENABLED, true)
      && !booleanEnv(env.ASK_AUDIENCE_PRESENTATION_KILL_SWITCH, false),
    localRoutingMinimumConfidence: ratioEnv(env.ASK_LOCAL_ROUTING_MIN_CONFIDENCE, 0.42),
    routingAmbiguityMargin: ratioEnv(env.ASK_ROUTING_AMBIGUITY_MARGIN, 0.1),
    operationEnabled: (operationId) => booleanEnv(env[`ASK_OPERATION_${operationId}_ENABLED`], true)
      && !booleanEnv(env[`ASK_OPERATION_${operationId}_KILL_SWITCH`], false),
    consumerEnabled: (consumer) => booleanEnv(env[`ASK_CONSUMER_${consumer}_ENABLED`], true)
      && !booleanEnv(env[`ASK_CONSUMER_${consumer}_KILL_SWITCH`], false),
    domainEnabled: (domain) => booleanEnv(env[`ASK_DOMAIN_${domain}_ENABLED`], true)
      && !booleanEnv(env[`ASK_DOMAIN_${domain}_KILL_SWITCH`], false),
    skillEnabled: (skillId) => {
      const skill = getSkillDefinition(skillId);
      if (!skill) return false;
      return booleanEnv(env[skill.featureFlag], true)
        && !booleanEnv(env[skill.killSwitch], false);
    },
    adapterEnabled: (adapterId) => {
      const envId = adapterId.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
      return booleanEnv(env[`ASK_ADAPTER_${envId}_ENABLED`], true)
        && !booleanEnv(env[`ASK_ADAPTER_${envId}_KILL_SWITCH`], false);
    },
    contextProviderEnabled: (providerId) => {
      const envId = providerId.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
      return booleanEnv(env[`ASK_CONTEXT_PROVIDER_${envId}_ENABLED`], true)
        && !booleanEnv(env[`ASK_CONTEXT_PROVIDER_${envId}_KILL_SWITCH`], false);
    },
    rawConversationRetentionDays: positiveIntegerEnv(env.ASK_RAW_CONVERSATION_RETENTION_DAYS, 30, 365),
    feedbackRetentionDays: positiveIntegerEnv(env.ASK_FEEDBACK_RETENTION_DAYS, 365, 1_095),
    executionTimeoutMs: positiveIntegerEnv(env.ASK_EXECUTION_TIMEOUT_MS, 15_000, 120_000),
  };
}
