import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  compareVerifiedPolicyTerms,
  type ComparablePolicyFact,
  type ComparablePolicyTerm,
} from './policyTermComparison';

function asNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildRenewalAction(termEnd: Date | null, now: Date) {
  if (!termEnd) {
    return {
      status: 'DATE_UNKNOWN',
      dueAt: null,
      label: 'Confirm the current term end date',
      detail: 'A verified term end date is needed before ContractToCozy can time a renewal reminder.',
    };
  }
  const daysUntil = Math.ceil((termEnd.getTime() - now.getTime()) / 86_400_000);
  if (daysUntil < 0) {
    return {
      status: 'OVERDUE',
      dueAt: termEnd.toISOString(),
      label: 'Add the latest renewal term',
      detail: `The newest verified term ended ${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? '' : 's'} ago.`,
    };
  }
  if (daysUntil <= 60) {
    return {
      status: 'DUE',
      dueAt: termEnd.toISOString(),
      label: 'Review renewal changes now',
      detail: `The verified term ends in ${daysUntil} day${daysUntil === 1 ? '' : 's'}.`,
    };
  }
  if (daysUntil <= 120) {
    return {
      status: 'UPCOMING',
      dueAt: termEnd.toISOString(),
      label: 'Prepare for renewal review',
      detail: `The verified term ends in ${daysUntil} days.`,
    };
  }
  return {
    status: 'LATER',
    dueAt: termEnd.toISOString(),
    label: 'No renewal action due yet',
    detail: `The verified term ends in ${daysUntil} days.`,
  };
}

export async function getObservedInsurancePremiumHistory(propertyId: string) {
  const terms = await prisma.insurancePolicyTerm.findMany({
    where: {
      propertyId,
      verificationStatus: 'VERIFIED',
      facts: {
        some: {
          factKey: 'ANNUAL_PREMIUM',
          confirmationStatus: 'CONFIRMED',
          amountValue: { not: null },
        },
      },
    },
    orderBy: [{ termStart: 'asc' }, { createdAt: 'asc' }],
    include: {
      facts: {
        where: {
          factKey: 'ANNUAL_PREMIUM',
          confirmationStatus: 'CONFIRMED',
          amountValue: { not: null },
        },
        take: 1,
      },
    },
  });
  const latestPolicyId = terms.at(-1)?.insurancePolicyId ?? null;
  const premiumSeries = terms.flatMap((term) => {
    if (!latestPolicyId || term.insurancePolicyId !== latestPolicyId) return [];
    const fact = term.facts[0];
    const annualPremium = asNumber(fact?.amountValue);
    if (!fact || annualPremium == null) return [];
    return [{
      policyTermId: term.id,
      termStart: term.termStart,
      termEnd: term.termEnd,
      year: term.termStart?.getUTCFullYear() ?? null,
      annualPremium,
      currency: fact.currency ?? 'USD',
      sourceDocumentId: fact.sourceDocumentId ?? term.sourceDocumentId,
      sourcePage: fact.sourcePage,
    }];
  });
  return {
    state:
      premiumSeries.length === 0
        ? 'NO_CONFIRMED_PREMIUM'
        : premiumSeries.length === 1
          ? 'ONE_CONFIRMED_PREMIUM'
          : 'OBSERVED_PREMIUM_HISTORY',
    premiumSeries,
    currentAnnualPremium: premiumSeries.at(-1)?.annualPremium ?? null,
    previousAnnualPremium: premiumSeries.at(-2)?.annualPremium ?? null,
    classification: 'OBSERVED_CONFIRMED_HISTORY' as const,
  };
}

export async function getInsurancePolicyHistory(
  propertyId: string,
  userId: string,
  now = new Date()
) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, homeownerProfile: { userId } },
    select: { id: true },
  });
  if (!property) throw new APIError('Property not found', 404, 'PROPERTY_NOT_FOUND');

  const terms = await prisma.insurancePolicyTerm.findMany({
    where: { propertyId, verificationStatus: 'VERIFIED' },
    orderBy: [{ termStart: 'asc' }, { createdAt: 'asc' }],
    include: {
      insurancePolicy: {
        select: { id: true, carrierName: true, policyNumber: true, coverageType: true },
      },
      sourceDocument: { select: { id: true, name: true } },
      facts: {
        where: { confirmationStatus: 'CONFIRMED' },
        orderBy: { factKey: 'asc' },
        include: { sourceDocument: { select: { id: true, name: true } } },
      },
    },
  });

  const comparableTerms: ComparablePolicyTerm[] = terms.map((term) => ({
    id: term.id,
    insurancePolicyId: term.insurancePolicyId,
    termStart: term.termStart,
    termEnd: term.termEnd,
    verificationStatus: term.verificationStatus,
    sourceDocumentId: term.sourceDocumentId,
    facts: term.facts.map((fact): ComparablePolicyFact => ({
      id: fact.id,
      factKey: fact.factKey,
      valueType: fact.valueType,
      amountValue: asNumber(fact.amountValue),
      textValue: fact.textValue,
      booleanValue: fact.booleanValue,
      jsonValue: fact.jsonValue,
      currency: fact.currency,
      confirmationStatus: fact.confirmationStatus,
      sourceDocumentId: fact.sourceDocumentId,
      sourcePage: fact.sourcePage,
      extractionMethod: fact.extractionMethod,
      confirmedAt: fact.confirmedAt,
    })),
  }));

  const derivedChanges: Array<{
    insurancePolicyId: string;
    propertyId: string;
    fromTermId: string;
    toTermId: string;
    changeKey: string;
    category: string;
    oldValueJson: Prisma.InputJsonValue;
    newValueJson: Prisma.InputJsonValue;
    sourceEvidenceJson: Prisma.InputJsonValue;
    observedAt: Date;
  }> = [];
  const grouped = new Map<string, ComparablePolicyTerm[]>();
  for (const term of comparableTerms) {
    grouped.set(term.insurancePolicyId, [...(grouped.get(term.insurancePolicyId) ?? []), term]);
  }
  let comparablePairCount = 0;
  for (const [insurancePolicyId, policyTerms] of grouped) {
    for (let index = 1; index < policyTerms.length; index += 1) {
      const fromTerm = policyTerms[index - 1];
      const toTerm = policyTerms[index];
      comparablePairCount += 1;
      for (const change of compareVerifiedPolicyTerms(fromTerm, toTerm)) {
        derivedChanges.push({
          insurancePolicyId,
          propertyId,
          fromTermId: fromTerm.id,
          toTermId: toTerm.id,
          changeKey: change.changeKey,
          category: change.category,
          oldValueJson: change.oldValue as Prisma.InputJsonValue,
          newValueJson: change.newValue as Prisma.InputJsonValue,
          sourceEvidenceJson: change.sourceEvidence as Prisma.InputJsonValue,
          observedAt: toTerm.termStart ?? now,
        });
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.insurancePolicyTermChange.updateMany({
      where: { propertyId, status: 'CURRENT' },
      data: { status: 'STALE' },
    });
    for (const change of derivedChanges) {
      await tx.insurancePolicyTermChange.upsert({
        where: {
          fromTermId_toTermId_changeKey: {
            fromTermId: change.fromTermId,
            toTermId: change.toTermId,
            changeKey: change.changeKey,
          },
        },
        create: { ...change, status: 'CURRENT' },
        update: {
          category: change.category,
          oldValueJson: change.oldValueJson,
          newValueJson: change.newValueJson,
          sourceEvidenceJson: change.sourceEvidenceJson,
          observedAt: change.observedAt,
          status: 'CURRENT',
        },
      });
    }
  });

  const changes = await prisma.insurancePolicyTermChange.findMany({
    where: { propertyId, status: 'CURRENT' },
    orderBy: [{ observedAt: 'desc' }, { category: 'asc' }],
  });
  const latestTerm = terms[terms.length - 1] ?? null;
  const premiumSeries = terms.flatMap((term) => {
    if (latestTerm && term.insurancePolicyId !== latestTerm.insurancePolicyId) return [];
    const premium = term.facts.find((fact) => fact.factKey === 'ANNUAL_PREMIUM');
    const amount = asNumber(premium?.amountValue);
    if (!premium || amount == null) return [];
    return [{
      policyTermId: term.id,
      insurancePolicyId: term.insurancePolicyId,
      termStart: term.termStart?.toISOString() ?? null,
      termEnd: term.termEnd?.toISOString() ?? null,
      annualPremium: amount,
      currency: premium.currency ?? 'USD',
      sourceDocumentId: premium.sourceDocumentId ?? term.sourceDocumentId,
      sourcePage: premium.sourcePage,
    }];
  });

  return {
    propertyId,
    historyState:
      terms.length === 0
        ? 'NO_CONFIRMED_TERMS'
        : terms.length === 1
          ? 'ONE_CONFIRMED_TERM'
          : comparablePairCount === 0
            ? 'PARTIAL_HISTORY'
            : 'HISTORY',
    terms,
    changes,
    premiumSeries,
    renewalAction: buildRenewalAction(latestTerm?.termEnd ?? null, now),
    meta: {
      classification: 'OBSERVED_CONFIRMED_HISTORY',
      includesEstimatedValues: false,
      generatedAt: now.toISOString(),
    },
  };
}
