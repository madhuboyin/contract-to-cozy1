// Home Intelligence Functional Completeness FRD Phase 3 review finding 4,
// delivery step 6 — decision-family adapters wrapping the domains that
// already have an authoritative, persisted evaluation (see
// snapshotDecisionFamilyAdapter.ts for the shared factory and staleness
// mechanism). Each config's loadSourceState re-reads the same authoritative
// record its Home Action producer (homeActionSourcePromotion.service.ts)
// already reads, using the identical eligibility gate, so a decision
// thread only ever exists where a corresponding Home Action can currently
// justify one.

import { prisma } from '../../lib/prisma';
import { createSnapshotDecisionFamilyAdapter, hashSourceState, type SnapshotSourceState } from './snapshotDecisionFamilyAdapter';

// ── Refinance opportunity ───────────────────────────────────────────────
// Wraps PropertyRefinanceRadarState.currentOpportunity — the same record
// loadRefinanceOpportunityActions (homeActionSourcePromotion.service.ts)
// reads. One opportunity per property, so primaryEntityId is the
// propertyId itself (lineageId: `refinance-opportunity:${propertyId}`).

async function loadRefinanceOpportunitySourceState(propertyId: string, primaryEntityId: string): Promise<SnapshotSourceState | null> {
  if (primaryEntityId !== propertyId) return null;
  const state = await prisma.propertyRefinanceRadarState.findUnique({
    where: { propertyId },
    select: {
      radarState: true,
      currentOpportunity: {
        select: {
          id: true, monthlySavings: true, breakEvenMonths: true, lifetimeSavings: true,
          marketRate: true, currentRate: true, confidenceLevel: true, evaluationDate: true, updatedAt: true,
        },
      },
    },
  });
  const opportunity = state?.currentOpportunity;
  if (!state || state.radarState !== 'OPEN' || !opportunity) return null;

  return {
    title: 'Refinance opportunity',
    goalCode: 'REFINANCE_OPPORTUNITY_DECISION',
    verdictCode: 'EXPLORE_REFINANCE',
    reasonCodes: [
      `CONFIDENCE_${opportunity.confidenceLevel}`,
      Number(opportunity.monthlySavings) > 0 ? 'POSITIVE_MONTHLY_SAVINGS' : 'NO_MONTHLY_SAVINGS',
    ],
    confidenceBreakdown: {
      label: opportunity.confidenceLevel,
      monthlySavings: Number(opportunity.monthlySavings),
      breakEvenMonths: opportunity.breakEvenMonths,
      lifetimeSavings: Number(opportunity.lifetimeSavings),
    },
    inputDigest: hashSourceState({
      id: opportunity.id, monthlySavings: opportunity.monthlySavings.toString(), breakEvenMonths: opportunity.breakEvenMonths,
      lifetimeSavings: opportunity.lifetimeSavings.toString(), marketRate: opportunity.marketRate, currentRate: opportunity.currentRate,
      confidenceLevel: opportunity.confidenceLevel, evaluationDate: opportunity.evaluationDate.toISOString(), updatedAt: opportunity.updatedAt.toISOString(),
    }),
  };
}

export const refinanceOpportunityDecisionFamilyAdapter = createSnapshotDecisionFamilyAdapter({
  decisionDefinitionId: 'REFINANCE_OPPORTUNITY',
  primaryEntityType: 'Property',
  recommendationDefinitionVersion: '1.0',
  engineVersion: 'refinance-radar-v1',
  contextContractVersion: '1.0',
  loadSourceState: loadRefinanceOpportunitySourceState,
});

// ── Home capital timeline material window ───────────────────────────────
// Wraps a single HIGH-priority HomeCapitalTimelineItem — the same rows
// loadHomeCapitalTimelineMaterialWindowActions reads. primaryEntityId is
// the item's own id (lineageId: `home-capital-timeline-window:${item.id}`),
// not the underlying inventory item, since one physical asset's timeline
// can carry more than one distinct windowed event over time.

async function loadHomeCapitalTimelineWindowSourceState(propertyId: string, primaryEntityId: string): Promise<SnapshotSourceState | null> {
  const item = await prisma.homeCapitalTimelineItem.findFirst({
    where: { id: primaryEntityId, propertyId, priority: 'HIGH', analysis: { status: 'READY' } },
    select: {
      id: true, category: true, inventoryItemId: true, windowStart: true, windowEnd: true,
      estimatedCostMinCents: true, estimatedCostMaxCents: true, confidence: true, priority: true, why: true, updatedAt: true,
    },
  });
  if (!item) return null;

  return {
    title: `Capital timeline: ${item.category.toLowerCase().replace(/_/g, ' ')}`,
    goalCode: 'HOME_CAPITAL_TIMELINE_WINDOW_DECISION',
    verdictCode: 'PLAN_REPLACEMENT_WINDOW',
    reasonCodes: [`CONFIDENCE_${item.confidence}`, `PRIORITY_${item.priority}`],
    confidenceBreakdown: { label: item.confidence },
    inputDigest: hashSourceState({
      id: item.id, windowStart: item.windowStart.toISOString(), windowEnd: item.windowEnd.toISOString(),
      estimatedCostMinCents: item.estimatedCostMinCents, estimatedCostMaxCents: item.estimatedCostMaxCents,
      confidence: item.confidence, priority: item.priority, why: item.why, updatedAt: item.updatedAt.toISOString(),
    }),
    canonicalFactReferences: item.inventoryItemId
      ? [{ entityType: 'INVENTORY_ITEM', entityId: item.inventoryItemId, fieldPath: 'condition' }]
      : [],
  };
}

export const homeCapitalTimelineWindowDecisionFamilyAdapter = createSnapshotDecisionFamilyAdapter({
  decisionDefinitionId: 'HOME_CAPITAL_TIMELINE_WINDOW',
  primaryEntityType: 'HomeCapitalTimelineItem',
  recommendationDefinitionVersion: '1.0',
  engineVersion: 'home-capital-timeline-v1',
  contextContractVersion: '1.0',
  loadSourceState: loadHomeCapitalTimelineWindowSourceState,
});

// ── Ownership cost change ───────────────────────────────────────────────
// Wraps the latest material OwnershipCostChange for one category against
// the property's latest snapshot — matches loadOwnershipCostChangeActions'
// own gate exactly. primaryEntityId is the composite
// `${propertyId}:${category}` string the producer's own lineageId already
// uses (a later change in the same category reuses this identity, same as
// the Home Action does), not change.id.

async function loadOwnershipCostChangeSourceState(propertyId: string, primaryEntityId: string): Promise<SnapshotSourceState | null> {
  const prefix = `${propertyId}:`;
  if (!primaryEntityId.startsWith(prefix)) return null;
  const category = primaryEntityId.slice(prefix.length);

  const latestSnapshot = await prisma.ownershipCostSnapshot.findFirst({
    where: { propertyId },
    orderBy: [{ basePeriodEnd: 'desc' }, { computedAt: 'desc' }],
    select: { id: true },
  });
  if (!latestSnapshot) return null;

  const change = await prisma.ownershipCostChange.findFirst({
    where: { propertyId, toSnapshotId: latestSnapshot.id, category: category as never },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    select: { id: true, category: true, amountDeltaCents: true, recurringDeltaCents: true, evidenceJson: true, toSnapshotId: true },
  });
  if (!change) return null;
  const detail = (change.evidenceJson && typeof change.evidenceJson === 'object' ? change.evidenceJson : {}) as { materiality?: { material?: boolean }; confidence?: string };
  if (detail.materiality?.material !== true) return null;

  const delta = change.amountDeltaCents;
  return {
    title: `Ownership cost change: ${String(change.category).toLowerCase().replace(/_/g, ' ')}`,
    goalCode: 'OWNERSHIP_COST_CHANGE_DECISION',
    verdictCode: delta >= 0 ? 'COST_INCREASED' : 'COST_DECREASED',
    reasonCodes: [`CONFIDENCE_${detail.confidence ?? 'MEDIUM'}`],
    confidenceBreakdown: { label: detail.confidence ?? 'MEDIUM' },
    inputDigest: hashSourceState({
      id: change.id, toSnapshotId: change.toSnapshotId, amountDeltaCents: change.amountDeltaCents,
      recurringDeltaCents: change.recurringDeltaCents, evidenceJson: change.evidenceJson,
    }),
  };
}

export const ownershipCostChangeDecisionFamilyAdapter = createSnapshotDecisionFamilyAdapter({
  decisionDefinitionId: 'OWNERSHIP_COST_CHANGE',
  primaryEntityType: 'OwnershipCostCategory',
  recommendationDefinitionVersion: '1.0',
  engineVersion: 'ownership-cost-intelligence-v1',
  contextContractVersion: '1.0',
  loadSourceState: loadOwnershipCostChangeSourceState,
});

// ── Savings & benefits match ────────────────────────────────────────────
// Wraps a HIGH-confidence PropertyHiddenAssetMatch — the same rows the
// matchActions branch of loadSavingsBenefitsActions reads. The other
// branch of that producer (resumableActions, SavingsBenefitAction rows in
// state STARTED) is execution continuity, not a fresh decision — it stays
// NOT_REQUIRED in the producer registry and has no adapter here.

async function loadSavingsBenefitMatchSourceState(propertyId: string, primaryEntityId: string): Promise<SnapshotSourceState | null> {
  const match = await prisma.propertyHiddenAssetMatch.findFirst({
    where: { id: primaryEntityId, propertyId, confidenceLevel: 'HIGH', status: { in: ['DETECTED', 'VIEWED', 'PURSUING'] } },
    select: {
      id: true, status: true, confidenceLevel: true, estimatedValueMin: true, estimatedValueMax: true,
      lastEvaluatedAt: true, programVersionAtMatch: true,
      program: { select: { name: true } },
    },
  });
  if (!match) return null;

  return {
    title: `Benefit match: ${match.program.name}`,
    goalCode: 'SAVINGS_BENEFIT_MATCH_DECISION',
    verdictCode: 'PURSUE_BENEFIT',
    reasonCodes: [`CONFIDENCE_${match.confidenceLevel}`],
    confidenceBreakdown: { label: match.confidenceLevel },
    inputDigest: hashSourceState({
      id: match.id, status: match.status, estimatedValueMin: match.estimatedValueMin?.toString() ?? null,
      estimatedValueMax: match.estimatedValueMax?.toString() ?? null, lastEvaluatedAt: match.lastEvaluatedAt.toISOString(),
      programVersionAtMatch: match.programVersionAtMatch,
    }),
  };
}

export const savingsBenefitMatchDecisionFamilyAdapter = createSnapshotDecisionFamilyAdapter({
  decisionDefinitionId: 'SAVINGS_BENEFIT_MATCH',
  primaryEntityType: 'PropertyHiddenAssetMatch',
  recommendationDefinitionVersion: '1.0',
  engineVersion: 'hidden-asset-matcher-v1',
  contextContractVersion: '1.0',
  loadSourceState: loadSavingsBenefitMatchSourceState,
});

// ── Coverage question ───────────────────────────────────────────────────
// Wraps the primary open, evidence-qualified CoverageReviewQuestion for a
// coverage review — the same row loadCoverageActions reads. primaryEntityId
// is questionKey (stable across a review's re-evaluation), matching the
// producer's own lineageId (`coverage-review:${question.questionKey}`).

async function loadCoverageQuestionSourceState(propertyId: string, primaryEntityId: string): Promise<SnapshotSourceState | null> {
  const question = await prisma.coverageReviewQuestion.findFirst({
    where: {
      questionKey: primaryEntityId,
      status: 'OPEN',
      isPrimary: true,
      questionType: 'EVIDENCE_BASED',
      coverageReview: { propertyId, status: 'READY', overallState: 'QUESTIONS' },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, questionKey: true, category: true, priority: true, plainLanguageQuestion: true,
      evidenceJson: true, missingEvidenceJson: true, updatedAt: true,
      coverageReview: { select: { id: true, reviewVersion: true, inputFingerprint: true } },
    },
  });
  if (!question) return null;
  const evidenceCount = Array.isArray(question.evidenceJson) ? question.evidenceJson.length : 0;

  return {
    title: 'Coverage question',
    goalCode: 'COVERAGE_QUESTION_DECISION',
    verdictCode: 'RESOLVE_COVERAGE_QUESTION',
    reasonCodes: [`PRIORITY_${question.priority}`],
    confidenceBreakdown: { evidenceCount },
    inputDigest: hashSourceState({
      id: question.id, status: 'OPEN', plainLanguageQuestion: question.plainLanguageQuestion,
      evidenceJson: question.evidenceJson, missingEvidenceJson: question.missingEvidenceJson,
      reviewVersion: question.coverageReview.reviewVersion, inputFingerprint: question.coverageReview.inputFingerprint,
      updatedAt: question.updatedAt.toISOString(),
    }),
  };
}

export const coverageQuestionDecisionFamilyAdapter = createSnapshotDecisionFamilyAdapter({
  decisionDefinitionId: 'COVERAGE_QUESTION',
  primaryEntityType: 'CoverageReviewQuestion',
  recommendationDefinitionVersion: '1.0',
  engineVersion: 'coverage-review-v1',
  contextContractVersion: '1.0',
  loadSourceState: loadCoverageQuestionSourceState,
});

// ── Sell / Hold / Rent ──────────────────────────────────────────────────
// Home Intelligence Functional Completeness FRD Phase 3 review finding 4,
// delivery step 7. Wraps the latest CANONICAL SellHoldRentAnalysis — the
// persisted record sellHoldRent.service.ts's estimate() now writes on
// every non-scenario call (see that file's isCanonicalRequest). One
// analysis per property, so primaryEntityId is the propertyId itself, same
// as refinance-opportunity.

async function loadSellHoldRentSourceState(propertyId: string, primaryEntityId: string): Promise<SnapshotSourceState | null> {
  if (primaryEntityId !== propertyId) return null;
  const analysis = await prisma.sellHoldRentAnalysis.findFirst({
    where: { propertyId },
    orderBy: { computedAt: 'desc' },
    select: {
      id: true, years: true, winner: true, confidence: true,
      homeValueNowCents: true, netSellCents: true, netHoldCents: true, netRentCents: true,
    },
  });
  if (!analysis) return null;

  return {
    title: 'Sell, hold, or rent this property',
    goalCode: 'SELL_HOLD_RENT_DECISION',
    verdictCode: analysis.winner,
    reasonCodes: [`CONFIDENCE_${analysis.confidence}`],
    confidenceBreakdown: {
      label: analysis.confidence,
      netSellCents: analysis.netSellCents,
      netHoldCents: analysis.netHoldCents,
      netRentCents: analysis.netRentCents,
    },
    inputDigest: hashSourceState({
      id: analysis.id, years: analysis.years, winner: analysis.winner, confidence: analysis.confidence,
      homeValueNowCents: analysis.homeValueNowCents, netSellCents: analysis.netSellCents,
      netHoldCents: analysis.netHoldCents, netRentCents: analysis.netRentCents,
    }),
  };
}

export const sellHoldRentDecisionFamilyAdapter = createSnapshotDecisionFamilyAdapter({
  decisionDefinitionId: 'SELL_HOLD_RENT',
  primaryEntityType: 'Property',
  recommendationDefinitionVersion: '1.0',
  engineVersion: 'sell-hold-rent-v1',
  contextContractVersion: '1.0',
  loadSourceState: loadSellHoldRentSourceState,
});
