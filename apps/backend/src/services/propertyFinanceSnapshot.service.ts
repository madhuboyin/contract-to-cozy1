// apps/backend/src/services/propertyFinanceSnapshot.service.ts
import { prisma } from '../lib/prisma';

export type FinanceSnapshotDTO = {
  propertyId: string;
  mortgageBalance: number | null;
  interestRate: number | null;        // decimal
  remainingTermMonths: number | null;
  monthlyPayment: number | null;
  lastVerifiedAt: string | null;
};

export async function getFinanceSnapshot(propertyId: string): Promise<FinanceSnapshotDTO | null> {
  const row = await prisma.propertyFinancingProfile.findUnique({ where: { propertyId } });
  if (!row) return null;

  return {
    propertyId: row.propertyId,
    mortgageBalance: row.currentMortgageBalanceCents == null
      ? null
      : row.currentMortgageBalanceCents / 100,
    interestRate: row.interestRateBps == null ? null : row.interestRateBps / 10_000,
    remainingTermMonths: row.remainingTermMonths ?? null,
    monthlyPayment: row.monthlyPaymentCents == null ? null : row.monthlyPaymentCents / 100,
    lastVerifiedAt: row.mortgageBalanceAsOfDate
      ? row.mortgageBalanceAsOfDate.toISOString()
      : row.updatedAt.toISOString(),
  };
}

export async function upsertFinanceSnapshot(propertyId: string, patch: Partial<FinanceSnapshotDTO>) {
  await prisma.propertyFinancingProfile.upsert({
    where: { propertyId },
    create: {
      propertyId,
      currentMortgageBalanceCents: patch.mortgageBalance == null
        ? null
        : Math.round(patch.mortgageBalance * 100),
      interestRateBps: patch.interestRate == null
        ? null
        : Math.round(patch.interestRate * 10_000),
      remainingTermMonths: patch.remainingTermMonths ?? null,
      monthlyPaymentCents: patch.monthlyPayment == null
        ? null
        : Math.round(patch.monthlyPayment * 100),
      mortgageBalanceAsOfDate: patch.lastVerifiedAt ? new Date(patch.lastVerifiedAt) : new Date(),
    },
    update: {
      currentMortgageBalanceCents: patch.mortgageBalance == null
        ? undefined
        : Math.round(patch.mortgageBalance * 100),
      interestRateBps: patch.interestRate == null
        ? undefined
        : Math.round(patch.interestRate * 10_000),
      remainingTermMonths: patch.remainingTermMonths ?? undefined,
      monthlyPaymentCents: patch.monthlyPayment == null
        ? undefined
        : Math.round(patch.monthlyPayment * 100),
      mortgageBalanceAsOfDate: patch.lastVerifiedAt ? new Date(patch.lastVerifiedAt) : new Date(),
    },
  });

  return getFinanceSnapshot(propertyId);
}
