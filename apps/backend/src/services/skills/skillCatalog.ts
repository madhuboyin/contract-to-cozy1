import { getAskOperationDefinition, type AskPropertyRoleFloor } from '../ask/askOperationRegistry';
import type { SkillConsumer, SkillDefinition, SkillDomain, SkillLifecycleStatus } from './skill.contract';
import { resolveEffectiveSkillOperationPolicy, SKILL_DEFINITIONS } from './skillRegistry';
import { deriveSkillHealthForDefinition, type SkillHealthControls, type SkillHealthReasonCode, type SkillHealthStatus } from './skillHealth';

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
  health: Exclude<SkillHealthStatus, 'UNAVAILABLE' | 'DISABLED'>;
  healthReasonCodes: readonly SkillHealthReasonCode[];
  operations: readonly DiscoverableSkillOperation[];
}

export interface SkillCatalogControls extends SkillHealthControls {}

/**
 * Returns executable Skill identity and operation policy for one consumer.
 * Product destinations remain owned by the Capability Registry and are
 * intentionally absent from this projection.
 */
export function listDiscoverableSkills(
  consumer: SkillConsumer,
  controls: SkillCatalogControls = {},
): readonly DiscoverableSkill[] {
  return (Object.values(SKILL_DEFINITIONS) as SkillDefinition[])
    .flatMap((skill) => {
      const health = deriveSkillHealthForDefinition(skill, consumer, controls);
      if (health.status === 'UNAVAILABLE' || health.status === 'DISABLED') return [];
      const operationHealth = new Map(health.operations.map((operation) => [operation.operationId, operation]));
      const operations = skill.operations.flatMap((reference) => {
        if (operationHealth.get(reference.operationId)?.status === 'UNAVAILABLE') return [];
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
        health: health.status,
        healthReasonCodes: health.reasonCodes,
        operations: Object.freeze(operations),
      })];
    })
    .sort((left, right) => left.domain.localeCompare(right.domain) || left.id.localeCompare(right.id));
}
