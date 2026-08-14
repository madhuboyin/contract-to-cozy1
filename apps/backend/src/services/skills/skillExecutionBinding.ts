import { createHash } from 'node:crypto';
import type { AskOperationId } from '../ask/askOperationRegistry';
import type { SkillConsumer, SkillDefinition, VersionedSkillReference } from './skill.contract';
import { getSkillAdapter } from './adapters/skillAdapterRegistry';
import {
  SKILL_DEPENDENCY_ACTIVATIONS,
  SKILL_DEPENDENCY_CONTRACTS,
  skillDependencyContractKey,
  type ResolvedSkillDependency,
} from './skillDependencyRegistry';
import { getSkillDefinition, resolveEffectiveSkillOperationPolicy } from './skillRegistry';

export const SKILL_EXECUTION_BINDING_SCHEMA_VERSION = '1.1.0';

export interface SkillExecutionBinding {
  schemaVersion: typeof SKILL_EXECUTION_BINDING_SCHEMA_VERSION;
  skill: { id: string; version: string; domain: string };
  operation: { id: AskOperationId; version: string };
  consumer: SkillConsumer;
  effectivePolicyVersion: string;
  adapter: VersionedSkillReference;
  contextProviders: readonly (VersionedSkillReference & { required: boolean })[];
  dependencyActivation: {
    status: 'RESOLVED' | 'DEGRADED';
    dependencies: readonly ResolvedSkillDependency[];
    missing: readonly SkillDefinition['dependencies'][number][];
  };
  routing: {
    path: string;
    reasonCodes: readonly string[];
    semanticIndexVersion: string | null;
  };
}

export type SkillExecutionBindingValidation =
  | { valid: true; binding: SkillExecutionBinding }
  | { valid: false; reasonCode: 'ASK_SKILL_VERSION_UNAVAILABLE' | 'ASK_SKILL_POLICY_MISMATCH' | 'ASK_SKILL_DEPENDENCY_UNAVAILABLE' };

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]));
  }
  return value;
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

function operationProviders(skill: SkillDefinition, operationId: AskOperationId): SkillExecutionBinding['contextProviders'] {
  const operation = skill.operations.find((candidate) => candidate.operationId === operationId);
  if (!operation) return [];
  const providers = new Map<string, VersionedSkillReference & { required: boolean }>();
  for (const provider of operation.requiredContextProviders ?? []) {
    providers.set(`${provider.id}@${provider.version}`, { ...provider, required: true });
  }
  for (const provider of operation.optionalContextProviders ?? []) {
    const key = `${provider.id}@${provider.version}`;
    if (!providers.has(key)) providers.set(key, { ...provider, required: false });
  }
  return [...providers.values()].sort((left, right) => left.id.localeCompare(right.id) || left.version.localeCompare(right.version));
}

function effectivePolicyVersion(skillId: string, operationId: AskOperationId, consumer: SkillConsumer): string | null {
  const policy = resolveEffectiveSkillOperationPolicy(skillId, operationId, consumer);
  return policy ? digest(policy) : null;
}

export function buildSkillExecutionBinding(input: {
  skill: SkillDefinition;
  operationId: AskOperationId;
  consumer: SkillConsumer;
  routingPath: string;
  routingReasonCodes: readonly string[];
  semanticIndexVersion: string | null;
}): SkillExecutionBinding {
  const operation = input.skill.operations.find((candidate) => candidate.operationId === input.operationId);
  if (!operation) throw new Error(`Skill ${input.skill.id} does not own operation ${input.operationId}.`);
  const policyVersion = effectivePolicyVersion(input.skill.id, input.operationId, input.consumer);
  if (!policyVersion) throw new Error(`Skill policy is unavailable for ${input.skill.id}/${input.operationId}/${input.consumer}.`);
  const adapterId = resolveEffectiveSkillOperationPolicy(input.skill.id, input.operationId, input.consumer)!.adapterKey;
  const adapterReference = input.skill.allowedAdapters.find((candidate) => candidate.id === adapterId);
  const adapter = adapterReference && getSkillAdapter(adapterReference.id, adapterReference.version);
  if (!adapterReference || !adapter) throw new Error(`Skill adapter is unavailable for ${input.skill.id}/${input.operationId}.`);
  const dependencyActivation = SKILL_DEPENDENCY_ACTIVATIONS[input.skill.id];
  if (!dependencyActivation || dependencyActivation.skillVersion !== input.skill.version || dependencyActivation.status === 'UNAVAILABLE') {
    throw Object.assign(new Error(`Skill dependencies are unavailable for ${input.skill.id}@${input.skill.version}.`), {
      code: 'ASK_SKILL_DEPENDENCY_UNAVAILABLE',
    });
  }

  return Object.freeze({
    schemaVersion: SKILL_EXECUTION_BINDING_SCHEMA_VERSION,
    skill: Object.freeze({ id: input.skill.id, version: input.skill.version, domain: input.skill.domain }),
    operation: Object.freeze({ id: input.operationId, version: operation.version }),
    consumer: input.consumer,
    effectivePolicyVersion: policyVersion,
    adapter: Object.freeze({ id: adapter.id, version: adapter.version }),
    contextProviders: Object.freeze(operationProviders(input.skill, input.operationId).map((provider) => Object.freeze(provider))),
    dependencyActivation: Object.freeze({
      status: dependencyActivation.status,
      dependencies: Object.freeze(dependencyActivation.dependencies.map((dependency) => Object.freeze({ ...dependency }))),
      missing: Object.freeze(dependencyActivation.missing.map((dependency) => Object.freeze({ ...dependency }))),
    }),
    routing: Object.freeze({
      path: input.routingPath,
      reasonCodes: Object.freeze([...new Set(input.routingReasonCodes)].sort()),
      semanticIndexVersion: input.semanticIndexVersion,
    }),
  });
}

function isBinding(value: unknown): value is SkillExecutionBinding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const binding = value as Partial<SkillExecutionBinding>;
  return binding.schemaVersion === SKILL_EXECUTION_BINDING_SCHEMA_VERSION
    && Boolean(binding.skill && typeof binding.skill.id === 'string' && typeof binding.skill.version === 'string')
    && Boolean(binding.operation && typeof binding.operation.id === 'string' && typeof binding.operation.version === 'string')
    && Boolean(binding.adapter && typeof binding.adapter.id === 'string' && typeof binding.adapter.version === 'string')
    && Array.isArray(binding.contextProviders)
    && Boolean(binding.dependencyActivation
      && (binding.dependencyActivation.status === 'RESOLVED' || binding.dependencyActivation.status === 'DEGRADED')
      && Array.isArray(binding.dependencyActivation.dependencies)
      && Array.isArray(binding.dependencyActivation.missing))
    && typeof binding.effectivePolicyVersion === 'string'
    && typeof binding.consumer === 'string';
}

export function validateSkillExecutionBinding(value: unknown): SkillExecutionBindingValidation {
  if (!isBinding(value)) return { valid: false, reasonCode: 'ASK_SKILL_VERSION_UNAVAILABLE' };
  const skill = getSkillDefinition(value.skill.id);
  const operation = skill?.operations.find((candidate) => candidate.operationId === value.operation.id);
  if (!skill || skill.version !== value.skill.version || skill.domain !== value.skill.domain
    || !operation || operation.version !== value.operation.version) {
    return { valid: false, reasonCode: 'ASK_SKILL_VERSION_UNAVAILABLE' };
  }
  const currentPolicy = resolveEffectiveSkillOperationPolicy(skill.id, value.operation.id, value.consumer);
  const currentPolicyVersion = currentPolicy ? digest(currentPolicy) : null;
  if (!currentPolicyVersion || currentPolicyVersion !== value.effectivePolicyVersion) {
    return { valid: false, reasonCode: 'ASK_SKILL_POLICY_MISMATCH' };
  }
  const adapterReference = skill.allowedAdapters.find((candidate) => candidate.id === currentPolicy!.adapterKey);
  const adapter = getSkillAdapter(value.adapter.id, value.adapter.version);
  if (!adapterReference || !adapter || adapter.id !== adapterReference.id || adapter.version !== adapterReference.version) {
    return { valid: false, reasonCode: 'ASK_SKILL_VERSION_UNAVAILABLE' };
  }
  if (digest(value.contextProviders) !== digest(operationProviders(skill, value.operation.id))) {
    return { valid: false, reasonCode: 'ASK_SKILL_VERSION_UNAVAILABLE' };
  }
  const pinnedDeclarations = [
    ...value.dependencyActivation.dependencies.map(({ type, id, requestedVersion: version, required }) => ({ type, id, version, required })),
    ...value.dependencyActivation.missing.map(({ type, id, version, required }) => ({ type, id, version, required })),
  ].sort((left, right) => left.type.localeCompare(right.type) || left.id.localeCompare(right.id));
  const currentDeclarations = [...skill.dependencies]
    .map(({ type, id, version, required }) => ({ type, id, version, required }))
    .sort((left, right) => left.type.localeCompare(right.type) || left.id.localeCompare(right.id));
  const expectedDependencyStatus = value.dependencyActivation.missing.length ? 'DEGRADED' : 'RESOLVED';
  const pinnedContractsAvailable = value.dependencyActivation.dependencies.every((dependency) => Boolean(
    SKILL_DEPENDENCY_CONTRACTS[skillDependencyContractKey({
      type: dependency.type,
      id: dependency.id,
      version: dependency.resolvedVersion,
    })],
  ));
  if (digest(pinnedDeclarations) !== digest(currentDeclarations)
    || value.dependencyActivation.status !== expectedDependencyStatus
    || value.dependencyActivation.missing.some((dependency) => dependency.required)
    || !pinnedContractsAvailable) {
    return { valid: false, reasonCode: 'ASK_SKILL_DEPENDENCY_UNAVAILABLE' };
  }
  return { valid: true, binding: value };
}
