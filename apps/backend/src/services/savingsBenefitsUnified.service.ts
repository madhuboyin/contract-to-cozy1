// apps/backend/src/services/savingsBenefitsUnified.service.ts
//
// Read-only unification layer over the two parallel opportunity models:
// PropertyHiddenAssetMatch (benefits/rebates) and HomeSavingsOpportunity
// (recurring-cost). Both existing models, their write paths, and their
// dedicated endpoints are untouched — this adds one normalized projection
// so the homeowner can see everything currently in motion, and everything
// with verified realized value, in a single place.
//
// "Realized" is intentionally governed by the same rule as
// savingsOutcome.service.ts: a SavingsOutcomeStage.RECEIVED outcome is the
// only signal that counts. An opportunity's own status (PURSUING/APPLIED/
// SWITCHED) reflects homeowner intent, not verified value — conflating the
// two here would reintroduce the estimate-as-realized problem this
// capability's audit already fixed once.

import { HomeSavingsOpportunityStatus, Prisma, PropertyHiddenAssetMatchStatus, SavingsOutcomeStage } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asNumber, round2 } from './homeSavings/helpers';

export type SavingsBenefitsFamily = 'BENEFIT' | 'RECURRING_COST';
export type SavingsBenefitsLifecycle = 'IN_PROGRESS' | 'REALIZED';
export type SavingsBenefitsValueBasis = 'ONE_TIME' | 'RECURRING' | 'UNKNOWN';

export interface SavingsBenefitsUnifiedItemDTO {
  id: string;
  family: SavingsBenefitsFamily;
  lifecycle: SavingsBenefitsLifecycle;
  title: string;
  category: string;
  explanation: string | null;
  estimatedValue: number | null;
  estimatedValueBasis: SavingsBenefitsValueBasis;
  realizedValue: number | null;
  currency: string;
  deadline: string | null;
  sourceLabel: string | null;
  statusLabel: string;
  outcomeStage: SavingsOutcomeStage | null;
  detailHref: string;
  updatedAt: string;
}

export interface SavingsBenefitsUnifiedResponseDTO {
  propertyId: string;
  inProgress: SavingsBenefitsUnifiedItemDTO[];
  realized: SavingsBenefitsUnifiedItemDTO[];
  totals: {
    inProgressCount: number;
    realizedCount: number;
    realizedValueTotal: number;
    realizedValueByFamily: Record<SavingsBenefitsFamily, number>;
  };
}

function decimalToNumber(d: Prisma.Decimal | null | undefined): number | null {
  if (d == null) return null;
  return Number(d.toString());
}

function safeJsonToStringArray(json: Prisma.JsonValue | null | undefined): string[] | null {
  if (json == null) return null;
  if (Array.isArray(json)) return json.map(String);
  return null;
}

function valueBasisForBenefitPeriod(benefitPeriod: string): SavingsBenefitsValueBasis {
  if (benefitPeriod === 'ONE_TIME') return 'ONE_TIME';
  if (benefitPeriod === 'MONTHLY' || benefitPeriod === 'ANNUAL') return 'RECURRING';
  return 'UNKNOWN';
}

async function assertPropertyForUser(propertyId: string, userId: string) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, homeownerProfile: { userId } },
    select: { id: true, homeownerProfileId: true },
  });
  if (!property?.homeownerProfileId) {
    throw new Error('Property not found or access denied.');
  }
  return property;
}

type PursuingMatchRow = Prisma.PropertyHiddenAssetMatchGetPayload<{
  include: { program: true; outcomes: { orderBy: { recordedAt: 'desc' }; take: 1 } };
}>;

type AppliedOpportunityRow = Prisma.HomeSavingsOpportunityGetPayload<{
  include: { outcomes: { orderBy: { recordedAt: 'desc' }; take: 1 } };
}>;

type ReceivedMatchOutcomeRow = Prisma.HiddenAssetMatchOutcomeGetPayload<{
  include: { match: { include: { program: true } } };
}>;

type ReceivedOpportunityOutcomeRow = Prisma.HomeSavingsOpportunityOutcomeGetPayload<{
  include: { opportunity: true };
}>;

function mapPursuingMatch(row: PursuingMatchRow, propertyId: string): SavingsBenefitsUnifiedItemDTO {
  const program = row.program;
  const latestOutcome = row.outcomes[0] ?? null;
  return {
    id: row.id,
    family: 'BENEFIT',
    lifecycle: 'IN_PROGRESS',
    title: program.name,
    category: program.category,
    explanation: safeJsonToStringArray(row.matchReasons)?.[0] ?? program.description ?? null,
    estimatedValue: decimalToNumber(row.estimatedValue) ?? decimalToNumber(row.estimatedValueMax) ?? decimalToNumber(row.estimatedValueMin),
    estimatedValueBasis: valueBasisForBenefitPeriod(program.benefitPeriod),
    realizedValue: null,
    currency: program.currency,
    deadline: program.expiresAt ? program.expiresAt.toISOString() : null,
    sourceLabel: program.sourceLabel ?? null,
    statusLabel: 'Pursuing',
    outcomeStage: latestOutcome?.stage ?? null,
    detailHref: `/dashboard/properties/${propertyId}/tools/savings-benefits?section=benefits&matchId=${row.id}`,
    updatedAt: (latestOutcome?.recordedAt ?? row.lastEvaluatedAt).toISOString(),
  };
}

function mapAppliedOpportunity(row: AppliedOpportunityRow, propertyId: string): SavingsBenefitsUnifiedItemDTO {
  const latestOutcome = row.outcomes[0] ?? null;
  const annual = asNumber(row.estimatedAnnualSavings);
  const monthly = asNumber(row.estimatedMonthlySavings);
  return {
    id: row.id,
    family: 'RECURRING_COST',
    lifecycle: 'IN_PROGRESS',
    title: row.headline,
    category: row.categoryKey,
    explanation: row.detail ?? null,
    estimatedValue: annual ?? (monthly != null ? round2(monthly * 12) : null),
    estimatedValueBasis: 'RECURRING',
    realizedValue: null,
    currency: row.currency,
    deadline: row.expiresAt ? row.expiresAt.toISOString() : null,
    sourceLabel: row.recommendedProviderName ?? null,
    statusLabel: 'Applied',
    outcomeStage: latestOutcome?.stage ?? null,
    detailHref: `/dashboard/properties/${propertyId}/tools/savings-benefits?section=recurring&categoryKey=${row.categoryKey}`,
    updatedAt: (latestOutcome?.recordedAt ?? row.updatedAt).toISOString(),
  };
}

function mapReceivedMatchOutcome(outcome: ReceivedMatchOutcomeRow, propertyId: string): SavingsBenefitsUnifiedItemDTO {
  const match = outcome.match;
  const program = match.program;
  return {
    id: match.id,
    family: 'BENEFIT',
    lifecycle: 'REALIZED',
    title: program.name,
    category: program.category,
    explanation: outcome.evidenceNote ?? null,
    estimatedValue: decimalToNumber(match.estimatedValue),
    estimatedValueBasis: valueBasisForBenefitPeriod(program.benefitPeriod),
    realizedValue: decimalToNumber(outcome.amountReceived),
    currency: outcome.currency,
    deadline: null,
    sourceLabel: program.sourceLabel ?? null,
    statusLabel: 'Received',
    outcomeStage: outcome.stage,
    detailHref: `/dashboard/properties/${propertyId}/tools/savings-benefits?section=benefits&matchId=${match.id}`,
    updatedAt: outcome.recordedAt.toISOString(),
  };
}

function mapReceivedOpportunityOutcome(outcome: ReceivedOpportunityOutcomeRow, propertyId: string): SavingsBenefitsUnifiedItemDTO {
  const opportunity = outcome.opportunity;
  const observedAnnual = asNumber(outcome.observedAnnualValue);
  const observedMonthly = asNumber(outcome.observedMonthlyValue);
  return {
    id: opportunity.id,
    family: 'RECURRING_COST',
    lifecycle: 'REALIZED',
    title: opportunity.headline,
    category: opportunity.categoryKey,
    explanation: outcome.evidenceNote ?? null,
    estimatedValue: asNumber(opportunity.estimatedAnnualSavings) ?? null,
    estimatedValueBasis: 'RECURRING',
    realizedValue: observedAnnual ?? (observedMonthly != null ? round2(observedMonthly * 12) : null),
    currency: outcome.currency,
    deadline: null,
    sourceLabel: opportunity.recommendedProviderName ?? null,
    statusLabel: 'Switched',
    outcomeStage: outcome.stage,
    detailHref: `/dashboard/properties/${propertyId}/tools/savings-benefits?section=recurring&categoryKey=${opportunity.categoryKey}`,
    updatedAt: outcome.recordedAt.toISOString(),
  };
}

function byUpdatedAtDesc(a: SavingsBenefitsUnifiedItemDTO, b: SavingsBenefitsUnifiedItemDTO): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

export class SavingsBenefitsUnifiedService {
  async getUnified(propertyId: string, userId: string): Promise<SavingsBenefitsUnifiedResponseDTO> {
    await assertPropertyForUser(propertyId, userId);

    const [pursuingMatches, appliedOpportunities, receivedMatchOutcomes, receivedOpportunityOutcomes] = await Promise.all([
      prisma.propertyHiddenAssetMatch.findMany({
        where: { propertyId, status: PropertyHiddenAssetMatchStatus.PURSUING },
        include: { program: true, outcomes: { orderBy: { recordedAt: 'desc' }, take: 1 } },
      }),
      prisma.homeSavingsOpportunity.findMany({
        where: { propertyId, status: HomeSavingsOpportunityStatus.APPLIED },
        include: { outcomes: { orderBy: { recordedAt: 'desc' }, take: 1 } },
      }),
      prisma.hiddenAssetMatchOutcome.findMany({
        where: { stage: SavingsOutcomeStage.RECEIVED, match: { propertyId } },
        include: { match: { include: { program: true } } },
        orderBy: { recordedAt: 'desc' },
      }),
      prisma.homeSavingsOpportunityOutcome.findMany({
        where: { stage: SavingsOutcomeStage.RECEIVED, opportunity: { propertyId } },
        include: { opportunity: true },
        orderBy: { recordedAt: 'desc' },
      }),
    ]);

    // A match/opportunity that already has a RECEIVED outcome belongs in
    // "realized," not "in progress," even if its own status field (which
    // reflects homeowner intent, not the verified ledger) hasn't caught up.
    const receivedMatchIds = new Set(receivedMatchOutcomes.map((o) => o.matchId));
    const receivedOpportunityIds = new Set(receivedOpportunityOutcomes.map((o) => o.opportunityId));

    const inProgress = [
      ...pursuingMatches.filter((m) => !receivedMatchIds.has(m.id)).map((m) => mapPursuingMatch(m, propertyId)),
      ...appliedOpportunities.filter((o) => !receivedOpportunityIds.has(o.id)).map((o) => mapAppliedOpportunity(o, propertyId)),
    ].sort(byUpdatedAtDesc);

    const realized = [
      ...receivedMatchOutcomes.map((o) => mapReceivedMatchOutcome(o, propertyId)),
      ...receivedOpportunityOutcomes.map((o) => mapReceivedOpportunityOutcome(o, propertyId)),
    ].sort(byUpdatedAtDesc);

    const realizedValueByFamily: Record<SavingsBenefitsFamily, number> = { BENEFIT: 0, RECURRING_COST: 0 };
    for (const item of realized) {
      realizedValueByFamily[item.family] = round2(realizedValueByFamily[item.family] + (item.realizedValue ?? 0));
    }

    return {
      propertyId,
      inProgress,
      realized,
      totals: {
        inProgressCount: inProgress.length,
        realizedCount: realized.length,
        realizedValueTotal: round2(realizedValueByFamily.BENEFIT + realizedValueByFamily.RECURRING_COST),
        realizedValueByFamily,
      },
    };
  }
}

export const savingsBenefitsUnifiedService = new SavingsBenefitsUnifiedService();
