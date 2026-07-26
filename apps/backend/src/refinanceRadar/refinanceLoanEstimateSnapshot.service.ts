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
  return {
    id: row.id,
    propertyId: row.propertyId,
    label: row.label,
    offers: row.offersJson as unknown as RefinanceLoanEstimateInput[],
    comparison:
      row.comparisonJson as unknown as RefinanceLoanEstimateComparison,
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
  const row = await prisma.refinanceLoanEstimateComparisonSnapshot.create({
    data: {
      propertyId: input.propertyId,
      label: input.label?.trim() || null,
      offersJson: input.offers as unknown as Prisma.InputJsonValue,
      comparisonJson: comparison as unknown as Prisma.InputJsonValue,
    },
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
