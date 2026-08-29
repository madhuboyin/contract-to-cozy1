import type { AskOperationId } from '../ask/askOperationRegistry';
import type { EnvelopeDomain } from '../../productFramework/intelligence/intelligenceIssueDomain.contract';
import type { PropertyContextScope } from '../../modules/propertyContext/domain/contracts';

export type AgentTrigger = 'USER_INITIATED' | 'HOME_ACTION_ENGAGEMENT' | 'SPECIALIST_HANDOFF';
export type AgentReleaseState = 'DEV' | 'EVAL_APPROVED' | 'ENABLED' | 'DISABLED';
export type AgentSafetyLevel = 'RECOMMEND' | 'DRAFT';

export interface AgentSkillReference {
  id: string;
  version: string;
  operations: readonly AskOperationId[];
}

export interface AgentTriggerBinding {
  trigger: AgentTrigger;
  handlerId: string;
  handlerVersion: string;
}

export interface AgentDefinition {
  agentId: string;
  version: string;
  definitionSchemaVersion: string;
  name: string;
  responsibility: string;
  supportedDomains: readonly EnvelopeDomain[];
  acceptedTriggers: readonly AgentTrigger[];
  triggerBindings: readonly AgentTriggerBinding[];
  requiredContext: readonly PropertyContextScope[];
  allowedSkills: readonly AgentSkillReference[];
  prohibitedSkills?: readonly { id: string; version: string }[];
  executionMode: 'SYNC' | 'ASYNC_LONG_RUNNING';
  stateRequirements: { persistsAcrossInvocations: boolean; stateShape?: string };
  outputContract: {
    contractId: string;
    producerCommandsAllowed: readonly string[];
    producesRecommendation: boolean;
    maxAutonomyLevel: 0 | 1 | 2;
  };
  budgets: {
    maxContextFactsPerRun: number;
    maxLLMInvocationsPerRun: number;
    maxLLMCostPerRunUsd: number;
    maxExecutionMsPerRun: number;
    maxLoopIterations: number;
  };
  killSwitch: string;
  featureFlag: string;
  releaseState: AgentReleaseState;
  retryPolicy: { maxAttempts: number; backoffMs: number };
  timeoutMs: number;
  escalationPolicy: {
    onLowConfidence: 'ABSTAIN' | 'ASK_HOMEOWNER';
    onToolFailure: 'RETRY' | 'ABSTAIN' | 'ESCALATE_TO_HUMAN_REVIEW';
    onLoopBudgetExhausted: 'ABSTAIN_WITH_PARTIAL_RESULT';
  };
  auditRequirements: { logEveryToolCall: true; logEveryStateTransition: true };
  safetyLevel: AgentSafetyLevel;
  evaluationSuiteId: string;
}

export interface VersionedAgentRegistryEntry {
  activeVersion: string;
  versions: Readonly<Record<string, AgentDefinition>>;
}

export interface ReferencedAgentDefinitionVersion {
  agentId: string;
  version: string;
  source: 'NONTERMINAL_RUN' | 'PAUSED_STATE' | 'DELAYED_JOB';
  sourceId: string;
}
