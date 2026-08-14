import { getAskOperationDefinition, type AskOperationId, type AskPropertyRoleFloor } from '../ask/askOperationRegistry';
import type { SkillConsumer, SkillDefinition, SkillDomain, SkillLifecycleStatus } from './skill.contract';
import { resolveEffectiveSkillOperationPolicy, SKILL_DEFINITIONS } from './skillRegistry';

export interface DiscoverableSkillOperation {
  id: string;
  version: string;
  family: string;
  authorizationFloor: AskPropertyRoleFloor;
}

export interface DiscoverableSkill {
  id: string;
  version: string;
  domain: SkillDomain;
  displayName: string;
  description: string;
  lifecycleStatus: SkillLifecycleStatus;
  operations: readonly DiscoverableSkillOperation[];
}

export interface SkillCatalogControls {
  skillEnabled?: (skillId: string) => boolean;
  operationEnabled?: (operationId: AskOperationId) => boolean;
}

function isRuntimeDiscoverable(skill: SkillDefinition, skillEnabled: (skillId: string) => boolean): boolean {
  return skill.lifecycleStatus !== 'RETIRED'
    && skill.operationalStatus === 'ENABLED'
    && skillEnabled(skill.id);
}

/**
 * Returns executable Skill identity and operation policy for one consumer.
 * Product destinations remain owned by the Capability Registry and are
 * intentionally absent from this projection.
 */
export function listDiscoverableSkills(
  consumer: SkillConsumer,
  controls: SkillCatalogControls = {},
): readonly DiscoverableSkill[] {
  const skillEnabled = controls.skillEnabled ?? (() => true);
  const operationEnabled = controls.operationEnabled ?? (() => true);
  return (Object.values(SKILL_DEFINITIONS) as SkillDefinition[])
    .filter((skill) => isRuntimeDiscoverable(skill, skillEnabled))
    .flatMap((skill) => {
      const operations = skill.operations.flatMap((reference) => {
        if (!operationEnabled(reference.operationId)) return [];
        const policy = resolveEffectiveSkillOperationPolicy(skill.id, reference.operationId, consumer);
        if (!policy) return [];
        const operation = getAskOperationDefinition(reference.operationId);
        return [Object.freeze({
          id: operation.operationId,
          version: operation.version,
          family: operation.family,
          authorizationFloor: policy.authorizationFloor,
        })];
      }).sort((left, right) => left.id.localeCompare(right.id));
      if (!operations.length) return [];
      return [Object.freeze({
        id: skill.id,
        version: skill.version,
        domain: skill.domain,
        displayName: skill.displayName,
        description: skill.description,
        lifecycleStatus: skill.lifecycleStatus,
        operations: Object.freeze(operations),
      })];
    })
    .sort((left, right) => left.domain.localeCompare(right.domain) || left.id.localeCompare(right.id));
}
