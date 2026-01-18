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
  const row = await prisma.propertyFinanceSnapshot.findUnique({ where: { propertyId } });
  if (!row) return null;

  return {
    propertyId: row.propertyId,
    mortgageBalance: row.mortgageBalance ?? null,
    interestRate: row.interestRate ?? null,
    remainingTermMonths: row.remainingTermMonths ?? null,
    monthlyPayment: row.monthlyPayment ?? null,
    lastVerifiedAt: row.lastVerifiedAt ? row.lastVerifiedAt.toISOString() : null,
  };
}

export async function upsertFinanceSnapshot(propertyId: string, patch: Partial<FinanceSnapshotDTO>) {
  const row = await prisma.propertyFinanceSnapshot.upsert({
    where: { propertyId },
    create: {
      propertyId,
      mortgageBalance: patch.mortgageBalance ?? null,
      interestRate: patch.interestRate ?? null,
      remainingTermMonths: patch.remainingTermMonths ?? null,
      monthlyPayment: patch.monthlyPayment ?? null,
      lastVerifiedAt: patch.lastVerifiedAt ? new Date(patch.lastVerifiedAt) : new Date(),
    },
    update: {
      mortgageBalance: patch.mortgageBalance ?? undefined,
      interestRate: patch.interestRate ?? undefined,
      remainingTermMonths: patch.remainingTermMonths ?? undefined,
      monthlyPayment: patch.monthlyPayment ?? undefined,
      lastVerifiedAt: patch.lastVerifiedAt ? new Date(patch.lastVerifiedAt) : new Date(),
    },
  });

  return row;
}
