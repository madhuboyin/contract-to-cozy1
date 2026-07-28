import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import {
  emptyOwnershipCostSourceBundle,
  type OwnershipCostSourceBundle,
  type OwnershipCostSourceInput,
} from './ownershipCostAdapters';
import type { OwnershipCostRecurrence } from './ownershipCost.contract';

type DbClient = Pick<
  typeof prisma,
  | 'propertyTaxBillRecord'
  | 'insurancePolicyTerm'
  | 'propertyFinancingProfile'
  | 'expense'
  | 'propertyMaintenanceTask'
  | 'hoaAssociation'
  | 'projectRecord'
  | 'homeReserveFund'
>;

function cents(value: Prisma.Decimal | number | string | null | undefined): number | null {
  if (value == null) return null;
  const numeric = typeof value === 'object' && 'toNumber' in value
    ? value.toNumber()
    : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric * 100);
}

function freshness(
  value: Date | null | undefined,
  asOf: Date,
): OwnershipCostSourceInput['freshnessStatus'] {
  if (!value) return 'UNKNOWN';
  const ageDays = Math.floor((asOf.getTime() - value.getTime()) / 86_400_000);
  if (ageDays <= 395) return 'CURRENT';
  if (ageDays <= 730) return 'AGING';
  return 'STALE';
}

function observedTemporalKind(
  value: Date | null | undefined,
  asOf: Date,
): 'CURRENT_PERIOD' | 'OBSERVED_PAST_PERIOD' {
  if (!value) return 'CURRENT_PERIOD';
  const currentPeriodStart = Date.UTC(asOf.getUTCFullYear(), 0, 1);
  return value.getTime() < currentPeriodStart
    ? 'OBSERVED_PAST_PERIOD'
    : 'CURRENT_PERIOD';
}

function recurrenceFromMaintenance(
  value: string | null | undefined,
): OwnershipCostRecurrence {
  switch (value) {
    case 'MONTHLY': return 'MONTHLY';
    case 'QUARTERLY': return 'QUARTERLY';
    case 'SEMI_ANNUALLY': return 'SEMIANNUAL';
    case 'ANNUALLY': return 'ANNUAL';
    default: return 'ONE_TIME';
  }
}

function recurrenceFromHoa(
  value: string | null | undefined,
): OwnershipCostRecurrence {
  switch (value) {
    case 'MONTHLY': return 'MONTHLY';
    case 'QUARTERLY': return 'QUARTERLY';
    case 'ANNUAL': return 'ANNUAL';
    default: return 'IRREGULAR';
  }
}

export async function loadOwnershipCostSourceBundle(
  propertyId: string,
  asOf: Date,
  db: DbClient = prisma,
): Promise<OwnershipCostSourceBundle> {
  const [
    taxBills,
    insuranceTerms,
    financingProfile,
    expenses,
    maintenanceTasks,
    hoa,
    projects,
    reserve,
  ] = await Promise.all([
    db.propertyTaxBillRecord.findMany({
      where: { propertyId, status: 'ACTIVE', supersededById: null },
      orderBy: [{ taxYear: 'desc' }, { observedAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        billAmount: true,
        currency: true,
        taxYear: true,
        periodStartDate: true,
        periodEndDate: true,
        observedAt: true,
        confidence: true,
        sourceType: true,
        updatedAt: true,
      },
    }),
    db.insurancePolicyTerm.findMany({
      where: { propertyId },
      orderBy: [{ termStart: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        annualPremium: true,
        termStart: true,
        termEnd: true,
        sourceDocumentId: true,
        verificationStatus: true,
        status: true,
        updatedAt: true,
      },
    }),
    db.propertyFinancingProfile.findUnique({
      where: { propertyId },
      select: {
        id: true,
        mortgageStatus: true,
        monthlyPaymentCents: true,
        interestRateBps: true,
        currentMortgageBalanceCents: true,
        mortgageBalanceAsOfDate: true,
        hasPMI: true,
        updatedAt: true,
      },
    }),
    db.expense.findMany({
      where: { propertyId },
      orderBy: [{ transactionDate: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        category: true,
        amount: true,
        description: true,
        transactionDate: true,
        projectId: true,
        updatedAt: true,
      },
    }),
    db.propertyMaintenanceTask.findMany({
      where: {
        propertyId,
        status: { in: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'NEEDS_REVIEW'] },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        status: true,
        isRecurring: true,
        frequency: true,
        actualCost: true,
        estimatedCost: true,
        lastCompletedDate: true,
        nextDueDate: true,
        updatedAt: true,
      },
    }),
    db.hoaAssociation.findUnique({
      where: { propertyId },
      select: {
        id: true,
        duesAmountCents: true,
        duesFrequency: true,
        documentIds: true,
        isActive: true,
        updatedAt: true,
      },
    }),
    db.projectRecord.findMany({
      where: {
        propertyId,
        status: { in: ['PLANNING', 'IN_PROGRESS', 'PAUSED', 'COMPLETED'] },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        status: true,
        actualCostCents: true,
        currentContractAmountCents: true,
        startDate: true,
        actualEndDate: true,
        updatedAt: true,
      },
    }),
    db.homeReserveFund.findUnique({
      where: { propertyId },
      select: {
        id: true,
        recommendedMonthlyContributionCents: true,
        isActive: true,
        lastRecalculatedAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const bundle = emptyOwnershipCostSourceBundle();

  for (const bill of taxBills) {
    bundle.tax.push({
      sourceDomain: 'PROPERTY_TAX',
      sourceEntityType: 'PropertyTaxBillRecord',
      sourceEntityId: bill.id,
      sourceUpdatedAt: bill.updatedAt,
      category: 'PROPERTY_TAX',
      amountCents: cents(bill.billAmount),
      currency: bill.currency,
      recurrence: 'ANNUAL',
      periodStart: bill.periodStartDate
        ?? new Date(Date.UTC(bill.taxYear, 0, 1)),
      periodEnd: bill.periodEndDate
        ?? new Date(Date.UTC(bill.taxYear, 11, 31, 23, 59, 59, 999)),
      temporalKind: bill.taxYear < asOf.getUTCFullYear()
        ? 'OBSERVED_PAST_PERIOD'
        : 'CURRENT_PERIOD',
      evidenceStatus: bill.sourceType === 'DOCUMENT'
        ? 'CONFIRMED'
        : 'OBSERVED',
      verificationStatus: bill.confidence === 'VERIFIED'
        ? 'VERIFIED'
        : 'PENDING_CONFIRMATION',
      freshnessStatus: freshness(bill.observedAt, asOf),
      confidence: bill.confidence === 'VERIFIED' ? 'HIGH' : 'MEDIUM',
      missingDependencies: bill.billAmount == null ? ['property-tax bill amount'] : [],
      dedupeKey: `PROPERTY_TAX:${bill.taxYear}`,
    });
  }

  for (const term of insuranceTerms) {
    bundle.insurance.push({
      sourceDomain: 'COVERAGE',
      sourceEntityType: 'InsurancePolicyTerm',
      sourceEntityId: term.id,
      sourceDocumentId: term.sourceDocumentId,
      sourceUpdatedAt: term.updatedAt,
      category: 'INSURANCE',
      amountCents: cents(term.annualPremium),
      recurrence: 'ANNUAL',
      periodStart: term.termStart,
      periodEnd: term.termEnd,
      temporalKind: observedTemporalKind(term.termEnd ?? term.termStart, asOf),
      evidenceStatus: term.sourceDocumentId ? 'EXTRACTED' : 'HOMEOWNER_REPORTED',
      verificationStatus: term.verificationStatus === 'VERIFIED'
        ? 'VERIFIED'
        : term.status === 'PENDING_CONFIRMATION'
          ? 'PENDING_CONFIRMATION'
          : 'UNVERIFIED',
      freshnessStatus: freshness(term.termEnd ?? term.updatedAt, asOf),
      missingDependencies: term.annualPremium == null ? ['annual insurance premium'] : [],
    });
  }

  if (financingProfile) {
    const mortgageApplicability = financingProfile.mortgageStatus === 'MORTGAGED'
      ? 'APPLICABLE'
      : financingProfile.mortgageStatus === 'NO_MORTGAGE'
        ? 'NOT_APPLICABLE'
        : 'UNKNOWN';
    for (const category of ['MORTGAGE_PRINCIPAL', 'MORTGAGE_INTEREST'] as const) {
      bundle.financing.push({
        sourceDomain: 'FINANCING',
        sourceEntityType: 'PropertyFinancingProfile',
        sourceEntityId: financingProfile.id,
        sourceUpdatedAt: financingProfile.updatedAt,
        category,
        amountCents: null,
        recurrence: 'MONTHLY',
        applicability: mortgageApplicability,
        evidenceStatus: null,
        verificationStatus: 'UNVERIFIED',
        freshnessStatus: freshness(
          financingProfile.mortgageBalanceAsOfDate ?? financingProfile.updatedAt,
          asOf,
        ),
        missingDependencies: mortgageApplicability !== 'NOT_APPLICABLE'
          ? [
              'payment allocation between principal and interest',
              ...(financingProfile.monthlyPaymentCents == null
                ? ['monthly mortgage payment']
                : []),
            ]
          : [],
      });
    }
    bundle.financing.push({
      sourceDomain: 'FINANCING',
      sourceEntityType: 'PropertyFinancingProfile',
      sourceEntityId: financingProfile.id,
      sourceUpdatedAt: financingProfile.updatedAt,
      category: 'PMI',
      amountCents: null,
      recurrence: 'MONTHLY',
      applicability: financingProfile.hasPMI
        ? 'APPLICABLE'
        : financingProfile.mortgageStatus === 'UNKNOWN'
          ? 'UNKNOWN'
          : 'NOT_APPLICABLE',
      evidenceStatus: null,
      verificationStatus: 'UNVERIFIED',
      freshnessStatus: freshness(financingProfile.updatedAt, asOf),
      missingDependencies: financingProfile.hasPMI ? ['monthly PMI amount'] : [],
    });
  }

  for (const expense of expenses) {
    const base = {
      sourceEntityType: 'Expense',
      sourceEntityId: expense.id,
      sourceUpdatedAt: expense.updatedAt,
      amountCents: cents(expense.amount),
      periodStart: expense.transactionDate,
      periodEnd: expense.transactionDate,
      temporalKind: observedTemporalKind(expense.transactionDate, asOf),
      evidenceStatus: 'OBSERVED' as const,
      verificationStatus: 'UNVERIFIED' as const,
      freshnessStatus: freshness(expense.transactionDate, asOf),
      recurrence: 'ONE_TIME' as const,
      assumptions: ['An individual expense is treated as one-time unless recurrence is explicit.'],
    };
    if (expense.category === 'UTILITY') {
      bundle.utility.push({
        ...base,
        sourceDomain: 'UTILITY',
        category: 'UTILITIES',
      });
    } else if (expense.category === 'HOA_FEE') {
      bundle.hoa.push({
        ...base,
        sourceDomain: 'HOA',
        category: 'HOA',
      });
    } else if (expense.category === 'PROPERTY_TAX') {
      bundle.expense.push({
        ...base,
        sourceDomain: 'EXPENSE',
        category: 'PROPERTY_TAX',
      });
    } else if (expense.category === 'REPAIR_SERVICE') {
      bundle.expense.push({
        ...base,
        sourceDomain: 'EXPENSE',
        category: 'KNOWN_REPAIR',
      });
    } else if (expense.projectId) {
      bundle.expense.push({
        ...base,
        sourceDomain: 'EXPENSE',
        category: 'CAPITAL_PROJECT',
        dedupeKey: `CAPITAL_PROJECT:${expense.projectId}`,
      });
    }
  }

  for (const task of maintenanceTasks) {
    const actual = cents(task.actualCost);
    const estimated = cents(task.estimatedCost);
    bundle.maintenance.push({
      sourceDomain: 'MAINTENANCE',
      sourceEntityType: 'PropertyMaintenanceTask',
      sourceEntityId: task.id,
      sourceUpdatedAt: task.updatedAt,
      category: task.isRecurring ? 'ROUTINE_MAINTENANCE' : 'KNOWN_REPAIR',
      amountCents: actual ?? estimated,
      recurrence: task.isRecurring
        ? recurrenceFromMaintenance(task.frequency)
        : 'ONE_TIME',
      periodStart: task.lastCompletedDate ?? task.nextDueDate,
      periodEnd: task.lastCompletedDate ?? task.nextDueDate,
      temporalKind: observedTemporalKind(task.lastCompletedDate, asOf),
      evidenceStatus: actual != null ? 'OBSERVED' : estimated != null ? 'ESTIMATED' : null,
      verificationStatus: actual != null && task.status === 'COMPLETED'
        ? 'VERIFIED'
        : 'UNVERIFIED',
      freshnessStatus: freshness(task.updatedAt, asOf),
      assumptions: actual == null && estimated != null
        ? ['Maintenance task amount is an estimate, not observed spend.']
        : [],
      missingDependencies: actual == null && estimated == null
        ? ['maintenance cost']
        : [],
    });
  }

  if (hoa?.isActive) {
    bundle.hoa.push({
      sourceDomain: 'HOA',
      sourceEntityType: 'HoaAssociation',
      sourceEntityId: hoa.id,
      sourceDocumentId: hoa.documentIds[0] ?? null,
      sourceUpdatedAt: hoa.updatedAt,
      category: 'HOA',
      amountCents: hoa.duesAmountCents,
      recurrence: recurrenceFromHoa(hoa.duesFrequency),
      evidenceStatus: hoa.documentIds.length ? 'CONFIRMED' : 'HOMEOWNER_REPORTED',
      verificationStatus: hoa.documentIds.length ? 'PENDING_CONFIRMATION' : 'UNVERIFIED',
      freshnessStatus: freshness(hoa.updatedAt, asOf),
      missingDependencies: hoa.duesAmountCents == null ? ['HOA dues amount'] : [],
      dedupeKey: `HOA:${hoa.id}`,
    });
  }

  for (const project of projects) {
    const amount = project.actualCostCents
      ?? (project.currentContractAmountCents > 0
        ? project.currentContractAmountCents
        : null);
    bundle.project.push({
      sourceDomain: 'PROJECT',
      sourceEntityType: 'ProjectRecord',
      sourceEntityId: project.id,
      sourceUpdatedAt: project.updatedAt,
      category: 'CAPITAL_PROJECT',
      amountCents: amount,
      recurrence: 'ONE_TIME',
      periodStart: project.startDate,
      periodEnd: project.actualEndDate ?? project.startDate,
      temporalKind: observedTemporalKind(
        project.actualEndDate ?? project.startDate,
        asOf,
      ),
      evidenceStatus: project.actualCostCents != null ? 'OBSERVED' : amount != null ? 'ESTIMATED' : null,
      verificationStatus: project.actualCostCents != null && project.status === 'COMPLETED'
        ? 'VERIFIED'
        : 'UNVERIFIED',
      freshnessStatus: freshness(project.updatedAt, asOf),
      assumptions: project.actualCostCents == null && amount != null
        ? ['Current contract amount is a project estimate until actual cost is recorded.']
        : [],
      missingDependencies: amount == null ? ['project cost'] : [],
      dedupeKey: `CAPITAL_PROJECT:${project.id}`,
    });
  }

  if (reserve?.isActive) {
    bundle.reserve.push({
      sourceDomain: 'RESERVE',
      sourceEntityType: 'HomeReserveFund',
      sourceEntityId: reserve.id,
      sourceUpdatedAt: reserve.updatedAt,
      category: 'RESERVE_CONTRIBUTION',
      amountCents: reserve.recommendedMonthlyContributionCents,
      recurrence: 'MONTHLY',
      evidenceStatus: 'ESTIMATED',
      verificationStatus: 'UNVERIFIED',
      freshnessStatus: freshness(reserve.lastRecalculatedAt ?? reserve.updatedAt, asOf),
      assumptions: ['Reserve contribution is a planning allocation, not an operating expense.'],
      missingDependencies: [],
    });
  }

  return bundle;
}
