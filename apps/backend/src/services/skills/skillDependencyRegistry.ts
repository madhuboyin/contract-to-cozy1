import { ASK_OPERATION_DEFINITIONS } from '../ask/askOperationRegistry';
import { SKILL_CONTEXT_PROVIDERS } from './context/skillContextProviderRegistry';
import type { SkillDefinition, SkillDependency, SkillDependencyType } from './skill.contract';
import { selectSkillDependencyVersion, isSupportedSkillDependencyVersionSpec } from './skillDependencyVersion';
import { SKILL_DEFINITIONS } from './skillRegistry';

export interface SkillDependencyContract {
  type: SkillDependencyType;
  id: string;
  version: string;
  owner: string;
}

export interface ResolvedSkillDependency extends Omit<SkillDependency, 'version'> {
  requestedVersion: string;
  resolvedVersion: string;
  owner: string;
}

export interface SkillDependencyResolution {
  skillId: string;
  skillVersion: string;
  status: 'RESOLVED' | 'DEGRADED' | 'UNAVAILABLE';
  dependencies: readonly ResolvedSkillDependency[];
  missing: readonly SkillDependency[];
}

const NON_REGISTRY_CONTRACTS: readonly SkillDependencyContract[] = Object.freeze(([
  { type: 'CANONICAL_SERVICE_CAPABILITY', id: 'property-record-overview', version: '1.0', owner: 'Property Record Overview' },
  { type: 'CANONICAL_SERVICE_CAPABILITY', id: 'home-inventory-read', version: '1.0', owner: 'InventoryService' },
  { type: 'CANONICAL_SERVICE_CAPABILITY', id: 'refinance-radar-analysis', version: '1.0', owner: 'Refinance Radar' },
  { type: 'CANONICAL_SERVICE_CAPABILITY', id: 'refinance-rate-monitor', version: '1.0', owner: 'Refinance Rate Monitor' },
  { type: 'CANONICAL_SERVICE_CAPABILITY', id: 'inventory-repair-replace-analysis', version: '1.0', owner: 'Inventory and ReplaceRepairService' },
  { type: 'CANONICAL_SERVICE_CAPABILITY', id: 'decision-platform-hvac-repair-replace', version: '1.0', owner: 'Decision Platform' },
  { type: 'CANONICAL_SERVICE_CAPABILITY', id: 'inspection-hub', version: '1.0', owner: 'InspectionHubService' },
  { type: 'CANONICAL_SERVICE_CAPABILITY', id: 'document-promotion-registry', version: '1.0', owner: 'Document Promotion Adapter Registry' },
] satisfies SkillDependencyContract[]).map((contract) => Object.freeze(contract)));

export function skillDependencyContractKey(contract: Pick<SkillDependencyContract, 'type' | 'id' | 'version'>): string {
  return `${contract.type}:${contract.id}@${contract.version}`;
}

function registeredContracts(): SkillDependencyContract[] {
  const operationContracts: SkillDependencyContract[] = Object.values(ASK_OPERATION_DEFINITIONS).map((operation) => ({
    type: 'OPERATION_CONTRACT', id: operation.operationId, version: operation.version, owner: 'Ask Operation Registry',
  }));
  const providerContracts: SkillDependencyContract[] = Object.values(SKILL_CONTEXT_PROVIDERS).map((provider) => ({
    type: 'CONTEXT_PROVIDER', id: provider.id, version: provider.version, owner: provider.canonicalOwner,
  }));
  return [...operationContracts, ...providerContracts, ...NON_REGISTRY_CONTRACTS];
}

export const SKILL_DEPENDENCY_CONTRACTS: Readonly<Record<string, SkillDependencyContract>> = Object.freeze(
  Object.fromEntries(registeredContracts().map((contract) => {
    const frozen = Object.freeze(contract);
    return [skillDependencyContractKey(frozen), frozen];
  })),
);

function candidatesFor(
  dependency: SkillDependency,
  contracts: Readonly<Record<string, SkillDependencyContract>>,
): SkillDependencyContract[] {
  return Object.values(contracts).filter((contract) => contract.type === dependency.type && contract.id === dependency.id);
}

export function resolveSkillDependencyContract(
  dependency: SkillDependency,
  contracts: Readonly<Record<string, SkillDependencyContract>> = SKILL_DEPENDENCY_CONTRACTS,
): SkillDependencyContract | undefined {
  const candidates = candidatesFor(dependency, contracts);
  const version = selectSkillDependencyVersion(dependency.version, candidates.map((candidate) => candidate.version));
  return version ? candidates.find((candidate) => candidate.version === version) : undefined;
}

export function resolveSkillDependencies(
  skill: SkillDefinition,
  contracts: Readonly<Record<string, SkillDependencyContract>> = SKILL_DEPENDENCY_CONTRACTS,
): SkillDependencyResolution {
  const dependencies: ResolvedSkillDependency[] = [];
  const missing: SkillDependency[] = [];
  for (const dependency of skill.dependencies) {
    const contract = resolveSkillDependencyContract(dependency, contracts);
    if (!contract) {
      missing.push(Object.freeze({ ...dependency }));
      continue;
    }
    dependencies.push(Object.freeze({
      type: dependency.type,
      id: dependency.id,
      requestedVersion: dependency.version,
      resolvedVersion: contract.version,
      required: dependency.required,
      owner: contract.owner,
    }));
  }
  dependencies.sort((left, right) => left.type.localeCompare(right.type) || left.id.localeCompare(right.id));
  const status = missing.some((dependency) => dependency.required)
    ? 'UNAVAILABLE'
    : missing.length ? 'DEGRADED' : 'RESOLVED';
  return Object.freeze({
    skillId: skill.id,
    skillVersion: skill.version,
    status,
    dependencies: Object.freeze(dependencies),
    missing: Object.freeze(missing),
  });
}

export const SKILL_DEPENDENCY_ACTIVATIONS: Readonly<Record<string, SkillDependencyResolution>> = Object.freeze(
  Object.fromEntries(Object.values(SKILL_DEFINITIONS).map((skill) => [skill.id, resolveSkillDependencies(skill)])),
);

export function validateSkillDependencyRegistry(
  definitions: Readonly<Record<string, SkillDefinition>> = SKILL_DEFINITIONS,
  contracts: Readonly<Record<string, SkillDependencyContract>> = SKILL_DEPENDENCY_CONTRACTS,
): string[] {
  const issues: string[] = [];
  const identities = new Set<string>();
  for (const [key, contract] of Object.entries(contracts)) {
    const expectedKey = skillDependencyContractKey(contract);
    if (key !== expectedKey) issues.push(`${key}: dependency contract key mismatch`);
    if (identities.has(expectedKey)) issues.push(`${key}: duplicate dependency contract`);
    identities.add(expectedKey);
    if (!contract.id || !contract.owner || !isSupportedSkillDependencyVersionSpec(contract.version) || contract.version.startsWith('^')) {
      issues.push(`${key}: invalid dependency contract`);
    }
  }
  for (const skill of Object.values(definitions)) {
    const declaredDependencies = new Set<string>();
    for (const dependency of skill.dependencies) {
      const identity = `${dependency.type}:${dependency.id}`;
      if (declaredDependencies.has(identity)) issues.push(`${skill.id}: duplicate dependency identity ${identity}`);
      declaredDependencies.add(identity);
      if (!isSupportedSkillDependencyVersionSpec(dependency.version)) {
        issues.push(`${skill.id}: unsupported dependency version specification ${dependency.type}:${dependency.id}@${dependency.version}`);
      }
    }
    const resolution = resolveSkillDependencies(skill, contracts);
    for (const dependency of resolution.missing.filter((candidate) => candidate.required)) {
      issues.push(`${skill.id}: unresolved required dependency ${dependency.type}:${dependency.id}@${dependency.version}`);
    }
  }
  return issues;
}
