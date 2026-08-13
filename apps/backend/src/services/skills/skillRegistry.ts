import {
  ASK_OPERATION_DEFINITIONS,
  getAskOperationDefinition,
  type AskOperationId,
  type AskPropertyRoleFloor,
} from '../ask/askOperationRegistry';
import type {
  EffectiveSkillOperationPolicy,
  SkillConsumer,
  SkillDefinition,
} from './skill.contract';
import { MAINTENANCE_SKILL } from './maintenance';

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const ROLE_RANK: Record<Exclude<AskPropertyRoleFloor, null>, number> = { VIEWER: 1, CONTRIBUTOR: 2, OWNER: 3 };
const PLATFORM_CONTEXT_BUDGET_MAXIMUMS = Object.freeze({
  maxFacts: 100,
  maxEntities: 50,
  maxDocuments: 10,
  maxHistoryEvents: 200,
  maxSerializedBytes: 256_000,
  maxProviderLatencyMs: 10_000,
  maxOverallLatencyMs: 30_000,
});

export const SKILL_DEFINITIONS = Object.freeze({
  maintenance: MAINTENANCE_SKILL,
} satisfies Readonly<Record<string, SkillDefinition>>);

export type SkillId = keyof typeof SKILL_DEFINITIONS;

const skillByOperation = new Map<AskOperationId, SkillDefinition>();
for (const skill of Object.values(SKILL_DEFINITIONS)) {
  for (const operation of skill.operations) skillByOperation.set(operation.operationId, skill);
}

export function getSkillDefinition(skillId: string): SkillDefinition | undefined {
  return SKILL_DEFINITIONS[skillId as SkillId];
}

export function getSkillForOperation(operationId: AskOperationId): SkillDefinition | undefined {
  return skillByOperation.get(operationId);
}

function stricterRole(left: AskPropertyRoleFloor, right: AskPropertyRoleFloor): AskPropertyRoleFloor {
  if (left == null) return right;
  if (right == null) return left;
  return ROLE_RANK[left] >= ROLE_RANK[right] ? left : right;
}

export function resolveEffectiveSkillOperationPolicy(
  skillId: string,
  operationId: AskOperationId,
  consumer: SkillConsumer,
): EffectiveSkillOperationPolicy | null {
  const skill = getSkillDefinition(skillId);
  if (!skill || skill.operationalStatus !== 'ENABLED') return null;
  const operationReference = skill.operations.find((candidate) => candidate.operationId === operationId);
  const consumerPolicy = skill.consumerPolicy.find((candidate) => candidate.consumer === consumer);
  if (!operationReference || !consumerPolicy?.operations.includes(operationId)) return null;

  const operation = getAskOperationDefinition(operationId);
  if (operationReference.version !== operation.version) return null;
  if (!skill.allowedAdapters.some((adapter) => adapter.id === operation.adapterKey)) return null;

  return {
    skillId: skill.id,
    skillVersion: skill.version,
    operationId,
    operationVersion: operation.version,
    consumer,
    authorizationFloor: stricterRole(skill.authorizationFloor, operation.propertyRoleFloor),
    adapterKey: operation.adapterKey,
    allowedResultBlocks: operation.allowedBlockTypes.filter((block) => skill.allowedResultBlocks.includes(block)),
    riskPolicy: skill.riskPolicy,
  };
}

export function validateSkillDefinitions(
  definitions: Readonly<Record<string, SkillDefinition>> = SKILL_DEFINITIONS,
  registeredContextProviders: ReadonlySet<string> = new Set(),
  registeredExternalConnectors: ReadonlySet<string> = new Set(),
): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const operationOwners = new Map<AskOperationId, string>();

  for (const [key, skill] of Object.entries(definitions)) {
    if (key !== skill.id) issues.push(`${key}: Skill id mismatch`);
    if (ids.has(skill.id)) issues.push(`${key}: duplicate Skill id`);
    ids.add(skill.id);
    if (!SEMVER_PATTERN.test(skill.version)) issues.push(`${key}: invalid Skill semantic version`);
    if (!skill.displayName || !skill.description || !skill.owner || !skill.evaluationSuite) issues.push(`${key}: missing required metadata`);
    if (!skill.featureFlag || !skill.killSwitch) issues.push(`${key}: missing runtime controls`);
    if (!skill.homeownerJobs.length || !skill.supportedGoals.length || !skill.aliases.length) issues.push(`${key}: missing semantic routing metadata`);
    if (!skill.operations.length) issues.push(`${key}: no registered operations`);
    if (!skill.allowedResultBlocks.length) issues.push(`${key}: no allowed result blocks`);
    if (!skill.consumerPolicy.length) issues.push(`${key}: no consumer policy`);

    for (const operationReference of skill.operations) {
      const operation = ASK_OPERATION_DEFINITIONS[operationReference.operationId];
      if (!operation) {
        issues.push(`${key}: unknown operation ${operationReference.operationId}`);
        continue;
      }
      if (operationReference.version !== operation.version) issues.push(`${key}: incompatible operation version ${operationReference.operationId}@${operationReference.version}`);
      const existingOwner = operationOwners.get(operationReference.operationId);
      if (existingOwner) issues.push(`${key}: operation ${operationReference.operationId} already belongs to ${existingOwner}`);
      else operationOwners.set(operationReference.operationId, key);
      if (!skill.allowedAdapters.some((adapter) => adapter.id === operation.adapterKey)) issues.push(`${key}: operation ${operationReference.operationId} uses undeclared adapter ${operation.adapterKey}`);
      for (const block of operation.allowedBlockTypes) {
        if (!skill.allowedResultBlocks.includes(block)) issues.push(`${key}: operation ${operationReference.operationId} uses undeclared result block ${block}`);
      }
      if (skill.authorizationFloor && operation.propertyRoleFloor && ROLE_RANK[skill.authorizationFloor] > ROLE_RANK[operation.propertyRoleFloor]) {
        issues.push(`${key}: Skill authorization floor is stricter than operation ${operationReference.operationId}`);
      }
    }

    for (const consumer of skill.consumerPolicy) {
      for (const operationId of consumer.operations) {
        if (!skill.operations.some((operation) => operation.operationId === operationId)) issues.push(`${key}: consumer ${consumer.consumer} references undeclared operation ${operationId}`);
      }
    }
    for (const provider of [...skill.requiredContextProviders, ...skill.optionalContextProviders]) {
      if (!registeredContextProviders.has(`${provider.id}@${provider.version}`)) issues.push(`${key}: unknown context provider ${provider.id}@${provider.version}`);
    }
    for (const connector of skill.allowedExternalConnectors) {
      if (!registeredExternalConnectors.has(`${connector.id}@${connector.version}`)) issues.push(`${key}: unknown external connector ${connector.id}@${connector.version}`);
    }
    for (const [budgetName, maximum] of Object.entries(PLATFORM_CONTEXT_BUDGET_MAXIMUMS)) {
      const value = skill.contextBudget[budgetName as keyof typeof skill.contextBudget];
      if (!Number.isInteger(value) || value < 0 || value > maximum) issues.push(`${key}: invalid context budget ${budgetName}`);
    }
    if (skill.contextBudget.maxOverallLatencyMs < skill.contextBudget.maxProviderLatencyMs) issues.push(`${key}: overall latency budget is below provider latency budget`);
    for (const dependency of skill.dependencies) {
      if (dependency.type === 'OPERATION_CONTRACT' && !ASK_OPERATION_DEFINITIONS[dependency.id as AskOperationId]) issues.push(`${key}: unknown operation dependency ${dependency.id}`);
      if (dependency.id === skill.id) issues.push(`${key}: self dependency is prohibited`);
    }
  }
  return issues;
}
