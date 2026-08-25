import {
  Prisma,
  type RefinanceLoanEstimateComparisonSnapshot,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  compareRefinanceLoanEstimates,
  type RefinanceLoanEstimateComparison,
  type RefinanceLoanEstimateInput,
} from './refinanceLoanEstimateComparison';
import { emitPropertyChangeWithTransaction } from '../propertyChanges/propertyChange.service';

export interface SavedRefinanceLoanEstimateComparison {
  id: string;
  propertyId: string;
  label: string | null;
  offers: RefinanceLoanEstimateInput[];
  comparison: RefinanceLoanEstimateComparison;
  createdAt: string;
  updatedAt: string;
}

function mapSnapshot(
  row: RefinanceLoanEstimateComparisonSnapshot,
): SavedRefinanceLoanEstimateComparison {
  const offers =
    row.offersJson as unknown as RefinanceLoanEstimateInput[];
  return {
    id: row.id,
    propertyId: row.propertyId,
    label: row.label,
    offers,
    comparison: compareRefinanceLoanEstimates(offers),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function saveRefinanceLoanEstimateComparison(input: {
  propertyId: string;
  label?: string;
  offers: RefinanceLoanEstimateInput[];
}): Promise<SavedRefinanceLoanEstimateComparison> {
  const comparison = compareRefinanceLoanEstimates(input.offers);
  const extractedOffers = input.offers.filter((offer) => offer.extractionProvenance);

  // HI-DOC-003/005 (Home Intelligence FRD §8.7, Phase 5 remediation item d)
  // — this is the registered LOAN_ESTIMATE promotion adapter: the
  // homeowner's own save is the review step (no separate persisted
  // candidate row precedes it), and this is the point a document-derived
  // offer becomes a canonical record, so it emits a PropertyChange like
  // every other promotion adapter.
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.refinanceLoanEstimateComparisonSnapshot.create({
      data: {
        propertyId: input.propertyId,
        label: input.label?.trim() || null,
        offersJson: input.offers as unknown as Prisma.InputJsonValue,
        comparisonJson: comparison as unknown as Prisma.InputJsonValue,
      },
    });

    await emitPropertyChangeWithTransaction(tx, {
      propertyId: input.propertyId,
      sourceType: 'DOCUMENT',
      sourceEntityId: created.id,
      sourceRevision: created.updatedAt.toISOString(),
      changeType: extractedOffers.length > 0 ? 'DOCUMENT_PROMOTED' : 'SOURCE_RECORD_CREATED',
      changedFactKeys: ['financial.refinanceLoanEstimateComparison'],
      canonicalReferences: [{ entityType: 'REFINANCE_LOAN_ESTIMATE_COMPARISON_SNAPSHOT', entityId: created.id }],
      occurredAt: created.createdAt,
      detectedAt: new Date(),
      confidence: extractedOffers.length > 0
        ? Math.min(...extractedOffers.map((offer) => {
            const values = Object.values(offer.extractionProvenance!.fieldConfidence);
            return values.length > 0 ? Math.min(...values) : 0.5;
          }))
        : 1,
      sourceHealth: 'CURRENT',
      signals: {
        homeownerRelevant: true,
        lifecycleAdvanced: true,
        propertyEffectConfirmed: true,
        urgentSafetyCondition: false,
        canonicalActionPriority: null,
      },
    });

    return created;
  });

  return mapSnapshot(row);
}

export async function listSavedRefinanceLoanEstimateComparisons(
  propertyId: string,
): Promise<SavedRefinanceLoanEstimateComparison[]> {
  const rows =
    await prisma.refinanceLoanEstimateComparisonSnapshot.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  return rows.map(mapSnapshot);
}

export interface LoanEstimateComparisonDeleteStore {
  refinanceLoanEstimateComparisonSnapshot: {
    deleteMany(input: {
      where: { id: string; propertyId: string };
    }): Promise<{ count: number }>;
  };
}

export async function deleteSavedRefinanceLoanEstimateComparison(
  propertyId: string,
  comparisonId: string,
  store: LoanEstimateComparisonDeleteStore = prisma,
): Promise<boolean> {
  const result =
    await store.refinanceLoanEstimateComparisonSnapshot.deleteMany({
      where: { id: comparisonId, propertyId },
    });
  return result.count > 0;
}
