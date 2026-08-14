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
import { REPAIR_REPLACE_SKILL } from './repairReplace';
import { REFINANCE_SKILL } from './refinance';
import { PROPERTY_RECORD_SKILL } from './propertyRecord';
import { CAPITAL_PLANNING_SKILL } from './capital-planning';
import { COVERAGE_SKILL } from './coverage';
import { HOUSEHOLD_SKILL } from './household';
import { OWNERSHIP_COST_SKILL } from './ownership-cost';
import { PROPERTY_TAX_SKILL } from './property-tax';
import { QUOTE_COMPARISON_SKILL } from './quote-comparison';
import { RENOVATION_SKILL } from './renovation';
import { SAVINGS_SKILL } from './savings';
import { SELL_HOLD_RENT_SKILL } from './sell-hold-rent';
import { SELLER_PREPARATION_SKILL } from './seller-preparation';
import { REGISTERED_SKILL_CONTEXT_PROVIDER_REFS } from './context/skillContextProviderRegistry';
import { REGISTERED_SKILL_ADAPTER_REFS } from './adapters/skillAdapterRegistry';
import { selectSkillDependencyVersion } from './skillDependencyVersion';

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const RUNTIME_CONTROL_PATTERN = /^ASK_SKILL_[A-Z0-9_]+_(?:ENABLED|KILL_SWITCH)$/;
const ROLE_RANK: Record<Exclude<AskPropertyRoleFloor, null>, number> = { VIEWER: 1, CONTRIBUTOR: 2, OWNER: 3 };
const SKILL_CONSUMERS: ReadonlySet<SkillConsumer> = new Set(['ASK', 'HOME_ACTIONS', 'CONCIERGE_HOME', 'PROACTIVE', 'NOTIFICATION_CONTINUATION']);
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
  'repair-replace': REPAIR_REPLACE_SKILL,
  refinance: REFINANCE_SKILL,
  'property-record': PROPERTY_RECORD_SKILL,
  'capital-planning': CAPITAL_PLANNING_SKILL,
  coverage: COVERAGE_SKILL,
  household: HOUSEHOLD_SKILL,
  'ownership-cost': OWNERSHIP_COST_SKILL,
  'property-tax': PROPERTY_TAX_SKILL,
  'quote-comparison': QUOTE_COMPARISON_SKILL,
  renovation: RENOVATION_SKILL,
  savings: SAVINGS_SKILL,
  'sell-hold-rent': SELL_HOLD_RENT_SKILL,
  'seller-preparation': SELLER_PREPARATION_SKILL,
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
  registeredContextProviders: ReadonlySet<string> = REGISTERED_SKILL_CONTEXT_PROVIDER_REFS,
  registeredExternalConnectors: ReadonlySet<string> = new Set(),
  registeredAdapters: ReadonlySet<string> = REGISTERED_SKILL_ADAPTER_REFS,
): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const operationOwners = new Map<AskOperationId, string>();
  const runtimeControls = new Map<string, string>();
  const registeredSkillIds = new Set(Object.values(definitions).map((skill) => skill.id));

  for (const [key, skill] of Object.entries(definitions)) {
    if (key !== skill.id) issues.push(`${key}: Skill id mismatch`);
    if (ids.has(skill.id)) issues.push(`${key}: duplicate Skill id`);
    ids.add(skill.id);
    if (!SEMVER_PATTERN.test(skill.version)) issues.push(`${key}: invalid Skill semantic version`);
    if (!skill.displayName || !skill.description || !skill.owner || !skill.evaluationSuite) issues.push(`${key}: missing required metadata`);
    if (!RUNTIME_CONTROL_PATTERN.test(skill.featureFlag) || !skill.featureFlag.endsWith('_ENABLED')) issues.push(`${key}: invalid feature flag ${skill.featureFlag || '(missing)'}`);
    if (!RUNTIME_CONTROL_PATTERN.test(skill.killSwitch) || !skill.killSwitch.endsWith('_KILL_SWITCH')) issues.push(`${key}: invalid kill switch ${skill.killSwitch || '(missing)'}`);
    for (const control of [skill.featureFlag, skill.killSwitch]) {
      const owner = runtimeControls.get(control);
      if (owner && owner !== key) issues.push(`${key}: runtime control ${control} already belongs to ${owner}`);
      else runtimeControls.set(control, key);
    }
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
      const declaredProviders = new Set([
        ...skill.requiredContextProviders,
        ...skill.optionalContextProviders,
      ].map((provider) => `${provider.id}@${provider.version}`));
      for (const provider of [
        ...(operationReference.requiredContextProviders ?? []),
        ...(operationReference.optionalContextProviders ?? []),
      ]) {
        const providerRef = `${provider.id}@${provider.version}`;
        if (!declaredProviders.has(providerRef)) issues.push(`${key}: operation ${operationReference.operationId} uses undeclared context provider ${providerRef}`);
      }
    }

    const declaredConsumers = new Set<SkillConsumer>();
    for (const consumer of skill.consumerPolicy) {
      if (!SKILL_CONSUMERS.has(consumer.consumer)) issues.push(`${key}: unknown consumer ${consumer.consumer}`);
      if (declaredConsumers.has(consumer.consumer)) issues.push(`${key}: duplicate consumer policy ${consumer.consumer}`);
      declaredConsumers.add(consumer.consumer);
      if (!consumer.operations.length) issues.push(`${key}: consumer ${consumer.consumer} has no operations`);
      const consumerOperations = new Set<AskOperationId>();
      for (const operationId of consumer.operations) {
        if (consumerOperations.has(operationId)) issues.push(`${key}: consumer ${consumer.consumer} duplicates operation ${operationId}`);
        consumerOperations.add(operationId);
        if (!skill.operations.some((operation) => operation.operationId === operationId)) issues.push(`${key}: consumer ${consumer.consumer} references undeclared operation ${operationId}`);
      }
    }
    for (const provider of [...skill.requiredContextProviders, ...skill.optionalContextProviders]) {
      if (!registeredContextProviders.has(`${provider.id}@${provider.version}`)) issues.push(`${key}: unknown context provider ${provider.id}@${provider.version}`);
    }
    for (const connector of skill.allowedExternalConnectors) {
      if (!registeredExternalConnectors.has(`${connector.id}@${connector.version}`)) issues.push(`${key}: unknown external connector ${connector.id}@${connector.version}`);
    }
    const adapterRefs = new Set<string>();
    for (const adapter of skill.allowedAdapters) {
      const adapterRef = `${adapter.id}@${adapter.version}`;
      if (adapterRefs.has(adapterRef)) issues.push(`${key}: duplicate allowed adapter ${adapterRef}`);
      adapterRefs.add(adapterRef);
      if (!registeredAdapters.has(`${adapter.id}@${adapter.version}`)) issues.push(`${key}: unknown adapter ${adapter.id}@${adapter.version}`);
      if (!skill.operations.some((operation) => ASK_OPERATION_DEFINITIONS[operation.operationId]?.adapterKey === adapter.id)) {
        issues.push(`${key}: adapter ${adapter.id} is not used by a declared operation`);
      }
    }
    for (const [budgetName, maximum] of Object.entries(PLATFORM_CONTEXT_BUDGET_MAXIMUMS)) {
      const value = skill.contextBudget[budgetName as keyof typeof skill.contextBudget];
      if (!Number.isInteger(value) || value < 0 || value > maximum) issues.push(`${key}: invalid context budget ${budgetName}`);
    }
    if (skill.contextBudget.maxOverallLatencyMs < skill.contextBudget.maxProviderLatencyMs) issues.push(`${key}: overall latency budget is below provider latency budget`);
    const dependencyRefs = new Set<string>();
    for (const dependency of skill.dependencies) {
      const dependencyRef = `${dependency.type}:${dependency.id}`;
      if (dependencyRefs.has(dependencyRef)) issues.push(`${key}: duplicate dependency ${dependencyRef}`);
      dependencyRefs.add(dependencyRef);
      if (registeredSkillIds.has(dependency.id)) issues.push(`${key}: executable Skill dependency ${dependency.id} is prohibited`);
      if (dependency.type === 'OPERATION_CONTRACT') {
        const operation = ASK_OPERATION_DEFINITIONS[dependency.id as AskOperationId];
        if (!operation) issues.push(`${key}: unknown operation dependency ${dependency.id}`);
        else if (!selectSkillDependencyVersion(dependency.version, [operation.version])) issues.push(`${key}: incompatible operation dependency ${dependency.id}@${dependency.version}`);
      }
      const contextProviderVersions = [...registeredContextProviders]
        .filter((reference) => reference.startsWith(`${dependency.id}@`))
        .map((reference) => reference.slice(reference.lastIndexOf('@') + 1));
      if (dependency.type === 'CONTEXT_PROVIDER' && !selectSkillDependencyVersion(dependency.version, contextProviderVersions)) {
        issues.push(`${key}: unknown context provider dependency ${dependency.id}@${dependency.version}`);
      }
    }
  }
  return issues;
}
