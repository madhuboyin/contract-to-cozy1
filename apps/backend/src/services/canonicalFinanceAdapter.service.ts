import { prisma } from '../lib/prisma';

export type CanonicalMortgageDTO = {
  propertyId: string;
  mortgageBalance: number | null;
  interestRate: number | null;
  remainingTermMonths: number | null;
  monthlyPayment: number | null;
  lastVerifiedAt: string | null;
};

export async function getCanonicalMortgage(propertyId: string): Promise<CanonicalMortgageDTO | null> {
  const row = await prisma.propertyFinancingProfile.findUnique({ where: { propertyId } });
  if (!row) return null;

  return {
    propertyId: row.propertyId,
    mortgageBalance: row.currentMortgageBalanceCents == null ? null : row.currentMortgageBalanceCents / 100,
    interestRate: row.interestRateBps == null ? null : row.interestRateBps / 10_000,
    remainingTermMonths: row.remainingTermMonths ?? null,
    monthlyPayment: row.monthlyPaymentCents == null ? null : row.monthlyPaymentCents / 100,
    lastVerifiedAt: (row.mortgageBalanceAsOfDate ?? row.updatedAt).toISOString(),
  };
}
