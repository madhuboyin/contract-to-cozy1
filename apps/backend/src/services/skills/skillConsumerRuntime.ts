import type { HouseholdRole } from '@prisma/client';
import { readAskOperationalControls, type AskOperationalControls } from '../../config/askOperationalControls';
import { skillConsumerInvocationDurationSeconds, skillConsumerInvocationsTotal } from '../../lib/metrics';
import { ROLE_RANK } from '../propertyAccess.service';
import type { AskOperationId } from '../ask/askOperationRegistry';
import { getSkillAdapter } from './adapters/skillAdapterRegistry';
import type { SkillConsumer } from './skill.contract';
import { deriveSkillHealthForDefinition } from './skillHealth';
import { getSkillForOperation, resolveEffectiveSkillOperationPolicy } from './skillRegistry';

export type SkillConsumerRuntimeErrorCode =
  | 'ASK_SKILL_UNSUPPORTED'
  | 'ASK_SKILL_DISABLED'
  | 'ASK_SKILL_POLICY_MISMATCH'
  | 'ASK_SKILL_DEPENDENCY_UNAVAILABLE'
  | 'ASK_PERMISSION_REQUIRED';

export class SkillConsumerRuntimeError extends Error {
  constructor(public readonly code: SkillConsumerRuntimeErrorCode, message: string) {
    super(message);
    this.name = 'SkillConsumerRuntimeError';
  }
}

/**
 * Consumer-neutral gateway for existing canonical read operations. It makes
 * consumer policy, Skill health, adapter registration, and authorization
 * consequential outside Ask without moving canonical implementation into the
 * Skill layer or permitting peer-Skill execution.
 */
export async function invokeReadSkillOperationForConsumer<T>(input: {
  consumer: SkillConsumer;
  operationId: AskOperationId;
  role: HouseholdRole;
  execute: () => Promise<T>;
  controls?: AskOperationalControls;
}): Promise<T> {
  const skill = getSkillForOperation(input.operationId);
  if (!skill) throw new SkillConsumerRuntimeError('ASK_SKILL_UNSUPPORTED', `No Skill owns ${input.operationId}.`);

  const startedAt = process.hrtime.bigint();
  let status = 'THREW';
  try {
    const controls = input.controls ?? readAskOperationalControls();
    const health = deriveSkillHealthForDefinition(skill, input.consumer, controls);
    if (health.status === 'DISABLED') {
      throw new SkillConsumerRuntimeError('ASK_SKILL_DISABLED', `${skill.displayName} is disabled for ${input.consumer}.`);
    }
    if (health.status === 'UNAVAILABLE') {
      throw new SkillConsumerRuntimeError('ASK_SKILL_DEPENDENCY_UNAVAILABLE', `${skill.displayName} is unavailable for ${input.consumer}.`);
    }

    const policy = resolveEffectiveSkillOperationPolicy(skill.id, input.operationId, input.consumer);
    if (!policy || !health.operations.some((operation) => operation.operationId === input.operationId && operation.status !== 'UNAVAILABLE')) {
      throw new SkillConsumerRuntimeError('ASK_SKILL_POLICY_MISMATCH', `${input.operationId} is not allowed for ${input.consumer}.`);
    }
    if (policy.authorizationFloor && ROLE_RANK[input.role] < ROLE_RANK[policy.authorizationFloor]) {
      throw new SkillConsumerRuntimeError('ASK_PERMISSION_REQUIRED', `${policy.authorizationFloor} access is required.`);
    }

    const adapterReference = skill.allowedAdapters.find((candidate) => candidate.id === policy.adapterKey);
    const adapter = adapterReference ? getSkillAdapter(adapterReference.id, adapterReference.version) : undefined;
    if (!adapter || adapter.effect !== 'READ' || !adapter.allowedOperations.includes(input.operationId)) {
      throw new SkillConsumerRuntimeError('ASK_SKILL_DEPENDENCY_UNAVAILABLE', `A governed read adapter is unavailable for ${input.operationId}.`);
    }

    const result = await input.execute();
    status = 'COMPLETED';
    return result;
  } catch (error) {
    status = error instanceof SkillConsumerRuntimeError ? error.code : 'THREW';
    throw error;
  } finally {
    skillConsumerInvocationsTotal.inc({
      consumer: input.consumer,
      skill: skill.id,
      skill_version: skill.version,
      operation: input.operationId,
      status,
    });
    skillConsumerInvocationDurationSeconds.observe(
      { consumer: input.consumer, skill: skill.id, skill_version: skill.version, operation: input.operationId },
      Number(process.hrtime.bigint() - startedAt) / 1_000_000_000,
    );
  }
}
