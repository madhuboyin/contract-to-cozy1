// Ask Cozy Stage 3, Phase 3 (implementation plan §9/§22; FRD §14/§22's
// "warranty sibling-pairing" gap, closed by this writer).
//
// A dedicated writer for the CAPTURE_WARRANTY_CONFIRM operation -- Warranty
// is not a PropertyFactEvidence-backed fact (no factCatalog entry, no
// canonicalOwner on a scalar Property field), so this cannot go through
// capturePropertyFact.ts's generic writer, the same reasoning that gave
// capturePropertyFinancingFact.ts its own dedicated writer for
// financial.currentMortgage. Idempotency here doesn't need that writer's
// "create-first-then-supersede-excluding-self" ordering, because a Warranty
// row has no prior-value supersession chain to protect -- it is a single
// create, gated on the schema's own @@unique([propertyId, sourceExecutionId])
// (confirmed present on the Warranty model, forward-provisioned during
// Phase 2 alongside AskExecution.linkedExecutionId for exactly this future
// writer). A P2002 on that constraint means this is a lease-reclaim retry of
// an already-succeeded attempt; recovered the same way as
// capturePropertyFact/capturePropertyFinancingFact's own outer-catch.
//
// homeownerProfileId (required, non-nullable on Warranty) is resolved from
// propertyId via a direct Property lookup -- the same pattern already used
// by every other Warranty-creating caller in this codebase
// (relationalCaptureAdapters.ts's own createWarranty, confirmed by reading
// it directly before writing this).
import { Prisma, WarrantyCategory, WarrantyScopeKind } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { propertyContextCapturesTotal } from '../../../lib/metrics';
import { resolvePropertyAccess, ROLE_RANK } from '../../../services/propertyAccess.service';
import { PropertyContextAccessDeniedError } from './getPropertyContext';
import { assertCanonicalWarrantyScope } from '../../../services/warrantyCanonicalModel';
import {
  classifyWarrantyCoverage,
  warrantyCreateLockText,
  warrantyOverrideFingerprint,
  type ExistingWarrantyRecord,
  type WarrantyCoverageClassification,
} from './warrantyCoverageMatch';

/** Raised when an identical warranty is already recorded for the same target (Actionable Result Enrichment FRD §5.2). Nothing is written. */
export class WarrantyAlreadyRecordedError extends Error {
  readonly code = 'ASK_CONFIRMATION_CONFLICT';
  constructor(readonly existingWarrantyId: string) {
    super('This warranty is already recorded for this item, so nothing was added. Start Record warranty again to review the current coverage.');
  }
}

/** Raised when equivalent or conflicting coverage exists and the reviewed, single-use override no longer matches it. Nothing is written. */
export class WarrantyCoverageChangedError extends Error {
  readonly code = 'ASK_CONFIRMATION_CONFLICT';
  constructor() {
    super('Coverage already recorded for this item overlaps this warranty or changed since you reviewed it, so nothing was added. Start Record warranty again to review the current coverage.');
  }
}

type WarrantyDb = Pick<Prisma.TransactionClient, 'warranty'>;

/**
 * Every existing warranty on ONE target (an inventory item, or the property-wide target when no item), classified against a candidate. Used by the
 * Ask review step (to choose the review surface) and again inside the write transaction (the authoritative check).
 */
export async function findWarrantyCoverage(
  db: WarrantyDb,
  propertyId: string,
  inventoryItemId: string | null,
  candidate: { providerName: string; policyNumber?: string | null; category: string; scopeKind: string; startDate: Date; expiryDate: Date },
): Promise<WarrantyCoverageClassification> {
  const rows = await db.warranty.findMany({
    where: { propertyId, inventoryItemId },
    select: { id: true, providerName: true, policyNumber: true, category: true, scopeKind: true, startDate: true, expiryDate: true, updatedAt: true },
  });
  const existing: ExistingWarrantyRecord[] = rows.map((row) => ({ ...row, category: String(row.category), scopeKind: String(row.scopeKind) }));
  return classifyWarrantyCoverage(candidate, existing);
}

const captureWarrantyInputSchema = z.object({
  providerName: z.string().trim().min(1).max(160),
  category: z.nativeEnum(WarrantyCategory),
  scopeKind: z.nativeEnum(WarrantyScopeKind).optional(),
  inventoryItemId: z.string().uuid().nullable().optional(),
  policyNumber: z.string().trim().max(160).nullable().optional(),
  coverageDetails: z.string().trim().max(2000).nullable().optional(),
  cost: z.number().nonnegative().max(10_000_000).nullable().optional(),
  startDate: z.string().datetime(),
  expiryDate: z.string().datetime(),
  sourceExecutionId: z.string().trim().min(1),
  /** The single-use override fingerprint stored with this execution at review time. Never client-supplied. */
  overrideFingerprint: z.string().trim().min(1).nullable().optional(),
});

export type CaptureWarrantyInput = z.infer<typeof captureWarrantyInputSchema>;

export async function captureWarranty(
  propertyId: string,
  userId: string,
  rawInput: CaptureWarrantyInput,
) {
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access || ROLE_RANK[access.role] < ROLE_RANK.CONTRIBUTOR) throw new PropertyContextAccessDeniedError();

  const input = captureWarrantyInputSchema.parse(rawInput);
  const startDate = new Date(input.startDate);
  const expiryDate = new Date(input.expiryDate);
  if (expiryDate <= startDate) throw new Error('Warranty expiry date must be after the start date.');
  const scopeKind = assertCanonicalWarrantyScope({ ...input, propertyId });

  try {
    const warranty = await prisma.$transaction((tx) => recordWarrantyInTransaction(tx, { propertyId, userId, input, scopeKind, startDate, expiryDate }));
    propertyContextCapturesTotal.inc({ scope: 'WARRANTY', fact_key: 'warranty', outcome: 'success' });
    return warranty;
  } catch (error) {
    // Duplicate-key recovery, same shape as capturePropertyFact/
    // capturePropertyFinancingFact's own outer-catch: never retry, just
    // return the already-committed row from the winning attempt.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const winner = await prisma.warranty.findFirst({
        where: { propertyId, sourceExecutionId: input.sourceExecutionId },
      });
      if (winner) {
        propertyContextCapturesTotal.inc({ scope: 'WARRANTY', fact_key: 'warranty', outcome: 'success' });
        return winner;
      }
    }
    propertyContextCapturesTotal.inc({ scope: 'WARRANTY', fact_key: 'warranty', outcome: 'error' });
    throw error;
  }
}

/**
 * The authoritative create (FRD §5.4). Order matters:
 *  1. take the transaction-scoped advisory lock for this target, so two concurrent executions serialize without a semantic unique index;
 *  2. return the row this same execution already wrote (a safe retry), before any duplicate check could mistake it for a duplicate;
 *  3. re-check the property and item;
 *  4. re-run the COMPLETE duplicate / conflict query and classify every current match;
 *  5. block an exact duplicate; require a matching single-use fingerprint for an equivalent or conflicting record; otherwise create.
 */
export async function recordWarrantyInTransaction(
  tx: Prisma.TransactionClient,
  ctx: { propertyId: string; userId: string; input: CaptureWarrantyInput; scopeKind: WarrantyScopeKind; startDate: Date; expiryDate: Date },
) {
  const { propertyId, userId, input, scopeKind, startDate, expiryDate } = ctx;
  const inventoryItemId = input.inventoryItemId ?? null;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${warrantyCreateLockText(propertyId, inventoryItemId)}, 0))`;

  const already = await tx.warranty.findFirst({ where: { propertyId, sourceExecutionId: input.sourceExecutionId } });
  if (already) return already;

  const property = await tx.property.findUnique({ where: { id: propertyId }, select: { homeownerProfileId: true } });
  if (!property) throw new Error('Property not found.');
  if (inventoryItemId) {
    const item = await tx.inventoryItem.findFirst({ where: { id: inventoryItemId, propertyId }, select: { id: true } });
    if (!item) throw new Error('Warranty inventory item does not belong to this property.');
  }

  const coverage = await findWarrantyCoverage(tx, propertyId, inventoryItemId, {
    providerName: input.providerName, policyNumber: input.policyNumber ?? null, category: input.category, scopeKind, startDate, expiryDate,
  });
  if (coverage.outcome === 'EXACT_DUPLICATE') throw new WarrantyAlreadyRecordedError(coverage.matches[0].id);
  if (coverage.outcome !== 'NO_MATCH') {
    const current = warrantyOverrideFingerprint({ executionId: input.sourceExecutionId, userId, propertyId, inventoryItemId, matches: coverage.matches });
    if (!input.overrideFingerprint || input.overrideFingerprint !== current) throw new WarrantyCoverageChangedError();
  }

  return tx.warranty.create({
    data: {
      homeownerProfileId: property.homeownerProfileId,
      propertyId,
      providerName: input.providerName,
      category: input.category,
      scopeKind,
      inventoryItemId,
      policyNumber: input.policyNumber ?? null,
      coverageDetails: input.coverageDetails ?? null,
      cost: input.cost != null ? new Prisma.Decimal(input.cost) : null,
      startDate,
      expiryDate,
      sourceExecutionId: input.sourceExecutionId,
    },
  });
}
