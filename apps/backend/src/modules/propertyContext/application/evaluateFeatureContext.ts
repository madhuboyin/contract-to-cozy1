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
import { resolveRelationalCaptureSchema } from './relationalCaptureAdapters';

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

function operationInputMatches(
  condition: FactRequirementDefinition['operationInputWhen'],
  operationInput: Record<string, unknown> | undefined,
): boolean {
  if (!condition) return true;
  const actual = operationInput?.[condition.key];
  if (condition.operator === 'EQUALS') return actual === condition.value;
  return Array.isArray(condition.value) && condition.value.includes(actual as never);
}

function requirementState(requirement: FactRequirementDefinition, fact?: PropertyFact): PropertyFact['state'] {
  if (!fact) return 'UNKNOWN';
  if (fact.state !== 'KNOWN') return fact.state;
  let collectionValue = fact.value;
  if (requirement.collectionPredicate === 'ACTIVE_DATE_RANGE' && Array.isArray(collectionValue)) {
    const now = Date.now();
    collectionValue = collectionValue.filter((item) => {
      if (!item || typeof item !== 'object') return false;
      const { startDate, expiryDate } = item as { startDate?: unknown; expiryDate?: unknown };
      if (typeof startDate !== 'string' || typeof expiryDate !== 'string') return false;
      const start = new Date(startDate).getTime();
      const expiry = new Date(expiryDate).getTime();
      return Number.isFinite(start) && Number.isFinite(expiry) && start <= now && expiry >= now;
    });
  }
  if (requirement.minimumItems !== undefined && (!Array.isArray(collectionValue) || collectionValue.length < requirement.minimumItems)) return 'UNKNOWN';
  if (requirement.acceptableStates.includes('VERIFIED') && !fact.verified) return 'UNKNOWN';
  if (requirement.acceptableStates.includes('FRESH') && fact.validUntil && new Date(fact.validUntil) <= new Date()) return 'STALE';
  return 'KNOWN';
}

async function evaluateRequirement(
  contractKey: string,
  requirement: FactRequirementDefinition,
  context: PropertyContextSnapshot,
  operationInput?: Record<string, unknown>,
): Promise<EvaluatedContextRequirement | null> {
  if (!conditionMatches(requirement.when, context)) return null;
  if (!operationInputMatches(requirement.operationInputWhen, operationInput)) return null;
  const state = requirementState(requirement, context.facts[requirement.factKey]);
  if (state === 'KNOWN') return null;
  const definition = getCaptureDefinition(requirement.captureKey);
  const {
    canonicalOwner: _canonicalOwner,
    answerBindings: _answerBindings,
    relationalAdapterKey: _relationalAdapterKey,
    ...publicDefinition
  } = definition;
  const capture = definition.mode === 'RELATIONAL'
    ? { ...publicDefinition, inputSchema: await resolveRelationalCaptureSchema(context.propertyId, definition) }
    : publicDefinition;
  const requirementId = createHash('sha256')
    .update(`${contractKey}:${requirement.factKey}:${requirement.captureKey}:${JSON.stringify(inputForRequirementId(operationInput))}`)
    .digest('hex')
    .slice(0, 24);
  return {
    requirementId,
    factKeys: definition.factKeys,
    classification: requirement.classification,
    state,
    reasonCode: requirement.reasonCode,
    capture,
    currentAnswer: definition.mode === 'STRUCTURED'
      ? Object.fromEntries(Object.entries(definition.answerBindings ?? {}).map(([answerKey, factKey]) => [
        answerKey,
        context.facts[factKey]?.value ?? null,
      ]))
      : definition.mode === 'RELATIONAL'
        ? null
        : { value: context.facts[requirement.factKey]?.value ?? null },
  };
}

function inputForRequirementId(operationInput: Record<string, unknown> | undefined): Record<string, unknown> {
  return Object.fromEntries(Object.entries(operationInput ?? {}).sort(([left], [right]) => left.localeCompare(right)));
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
  const required = (await Promise.all(contract.required
    .sort((left, right) => left.priority - right.priority)
    .map((requirement) => evaluateRequirement(contractKey, requirement, context, input.operationInput))))
    .filter((value): value is EvaluatedContextRequirement => Boolean(value));
  const enhancements = (await Promise.all(contract.enhancements
    .sort((left, right) => left.priority - right.priority)
    .map((requirement) => evaluateRequirement(contractKey, requirement, context, input.operationInput))))
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
