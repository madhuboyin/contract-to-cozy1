import {
  AskCaptureAttribution,
  Prisma,
  PropertyFactSourceType,
  ResponsibleParty,
} from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { propertyContextCapturesTotal } from '../../../lib/metrics';
import { resolvePropertyAccess, ROLE_RANK } from '../../../services/propertyAccess.service';
import { getFactDefinition } from '../catalog/factCatalog';
import { getPropertyContext, PropertyContextAccessDeniedError } from './getPropertyContext';
import {
  buildPropertyGeographyInvalidation,
  hasPropertyLocationIdentityChanged,
} from '../../homeEventRadar/domain/propertyGeography';
import {
  radarReconciliationReasonForFactKey,
  requestRadarPropertyReconciliation,
} from '../../homeEventRadar/services/radarPropertyReconciliation.service';
import { emitPropertyChangeWithTransaction } from '../../../propertyChanges/propertyChange.service';
import {
  exteriorFacts,
  isContextCaptureSupported,
  propertyFacts,
  responsibilityScopes,
  salePrepFacts,
} from './capturePropertyFactCatalog';

// propertyFacts/exteriorFacts/salePrepFacts/responsibilityScopes/
// isContextCaptureSupported moved to capturePropertyFactCatalog.ts (a
// zero-dependency leaf module) to break a real circular-import deadlock:
// captureRegistry.ts imports isContextCaptureSupported, and this file's own
// import chain (radarPropertyReconciliation -> ... -> evaluateFeatureContext)
// led back to captureRegistry.ts. See that file's own header comment.

export const capturePropertyFactInputSchema = z.object({
  value: z.unknown(),
  sourceType: z.nativeEnum(PropertyFactSourceType).default('USER_REPORTED'),
  confidence: z.number().min(0).max(1).nullable().optional(),
  validUntil: z.coerce.date().nullable().optional(),
  // Ask Cozy Stage 3, Phase 2 (implementation plan §8; FRD §19). All four
  // optional and unused by every existing caller (the property-context
  // capture controller, groundedAsk.service.ts's legacy ADD_FACT/CORRECT_FACT
  // path) -- omitting them preserves this function's exact prior behavior.
  // Only the new CAPTURE_FACT_CONFIRM operation (confirmCapabilityHandlerRegistry.ts)
  // passes them.
  attribution: z.nativeEnum(AskCaptureAttribution).nullable().optional(),
  captureChannel: z.string().trim().max(100).nullable().optional(),
  extractionConfidence: z.number().min(0).max(1).nullable().optional(),
  // Idempotency key for a conversational capture-confirm write -- NOT
  // sourceEntityId, which already means "acting user" for every existing
  // caller (line ~307 below); reusing it would break ordinary repeat edits
  // by the same homeowner (Stage 2's third-round correction, FRD §19).
  captureExecutionId: z.string().trim().min(1).nullable().optional(),
});

export type CapturePropertyFactInput = z.infer<typeof capturePropertyFactInputSchema>;

// FRD §19: for THIRD_PARTY_RELAYED/INFERRED attribution, the write must NOT
// apply the unconditional verifiedAt-set/confidence:0.9 treatment this
// function has always used for every USER_REPORTED value (confirmed still
// true below) -- write verifiedAt: null and a distinctly lower confidence
// instead. No exact figure is specified upstream; 0.5 is chosen here as
// clearly below the 0.9 firsthand default while still above an "unknown"
// answer's absence of confidence, and is intentionally the same for both
// non-firsthand attributions rather than inventing an unrequested finer
// distinction between them.
const NON_FIRSTHAND_CONFIDENCE = 0.5;

function isNonFirsthandAttribution(attribution: AskCaptureAttribution | null | undefined): boolean {
  return attribution === 'THIRD_PARTY_RELAYED' || attribution === 'INFERRED';
}

export function normalizeCaptureValue(factKey: string, value: unknown): unknown {
  if (factKey in propertyFacts) {
    const mapping = propertyFacts[factKey as keyof typeof propertyFacts];
    return mapping.schema.parse(value === null && 'unknown' in mapping ? mapping.unknown : value);
  }
  if (factKey in exteriorFacts) {
    return exteriorFacts[factKey as keyof typeof exteriorFacts].schema.parse(value);
  }
  if (factKey in salePrepFacts) {
    return salePrepFacts[factKey as keyof typeof salePrepFacts].schema.parse(value);
  }
  if (factKey in responsibilityScopes) {
    return z.nativeEnum(ResponsibleParty).parse(value ?? 'UNKNOWN');
  }
  throw new Error(`Property Context fact is not supported for direct capture: ${factKey}`);
}

export async function writeCanonicalFact(
  tx: Prisma.TransactionClient,
  propertyId: string,
  factKey: string,
  value: unknown,
): Promise<void> {
  if (factKey in propertyFacts) {
    if (factKey === 'safety.hasSumpPump') {
      await tx.property.update({
        where: { id: propertyId },
        data: {
          hasSumpPump: value as boolean,
          ...(value === false ? { hasSumpPumpBackup: null } : {}),
          isResilienceVerified: value === false,
        },
      });
      return;
    }
    if (factKey === 'safety.hasSumpPumpBackup') {
      await tx.property.update({
        where: { id: propertyId },
        data: {
          hasSumpPump: true,
          hasSumpPumpBackup: value as boolean,
          isResilienceVerified: true,
        },
      });
      return;
    }
    const mapping = propertyFacts[factKey as keyof typeof propertyFacts];
    if (
      factKey === 'location.city'
      || factKey === 'location.state'
      || factKey === 'location.zipCode'
    ) {
      const current = await tx.property.findUnique({
        where: { id: propertyId },
        select: {
          address: true,
          city: true,
          state: true,
          zipCode: true,
        },
      });
      if (!current) throw new Error('Property not found');
      const patch = {
        ...(factKey === 'location.city' ? { city: value as string } : {}),
        ...(factKey === 'location.state' ? { state: value as string } : {}),
        ...(factKey === 'location.zipCode' ? { zipCode: value as string } : {}),
      };
      if (hasPropertyLocationIdentityChanged(current, patch)) {
        const nextZipCode = patch.zipCode ?? current.zipCode;
        await tx.propertyRadarCoverage.deleteMany({ where: { propertyId } });
        await tx.$executeRaw`
          UPDATE "properties"
          SET "locationPoint" = NULL
          WHERE "id" = ${propertyId}
        `;
        await tx.property.update({
          where: { id: propertyId },
          data: {
            [mapping.field]: value,
            ...buildPropertyGeographyInvalidation(nextZipCode),
          },
        });
        return;
      }
    }
    await tx.property.update({ where: { id: propertyId }, data: { [mapping.field]: value } });
    return;
  }

  if (factKey in exteriorFacts) {
    const mapping = exteriorFacts[factKey as keyof typeof exteriorFacts];
    const patch: Record<string, unknown> = { [mapping.field]: value };
    if (factKey === 'exterior.hasPrivateOutdoorSpace' && value === false) patch.outdoorSpaceTypes = [];
    if (factKey === 'exterior.outdoorSpaceTypes' && Array.isArray(value) && value.length > 0) {
      patch.hasPrivateOutdoorSpace = true;
    }
    await tx.propertyExteriorProfile.upsert({
      where: { propertyId },
      create: { propertyId, ...patch },
      update: patch,
    });
    return;
  }

  if (factKey in salePrepFacts) {
    const mapping = salePrepFacts[factKey as keyof typeof salePrepFacts];
    const patch: Record<string, unknown> = { [mapping.field]: value };
    await tx.propertySalePrepProfile.upsert({
      where: { propertyId },
      create: { propertyId, ...patch },
      update: patch,
    });
    return;
  }

  const scope = responsibilityScopes[factKey];
  await tx.propertyResponsibility.upsert({
    where: { propertyId_scope: { propertyId, scope } },
    create: { propertyId, scope, party: value as ResponsibleParty },
    update: { party: value as ResponsibleParty },
  });
}

export async function capturePropertyFact(
  propertyId: string,
  userId: string,
  factKey: string,
  rawInput: CapturePropertyFactInput,
) {
  const definition = getFactDefinition(factKey);
  if (!definition.writable || !isContextCaptureSupported(factKey)) {
    throw new Error(`Property Context fact is not writable through contextual capture: ${factKey}`);
  }
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access || ROLE_RANK[access.role] < ROLE_RANK.CONTRIBUTOR) throw new PropertyContextAccessDeniedError();

  const input = capturePropertyFactInputSchema.parse(rawInput);

  // FRD §19/§22: idempotency dedup must resolve to the original execution's
  // write regardless of current supersession state -- a stale replay must
  // not resurrect a value a later, unrelated correction already superseded.
  // Checked before the value is even normalized/validated again, since a
  // genuine replay carries the same (already-validated) captureExecutionId
  // the original write already succeeded with.
  if (input.captureExecutionId) {
    const existing = await prisma.propertyFactEvidence.findFirst({
      where: { propertyId, factKey, captureExecutionId: input.captureExecutionId },
    });
    if (existing) {
      const snapshot = await getPropertyContext(propertyId, { userId }, { scopes: [definition.scope] });
      return { fact: snapshot.facts[factKey], contextVersion: snapshot.contextVersion, evidenceIds: [existing.id] };
    }
  }

  const value = normalizeCaptureValue(factKey, input.value);
  const radarReconciliationReason =
    radarReconciliationReasonForFactKey(factKey);
  const unknownAnswer = value === null || value === 'UNKNOWN';
  const observedAt = new Date();
  const nonFirsthand = isNonFirsthandAttribution(input.attribution);

  let evidenceId = '';
  try {
    await prisma.$transaction(async (tx) => {
      if (!unknownAnswer) {
        await writeCanonicalFact(tx, propertyId, factKey, value);
        await tx.propertyFactEvidence.updateMany({
          where: { propertyId, factKey, supersededAt: null },
          data: { supersededAt: observedAt },
        });
      } else if (factKey === 'safety.hasSumpPump' || factKey === 'safety.hasSumpPumpBackup') {
        // "Not sure" is an explicit response. Preserve the unknown physical
        // fact while preventing repeated prompts until the homeowner edits it.
        await tx.property.update({
          where: { id: propertyId },
          data: { isResilienceVerified: true },
        });
      }
      const evidence = await tx.propertyFactEvidence.create({
        data: {
          propertyId,
          factKey,
          sourceType: input.sourceType,
          observationState: unknownAnswer ? 'UNKNOWN' : 'KNOWN',
          sourceEntityType: 'PROPERTY_CONTEXT_CAPTURE',
          sourceEntityId: userId,
          confidence: input.confidence ?? (nonFirsthand ? NON_FIRSTHAND_CONFIDENCE : (input.sourceType === 'USER_REPORTED' ? 0.9 : null)),
          observedAt,
          validUntil: input.validUntil ?? null,
          verifiedAt: nonFirsthand ? null : (input.sourceType === 'USER_REPORTED' ? observedAt : null),
          captureExecutionId: input.captureExecutionId ?? null,
          captureChannel: input.captureChannel ?? null,
          attribution: input.attribution ?? null,
          extractionConfidence: input.extractionConfidence ?? null,
        },
      });
      evidenceId = evidence.id;
      await emitPropertyChangeWithTransaction(tx, {
        propertyId,
        sourceType: 'PROPERTY_FACT',
        sourceEntityId: evidence.id,
        sourceRevision: observedAt.toISOString(),
        changeType: 'PROPERTY_FACT_CHANGED',
        changedFactKeys: [factKey],
        canonicalReferences: [{ entityType: 'PROPERTY', entityId: propertyId, fieldPath: factKey }],
        occurredAt: observedAt,
        detectedAt: observedAt,
        confidence: evidence.confidence,
        sourceHealth: 'CURRENT',
        signals: {
          homeownerRelevant: true,
          lifecycleAdvanced: false,
          propertyEffectConfirmed: !unknownAnswer,
          urgentSafetyCondition: factKey.startsWith('safety.') && value === true,
          canonicalActionPriority: null,
        },
      });
      if (radarReconciliationReason) {
        await requestRadarPropertyReconciliation(
          {
            propertyId,
            reasons: [radarReconciliationReason],
            changeToken: observedAt.toISOString(),
            correlationId:
              `property-context:${propertyId}:${factKey}:${observedAt.toISOString()}`,
          },
          tx,
          observedAt,
        );
      }
    });
    propertyContextCapturesTotal.inc({ scope: definition.scope, fact_key: factKey, outcome: 'success' });
  } catch (error) {
    // Defense-in-depth for the race the initial check above (line ~315)
    // can't close by itself: two concurrent replays of the same
    // captureExecutionId both pass the pre-check, then one loses the
    // @@unique([propertyId, factKey, captureExecutionId]) race here. Resolve
    // to the winner's row rather than surfacing a spurious failure.
    if (
      input.captureExecutionId
      && error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2002'
    ) {
      const winner = await prisma.propertyFactEvidence.findFirst({
        where: { propertyId, factKey, captureExecutionId: input.captureExecutionId },
      });
      if (winner) {
        propertyContextCapturesTotal.inc({ scope: definition.scope, fact_key: factKey, outcome: 'success' });
        const snapshot = await getPropertyContext(propertyId, { userId }, { scopes: [definition.scope] });
        return { fact: snapshot.facts[factKey], contextVersion: snapshot.contextVersion, evidenceIds: [winner.id] };
      }
    }
    propertyContextCapturesTotal.inc({ scope: definition.scope, fact_key: factKey, outcome: 'error' });
    throw error;
  }

  const snapshot = await getPropertyContext(propertyId, { userId }, { scopes: [definition.scope] });
  return { fact: snapshot.facts[factKey], contextVersion: snapshot.contextVersion, evidenceIds: [evidenceId] };
}

export async function listPropertyFactEvidence(propertyId: string, userId: string, factKey: string) {
  getFactDefinition(factKey);
  if (!await resolvePropertyAccess(userId, propertyId)) throw new PropertyContextAccessDeniedError();
  return prisma.propertyFactEvidence.findMany({
    where: { propertyId, factKey },
    orderBy: [{ observedAt: 'desc' }],
    select: {
      id: true,
      factKey: true,
      sourceType: true,
      sourceEntityType: true,
      confidence: true,
      observedAt: true,
      validUntil: true,
      verifiedAt: true,
      supersededAt: true,
    },
  });
}
