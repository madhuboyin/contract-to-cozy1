import { createHash } from 'node:crypto';
import { z } from 'zod';
import { resolvePropertyAccess, ROLE_RANK } from '../../../services/propertyAccess.service';
import { getCaptureDefinition } from '../catalog/captureRegistry';
import { getFactDefinition } from '../catalog/factCatalog';
import {
  type DeclarativeCondition,
  type FactRequirementDefinition,
  getFeatureContextRequirement,
} from '../catalog/featureRequirementRegistry';
import type {
  EvaluatedContextRequirement,
  FeatureContextEvaluation,
  PropertyContextSnapshot,
  PropertyFact,
} from '../domain/contracts';
import { getPropertyContext } from './getPropertyContext';

export const evaluateFeatureContextInputSchema = z.object({
  featureKey: z.string().trim().min(1).max(100).transform((value) => value.toUpperCase()),
  operationKey: z.string().trim().min(1).max(100).transform((value) => value.toUpperCase()),
  operationInput: z.record(z.string(), z.unknown()).optional(),
});

export type EvaluateFeatureContextInput = z.infer<typeof evaluateFeatureContextInputSchema>;

function conditionMatches(condition: DeclarativeCondition | undefined, context: PropertyContextSnapshot): boolean {
  if (!condition) return true;
  const fact = context.facts[condition.factKey];
  if (!fact || fact.state !== 'KNOWN') return false;
  return condition.operator === 'EQUALS' ? fact.value === condition.value : fact.value !== condition.value;
}

function requirementState(requirement: FactRequirementDefinition, fact?: PropertyFact): PropertyFact['state'] {
  if (!fact) return 'UNKNOWN';
  if (fact.state !== 'KNOWN') return fact.state;
  if (requirement.acceptableStates.includes('VERIFIED') && !fact.verified) return 'UNKNOWN';
  if (requirement.acceptableStates.includes('FRESH') && fact.validUntil && new Date(fact.validUntil) <= new Date()) return 'STALE';
  return 'KNOWN';
}

function evaluateRequirement(
  contractKey: string,
  requirement: FactRequirementDefinition,
  context: PropertyContextSnapshot,
): EvaluatedContextRequirement | null {
  if (!conditionMatches(requirement.when, context)) return null;
  const state = requirementState(requirement, context.facts[requirement.factKey]);
  if (state === 'KNOWN') return null;
  const definition = getCaptureDefinition(requirement.captureKey);
  const { canonicalOwner: _canonicalOwner, ...capture } = definition;
  const requirementId = createHash('sha256')
    .update(`${contractKey}:${requirement.factKey}:${requirement.captureKey}`)
    .digest('hex')
    .slice(0, 24);
  return {
    requirementId,
    factKeys: [requirement.factKey],
    classification: requirement.classification,
    state,
    reasonCode: requirement.reasonCode,
    capture,
  };
}

export async function evaluateFeatureContext(
  propertyId: string,
  userId: string,
  rawInput: EvaluateFeatureContextInput,
): Promise<FeatureContextEvaluation> {
  const input = evaluateFeatureContextInputSchema.parse(rawInput);
  const contract = getFeatureContextRequirement(input.featureKey, input.operationKey);
  const factKeys = [...contract.required, ...contract.enhancements]
    .flatMap((requirement) => [requirement.factKey, requirement.when?.factKey])
    .filter((key): key is string => Boolean(key));
  if (contract.notApplicableWhen) factKeys.push(contract.notApplicableWhen.factKey);
  const scopes = [...new Set(factKeys.map((key) => getFactDefinition(key).scope))];
  const [access, context] = await Promise.all([
    resolvePropertyAccess(userId, propertyId),
    getPropertyContext(propertyId, { userId }, { scopes }),
  ]);
  const contractKey = `${contract.featureKey}:${contract.operationKey}:${contract.policyVersion}`;
  const required = contract.required
    .sort((left, right) => left.priority - right.priority)
    .map((requirement) => evaluateRequirement(contractKey, requirement, context))
    .filter((value): value is EvaluatedContextRequirement => Boolean(value));
  const enhancements = contract.enhancements
    .sort((left, right) => left.priority - right.priority)
    .map((requirement) => evaluateRequirement(contractKey, requirement, context))
    .filter((value): value is EvaluatedContextRequirement => Boolean(value));
  const canWrite = Boolean(access && ROLE_RANK[access.role] >= ROLE_RANK.CONTRIBUTOR);
  const notApplicable = Boolean(contract.notApplicableWhen && conditionMatches(contract.notApplicableWhen, context));
  const conflict = required.some((requirement) => requirement.state === 'CONFLICTED');
  const readiness = !canWrite && required.length
    ? 'PERMISSION_REQUIRED'
    : notApplicable
      ? 'NOT_APPLICABLE'
      : conflict
        ? 'CONFLICT_REVIEW_REQUIRED'
        : required.length
          ? 'NEEDS_REQUIRED_CONTEXT'
          : enhancements.length
            ? 'READY_WITH_LIMITATIONS'
            : 'READY';
  const requirements = required.length ? [required[0]] : enhancements.length ? [enhancements[0]] : [];
  const usedFactKeys = factKeys.filter((key) => context.facts[key]?.state === 'KNOWN');
  return {
    propertyId,
    contextVersion: context.contextVersion,
    featureKey: contract.featureKey,
    operationKey: contract.operationKey,
    policyVersion: contract.policyVersion,
    readiness,
    reasonCodes: notApplicable && contract.notApplicableReasonCode
      ? [contract.notApplicableReasonCode]
      : requirements.map((requirement) => requirement.reasonCode),
    usedFactKeys: [...new Set(usedFactKeys)],
    requirements: readiness === 'PERMISSION_REQUIRED' ? requirements.map((requirement) => ({
      ...requirement,
      capture: { ...requirement.capture, actionKey: 'PERMISSION_REQUIRED' },
    })) : requirements,
    canExecute: readiness === 'READY' || readiness === 'READY_WITH_LIMITATIONS',
  };
}
