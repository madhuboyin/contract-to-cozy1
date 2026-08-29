import { createHash } from 'node:crypto';
import { PROPERTY_CONTEXT_SCOPES } from '../../modules/propertyContext/domain/contracts';
import { ASK_OPERATION_DEFINITIONS, type AskOperationId } from '../ask/askOperationRegistry';
import { getSkillAdapter } from '../skills/adapters/skillAdapterRegistry';
import { SKILL_EVALUATION_PACKAGES } from '../skills/skillEvaluationRegistry';
import { getSkillDefinition } from '../skills/skillRegistry';
import type {
  AgentDefinition,
  ReferencedAgentDefinitionVersion,
  VersionedAgentRegistryEntry,
} from './agent.contract';
import { AGENT_DEFINITION_DIGEST_BASELINE } from './agentDefinitionDigestBaseline';
import { AGENT_DEFINITION_REGISTRY } from './agentDefinitionRegistry';

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const RUNTIME_CONTROL_PATTERN = /^AGENT_[A-Z0-9_]+_(?:ENABLED|KILL_SWITCH)$/;

export type AgentDependencyReadiness = 'AVAILABLE' | 'PENDING';

export const AGENT_TRIGGER_HANDLER_REGISTRY: Readonly<Record<string, AgentDependencyReadiness>> = Object.freeze({
  // PR 10 implements the runtime entry point (agentTriggerRegistry.ts).
  'agent.hvac.home-action-engagement@1.0.0': 'AVAILABLE',
});

export const AGENT_OUTPUT_CONTRACT_REGISTRY: Readonly<Record<string, AgentDependencyReadiness>> = Object.freeze({
  'decision-platform.hvac-repair-replace-projection@1.0.0': 'AVAILABLE',
  'decision-platform.repair-replace-projection@1.1.0': 'AVAILABLE',
});

export const AGENT_EVALUATION_SUITE_REGISTRY: Readonly<Record<string, AgentDependencyReadiness>> = Object.freeze({
  // PR 11 / IPD-005: hvacSpecialistEvaluation.ts is the checked-in fixture
  // contract; hvacSpecialistEvaluation.test.js runs it in CI.
  'agent-hvac-repair-replace-eval@1.0.0': 'AVAILABLE',
  // IPD-006: deterministic, versioned APPLIANCE-only corpus.
  'agent-generic-appliance-repair-replace-eval@1.0.0': 'AVAILABLE',
});

export const AGENT_PLATFORM_BUDGET_MAXIMUMS = Object.freeze({
  maxContextFactsPerRun: 250,
  maxLLMInvocationsPerRun: 5,
  maxLLMCostPerRunUsd: 2,
  maxExecutionMsPerRun: 120_000,
  maxLoopIterations: 25,
});

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]));
  }
  return value;
}

export function canonicalAgentDefinitionJson(definition: AgentDefinition): string {
  return JSON.stringify(canonicalize(definition));
}

export function digestAgentDefinition(definition: AgentDefinition): string {
  return createHash('sha256').update(canonicalAgentDefinitionJson(definition)).digest('hex');
}

function dependencyIssue(
  key: string,
  kind: string,
  reference: string,
  readiness: AgentDependencyReadiness | undefined,
  releaseState: AgentDefinition['releaseState'],
): string | null {
  if (!readiness) return `${key}: missing ${kind} ${reference}`;
  if (readiness === 'PENDING' && releaseState !== 'DEV') return `${key}: ${kind} ${reference} is pending and permits only DEV release state`;
  return null;
}

export interface AgentRegistryValidationDependencies {
  triggerHandlers?: Readonly<Record<string, AgentDependencyReadiness>>;
  outputContracts?: Readonly<Record<string, AgentDependencyReadiness>>;
  evaluationSuites?: Readonly<Record<string, AgentDependencyReadiness>>;
  digestBaseline?: Readonly<Record<string, string>>;
}

export function validateAgentDefinitionRegistry(
  registry: Readonly<Record<string, VersionedAgentRegistryEntry>> = AGENT_DEFINITION_REGISTRY,
  dependencies: AgentRegistryValidationDependencies = {},
): string[] {
  const issues: string[] = [];
  const triggerHandlers = dependencies.triggerHandlers ?? AGENT_TRIGGER_HANDLER_REGISTRY;
  const outputContracts = dependencies.outputContracts ?? AGENT_OUTPUT_CONTRACT_REGISTRY;
  const evaluationSuites = dependencies.evaluationSuites ?? AGENT_EVALUATION_SUITE_REGISTRY;
  const digestBaseline = dependencies.digestBaseline ?? AGENT_DEFINITION_DIGEST_BASELINE;
  const contextScopes = new Set<string>(PROPERTY_CONTEXT_SCOPES);

  for (const [agentKey, entry] of Object.entries(registry)) {
    if (!entry.versions[entry.activeVersion]) issues.push(`${agentKey}: activeVersion ${entry.activeVersion} is not registered`);
    for (const [versionKey, definition] of Object.entries(entry.versions)) {
      const key = `${agentKey}@${versionKey}`;
      if (agentKey !== definition.agentId) issues.push(`${key}: agentId mismatch`);
      if (versionKey !== definition.version) issues.push(`${key}: version key mismatch`);
      if (!SEMVER_PATTERN.test(definition.version) || !SEMVER_PATTERN.test(definition.definitionSchemaVersion)) issues.push(`${key}: invalid semantic version`);
      if (!definition.name.trim() || !definition.responsibility.trim()) issues.push(`${key}: missing required metadata`);
      if (!definition.supportedDomains.length || !definition.acceptedTriggers.length) issues.push(`${key}: missing supported domain or trigger`);
      if (!RUNTIME_CONTROL_PATTERN.test(definition.featureFlag) || !definition.featureFlag.endsWith('_ENABLED')) issues.push(`${key}: invalid feature flag ${definition.featureFlag}`);
      if (!RUNTIME_CONTROL_PATTERN.test(definition.killSwitch) || !definition.killSwitch.endsWith('_KILL_SWITCH')) issues.push(`${key}: invalid kill switch ${definition.killSwitch}`);

      const triggerBindings = new Map(definition.triggerBindings.map((binding) => [binding.trigger, binding]));
      for (const trigger of definition.acceptedTriggers) {
        const binding = triggerBindings.get(trigger);
        if (!binding) {
          issues.push(`${key}: accepted trigger ${trigger} has no handler binding`);
          continue;
        }
        const handlerRef = `${binding.handlerId}@${binding.handlerVersion}`;
        const issue = dependencyIssue(key, 'trigger handler', handlerRef, triggerHandlers[handlerRef], definition.releaseState);
        if (issue) issues.push(issue);
      }
      for (const binding of definition.triggerBindings) {
        if (!definition.acceptedTriggers.includes(binding.trigger)) issues.push(`${key}: handler binding for undeclared trigger ${binding.trigger}`);
      }

      for (const scope of definition.requiredContext) {
        if (!contextScopes.has(scope)) issues.push(`${key}: unknown Property Context scope ${scope}`);
      }
      if (!definition.allowedSkills.length) issues.push(`${key}: no allowed Skills`);
      for (const reference of definition.allowedSkills) {
        const skill = getSkillDefinition(reference.id);
        if (!skill || skill.version !== reference.version) {
          issues.push(`${key}: missing Skill ${reference.id}@${reference.version}`);
          continue;
        }
        if (!SKILL_EVALUATION_PACKAGES[skill.evaluationSuite]) issues.push(`${key}: Skill ${reference.id} has no registered evaluation package`);
        if (skill.autonomyLevel > definition.outputContract.maxAutonomyLevel) issues.push(`${key}: Skill ${reference.id} exceeds agent autonomy ceiling`);
        if (!reference.operations.length) issues.push(`${key}: Skill ${reference.id} has no allowed operations`);
        for (const operationId of reference.operations) {
          const skillOperation = skill.operations.find((operation) => operation.operationId === operationId);
          const operation = ASK_OPERATION_DEFINITIONS[operationId];
          if (!skillOperation || !operation || skillOperation.version !== operation.version) {
            issues.push(`${key}: missing or incompatible operation ${operationId} on Skill ${reference.id}`);
            continue;
          }
          const adapterReference = skill.allowedAdapters.find((adapter) => adapter.id === operation.adapterKey);
          if (!adapterReference || !getSkillAdapter(adapterReference.id, adapterReference.version)) {
            issues.push(`${key}: operation ${operationId} has no registered allowed adapter`);
          }
        }
      }
      for (const prohibited of definition.prohibitedSkills ?? []) {
        if (definition.allowedSkills.some((allowed) => allowed.id === prohibited.id && allowed.version === prohibited.version)) issues.push(`${key}: Skill ${prohibited.id}@${prohibited.version} is both allowed and prohibited`);
      }

      const outputIssue = dependencyIssue(key, 'output contract', definition.outputContract.contractId, outputContracts[definition.outputContract.contractId], definition.releaseState);
      if (outputIssue) issues.push(outputIssue);
      const allowedOperationIds = new Set(definition.allowedSkills.flatMap((skill) => skill.operations));
      for (const command of definition.outputContract.producerCommandsAllowed) {
        if (!allowedOperationIds.has(command as AskOperationId)) issues.push(`${key}: producer command ${command} is not an allowed Skill operation`);
      }
      if (![0, 1, 2].includes(definition.outputContract.maxAutonomyLevel)) issues.push(`${key}: autonomy ceiling exceeds platform maximum`);
      if (definition.outputContract.maxAutonomyLevel === 2 && definition.safetyLevel !== 'DRAFT') issues.push(`${key}: autonomy level 2 requires DRAFT safety level`);

      for (const [budgetName, maximum] of Object.entries(AGENT_PLATFORM_BUDGET_MAXIMUMS)) {
        const value = definition.budgets[budgetName as keyof AgentDefinition['budgets']];
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum) issues.push(`${key}: invalid budget ${budgetName}`);
      }
      if (!Number.isInteger(definition.budgets.maxContextFactsPerRun) || !Number.isInteger(definition.budgets.maxLLMInvocationsPerRun) || !Number.isInteger(definition.budgets.maxLoopIterations)) issues.push(`${key}: count budgets must be integers`);
      if (!Number.isInteger(definition.retryPolicy.maxAttempts) || definition.retryPolicy.maxAttempts < 0 || definition.retryPolicy.maxAttempts > 5) issues.push(`${key}: invalid retry maxAttempts`);
      if (!Number.isInteger(definition.retryPolicy.backoffMs) || definition.retryPolicy.backoffMs < 0 || definition.retryPolicy.backoffMs > 30_000) issues.push(`${key}: invalid retry backoffMs`);
      if (!Number.isInteger(definition.timeoutMs) || definition.timeoutMs <= 0 || definition.timeoutMs > definition.budgets.maxExecutionMsPerRun) issues.push(`${key}: invalid timeoutMs`);
      if (!definition.auditRequirements.logEveryToolCall || !definition.auditRequirements.logEveryStateTransition) issues.push(`${key}: required audit logging cannot be disabled`);

      const evaluationIssue = dependencyIssue(key, 'evaluation suite', definition.evaluationSuiteId, evaluationSuites[definition.evaluationSuiteId], definition.releaseState);
      if (evaluationIssue) issues.push(evaluationIssue);
      const expectedDigest = digestBaseline[key];
      const actualDigest = digestAgentDefinition(definition);
      if (!expectedDigest) issues.push(`${key}: missing canonical digest baseline`);
      else if (expectedDigest !== actualDigest) issues.push(`${key}: canonical digest changed under an immutable version`);
    }
  }
  return issues;
}

export function validateReferencedAgentDefinitionVersions(
  references: readonly ReferencedAgentDefinitionVersion[],
  registry: Readonly<Record<string, VersionedAgentRegistryEntry>> = AGENT_DEFINITION_REGISTRY,
): string[] {
  return references.flatMap((reference) => registry[reference.agentId]?.versions[reference.version]
    ? []
    : [`${reference.source}:${reference.sourceId}: pinned definition ${reference.agentId}@${reference.version} is not registered`]);
}
