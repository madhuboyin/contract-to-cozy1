import { createHash } from 'node:crypto';
import { Prisma, PropertyFactSourceType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { propertyContextCapturesTotal } from '../../../lib/metrics';
import { resolvePropertyAccess, ROLE_RANK } from '../../../services/propertyAccess.service';
import { getCaptureDefinition } from '../catalog/captureRegistry';
import { getFeatureContextRequirement } from '../catalog/featureRequirementRegistry';
import { getFactDefinition } from '../catalog/factCatalog';
import { capturePropertyFactInputSchema, normalizeCaptureValue, writeCanonicalFact } from './capturePropertyFact';
import { evaluateFeatureContext } from './evaluateFeatureContext';
import { PropertyContextAccessDeniedError } from './getPropertyContext';

export const captureFeatureContextInputSchema = z.object({
  requirementId: z.string().trim().min(1).max(100),
  captureKey: z.string().trim().min(1).max(100).transform((value) => value.toUpperCase()),
  featureKey: z.string().trim().min(1).max(100).transform((value) => value.toUpperCase()),
  operationKey: z.string().trim().min(1).max(100).transform((value) => value.toUpperCase()),
  expectedContextVersion: z.string().trim().min(1).max(128),
  idempotencyKey: z.string().trim().min(8).max(128),
  answer: z.object({ value: z.unknown() }),
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

const stableHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function captureFeatureContext(propertyId: string, userId: string, rawInput: unknown) {
  const input = captureFeatureContextInputSchema.parse(rawInput);
  const answerHash = stableHash({
    featureKey: input.featureKey,
    operationKey: input.operationKey,
    requirementId: input.requirementId,
    captureKey: input.captureKey,
    expectedContextVersion: input.expectedContextVersion,
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

  const factKey = definition.factKeys[0];
  const fact = getFactDefinition(factKey);
  const captureInput = capturePropertyFactInputSchema.parse({ value: input.answer.value, sourceType: PropertyFactSourceType.USER_REPORTED });
  const value = normalizeCaptureValue(factKey, captureInput.value);
  const observedAt = new Date();
  let captureId = '';
  let evidenceId = '';
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
          updatedFactKeys: [factKey],
          evidenceIds: [],
        },
      });
      captureId = receipt.id;
      await writeCanonicalFact(tx, propertyId, factKey, value);
      await tx.propertyFactEvidence.updateMany({
        where: { propertyId, factKey, supersededAt: null },
        data: { supersededAt: observedAt },
      });
      const evidence = await tx.propertyFactEvidence.create({
        data: {
          propertyId,
          factKey,
          sourceType: PropertyFactSourceType.USER_REPORTED,
          sourceEntityType: 'PROPERTY_CONTEXT_CAPTURE',
          sourceEntityId: receipt.id,
          confidence: 0.9,
          observedAt,
          verifiedAt: observedAt,
        },
      });
      evidenceId = evidence.id;
      await tx.propertyContextCaptureReceipt.update({ where: { id: receipt.id }, data: { evidenceIds: [evidence.id] } });
    });
    propertyContextCapturesTotal.inc({ scope: fact.scope, fact_key: factKey, outcome: 'success' });
  } catch (error) {
    propertyContextCapturesTotal.inc({ scope: fact.scope, fact_key: factKey, outcome: 'error' });
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
    updatedFactKeys: [factKey],
    evidenceIds: [evidenceId],
    evaluation: nextEvaluation,
  };
  await prisma.propertyContextCaptureReceipt.update({
    where: { id: captureId },
    data: { result: result as unknown as Prisma.InputJsonValue },
  });
  return result;
}
