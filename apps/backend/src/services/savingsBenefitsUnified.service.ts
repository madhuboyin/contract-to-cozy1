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

import { HomeSavingsOpportunityStatus, Prisma, PropertyHiddenAssetMatchStatus, SavingsOutcomeStage, SavingsOutcomeVerificationState } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asNumber, round2 } from './homeSavings/helpers';
import { propertyTaxAppealCaseService } from './propertyTax/propertyTaxAppealCase.service';
import { detectCoverageGaps } from './coverageGap.service';
import { logger } from '../lib/logger';
import { isReviewedProgramCurrent } from './hiddenAssets/sourceFreshness';

export type SavingsBenefitsFamily = 'BENEFIT' | 'RECURRING_COST';
export type SavingsBenefitsLifecycle = 'IN_PROGRESS' | 'REALIZED';
export type SavingsBenefitsValueBasis = 'ONE_TIME' | 'MONTHLY' | 'ANNUAL' | 'UNKNOWN';

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
  verificationState: SavingsOutcomeVerificationState | null;
  detailHref: string;
  updatedAt: string;
  // Other realized item IDs sharing this program's exclusionGroupKey. A
  // non-empty array here is a real red flag — evidence of received value on
  // two programs that were supposed to be mutually exclusive — never used
  // to hide or discount the recorded amount, only to surface it.
  mutuallyExclusiveWith: string[];
  canonicalAction: {
    id: string;
    actionType: string;
    state: 'STARTED' | 'COMPLETED' | 'CANCELLED';
    handoffStatus: 'CONSENTED' | 'SUBMITTED' | 'ACKNOWLEDGED' | 'FULFILLED' | 'FAILED' | 'REVOKED' | null;
    partner: { id: string; name: string } | null;
  } | null;
}

export interface SavingsBenefitsExclusionConflictDTO {
  exclusionGroupKey: string;
  itemIds: string[];
}

// Read-only pointers into domains that own their own decisions per the
// audit's §4.5 canonical responsibility map (Property Tax owns tax
// decisions, Coverage and Premium Review owns insurance decisions,
// Mortgage Refinance Radar owns mortgage decisions). This never duplicates
// their logic or computes anything new — it only surfaces a one-line
// "there's something here" summary from each domain's own already-persisted
// state. A domain with nothing current to show is simply omitted, never
// shown as an empty/zero entry.
export type SavingsBenefitsRelatedDomain = 'PROPERTY_TAX' | 'COVERAGE' | 'REFINANCE';

export interface SavingsBenefitsRelatedPointerDTO {
  domain: SavingsBenefitsRelatedDomain;
  summary: string;
  detailHref: string;
  updatedAt: string | null;
}

export interface SavingsBenefitsUnifiedResponseDTO {
  propertyId: string;
  inProgress: SavingsBenefitsUnifiedItemDTO[];
  realized: SavingsBenefitsUnifiedItemDTO[];
  relatedOpportunities: SavingsBenefitsRelatedPointerDTO[];
  totals: {
    inProgressCount: number;
    realizedCount: number;
    // Convenience total is populated only when every amount shares one
    // currency. Multi-currency values are never arithmetically combined.
    realizedValueTotal: number | null;
    realizedValueCurrency: string | null;
    realizedValueByCurrency: Record<string, number>;
    verifiedValueByCurrency: Record<string, number>;
    realizedValueByFamily: Record<SavingsBenefitsFamily, Record<string, number>>;
    // Non-empty only when two-or-more realized items share an
    // exclusionGroupKey — worth a homeowner double-checking, since the
    // programs were flagged as normally incompatible. The totals above
    // still include every evidenced RECEIVED amount; this never suppresses
    // real recorded value, it only flags it for review.
    exclusionConflicts: SavingsBenefitsExclusionConflictDTO[];
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

export function valueBasisForBenefitPeriod(benefitPeriod: string): SavingsBenefitsValueBasis {
  if (benefitPeriod === 'ONE_TIME') return 'ONE_TIME';
  if (benefitPeriod === 'MONTHLY') return 'MONTHLY';
  if (benefitPeriod === 'ANNUAL') return 'ANNUAL';
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
  include: {
    program: { include: { source: true } };
    outcomes: { orderBy: { recordedAt: 'desc' }; take: 1 };
    savingsBenefitActions: {
      orderBy: { createdAt: 'desc' };
      take: 1;
      include: { partner: true };
    };
  };
}>;

type AppliedOpportunityRow = Prisma.HomeSavingsOpportunityGetPayload<{
  include: {
    outcomes: { orderBy: { recordedAt: 'desc' }; take: 1 };
    savingsBenefitActions: {
      orderBy: { createdAt: 'desc' };
      take: 1;
      include: { partner: true };
    };
  };
}>;

type ReceivedMatchOutcomeRow = Prisma.HiddenAssetMatchOutcomeGetPayload<{
  include: { match: { include: { program: true } } };
}>;

type ReceivedOpportunityOutcomeRow = Prisma.HomeSavingsOpportunityOutcomeGetPayload<{
  include: { opportunity: true };
}>;

function mapPursuingMatch(row: PursuingMatchRow, propertyId: string, mutuallyExclusiveWith: string[] = []): SavingsBenefitsUnifiedItemDTO {
  const program = row.program;
  const latestOutcome = row.outcomes[0] ?? null;
  const action = row.savingsBenefitActions[0] ?? null;
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
    deadline: program.applicationWindowClosesAt?.toISOString()
      ?? program.expiresAt?.toISOString()
      ?? null,
    sourceLabel: program.sourceLabel ?? null,
    statusLabel: 'Pursuing',
    outcomeStage: latestOutcome?.stage ?? null,
    verificationState: latestOutcome?.verificationState ?? null,
    detailHref: `/dashboard/properties/${propertyId}/tools/savings-benefits?section=benefits&matchId=${row.id}`,
    updatedAt: (latestOutcome?.recordedAt ?? row.lastEvaluatedAt).toISOString(),
    mutuallyExclusiveWith,
    canonicalAction: action
      ? {
          id: action.id,
          actionType: action.actionType,
          state: action.state,
          handoffStatus: action.handoffStatus,
          partner: action.partner ? { id: action.partner.id, name: action.partner.name } : null,
        }
      : null,
  };
}

function mapAppliedOpportunity(row: AppliedOpportunityRow, propertyId: string): SavingsBenefitsUnifiedItemDTO {
  const latestOutcome = row.outcomes[0] ?? null;
  const action = row.savingsBenefitActions[0] ?? null;
  const annual = asNumber(row.estimatedAnnualSavings);
  const monthly = asNumber(row.estimatedMonthlySavings);
  const grossValue = annual ?? (monthly != null ? round2(monthly * 12) : null);
  // Net of the category's assumed switching cost (HSB-023) when available —
  // a more honest headline than gross savings that ignores switching
  // friction entirely.
  const netValue = asNumber(row.netAnnualSavings);
  return {
    id: row.id,
    family: 'RECURRING_COST',
    lifecycle: 'IN_PROGRESS',
    title: row.headline,
    category: row.categoryKey,
    explanation: row.detail ?? null,
    estimatedValue: netValue ?? grossValue,
    estimatedValueBasis: 'ANNUAL',
    realizedValue: null,
    currency: row.currency,
    deadline: row.expiresAt ? row.expiresAt.toISOString() : null,
    sourceLabel: row.recommendedProviderName ?? null,
    statusLabel:
      row.status === HomeSavingsOpportunityStatus.SWITCHED
        ? 'Switch recorded'
        : row.status === HomeSavingsOpportunityStatus.SAVED
          ? 'Saved'
          : 'Submitted externally',
    outcomeStage: latestOutcome?.stage ?? null,
    verificationState: latestOutcome?.verificationState ?? null,
    detailHref: `/dashboard/properties/${propertyId}/tools/savings-benefits?section=recurring&categoryKey=${row.categoryKey}`,
    updatedAt: (latestOutcome?.recordedAt ?? row.updatedAt).toISOString(),
    mutuallyExclusiveWith: [],
    canonicalAction: action
      ? {
          id: action.id,
          actionType: action.actionType,
          state: action.state,
          handoffStatus: action.handoffStatus,
          partner: action.partner ? { id: action.partner.id, name: action.partner.name } : null,
        }
      : null,
  };
}

function mapReceivedMatchOutcome(outcome: ReceivedMatchOutcomeRow, propertyId: string, mutuallyExclusiveWith: string[] = []): SavingsBenefitsUnifiedItemDTO {
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
    verificationState: outcome.verificationState,
    detailHref: `/dashboard/properties/${propertyId}/tools/savings-benefits?section=benefits&matchId=${match.id}`,
    updatedAt: outcome.recordedAt.toISOString(),
    mutuallyExclusiveWith,
    canonicalAction: null,
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
    estimatedValue: asNumber(opportunity.netAnnualSavings) ?? asNumber(opportunity.estimatedAnnualSavings) ?? null,
    estimatedValueBasis: 'ANNUAL',
    realizedValue: observedAnnual ?? (observedMonthly != null ? round2(observedMonthly * 12) : null),
    currency: outcome.currency,
    deadline: null,
    sourceLabel: opportunity.recommendedProviderName ?? null,
    statusLabel: 'Switched',
    outcomeStage: outcome.stage,
    verificationState: outcome.verificationState,
    detailHref: `/dashboard/properties/${propertyId}/tools/savings-benefits?section=recurring&categoryKey=${opportunity.categoryKey}`,
    updatedAt: outcome.recordedAt.toISOString(),
    mutuallyExclusiveWith: [],
    canonicalAction: null,
  };
}

function byUpdatedAtDesc(a: SavingsBenefitsUnifiedItemDTO, b: SavingsBenefitsUnifiedItemDTO): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

/**
 * Groups a set of (matchId, exclusionGroupKey) pairs and returns, per
 * matchId, the sibling matchIds sharing a non-null group key. Mirrors
 * hiddenAssets.service.ts's computeMutualExclusions but operates on
 * whatever subset of matches (pursuing or received) is being serialized
 * here, since the two lists are fetched independently.
 */
function computeExclusionSiblings(rows: Array<{ id: string; exclusionGroupKey: string | null }>): Map<string, string[]> {
  const byGroupKey = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.exclusionGroupKey) continue;
    const ids = byGroupKey.get(row.exclusionGroupKey) ?? [];
    ids.push(row.id);
    byGroupKey.set(row.exclusionGroupKey, ids);
  }
  const result = new Map<string, string[]>();
  for (const ids of byGroupKey.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      result.set(id, ids.filter((other) => other !== id));
    }
  }
  return result;
}

const TAX_APPEAL_TERMINAL_STATUSES = new Set(['CLOSED', 'WITHDRAWN']);

function formatCurrency(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
  } catch {
    return `$${Math.round(cents / 100).toLocaleString()}`;
  }
}

/**
 * Cheap, read-only pointers into Property Tax, Coverage and Premium Review,
 * and Mortgage Refinance Radar — see SavingsBenefitsRelatedPointerDTO's
 * doc comment. Each domain is queried independently and defensively: a
 * failure in one must never break this endpoint or hide the other two.
 */
async function buildRelatedOpportunities(propertyId: string, userId: string): Promise<SavingsBenefitsRelatedPointerDTO[]> {
  const pointers: SavingsBenefitsRelatedPointerDTO[] = [];

  await Promise.all([
    (async () => {
      try {
        const cases = await propertyTaxAppealCaseService.list(propertyId, userId);
        const active = cases
          .filter((c: any) => !TAX_APPEAL_TERMINAL_STATUSES.has(c.status))
          .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
        if (!active) return;
        const groundLabel = String(active.ground ?? '').replace(/_/g, ' ').toLowerCase();
        const statusLabel = String(active.status ?? '').replace(/_/g, ' ').toLowerCase();
        pointers.push({
          domain: 'PROPERTY_TAX',
          summary: `${groundLabel || 'Property tax'} appeal — ${statusLabel}`,
          detailHref: `/dashboard/properties/${propertyId}/tools/property-tax`,
          updatedAt: active.updatedAt ?? null,
        });
      } catch (err) {
        logger.error({ err, propertyId }, '[SavingsBenefitsUnified] Property Tax pointer failed — omitting, not failing the request');
      }
    })(),
    (async () => {
      try {
        const gaps = await detectCoverageGaps(propertyId);
        if (!gaps || gaps.length === 0) return;
        const largest = [...gaps].sort((a, b) => b.exposureCents - a.exposureCents)[0];
        pointers.push({
          domain: 'COVERAGE',
          summary: `${gaps.length} coverage gap${gaps.length === 1 ? '' : 's'} — largest exposure ${largest.itemName} (${formatCurrency(largest.exposureCents, largest.currency)})`,
          detailHref: `/dashboard/properties/${propertyId}/tools/coverage-intelligence`,
          updatedAt: null,
        });
      } catch (err) {
        logger.error({ err, propertyId }, '[SavingsBenefitsUnified] Coverage pointer failed — omitting, not failing the request');
      }
    })(),
    (async () => {
      try {
        const radar = await prisma.propertyRefinanceRadarState.findUnique({
          where: { propertyId },
          include: { currentOpportunity: true },
        });
        if (!radar || radar.radarState !== 'OPEN' || !radar.currentOpportunity) return;
        const opp = radar.currentOpportunity;
        const monthlySavings = asNumber(opp.monthlySavings) ?? 0;
        pointers.push({
          domain: 'REFINANCE',
          summary: `Refinance window open — ~$${Math.round(monthlySavings)}/mo savings, break-even in ${opp.breakEvenMonths} months`,
          detailHref: `/dashboard/properties/${propertyId}/tools/mortgage-refinance-radar`,
          updatedAt: radar.lastEvaluatedAt ? radar.lastEvaluatedAt.toISOString() : null,
        });
      } catch (err) {
        logger.error({ err, propertyId }, '[SavingsBenefitsUnified] Refinance pointer failed — omitting, not failing the request');
      }
    })(),
  ]);

  return pointers;
}

export class SavingsBenefitsUnifiedService {
  async getUnified(propertyId: string, userId: string): Promise<SavingsBenefitsUnifiedResponseDTO> {
    await assertPropertyForUser(propertyId, userId);

    const [pursuingMatches, appliedOpportunities, receivedMatchOutcomes, receivedOpportunityOutcomes, relatedOpportunities] = await Promise.all([
      prisma.propertyHiddenAssetMatch.findMany({
        where: { propertyId, status: PropertyHiddenAssetMatchStatus.PURSUING },
        include: {
          program: { include: { source: true } },
          outcomes: { orderBy: { recordedAt: 'desc' }, take: 1 },
          savingsBenefitActions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { partner: true },
          },
        },
      }),
      prisma.homeSavingsOpportunity.findMany({
        where: {
          propertyId,
          resultKind: {
            in: ['BENCHMARK_OPPORTUNITY', 'ADDRESS_QUALIFIED_OPPORTUNITY'],
          },
          status: {
            in: [
              HomeSavingsOpportunityStatus.SAVED,
              HomeSavingsOpportunityStatus.APPLIED,
              HomeSavingsOpportunityStatus.SWITCHED,
            ],
          },
        },
        include: {
          outcomes: { orderBy: { recordedAt: 'desc' }, take: 1 },
          savingsBenefitActions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { partner: true },
          },
        },
      }),
      prisma.hiddenAssetMatchOutcome.findMany({
        where: {
          stage: SavingsOutcomeStage.RECEIVED,
          revokedAt: null,
          verificationState: { not: SavingsOutcomeVerificationState.REVOKED },
          match: { propertyId },
        },
        include: { match: { include: { program: true } } },
        orderBy: { recordedAt: 'desc' },
      }),
      prisma.homeSavingsOpportunityOutcome.findMany({
        where: {
          stage: SavingsOutcomeStage.RECEIVED,
          revokedAt: null,
          verificationState: { not: SavingsOutcomeVerificationState.REVOKED },
          opportunity: {
            propertyId,
            resultKind: {
              in: ['BENCHMARK_OPPORTUNITY', 'ADDRESS_QUALIFIED_OPPORTUNITY'],
            },
          },
        },
        include: { opportunity: true },
        orderBy: { recordedAt: 'desc' },
      }),
      buildRelatedOpportunities(propertyId, userId),
    ]);

    // A match/opportunity that already has a RECEIVED outcome belongs in
    // "realized," not "in progress," even if its own status field (which
    // reflects homeowner intent, not the verified ledger) hasn't caught up.
    const currentPursuingMatches = pursuingMatches.filter((match) =>
      isReviewedProgramCurrent(match.program, match.program.source),
    );
    const receivedMatchIds = new Set(receivedMatchOutcomes.map((o) => o.matchId));
    const receivedOpportunityIds = new Set(receivedOpportunityOutcomes.map((o) => o.opportunityId));

    const pursuingSiblings = computeExclusionSiblings(
      currentPursuingMatches
        .filter((m) => !receivedMatchIds.has(m.id))
        .map((m) => ({ id: m.id, exclusionGroupKey: m.program.exclusionGroupKey })),
    );
    const inProgress = [
      ...currentPursuingMatches
        .filter((m) => !receivedMatchIds.has(m.id))
        .map((m) => mapPursuingMatch(m, propertyId, pursuingSiblings.get(m.id) ?? [])),
      ...appliedOpportunities.filter((o) => !receivedOpportunityIds.has(o.id)).map((o) => mapAppliedOpportunity(o, propertyId)),
    ].sort(byUpdatedAtDesc);

    // Only PropertyHiddenAssetMatch programs carry an exclusionGroupKey —
    // HomeSavingsOpportunity has no equivalent concept, so this only ever
    // groups within the benefits family.
    const realizedSiblings = computeExclusionSiblings(
      receivedMatchOutcomes.map((o) => ({ id: o.matchId, exclusionGroupKey: o.match.program.exclusionGroupKey })),
    );
    const realized = [
      ...receivedMatchOutcomes.map((o) => mapReceivedMatchOutcome(o, propertyId, realizedSiblings.get(o.matchId) ?? [])),
      ...receivedOpportunityOutcomes.map((o) => mapReceivedOpportunityOutcome(o, propertyId)),
    ].sort(byUpdatedAtDesc);

    // Every evidenced RECEIVED amount is counted — exclusionGroupKey is a
    // prospective "don't pursue both" signal, not grounds to discard real,
    // evidence-backed money a homeowner actually received. Conflicts are
    // surfaced for review instead of silently dropped or silently summed.
    const realizedValueByCurrency: Record<string, number> = {};
    const verifiedValueByCurrency: Record<string, number> = {};
    const realizedValueByFamily: Record<SavingsBenefitsFamily, Record<string, number>> = {
      BENEFIT: {},
      RECURRING_COST: {},
    };
    for (const item of realized) {
      const value = item.realizedValue ?? 0;
      realizedValueByCurrency[item.currency] = round2((realizedValueByCurrency[item.currency] ?? 0) + value);
      realizedValueByFamily[item.family][item.currency] = round2(
        (realizedValueByFamily[item.family][item.currency] ?? 0) + value,
      );
      if (item.verificationState === SavingsOutcomeVerificationState.VERIFIED) {
        verifiedValueByCurrency[item.currency] = round2(
          (verifiedValueByCurrency[item.currency] ?? 0) + value,
        );
      }
    }
    const currencies = Object.keys(realizedValueByCurrency);

    const exclusionConflicts: SavingsBenefitsExclusionConflictDTO[] = [];
    const seenGroupKeys = new Set<string>();
    for (const outcome of receivedMatchOutcomes) {
      const groupKey = outcome.match.program.exclusionGroupKey;
      if (!groupKey || seenGroupKeys.has(groupKey)) continue;
      const memberIds = realizedSiblings.get(outcome.matchId);
      if (!memberIds || memberIds.length === 0) continue;
      seenGroupKeys.add(groupKey);
      exclusionConflicts.push({ exclusionGroupKey: groupKey, itemIds: [outcome.matchId, ...memberIds] });
    }

    return {
      propertyId,
      inProgress,
      realized,
      relatedOpportunities,
      totals: {
        inProgressCount: inProgress.length,
        realizedCount: realized.length,
        realizedValueTotal: currencies.length === 1 ? realizedValueByCurrency[currencies[0]] : null,
        realizedValueCurrency: currencies.length === 1 ? currencies[0] : null,
        realizedValueByCurrency,
        verifiedValueByCurrency,
        realizedValueByFamily,
        exclusionConflicts,
      },
    };
  }
}

export const savingsBenefitsUnifiedService = new SavingsBenefitsUnifiedService();
