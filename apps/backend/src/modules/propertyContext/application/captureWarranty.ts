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
import { Prisma, WarrantyCategory } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { propertyContextCapturesTotal } from '../../../lib/metrics';
import { resolvePropertyAccess, ROLE_RANK } from '../../../services/propertyAccess.service';
import { PropertyContextAccessDeniedError } from './getPropertyContext';

const captureWarrantyInputSchema = z.object({
  providerName: z.string().trim().min(1).max(160),
  category: z.nativeEnum(WarrantyCategory),
  policyNumber: z.string().trim().max(160).nullable().optional(),
  coverageDetails: z.string().trim().max(2000).nullable().optional(),
  cost: z.number().nonnegative().max(10_000_000).nullable().optional(),
  startDate: z.string().datetime(),
  expiryDate: z.string().datetime(),
  sourceExecutionId: z.string().trim().min(1),
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

  try {
    const warranty = await prisma.$transaction(async (tx) => {
      const property = await tx.property.findUnique({ where: { id: propertyId }, select: { homeownerProfileId: true } });
      if (!property) throw new Error('Property not found.');
      return tx.warranty.create({
        data: {
          homeownerProfileId: property.homeownerProfileId,
          propertyId,
          providerName: input.providerName,
          category: input.category,
          policyNumber: input.policyNumber ?? null,
          coverageDetails: input.coverageDetails ?? null,
          cost: input.cost != null ? new Prisma.Decimal(input.cost) : null,
          startDate,
          expiryDate,
          sourceExecutionId: input.sourceExecutionId,
        },
      });
    });
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
