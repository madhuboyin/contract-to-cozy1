// Ask exact-four, packet D5: the governed mortgage-status capture. The ONLY transition it performs is UNKNOWN -> MORTGAGED or
// UNKNOWN -> NO_MORTGAGE, and the UNKNOWN precondition is part of the write itself (a single conditional UPDATE), never a read
// followed by a write: NO_MORTGAGE is the destructive direction elsewhere (`markPropertyAsHavingNoMortgage` clears every mortgage
// field), so a read-then-write check would leave a race. Changing a known status is a normal edit elsewhere, never a capture.
//
// Shape (mirrors capturePropertyFinancingFact, in the same transaction):
//   1. evidence create  -- the idempotency gate (unique on propertyId + factKey + captureExecutionId) and the audit row;
//   2. supersede prior evidence for this fact;
//   3. ensure the 1:1 profile row exists (ON CONFLICT DO NOTHING, so a concurrent creator never aborts the transaction);
//   4. the conditional transition  UPDATE ... WHERE propertyId AND mortgageStatus = UNKNOWN [AND no mortgage detail for NO_MORTGAGE];
//   5. emit the property change.
// A refused transition (count 0) throws a sentinel that rolls the whole transaction back, so the evidence row never survives a
// capture that did not happen. The post-refusal read only CLASSIFIES why; it never decides anything.
//
// NO_MORTGAGE never wipes data: if mortgage details already exist (for example a rate captured before the status), the write is
// refused as CONFLICT_DETAILS and the household resolves it in the financing profile.
import { Prisma, PropertyFactSourceType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { propertyContextCapturesTotal } from '../../../lib/metrics';
import { resolvePropertyAccess, ROLE_RANK } from '../../../services/propertyAccess.service';
import { emitPropertyChangeWithTransaction } from '../../../propertyChanges/propertyChange.service';
import { getFactDefinition } from '../catalog/factCatalog';
import { getPropertyContext, PropertyContextAccessDeniedError } from './getPropertyContext';

export const MORTGAGE_STATUS_FACT_KEY = 'financial.mortgageStatus' as const;
export const MORTGAGE_STATUS_ANSWERS = ['MORTGAGED', 'NO_MORTGAGE'] as const;
export type MortgageStatusAnswer = typeof MORTGAGE_STATUS_ANSWERS[number];

/** Fields whose presence contradicts "no mortgage". Their absence is part of the NO_MORTGAGE write condition. */
export const MORTGAGE_DETAIL_FIELDS = [
  'mortgageType', 'originalMortgageBalanceCents', 'currentMortgageBalanceCents', 'mortgageBalanceAsOfDate', 'interestRateBps',
  'remainingTermMonths', 'monthlyPaymentCents', 'secondMortgageBalanceCents',
] as const;

const inputSchema = z.object({
  status: z.enum(MORTGAGE_STATUS_ANSWERS),
  sourceType: z.nativeEnum(PropertyFactSourceType).default('USER_REPORTED'),
  captureExecutionId: z.string().trim().min(1).nullable().optional(),
  captureChannel: z.string().trim().max(100).nullable().optional(),
});
export type CapturePropertyMortgageStatusInput = z.input<typeof inputSchema>;

export type MortgageStatusOutcome =
  /** The transition happened in this call. */
  | 'CAPTURED'
  /** The same answer was already recorded (including an idempotent replay); nothing changed. */
  | 'ALREADY_SET'
  /** A different answer is already recorded; a capture never changes a known status. */
  | 'CONFLICT_STATUS'
  /** NO_MORTGAGE was refused because mortgage details already exist; nothing was wiped. */
  | 'CONFLICT_DETAILS';

export interface MortgageStatusResult {
  outcome: MortgageStatusOutcome;
  status: MortgageStatusAnswer | 'UNKNOWN' | null;
  contextVersion: string | null;
}

class TransitionRefused extends Error { constructor() { super('mortgage status transition refused'); } }

/** The slice of Prisma this writer uses, injectable so the concurrency behavior is testable without a database. */
export interface MortgageStatusDeps {
  resolveAccess(userId: string, propertyId: string): Promise<{ role: keyof typeof ROLE_RANK } | null>;
  transaction<T>(callback: (tx: any) => Promise<T>): Promise<T>;
  readProfile(propertyId: string): Promise<{ mortgageStatus: string } & Record<string, unknown> | null>;
  emitChange(tx: any, input: Parameters<typeof emitPropertyChangeWithTransaction>[1]): Promise<unknown>;
  loadContextVersion(propertyId: string, userId: string): Promise<string | null>;
  now(): Date;
}

const defaultDeps: MortgageStatusDeps = {
  resolveAccess: (userId, propertyId) => resolvePropertyAccess(userId, propertyId) as Promise<{ role: keyof typeof ROLE_RANK } | null>,
  transaction: (callback) => prisma.$transaction(callback),
  readProfile: (propertyId) => prisma.propertyFinancingProfile.findUnique({ where: { propertyId } }) as Promise<any>,
  emitChange: (tx, input) => emitPropertyChangeWithTransaction(tx, input),
  loadContextVersion: async (propertyId, userId) => (await getPropertyContext(propertyId, { userId }, { scopes: ['FINANCIAL'] })).contextVersion,
  now: () => new Date(),
};

function transitionWhere(propertyId: string, status: MortgageStatusAnswer) {
  const base: Record<string, unknown> = { propertyId, mortgageStatus: 'UNKNOWN' };
  if (status === 'NO_MORTGAGE') {
    for (const field of MORTGAGE_DETAIL_FIELDS) base[field] = null;
    base.hasSecondMortgage = false;
    base.hasPMI = false;
  }
  return base;
}

export async function capturePropertyMortgageStatus(
  propertyId: string,
  userId: string,
  rawInput: CapturePropertyMortgageStatusInput,
  deps: MortgageStatusDeps = defaultDeps,
): Promise<MortgageStatusResult> {
  const definition = getFactDefinition(MORTGAGE_STATUS_FACT_KEY);
  const access = await deps.resolveAccess(userId, propertyId);
  if (!access || ROLE_RANK[access.role] < ROLE_RANK.CONTRIBUTOR) throw new PropertyContextAccessDeniedError();
  const input = inputSchema.parse(rawInput);
  const observedAt = deps.now();
  let outcome: MortgageStatusOutcome = 'CAPTURED';

  try {
    await deps.transaction(async (tx) => {
      // 1. Idempotency gate and audit row.
      const evidence = await tx.propertyFactEvidence.create({
        data: {
          propertyId, factKey: MORTGAGE_STATUS_FACT_KEY, sourceType: input.sourceType, observationState: 'KNOWN',
          sourceEntityType: 'PROPERTY_CONTEXT_CAPTURE', sourceEntityId: userId,
          confidence: input.sourceType === 'USER_REPORTED' ? 0.9 : null, observedAt,
          verifiedAt: input.sourceType === 'USER_REPORTED' ? observedAt : null,
          captureExecutionId: input.captureExecutionId ?? null, captureChannel: input.captureChannel ?? null,
          attribution: null, extractionConfidence: null,
        },
      });
      // 2. Supersede earlier evidence, excluding the row created above.
      await tx.propertyFactEvidence.updateMany({
        where: { propertyId, factKey: MORTGAGE_STATUS_FACT_KEY, supersededAt: null, id: { not: evidence.id } },
        data: { supersededAt: observedAt },
      });
      // 3. Make sure the 1:1 row exists without ever aborting on a concurrent creator.
      await tx.propertyFinancingProfile.createMany({ data: [{ propertyId, mortgageStatus: 'UNKNOWN' }], skipDuplicates: true });
      // 4. THE atomic transition: the UNKNOWN precondition is the WHERE clause.
      const transitioned = await tx.propertyFinancingProfile.updateMany({
        where: transitionWhere(propertyId, input.status),
        data: { mortgageStatus: input.status },
      });
      if (transitioned.count !== 1) throw new TransitionRefused();
      // 5. Emit, then commit.
      await deps.emitChange(tx, {
        propertyId, sourceType: 'PROPERTY_FACT', sourceEntityId: evidence.id, sourceRevision: observedAt.toISOString(),
        changeType: 'PROPERTY_FACT_CHANGED', changedFactKeys: [MORTGAGE_STATUS_FACT_KEY],
        canonicalReferences: [{ entityType: 'PROPERTY', entityId: propertyId, fieldPath: MORTGAGE_STATUS_FACT_KEY }],
        occurredAt: observedAt, detectedAt: observedAt, confidence: evidence.confidence, sourceHealth: 'CURRENT',
        signals: { homeownerRelevant: true, lifecycleAdvanced: false, propertyEffectConfirmed: true, urgentSafetyCondition: false, canonicalActionPriority: null },
      });
    });
    propertyContextCapturesTotal.inc({ scope: definition.scope, fact_key: MORTGAGE_STATUS_FACT_KEY, outcome: 'success' });
  } catch (error) {
    if (error instanceof TransitionRefused) {
      // Classification only (the refusal already rolled everything back, including the evidence row).
      const profile = await deps.readProfile(propertyId);
      const current = (profile?.mortgageStatus ?? 'UNKNOWN') as MortgageStatusAnswer | 'UNKNOWN';
      outcome = current === input.status ? 'ALREADY_SET' : current !== 'UNKNOWN' ? 'CONFLICT_STATUS' : 'CONFLICT_DETAILS';
      propertyContextCapturesTotal.inc({ scope: definition.scope, fact_key: MORTGAGE_STATUS_FACT_KEY, outcome: outcome === 'ALREADY_SET' ? 'success' : 'rejected' });
      return { outcome, status: current, contextVersion: await deps.loadContextVersion(propertyId, userId) };
    }
    // An idempotent replay: the same execution already committed (unique evidence key). The first call's outcome stands.
    if (input.captureExecutionId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const profile = await deps.readProfile(propertyId);
      propertyContextCapturesTotal.inc({ scope: definition.scope, fact_key: MORTGAGE_STATUS_FACT_KEY, outcome: 'success' });
      return { outcome: 'ALREADY_SET', status: (profile?.mortgageStatus ?? null) as MortgageStatusResult['status'], contextVersion: await deps.loadContextVersion(propertyId, userId) };
    }
    propertyContextCapturesTotal.inc({ scope: definition.scope, fact_key: MORTGAGE_STATUS_FACT_KEY, outcome: 'error' });
    throw error;
  }
  return { outcome, status: input.status, contextVersion: await deps.loadContextVersion(propertyId, userId) };
}
