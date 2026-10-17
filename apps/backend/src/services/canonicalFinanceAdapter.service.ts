import { rateFromBasisPoints } from './mortgageRate';
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
    // Basis points to a decimal fraction (650 -> 0.065) through the one shared conversion. Plausibility is checked where the rate is used (mortgageRate.ts).
    interestRate: row.interestRateBps == null ? null : rateFromBasisPoints(row.interestRateBps),
    remainingTermMonths: row.remainingTermMonths ?? null,
    monthlyPayment: row.monthlyPaymentCents == null ? null : row.monthlyPaymentCents / 100,
    lastVerifiedAt: (row.mortgageBalanceAsOfDate ?? row.updatedAt).toISOString(),
  };
}
