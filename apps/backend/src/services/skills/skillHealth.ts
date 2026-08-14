import { getAskOperationDefinition, type AskOperationId } from '../ask/askOperationRegistry';
import { getSkillAdapter } from './adapters/skillAdapterRegistry';
import { getSkillContextProvider } from './context/skillContextProviderRegistry';
import type { SkillConsumer, SkillDefinition } from './skill.contract';
import { getSkillDefinition } from './skillRegistry';

export type SkillHealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE' | 'DISABLED';
export type SkillOperationHealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
export type SkillHealthReasonCode =
  | 'SKILL_DISABLED'
  | 'SKILL_RETIRED'
  | 'CONSUMER_NOT_ALLOWED'
  | 'OPERATION_DISABLED'
  | 'ADAPTER_UNAVAILABLE'
  | 'REQUIRED_CONTEXT_PROVIDER_UNAVAILABLE'
  | 'OPTIONAL_CONTEXT_PROVIDER_UNAVAILABLE';

export interface SkillHealthControls {
  skillEnabled?: (skillId: string) => boolean;
  operationEnabled?: (operationId: AskOperationId) => boolean;
  adapterEnabled?: (adapterId: string) => boolean;
  contextProviderEnabled?: (providerId: string) => boolean;
}

export interface SkillOperationHealth {
  operationId: AskOperationId;
  status: SkillOperationHealthStatus;
  reasonCodes: readonly SkillHealthReasonCode[];
}

export interface SkillHealth {
  skillId: string;
  skillVersion: string | null;
  consumer: SkillConsumer;
  status: SkillHealthStatus;
  reasonCodes: readonly SkillHealthReasonCode[];
  operations: readonly SkillOperationHealth[];
}

function uniqueReasons(operations: readonly SkillOperationHealth[]): SkillHealthReasonCode[] {
  return [...new Set(operations.flatMap((operation) => operation.reasonCodes))];
}

function terminalHealth(
  skillId: string,
  skillVersion: string | null,
  consumer: SkillConsumer,
  status: 'UNAVAILABLE' | 'DISABLED',
  reason: SkillHealthReasonCode,
): SkillHealth {
  return Object.freeze({
    skillId,
    skillVersion,
    consumer,
    status,
    reasonCodes: Object.freeze([reason] as SkillHealthReasonCode[]),
    operations: Object.freeze([] as SkillOperationHealth[]),
  });
}

export function deriveSkillHealthForDefinition(
  skill: SkillDefinition,
  consumer: SkillConsumer,
  controls: SkillHealthControls = {},
): SkillHealth {
  const skillEnabled = controls.skillEnabled ?? (() => true);
  const operationEnabled = controls.operationEnabled ?? (() => true);
  const adapterEnabled = controls.adapterEnabled ?? (() => true);
  const contextProviderEnabled = controls.contextProviderEnabled ?? (() => true);
  if (skill.operationalStatus !== 'ENABLED' || !skillEnabled(skill.id)) {
    return terminalHealth(skill.id, skill.version, consumer, 'DISABLED', 'SKILL_DISABLED');
  }
  if (skill.lifecycleStatus === 'RETIRED') {
    return terminalHealth(skill.id, skill.version, consumer, 'UNAVAILABLE', 'SKILL_RETIRED');
  }
  const policy = skill.consumerPolicy.find((candidate) => candidate.consumer === consumer);
  if (!policy?.operations.length) {
    return terminalHealth(skill.id, skill.version, consumer, 'UNAVAILABLE', 'CONSUMER_NOT_ALLOWED');
  }

  const operations = policy.operations.map((operationId): SkillOperationHealth => {
    const reasons: SkillHealthReasonCode[] = [];
    const operationReference = skill.operations.find((candidate) => candidate.operationId === operationId)!;
    const operation = getAskOperationDefinition(operationId);
    if (!operationEnabled(operationId)) reasons.push('OPERATION_DISABLED');
    const adapterReference = skill.allowedAdapters.find((candidate) => candidate.id === operation.adapterKey);
    const adapter = adapterReference ? getSkillAdapter(adapterReference.id, adapterReference.version) : undefined;
    if (!adapter || !adapter.allowedOperations.includes(operationId) || !adapterEnabled(operation.adapterKey)) reasons.push('ADAPTER_UNAVAILABLE');
    const requiredProviders = operationReference.requiredContextProviders ?? [];
    const optionalProviders = operationReference.optionalContextProviders ?? [];
    if (requiredProviders.some((reference) => !getSkillContextProvider(reference.id, reference.version) || !contextProviderEnabled(reference.id))) {
      reasons.push('REQUIRED_CONTEXT_PROVIDER_UNAVAILABLE');
    }
    if (optionalProviders.some((reference) => !getSkillContextProvider(reference.id, reference.version) || !contextProviderEnabled(reference.id))) {
      reasons.push('OPTIONAL_CONTEXT_PROVIDER_UNAVAILABLE');
    }
    const unavailable = reasons.some((reason) => reason !== 'OPTIONAL_CONTEXT_PROVIDER_UNAVAILABLE');
    return Object.freeze({
      operationId,
      status: unavailable ? 'UNAVAILABLE' : reasons.length ? 'DEGRADED' : 'HEALTHY',
      reasonCodes: Object.freeze(reasons),
    });
  });
  const allUnavailable = operations.every((operation) => operation.status === 'UNAVAILABLE');
  const degraded = operations.some((operation) => operation.status !== 'HEALTHY');
  return Object.freeze({
    skillId: skill.id,
    skillVersion: skill.version,
    consumer,
    status: allUnavailable ? 'UNAVAILABLE' : degraded ? 'DEGRADED' : 'HEALTHY',
    reasonCodes: Object.freeze(uniqueReasons(operations)),
    operations: Object.freeze(operations),
  });
}

export function deriveSkillHealth(
  skillId: string,
  consumer: SkillConsumer,
  controls: SkillHealthControls = {},
): SkillHealth {
  const skill = getSkillDefinition(skillId);
  if (!skill) return terminalHealth(skillId, null, consumer, 'UNAVAILABLE', 'CONSUMER_NOT_ALLOWED');
  return deriveSkillHealthForDefinition(skill, consumer, controls);
}
