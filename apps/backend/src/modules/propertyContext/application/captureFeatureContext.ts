import { createHash } from 'node:crypto';
import { Prisma, PropertyFactSourceType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import {
  propertyContextCapturesTotal,
  propertyContextFeatureCaptureDurationSeconds,
  propertyContextFeatureCapturesTotal,
} from '../../../lib/metrics';
import { resolvePropertyAccess, ROLE_RANK } from '../../../services/propertyAccess.service';
import { getCaptureDefinition } from '../catalog/captureRegistry';
import { getFeatureContextRequirement } from '../catalog/featureRequirementRegistry';
import { getFactDefinition } from '../catalog/factCatalog';
import { normalizeCaptureValue, writeCanonicalFact } from './capturePropertyFact';
import { evaluateFeatureContext } from './evaluateFeatureContext';
import { PropertyContextAccessDeniedError } from './getPropertyContext';
import type { ScalarCaptureInputSchema } from '../domain/contracts';
import { executeRelationalCapture, type RelationalCaptureSelection } from './relationalCaptureAdapters';
import { emitPropertyChangeWithTransaction } from '../../../propertyChanges/propertyChange.service';

export const captureFeatureContextInputSchema = z.object({
  requirementId: z.string().trim().min(1).max(100),
  captureKey: z.string().trim().min(1).max(100).transform((value) => value.toUpperCase()),
  featureKey: z.string().trim().min(1).max(100).transform((value) => value.toUpperCase()),
  operationKey: z.string().trim().min(1).max(100).transform((value) => value.toUpperCase()),
  operationInput: z.record(z.string(), z.unknown()).optional(),
  expectedContextVersion: z.string().trim().min(1).max(128),
  idempotencyKey: z.string().trim().min(8).max(128),
  answer: z.record(z.string(), z.unknown()),
});

export class PropertyContextVersionConflictError extends Error {
  constructor(readonly evaluation: Awaited<ReturnType<typeof evaluateFeatureContext>>) {
    super('Property Context changed while this answer was being captured.');
    this.name = 'PropertyContextVersionConflictError';
  }
}

export class PropertyContextIdempotencyConflictError extends Error {
  constructor() {
    super('The idempotency key was already used for a different context answer.');
    this.name = 'PropertyContextIdempotencyConflictError';
  }
}

export class PropertyContextCaptureValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PropertyContextCaptureValidationError';
  }
}

const stableHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const isUnknownAnswer = (value: unknown) => value === null || value === 'UNKNOWN';

function fieldConditionMatches(
  condition: { fieldKey: string; operator: 'EQUALS' | 'NOT_EQUALS'; value: string | number | boolean } | undefined,
  answer: Record<string, unknown>,
): boolean {
  if (!condition) return true;
  return condition.operator === 'EQUALS'
    ? answer[condition.fieldKey] === condition.value
    : answer[condition.fieldKey] !== condition.value;
}

function validateInputValue(schema: ScalarCaptureInputSchema, value: unknown, allowNotSure: boolean): void {
  if (value === null && allowNotSure) return;
  if (schema.type === 'BOOLEAN' && typeof value !== 'boolean') throw new Error('Expected a yes or no answer.');
  if (schema.type === 'SINGLE_SELECT' && (typeof value !== 'string' || !schema.options.some((option) => option.value === value))) {
    throw new Error('Selected answer is not registered.');
  }
  if (schema.type === 'MULTI_SELECT') {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !schema.options.some((option) => option.value === item))) {
      throw new Error('Selected answers are not registered.');
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) throw new Error('Too many answers were selected.');
  }
  if (schema.type === 'INTEGER' || schema.type === 'DECIMAL') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'INTEGER' && !Number.isInteger(value))) {
      throw new Error('Expected a valid numeric answer.');
    }
    if (schema.min !== undefined && value < schema.min) throw new Error('Numeric answer is below the allowed minimum.');
    if (schema.max !== undefined && value > schema.max) throw new Error('Numeric answer is above the allowed maximum.');
  }
  if (schema.type === 'SHORT_TEXT' && (typeof value !== 'string' || !value.trim() || value.length > schema.maxLength)) {
    throw new Error('Expected a valid short text answer.');
  }
  if (schema.type === 'APPROXIMATE_DATE') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected a date with precision.');
    const candidate = value as { precision?: string; value?: string; rangeEnd?: string };
    const allowed = schema.allowedPrecisions ?? ['EXACT_DATE', 'MONTH', 'YEAR', 'RANGE', 'UNKNOWN'];
    if (!candidate.precision || !allowed.includes(candidate.precision as typeof allowed[number])) throw new Error('Selected date precision is not registered.');
    if (candidate.precision === 'UNKNOWN' && allowNotSure) return;
    if (!candidate.value) throw new Error('Expected a date value.');
    if (candidate.precision === 'RANGE' && !candidate.rangeEnd) throw new Error('Expected a date range end.');
  }
}

export function normalizeAnswers(
  definition: ReturnType<typeof getCaptureDefinition>,
  answer: Record<string, unknown>,
  allowNotSureOverride?: boolean,
): Array<{ factKey: string; value: unknown }> {
  // The evaluator (evaluateFeatureContext.ts's applyRequirementPolicy) forces
  // allowNotSure to false for every REQUIRED_* classification, but that
  // correction lives on the evaluated requirement, not the static capture
  // catalog definition. Callers on the write path MUST pass the resolved
  // requirement's allowNotSure through allowNotSureOverride so a
  // REQUIRED_SAFETY/APPLICABILITY/CALCULATION capture can't be persisted as
  // "not sure" just because its catalog entry defaults to allowing it for
  // other (e.g. enhancement) contexts.
  const allowNotSure = allowNotSureOverride ?? definition.allowNotSure;
  if (definition.mode === 'SCALAR') {
    if (!Object.prototype.hasOwnProperty.call(answer, 'value')) throw new Error('Scalar capture requires an answer value.');
    if (definition.inputSchema.type === 'GROUP' || definition.inputSchema.type === 'RELATIONAL_SELECT_CREATE' || definition.inputSchema.type === 'RELATIONAL_UPDATE') {
      throw new Error('Scalar capture has an invalid input schema.');
    }
    validateInputValue(definition.inputSchema, answer.value, allowNotSure);
    return [{ factKey: definition.factKeys[0], value: normalizeCaptureValue(definition.factKeys[0], answer.value) }];
  }
  if (definition.mode !== 'STRUCTURED' || definition.inputSchema.type !== 'GROUP' || !definition.answerBindings) {
    throw new Error('Capture mode is not supported by the shared property orchestrator.');
  }
  const allowedKeys = new Set(definition.inputSchema.fields.map((field) => field.key));
  const unknownKeys = Object.keys(answer).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length) throw new Error(`Structured capture contains unknown fields: ${unknownKeys.join(', ')}`);
  const normalized: Array<{ factKey: string; value: unknown }> = [];
  for (const field of definition.inputSchema.fields) {
    if (!fieldConditionMatches(field.when, answer)) continue;
    const supplied = Object.prototype.hasOwnProperty.call(answer, field.key);
    if (!supplied && field.required) throw new Error(`Structured capture is missing required field: ${field.key}`);
    if (!supplied) continue;
    const answerValue = answer[field.key];
    validateInputValue(field.inputSchema, answerValue, allowNotSure);
    if (field.required && field.inputSchema.type === 'MULTI_SELECT' && Array.isArray(answerValue) && answerValue.length === 0) {
      throw new Error(`Structured capture requires at least one selection for: ${field.key}`);
    }
    const factKey = definition.answerBindings[field.key];
    if (!factKey) throw new Error(`Structured capture field is not bound: ${field.key}`);
    normalized.push({ factKey, value: normalizeCaptureValue(factKey, answerValue) });
  }
  if (definition.captureKey === 'OUTDOOR_SPACE_PROFILE' && answer.hasPrivateOutdoorSpace === false) {
    normalized.push({ factKey: 'exterior.outdoorSpaceTypes', value: [] });
  }
  return normalized.filter((entry, index, entries) => entries.findIndex(({ factKey }) => factKey === entry.factKey) === index);
}

async function captureFeatureContextInternal(propertyId: string, userId: string, rawInput: unknown) {
  const input = captureFeatureContextInputSchema.parse(rawInput);
  const answerHash = stableHash({
    featureKey: input.featureKey,
    operationKey: input.operationKey,
    requirementId: input.requirementId,
    captureKey: input.captureKey,
    expectedContextVersion: input.expectedContextVersion,
    operationInput: input.operationInput,
    answer: input.answer,
  });
  const previous = await prisma.propertyContextCaptureReceipt.findUnique({
    where: { propertyId_userId_idempotencyKey: { propertyId, userId, idempotencyKey: input.idempotencyKey } },
  });
  if (previous) {
    if (previous.answerHash !== answerHash) throw new PropertyContextIdempotencyConflictError();
    if (previous.result) return previous.result;
  }

  const contract = getFeatureContextRequirement(input.featureKey, input.operationKey);
  const definition = getCaptureDefinition(input.captureKey);
  const registered = [...contract.required, ...contract.enhancements]
    .find((requirement) => requirement.captureKey === input.captureKey);
  if (!registered || !definition.factKeys.includes(registered.factKey)) {
    throw new Error('Capture is not registered for this feature operation.');
  }
  const evaluation = await evaluateFeatureContext(propertyId, userId, input);
  const active = evaluation.requirements.find((requirement) => requirement.requirementId === input.requirementId);
  if (!active || active.capture.captureKey !== input.captureKey) throw new Error('Capture requirement is no longer active.');
  if (evaluation.contextVersion !== input.expectedContextVersion) throw new PropertyContextVersionConflictError(evaluation);
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access || ROLE_RANK[access.role] < ROLE_RANK.CONTRIBUTOR) throw new PropertyContextAccessDeniedError();

  let answers: Array<{ factKey: string; value: unknown }> = [];
  try {
    if (definition.mode !== 'RELATIONAL') answers = normalizeAnswers(definition, input.answer, active.capture.allowNotSure);
    else if ((definition.inputSchema.type !== 'RELATIONAL_SELECT_CREATE' && definition.inputSchema.type !== 'RELATIONAL_UPDATE') || !definition.relationalAdapterKey) {
      throw new Error('Relational capture is not backed by an allowlisted domain command.');
    }
  } catch (error) {
    throw new PropertyContextCaptureValidationError(error instanceof Error ? error.message : 'Invalid context capture answer.');
  }
  if (definition.mode !== 'RELATIONAL' && !answers.length) throw new PropertyContextCaptureValidationError('Capture did not contain an applicable answer.');
  const factDefinitions = (definition.mode === 'RELATIONAL' ? definition.factKeys : answers.map(({ factKey }) => factKey)).map(getFactDefinition);
  const updatedFactKeys = definition.mode === 'RELATIONAL' ? definition.factKeys : answers.map(({ factKey }) => factKey);
  const observedAt = new Date();
  let captureId = '';
  let selection: RelationalCaptureSelection | undefined;
  const evidenceIds: string[] = [];
  try {
    await prisma.$transaction(async (tx) => {
      const receipt = await tx.propertyContextCaptureReceipt.create({
        data: {
          propertyId,
          userId,
          featureKey: input.featureKey,
          operationKey: input.operationKey,
          captureKey: input.captureKey,
          requirementId: input.requirementId,
          idempotencyKey: input.idempotencyKey,
          expectedContextVersion: input.expectedContextVersion,
          answerHash,
          updatedFactKeys,
          evidenceIds: [],
        },
      });
      captureId = receipt.id;
      if (definition.mode === 'RELATIONAL') {
        try {
          selection = await executeRelationalCapture(tx, propertyId, definition, input.answer, input.operationInput);
        } catch (error) {
          throw new PropertyContextCaptureValidationError(error instanceof Error ? error.message : 'Invalid relational capture answer.');
        }
        const evidence = await tx.propertyFactEvidence.create({
          data: {
            propertyId,
            factKey: definition.factKeys[0],
            sourceType: PropertyFactSourceType.USER_REPORTED,
            observationState: 'KNOWN',
            sourceEntityType: `PROPERTY_CONTEXT_${selection.entityType}_${selection.created ? 'CREATED' : 'SELECTED'}`,
            sourceEntityId: selection.entityId,
            confidence: selection.created ? 0.9 : 1,
            observedAt,
            verifiedAt: observedAt,
          },
        });
        evidenceIds.push(evidence.id);
      }
      for (const { factKey, value } of answers) {
        const unknownAnswer = isUnknownAnswer(value);
        if (!unknownAnswer) await writeCanonicalFact(tx, propertyId, factKey, value);
        // Conflict resolution retains every prior evidence row. The new,
        // verified homeowner observation wins precedence without erasing the disagreement trail.
        if (!unknownAnswer && active.state !== 'CONFLICTED') {
          await tx.propertyFactEvidence.updateMany({
            where: { propertyId, factKey, supersededAt: null },
            data: { supersededAt: observedAt },
          });
        }
        const evidence = await tx.propertyFactEvidence.create({
          data: {
            propertyId,
            factKey,
            sourceType: PropertyFactSourceType.USER_REPORTED,
            observationState: unknownAnswer ? 'UNKNOWN' : 'KNOWN',
            sourceEntityType: active.state === 'CONFLICTED'
              ? 'PROPERTY_CONTEXT_CONFLICT_RESOLUTION'
              : active.state === 'STALE'
                ? 'PROPERTY_CONTEXT_STALE_CONFIRMATION'
                : 'PROPERTY_CONTEXT_CAPTURE',
            sourceEntityId: receipt.id,
            confidence: 0.9,
            observedAt,
            verifiedAt: observedAt,
          },
        });
        evidenceIds.push(evidence.id);
      }
      await tx.propertyContextCaptureReceipt.update({ where: { id: receipt.id }, data: { evidenceIds } });
      const canonicalReferences = selection
        ? updatedFactKeys.map((factKey) => ({
            entityType: selection!.entityType,
            entityId: selection!.entityId,
            fieldPath: factKey.split('.').at(-1) ?? factKey,
          }))
        : updatedFactKeys.map((factKey) => ({ entityType: 'PROPERTY', entityId: propertyId, fieldPath: factKey }));
      await emitPropertyChangeWithTransaction(tx, {
        propertyId,
        sourceType: 'PROPERTY_FACT',
        sourceEntityId: receipt.id,
        sourceRevision: receipt.id,
        changeType: 'PROPERTY_FACT_CHANGED',
        changedFactKeys: updatedFactKeys,
        canonicalReferences,
        occurredAt: observedAt,
        detectedAt: observedAt,
        confidence: 0.9,
        sourceHealth: 'CURRENT',
        signals: {
          homeownerRelevant: true,
          lifecycleAdvanced: false,
          propertyEffectConfirmed: true,
          urgentSafetyCondition: updatedFactKeys.some((factKey) => factKey.startsWith('safety.')),
          canonicalActionPriority: null,
        },
      });
    });
    for (const fact of factDefinitions) propertyContextCapturesTotal.inc({ scope: fact.scope, fact_key: fact.key, outcome: 'success' });
  } catch (error) {
    for (const fact of factDefinitions) propertyContextCapturesTotal.inc({ scope: fact.scope, fact_key: fact.key, outcome: 'error' });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const duplicate = await prisma.propertyContextCaptureReceipt.findUnique({
        where: { propertyId_userId_idempotencyKey: { propertyId, userId, idempotencyKey: input.idempotencyKey } },
      });
      if (duplicate?.answerHash !== answerHash) throw new PropertyContextIdempotencyConflictError();
      if (duplicate?.result) return duplicate.result;
    }
    throw error;
  }

  const nextEvaluation = await evaluateFeatureContext(propertyId, userId, input);
  const result = {
    captureId,
    contextVersion: nextEvaluation.contextVersion,
    updatedFactKeys,
    evidenceIds,
    ...(selection ? { selection } : {}),
    evaluation: nextEvaluation,
  };
  await prisma.propertyContextCaptureReceipt.update({
    where: { id: captureId },
    data: { result: result as unknown as Prisma.InputJsonValue },
  });
  return result;
}

function captureOutcome(error: unknown): string {
  if (error instanceof PropertyContextVersionConflictError) return 'VERSION_CONFLICT';
  if (error instanceof PropertyContextIdempotencyConflictError) return 'IDEMPOTENCY_CONFLICT';
  if (error instanceof PropertyContextCaptureValidationError) return 'VALIDATION_ERROR';
  if (error instanceof PropertyContextAccessDeniedError) return 'ACCESS_DENIED';
  return 'ERROR';
}

export async function captureFeatureContext(propertyId: string, userId: string, rawInput: unknown) {
  // As with evaluation metrics, only validated registry-shaped identifiers are
  // used as labels.
  const input = captureFeatureContextInputSchema.parse(rawInput);
  getFeatureContextRequirement(input.featureKey, input.operationKey);
  getCaptureDefinition(input.captureKey);
  const labels = {
    feature_key: input.featureKey,
    operation_key: input.operationKey,
    capture_key: input.captureKey,
  };
  const stopTimer = propertyContextFeatureCaptureDurationSeconds.startTimer(labels);
  try {
    const result = await captureFeatureContextInternal(propertyId, userId, input);
    propertyContextFeatureCapturesTotal.inc({ ...labels, outcome: 'SUCCESS' });
    return result;
  } catch (error) {
    propertyContextFeatureCapturesTotal.inc({ ...labels, outcome: captureOutcome(error) });
    throw error;
  } finally {
    stopTimer();
  }
}
