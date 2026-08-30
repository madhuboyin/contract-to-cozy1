import type { AgentDefinition } from '../agent.contract';

export const HVAC_REPAIR_REPLACE_AGENT_DEFINITION = Object.freeze({
  agentId: 'hvac-repair-replace-specialist',
  version: '1.0.0',
  definitionSchemaVersion: '1.0.0',
  name: 'HVAC Repair-or-Replace Specialist',
  responsibility: 'Help a homeowner complete an HVAC repair-or-replace decision using the authoritative HVAC Decision Platform workflow.',
  // ARD-002 keeps HVAC as an entity/category, not an Envelope domain.
  supportedDomains: ['ASSET_LIFECYCLE'],
  acceptedTriggers: ['HOME_ACTION_ENGAGEMENT'],
  triggerBindings: [{
    trigger: 'HOME_ACTION_ENGAGEMENT',
    handlerId: 'agent.hvac.home-action-engagement',
    handlerVersion: '1.0.0',
  }],
  requiredContext: ['SYSTEMS', 'INVENTORY', 'MAINTENANCE', 'SAFETY'],
  allowedSkills: [{
    id: 'repair-replace',
    version: '1.0.0',
    operations: ['HVAC_DECISION_START', 'HVAC_DECISION_CONTINUE'],
  }],
  prohibitedSkills: [],
  executionMode: 'ASYNC_LONG_RUNNING',
  stateRequirements: {
    persistsAcrossInvocations: true,
    stateShape: 'agent.hvac-repair-replace.state@1.0.0',
  },
  outputContract: {
    contractId: 'decision-platform.hvac-repair-replace-projection@1.0.0',
    producerCommandsAllowed: ['HVAC_DECISION_START', 'HVAC_DECISION_CONTINUE'],
    producesRecommendation: true,
    maxAutonomyLevel: 2,
  },
  budgets: {
    maxContextFactsPerRun: 100,
    maxLLMInvocationsPerRun: 1,
    maxLLMCostPerRunUsd: 0.25,
    maxExecutionMsPerRun: 30_000,
    maxLoopIterations: 8,
  },
  killSwitch: 'AGENT_HVAC_REPAIR_REPLACE_KILL_SWITCH',
  featureFlag: 'AGENT_HVAC_REPAIR_REPLACE_ENABLED',
  // PR 11 / IPD-005: trigger handler (PR 10) and evaluation suite are both
  // AVAILABLE. Version 1.0.0 had not shipped to any environment or user, so it
  // is finalized here rather than bumped; the digest baseline is regenerated.
  releaseState: 'ENABLED',
  retryPolicy: { maxAttempts: 2, backoffMs: 250 },
  timeoutMs: 30_000,
  escalationPolicy: {
    onLowConfidence: 'ASK_HOMEOWNER',
    onToolFailure: 'ABSTAIN',
    onLoopBudgetExhausted: 'ABSTAIN_WITH_PARTIAL_RESULT',
  },
  auditRequirements: { logEveryToolCall: true, logEveryStateTransition: true },
  safetyLevel: 'DRAFT',
  evaluationSuiteId: 'agent-hvac-repair-replace-eval@1.0.0',
} satisfies AgentDefinition);

// Phase 4A: the same bounded loop now serves the HVAC and admitted
// GENERIC_APPLIANCE profiles. Keep 1.0.0 registered for pinned continuations;
// new runs use this behavior-bearing version.
export const REPAIR_REPLACE_AGENT_DEFINITION_V1_1 = Object.freeze({
  ...HVAC_REPAIR_REPLACE_AGENT_DEFINITION,
  version: '1.1.0',
  name: 'Repair-or-Replace Specialist',
  responsibility: 'Help a homeowner complete an admitted repair-or-replace decision using the authoritative Decision Platform workflow selected by its RepairReplaceProfile.',
  requiredContext: ['SYSTEMS', 'INVENTORY', 'MAINTENANCE', 'SAFETY'],
  allowedSkills: [{
    id: 'repair-replace',
    version: '1.0.0',
    operations: ['REPLACEMENT_GUIDANCE', 'HVAC_DECISION_START', 'HVAC_DECISION_CONTINUE'],
  }],
  stateRequirements: {
    persistsAcrossInvocations: true,
    stateShape: 'agent.repair-replace.state@1.1.0',
  },
  outputContract: {
    contractId: 'decision-platform.repair-replace-projection@1.1.0',
    producerCommandsAllowed: ['REPLACEMENT_GUIDANCE', 'HVAC_DECISION_START', 'HVAC_DECISION_CONTINUE'],
    producesRecommendation: true,
    maxAutonomyLevel: 2,
  },
} satisfies AgentDefinition);

// Phase 2 audit: bind new invocations to the corrected evaluation contract.
// 1.0.0 and 1.1.0 remain immutable and registered for pinned continuations.
export const REPAIR_REPLACE_AGENT_DEFINITION_V1_2 = Object.freeze({
  ...REPAIR_REPLACE_AGENT_DEFINITION_V1_1,
  version: '1.2.0',
  evaluationSuiteId: 'agent-hvac-repair-replace-eval@1.1.0',
} satisfies AgentDefinition);
