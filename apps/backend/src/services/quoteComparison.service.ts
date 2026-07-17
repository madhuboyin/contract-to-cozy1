import { QuoteComparisonWorkspaceStatus, ServiceCategory } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { withSerializableDedupe } from './projectCompliance/serializableDedupe';

const OPEN_WORKSPACE_STATUSES: QuoteComparisonWorkspaceStatus[] = ['DRAFT', 'SHORTLISTED'];

export interface GetOrCreateQuoteWorkspaceInput {
  serviceCategory?: ServiceCategory | null;
  inventoryItemId?: string | null;
  guidanceJourneyId?: string | null;
  guidanceStepKey?: string | null;
  guidanceSignalIntentFamily?: string | null;
  scopeSummary?: string | null;
}

async function validateScope(propertyId: string, input: GetOrCreateQuoteWorkspaceInput) {
  const inventoryItem = input.inventoryItemId
    ? await prisma.inventoryItem.findFirst({ where: { id: input.inventoryItemId, propertyId }, select: { id: true } })
    : null;
  if (input.inventoryItemId && !inventoryItem) {
    throw new APIError('Inventory item not found for this property.', 404, 'QUOTE_SCOPE_NOT_FOUND');
  }
}

export async function getOrCreateQuoteComparisonWorkspace(
  propertyId: string,
  userId: string,
  input: GetOrCreateQuoteWorkspaceInput,
) {
  await validateScope(propertyId, input);

  const exactScope = {
    inventoryItemId: input.inventoryItemId ?? null,
    serviceCategory: input.serviceCategory ?? null,
  };
  return withSerializableDedupe(async (tx) => {
    const existing = await tx.quoteComparisonWorkspace.findFirst({
      where: {
        propertyId,
        status: { in: OPEN_WORKSPACE_STATUSES },
        OR: [
          ...(input.guidanceJourneyId ? [{ guidanceJourneyId: input.guidanceJourneyId }] : []),
          exactScope,
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (existing) return { workspace: existing, reused: true };

    const workspace = await tx.quoteComparisonWorkspace.create({
      data: {
        propertyId,
        createdByUserId: userId,
        ...exactScope,
        guidanceJourneyId: input.guidanceJourneyId ?? null,
        guidanceStepKey: input.guidanceStepKey ?? null,
        guidanceSignalIntentFamily: input.guidanceSignalIntentFamily ?? null,
        scopeSummary: input.scopeSummary?.trim() || null,
        status: 'DRAFT',
      },
    });
    return { workspace, reused: false };
  });
}
