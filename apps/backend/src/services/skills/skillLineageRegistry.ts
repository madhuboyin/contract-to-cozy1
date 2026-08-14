import type { SkillDefinition, SkillDomain, SkillLifecycleStatus } from './skill.contract';
import { SKILL_DEFINITIONS } from './skillRegistry';

export interface SkillLineageOperation {
  id: string;
  version: string;
}

/**
 * Minimized, non-executable identity retained for historical reads.
 * It intentionally excludes adapters, providers, policies, controls, and
 * dependencies so resolving lineage can never reactivate a retired Skill.
 */
export interface SkillLineageMetadata {
  id: string;
  version: string;
  domain: SkillDomain;
  displayName: string;
  owner: string;
  lifecycleStatus: SkillLifecycleStatus;
  operations: readonly SkillLineageOperation[];
  supersededByVersion: string | null;
}

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const OPERATION_VERSION_PATTERN = /^\d+\.\d+$/;

export function skillLineageKey(reference: { id: string; version: string }): string {
  return `${reference.id}@${reference.version}`;
}

function currentLineage(skill: SkillDefinition): SkillLineageMetadata {
  return Object.freeze({
    id: skill.id,
    version: skill.version,
    domain: skill.domain,
    displayName: skill.displayName,
    owner: skill.owner,
    lifecycleStatus: skill.lifecycleStatus,
    operations: Object.freeze(skill.operations.map((operation) => Object.freeze({
      id: operation.operationId,
      version: operation.version,
    }))),
    supersededByVersion: null,
  });
}

function freezeLineage(entry: SkillLineageMetadata): SkillLineageMetadata {
  return Object.freeze({
    ...entry,
    operations: Object.freeze(entry.operations.map((operation) => Object.freeze({ ...operation }))),
  });
}

// Add a minimized entry here before removing an old manifest version. These
// records are historical identity only and are never added to Skill routing.
export const HISTORICAL_SKILL_LINEAGE: readonly SkillLineageMetadata[] = Object.freeze([]);

export function buildSkillLineageRegistry(
  currentDefinitions: Readonly<Record<string, SkillDefinition>> = SKILL_DEFINITIONS,
  historicalDefinitions: readonly SkillLineageMetadata[] = HISTORICAL_SKILL_LINEAGE,
): Readonly<Record<string, SkillLineageMetadata>> {
  const entries = [
    ...Object.values(currentDefinitions).map(currentLineage),
    ...historicalDefinitions.map(freezeLineage),
  ];
  return Object.freeze(Object.fromEntries(entries.map((entry) => [skillLineageKey(entry), entry])));
}

export const SKILL_LINEAGE_REGISTRY = buildSkillLineageRegistry();

export function getSkillLineageMetadata(id: string, version: string): SkillLineageMetadata | undefined {
  return SKILL_LINEAGE_REGISTRY[skillLineageKey({ id, version })];
}

export function validateSkillLineageRegistry(
  currentDefinitions: Readonly<Record<string, SkillDefinition>> = SKILL_DEFINITIONS,
  historicalDefinitions: readonly SkillLineageMetadata[] = HISTORICAL_SKILL_LINEAGE,
): string[] {
  const issues: string[] = [];
  const entries = [
    ...Object.values(currentDefinitions).map(currentLineage),
    ...historicalDefinitions,
  ];
  const seen = new Set<string>();
  const availableVersions = new Map<string, Set<string>>();
  for (const entry of entries) {
    const key = skillLineageKey(entry);
    if (seen.has(key)) issues.push(`${key}: duplicate Skill lineage version`);
    seen.add(key);
    if (!SEMVER_PATTERN.test(entry.version)) issues.push(`${key}: invalid Skill semantic version`);
    if (!entry.id || !entry.displayName || !entry.owner) issues.push(`${key}: incomplete historical identity`);
    if (!entry.operations.length) issues.push(`${key}: no historical operations`);
    const operationRefs = new Set<string>();
    for (const operation of entry.operations) {
      const operationRef = `${operation.id}@${operation.version}`;
      if (operationRefs.has(operationRef)) issues.push(`${key}: duplicate historical operation ${operationRef}`);
      operationRefs.add(operationRef);
      if (!operation.id.trim()) issues.push(`${key}: empty historical operation id`);
      if (!OPERATION_VERSION_PATTERN.test(operation.version)) issues.push(`${key}: invalid historical operation version ${operationRef}`);
    }
    const versions = availableVersions.get(entry.id) ?? new Set<string>();
    versions.add(entry.version);
    availableVersions.set(entry.id, versions);
  }

  for (const historical of historicalDefinitions) {
    const key = skillLineageKey(historical);
    if (historical.lifecycleStatus !== 'DEPRECATED' && historical.lifecycleStatus !== 'RETIRED') {
      issues.push(`${key}: historical metadata must be deprecated or retired`);
    }
    if (historical.supersededByVersion === historical.version) issues.push(`${key}: cannot supersede itself`);
    if (historical.supersededByVersion && !availableVersions.get(historical.id)?.has(historical.supersededByVersion)) {
      issues.push(`${key}: superseding version ${historical.supersededByVersion} is not registered`);
    }
  }

  for (const skill of Object.values(currentDefinitions)) {
    const key = skillLineageKey(skill);
    const lineage = entries.find((entry) => skillLineageKey(entry) === key);
    if (!lineage || lineage.domain !== skill.domain || lineage.displayName !== skill.displayName
      || lineage.owner !== skill.owner || lineage.lifecycleStatus !== skill.lifecycleStatus) {
      issues.push(`${key}: current manifest lineage mismatch`);
    }
  }
  return issues;
}
