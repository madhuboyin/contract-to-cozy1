// Ask Cozy Stage 3, Phase 3 (implementation plan §9; FRD §19's "not every
// scalar fact goes through capturePropertyFact" finding).
//
// `financial.currentMortgage` (factCatalog.ts: writable: false, canonicalOwner
// PropertyFinancingProfile) cannot go through capturePropertyFact.ts's generic
// writer -- that function's own `!definition.writable` gate (:270-271) rejects
// it outright, and even without that gate the target model (a mutable
// propertyId-unique 1:1 row) isn't PropertyFactEvidence, so the generic
// writer's canonical-write step has nowhere to point. This is a small,
// dedicated writer for that one case, following capturePropertyFact's own
// four-effect shape (canonical write, supersede-prior, create-evidence, emit
// PropertyChange) but in a corrected order: the idempotency-gating create
// must run FIRST inside the transaction, because the blanket supersession
// step must exclude the row this same transaction just created -- copying
// capturePropertyFact's literal order would let it immediately re-supersede
// its own new row, leaving no active evidence for financingAssembler to read.
import { Prisma, AskCaptureAttribution, PropertyFactSourceType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { propertyContextCapturesTotal } from '../../../lib/metrics';
import { resolvePropertyAccess, ROLE_RANK } from '../../../services/propertyAccess.service';
import { getFactDefinition } from '../catalog/factCatalog';
import { getPropertyContext, PropertyContextAccessDeniedError } from './getPropertyContext';
import { emitPropertyChangeWithTransaction } from '../../../propertyChanges/propertyChange.service';

export const FINANCING_CAPTURE_FACT_KEY = 'financial.currentMortgage' as const;

/**
 * The household's mortgage status is NO_MORTGAGE, so a mortgage rate cannot be recorded. Raised from inside the transaction, so the
 * evidence row created before it rolls back with everything else. (Cross-writer integrity with `capturePropertyMortgageStatus`.)
 */
export class PropertyMortgageRateRefusedError extends Error {
  readonly code = 'MORTGAGE_STATUS_NO_MORTGAGE';
  constructor() { super('A mortgage rate cannot be recorded while the mortgage status is NO_MORTGAGE.'); }
}

// A percent value ("6.75" for 6.75%), not basis points -- matching how a
// homeowner actually states a mortgage rate in conversation. Bounds are a
// sanity check, not a product-accurate ceiling: negative or triple-digit-plus
// rates are never a real mortgage statement, so reject rather than silently
// clamp.
const capturePropertyFinancingFactInputSchema = z.object({
  value: z.number().min(0).max(100),
  sourceType: z.nativeEnum(PropertyFactSourceType).default('USER_REPORTED'),
  confidence: z.number().min(0).max(1).nullable().optional(),
  attribution: z.nativeEnum(AskCaptureAttribution).nullable().optional(),
  captureChannel: z.string().trim().max(100).nullable().optional(),
  extractionConfidence: z.number().min(0).max(1).nullable().optional(),
  captureExecutionId: z.string().trim().min(1).nullable().optional(),
});

export type CapturePropertyFinancingFactInput = z.infer<typeof capturePropertyFinancingFactInputSchema>;

const NON_FIRSTHAND_CONFIDENCE = 0.5;

function isNonFirsthandAttribution(attribution: AskCaptureAttribution | null | undefined): boolean {
  return attribution === 'THIRD_PARTY_RELAYED' || attribution === 'INFERRED';
}

/**
 * Cross-writer integrity with `capturePropertyMortgageStatus`: a rate must never land on a NO_MORTGAGE profile (the status writer
 * refuses NO_MORTGAGE over an existing rate; this is the mirror image). Every statement is conditional, never read-then-write:
 *  - no row yet: create it as MORTGAGED with the rate (ON CONFLICT DO NOTHING, so a concurrent creator never aborts the transaction);
 *  - UNKNOWN -> MORTGAGED with the rate (one conditional UPDATE);
 *  - already MORTGAGED: update the rate only (one conditional UPDATE);
 *  - NO_MORTGAGE: neither matches, which throws and rolls back the caller's transaction, evidence row included.
 * Returns whether the STATUS changed, so the caller can announce `financial.mortgageStatus` as well. Two rounds absorb a status that
 * moves between the two conditional updates. Must be called inside the caller's transaction.
 */
export async function writeMortgageRateGuarded(tx: Prisma.TransactionClient, propertyId: string, interestRateBps: number): Promise<{ statusChanged: boolean }> {
  const created = await tx.propertyFinancingProfile.createMany({
    data: [{ propertyId, mortgageStatus: 'MORTGAGED', interestRateBps }],
    skipDuplicates: true,
  });
  if (created.count > 0) return { statusChanged: true };
  for (let round = 0; round < 2; round += 1) {
    const promoted = await tx.propertyFinancingProfile.updateMany({
      where: { propertyId, mortgageStatus: 'UNKNOWN' },
      data: { interestRateBps, mortgageStatus: 'MORTGAGED' },
    });
    if (promoted.count === 1) return { statusChanged: true };
    const rateOnly = await tx.propertyFinancingProfile.updateMany({
      where: { propertyId, mortgageStatus: 'MORTGAGED' },
      data: { interestRateBps },
    });
    if (rateOnly.count === 1) return { statusChanged: false };
  }
  throw new PropertyMortgageRateRefusedError();
}

export const MORTGAGE_STATUS_FACT_KEY_FOR_RATE = 'financial.mortgageStatus' as const;

export interface RecordMortgageRateInput {
  propertyId: string;
  interestRateBps: number;
  observedAt: Date;
  /** The rate's own evidence row, already created in this transaction. */
  rateEvidence: { id: string; confidence: number | null };
  sourceType: PropertyFactSourceType;
  captureExecutionId: string | null;
  captureChannel: string | null;
}

/**
 * Steps 3 and 4 of the rate capture, inside the caller's transaction: the guarded canonical write, then ONE property change that
 * names every fact the capture changed. When the rate implicitly moved the status (new profile or UNKNOWN -> MORTGAGED), the status
 * is announced too (`changedFactKeys` carries both) and gets its own SYSTEM_DERIVED evidence row, so consumers watching
 * `financial.mortgageStatus` refresh and a pending status-capture chip is invalidated.
 */
export async function recordMortgageRate(
  tx: Prisma.TransactionClient,
  input: RecordMortgageRateInput,
  emitChange: typeof emitPropertyChangeWithTransaction = emitPropertyChangeWithTransaction,
): Promise<{ statusChanged: boolean }> {
  const { statusChanged } = await writeMortgageRateGuarded(tx, input.propertyId, input.interestRateBps);
  if (statusChanged) {
    const statusEvidence = await tx.propertyFactEvidence.create({
      data: {
        propertyId: input.propertyId, factKey: MORTGAGE_STATUS_FACT_KEY_FOR_RATE, sourceType: 'SYSTEM_DERIVED', observationState: 'KNOWN',
        sourceEntityType: 'PROPERTY_CONTEXT_CAPTURE', sourceEntityId: input.rateEvidence.id, confidence: null, observedAt: input.observedAt,
        verifiedAt: null, captureExecutionId: input.captureExecutionId, captureChannel: input.captureChannel, attribution: null, extractionConfidence: null,
      },
    });
    await tx.propertyFactEvidence.updateMany({
      where: { propertyId: input.propertyId, factKey: MORTGAGE_STATUS_FACT_KEY_FOR_RATE, supersededAt: null, id: { not: statusEvidence.id } },
      data: { supersededAt: input.observedAt },
    });
  }
  const changedFactKeys = statusChanged ? [FINANCING_CAPTURE_FACT_KEY, MORTGAGE_STATUS_FACT_KEY_FOR_RATE] : [FINANCING_CAPTURE_FACT_KEY];
  await emitChange(tx, {
    propertyId: input.propertyId,
    sourceType: 'PROPERTY_FACT',
    sourceEntityId: input.rateEvidence.id,
    sourceRevision: input.observedAt.toISOString(),
    changeType: 'PROPERTY_FACT_CHANGED',
    changedFactKeys,
    canonicalReferences: changedFactKeys.map((fieldPath) => ({ entityType: 'PROPERTY', entityId: input.propertyId, fieldPath })),
    occurredAt: input.observedAt,
    detectedAt: input.observedAt,
    confidence: input.rateEvidence.confidence,
    sourceHealth: 'CURRENT',
    signals: { homeownerRelevant: true, lifecycleAdvanced: false, propertyEffectConfirmed: true, urgentSafetyCondition: false, canonicalActionPriority: null },
  });
  return { statusChanged };
}

export async function capturePropertyFinancingFact(
  propertyId: string,
  userId: string,
  rawInput: CapturePropertyFinancingFactInput,
) {
  const definition = getFactDefinition(FINANCING_CAPTURE_FACT_KEY);
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access || ROLE_RANK[access.role] < ROLE_RANK.CONTRIBUTOR) throw new PropertyContextAccessDeniedError();

  const input = capturePropertyFinancingFactInputSchema.parse(rawInput);
  const nonFirsthand = isNonFirsthandAttribution(input.attribution);
  const observedAt = new Date();
  const interestRateBps = Math.round(input.value * 100);

  let evidenceId = '';
  try {
    await prisma.$transaction(async (tx) => {
      // Step 1 -- the idempotency gate, first statement in the transaction.
      // A P2002 here means this is a replay of an already-succeeded attempt;
      // caught below, outside this transaction (see the outer catch note).
      const evidence = await tx.propertyFactEvidence.create({
        data: {
          propertyId,
          factKey: FINANCING_CAPTURE_FACT_KEY,
          sourceType: input.sourceType,
          observationState: 'KNOWN',
          sourceEntityType: 'PROPERTY_CONTEXT_CAPTURE',
          sourceEntityId: userId,
          confidence: input.confidence ?? (nonFirsthand ? NON_FIRSTHAND_CONFIDENCE : (input.sourceType === 'USER_REPORTED' ? 0.9 : null)),
          observedAt,
          verifiedAt: nonFirsthand ? null : (input.sourceType === 'USER_REPORTED' ? observedAt : null),
          captureExecutionId: input.captureExecutionId ?? null,
          captureChannel: input.captureChannel ?? null,
          attribution: input.attribution ?? null,
          extractionConfidence: input.extractionConfidence ?? null,
        },
      });
      evidenceId = evidence.id;

      // Step 2 -- only reached on a genuine first-time create. The
      // `id: { not: evidence.id }` clause is required: without it this
      // blanket updateMany would re-supersede the row created one line above.
      await tx.propertyFactEvidence.updateMany({
        where: { propertyId, factKey: FINANCING_CAPTURE_FACT_KEY, supersededAt: null, id: { not: evidence.id } },
        data: { supersededAt: observedAt },
      });

      // Steps 3-4 -- the canonical value, written atomically against mortgageStatus, then ONE change naming every fact it changed
      // (including financial.mortgageStatus when the rate implicitly moved it). See `recordMortgageRate`.
      await recordMortgageRate(tx, {
        propertyId, interestRateBps, observedAt, rateEvidence: { id: evidence.id, confidence: evidence.confidence },
        sourceType: input.sourceType, captureExecutionId: input.captureExecutionId ?? null, captureChannel: input.captureChannel ?? null,
      });
    });
    propertyContextCapturesTotal.inc({ scope: definition.scope, fact_key: FINANCING_CAPTURE_FACT_KEY, outcome: 'success' });
  } catch (error) {
    if (error instanceof PropertyMortgageRateRefusedError) {
      propertyContextCapturesTotal.inc({ scope: definition.scope, fact_key: FINANCING_CAPTURE_FACT_KEY, outcome: 'rejected' });
      throw error;
    }
    // Duplicate-key recovery is an outer catch, not an inner one: a P2002 on
    // step 1's create aborts the whole Postgres transaction, so steps 2-4
    // never ran this attempt regardless of where the JS error is caught.
    // Never retry steps 2-4 for a replay -- just return the original,
    // already-committed row.
    if (
      input.captureExecutionId
      && error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2002'
    ) {
      const winner = await prisma.propertyFactEvidence.findFirst({
        where: { propertyId, factKey: FINANCING_CAPTURE_FACT_KEY, captureExecutionId: input.captureExecutionId },
      });
      if (winner) {
        propertyContextCapturesTotal.inc({ scope: definition.scope, fact_key: FINANCING_CAPTURE_FACT_KEY, outcome: 'success' });
        const snapshot = await getPropertyContext(propertyId, { userId }, { scopes: [definition.scope] });
        return { fact: snapshot.facts[FINANCING_CAPTURE_FACT_KEY], contextVersion: snapshot.contextVersion, evidenceIds: [winner.id] };
      }
    }
    propertyContextCapturesTotal.inc({ scope: definition.scope, fact_key: FINANCING_CAPTURE_FACT_KEY, outcome: 'error' });
    throw error;
  }

  const snapshot = await getPropertyContext(propertyId, { userId }, { scopes: [definition.scope] });
  return { fact: snapshot.facts[FINANCING_CAPTURE_FACT_KEY], contextVersion: snapshot.contextVersion, evidenceIds: [evidenceId] };
}
