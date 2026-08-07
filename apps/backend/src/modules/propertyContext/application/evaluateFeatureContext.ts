import { createHash } from 'node:crypto';
import { z } from 'zod';
import { resolvePropertyAccess, ROLE_RANK } from '../../../services/propertyAccess.service';
import {
  propertyContextFeatureEvaluationDurationSeconds,
  propertyContextFeatureEvaluationsTotal,
} from '../../../lib/metrics';
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

export function selectedItemCoverageEvidenceState(item: {
  warrantyId?: unknown;
  insurancePolicyId?: unknown;
  coverageEvidenceStatus?: unknown;
}): PropertyFact['state'] {
  if (item.warrantyId || item.insurancePolicyId) return 'KNOWN';
  // "Not sure" is an explicit unknown, not evidence that coverage exists or
  // does not exist. Keep the inline capture available so the homeowner can
  // resolve or intentionally defer the question without creating a false gap.
  return item.coverageEvidenceStatus === 'NONE' ? 'KNOWN' : 'UNKNOWN';
}

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
  if (!Array.isArray(condition.value)) return false;
  const expected = condition.value;
  if (condition.operator === 'IN') return expected.includes(actual as never);
  return Array.isArray(actual) && actual.some((value) => expected.includes(value as never));
}

function requirementState(
  requirement: FactRequirementDefinition,
  fact: PropertyFact | undefined,
  operationInput?: Record<string, unknown>,
): PropertyFact['state'] {
  if (requirement.alwaysCapture) {
    if (fact?.state === 'CONFLICTED') return 'CONFLICTED';
    return fact?.state === 'KNOWN' ? 'STALE' : (fact?.state ?? 'UNKNOWN');
  }
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
  if (requirement.collectionPredicate === 'SELECTED_ITEM_LIFECYCLE_INCOMPLETE') {
    if (!Array.isArray(collectionValue)) return 'UNKNOWN';
    const itemId = operationInput?.inventoryItemId;
    if (typeof itemId !== 'string' || !itemId.trim()) return 'KNOWN';
    const item = collectionValue.find((candidate) => candidate && typeof candidate === 'object'
      && (candidate as { id?: unknown }).id === itemId) as { condition?: unknown; installedOn?: unknown; purchasedOn?: unknown } | undefined;
    if (!item) return 'UNKNOWN';
    const hasCondition = typeof item.condition === 'string' && item.condition !== 'UNKNOWN';
    const hasLifecycleDate = typeof item.installedOn === 'string' || typeof item.purchasedOn === 'string';
    return hasCondition && hasLifecycleDate ? 'KNOWN' : 'UNKNOWN';
  }
  if (requirement.collectionPredicate?.startsWith('SELECTED_ITEM_')) {
    if (!Array.isArray(collectionValue)) return 'UNKNOWN';
    const itemId = operationInput?.inventoryItemId;
    if (typeof itemId !== 'string' || !itemId.trim()) return 'UNKNOWN';
    const item = collectionValue.find((candidate) => candidate && typeof candidate === 'object'
      && (candidate as { id?: unknown }).id === itemId) as Record<string, unknown> | undefined;
    if (!item) return 'UNKNOWN';
    if (requirement.collectionPredicate === 'SELECTED_ITEM_CONFIRMATION_INCOMPLETE') {
      const inferred = item.verificationSource === 'PROPERTY_DETAILS'
        || (typeof item.sourceHash === 'string' && item.sourceHash.startsWith('RISK_REPORT_SYSTEM:'))
        || (Array.isArray(item.tags) && item.tags.includes('RISK_REPORT_INFERRED'));
      return !inferred || item.isVerified === true ? 'KNOWN' : 'UNKNOWN';
    }
    if (requirement.collectionPredicate === 'SELECTED_ITEM_COVERAGE_LIFECYCLE_INCOMPLETE') {
      if (item.warrantyId || item.insurancePolicyId) return 'KNOWN';
      const hasCondition = typeof item.condition === 'string' && item.condition !== 'UNKNOWN';
      const hasLifecycleDate = typeof item.installedOn === 'string' || typeof item.purchasedOn === 'string';
      return hasCondition && hasLifecycleDate ? 'KNOWN' : 'UNKNOWN';
    }
    if (requirement.collectionPredicate === 'SELECTED_ITEM_VALUE_INCOMPLETE') {
      if (item.warrantyId || item.insurancePolicyId) return 'KNOWN';
      return (typeof item.replacementCostCents === 'number' && item.replacementCostCents > 0)
        || operationInput?.hasDisclosedEstimate === true
        ? 'KNOWN'
        : 'UNKNOWN';
    }
    if (requirement.collectionPredicate === 'SELECTED_ITEM_COVERAGE_EVIDENCE_INCOMPLETE') {
      return selectedItemCoverageEvidenceState(item);
    }
  }
  if (requirement.collectionPredicate === 'INCLUDES_OPERATION_INPUT_VALUE') {
    const inputKey = requirement.collectionOperationInputKey;
    const expected = inputKey ? operationInput?.[inputKey] : undefined;
    if (expected === undefined || expected === null || expected === '') return 'KNOWN';
    if (!Array.isArray(collectionValue) || !collectionValue.includes(expected)) return 'UNKNOWN';
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
  const state = requirementState(requirement, context.facts[requirement.factKey], operationInput);
  if (state === 'KNOWN') return null;
  const definition = getCaptureDefinition(requirement.captureKey);
  const {
    canonicalOwner: _canonicalOwner,
    answerBindings: _answerBindings,
    relationalAdapterKey: _relationalAdapterKey,
    relationalEntityInputKey: _relationalEntityInputKey,
    ...publicDefinition
  } = definition;
  const capture = definition.mode === 'RELATIONAL'
    ? { ...publicDefinition, ...(await resolveRelationalCaptureSchema(context.propertyId, definition, operationInput)) }
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

async function evaluateFeatureContextInternal(
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

export async function evaluateFeatureContext(
  propertyId: string,
  userId: string,
  rawInput: EvaluateFeatureContextInput,
): Promise<FeatureContextEvaluation> {
  // Parse before attaching labels so arbitrary invalid input can never create
  // unbounded metric cardinality.
  const input = evaluateFeatureContextInputSchema.parse(rawInput);
  getFeatureContextRequirement(input.featureKey, input.operationKey);
  const labels = { feature_key: input.featureKey, operation_key: input.operationKey };
  const stopTimer = propertyContextFeatureEvaluationDurationSeconds.startTimer(labels);
  try {
    const evaluation = await evaluateFeatureContextInternal(propertyId, userId, input);
    propertyContextFeatureEvaluationsTotal.inc({ ...labels, outcome: evaluation.readiness });
    return evaluation;
  } catch (error) {
    propertyContextFeatureEvaluationsTotal.inc({ ...labels, outcome: 'ERROR' });
    throw error;
  } finally {
    stopTimer();
  }
}
