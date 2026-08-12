// HVAC repair/replace engine — Ask Intelligence FRD §12.3, the "registered
// repair/replace engine" Phase 8A's Decision Thread relies on. Deterministic,
// no model calls. Split into a DB-touching composer and a pure evaluator so
// the evaluator is unit-testable without a database (see
// tests/unit/decisionPlatform/hvacRepairReplaceEngine.test.js).
//
// Distinct from services/replaceRepairAnalysis.service.ts (REPLACEMENT_GUIDANCE's
// generic-appliance heuristic): this engine is HVAC-specific, consumes the
// full DECISION_CONTEXT_CONTRACTS.HVAC_REPAIR_REPLACE input set (ownership
// horizon, registered quote, warranty), and produces a RecommendationSnapshot-
// shaped result rather than a ReplaceRepairAnalysis row. It reuses two pure
// helpers from that file (ageYearsFromDate, conditionAdjustment) rather than
// duplicating them.

import { InventoryItemCondition } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ageYearsFromDate, conditionAdjustment } from '../replaceRepairAnalysis.service';
import { DECISION_CONTEXT_CONTRACTS } from './decisionContextContracts';
import { withEnhancerTimeout } from './decisionContextEnhancer';

export const HVAC_ENGINE_VERSION = '1.0';

// FRD §12.3: "canonical HVAC identity, age/range, condition inputs, and
// repair history" (required) plus "registered current quote or scenario
// quote", "warranty applicability", "confirmed ownership horizon",
// "registered replacement cost range and freshness" (optional, degrade on
// absence), and "explicit technician-assessment absence as a limitation"
// (always disclosed — no technician-assessment integration exists yet).
export interface HvacDecisionContext {
  propertyId: string;
  inventoryItemId: string;
  itemName: string;
  ageYears: number | undefined;
  condition: InventoryItemCondition;
  repairSpendCentsLast30Months: number;
  repairEventCountLast30Months: number;
  warrantyActive: boolean;
  currentQuoteAmountCents: number | null;
  currentQuoteVendor: string | null;
  // A recorded single value from the homeowner's own record, not a sourced
  // "range" — FRD §12.3 asks for a registered range with freshness, which no
  // data source in this codebase provides yet (see decisionContextContracts.ts
  // comment). Using the generic category default as if it were that sourced
  // range would misrepresent an estimate as a fact (FRD §1: "must never imply
  // ... something that is unknown"), so it is intentionally left UNAVAILABLE
  // rather than backfilled.
  recordedReplacementCostCents: number | null;
  ownershipHorizonMonths: number | null;
  repairReplaceApproach: 'MINIMIZE_UPFRONT_COST' | 'MINIMIZE_LONG_TERM_COST' | 'MAXIMIZE_RELIABILITY' | null;
  // Set only when evaluating a Scenario (FRD §13) — overrides
  // currentQuoteAmountCents for this evaluation without mutating context.
  scenarioQuoteAmountCents?: number | null;
}

export type HvacRepairReplaceVerdict = 'REPAIR' | 'REPLACE' | 'MONITOR';

export interface HvacRepairReplaceResult {
  verdict: HvacRepairReplaceVerdict;
  score: number;
  reasonCodes: string[];
  limitationCodes: string[];
  confidenceBreakdown: {
    label: 'HIGH' | 'MEDIUM' | 'LOW';
    knownFactors: string[];
    unknownFactors: string[];
  };
  engineVersion: string;
  contextContractVersion: string;
}

const HVAC_LIFESPAN_YEARS = 15;
// Matches DEFAULTS_BY_CATEGORY.HVAC in replaceRepairAnalysis.service.ts —
// used only to normalize repair-spend-as-a-fraction-of-replacement when the
// homeowner has not recorded their own replacement cost, never presented as
// a registered cost figure itself.
const HVAC_TYPICAL_REPLACEMENT_COST_CENTS = 900_000;

export function evaluateHvacRepairReplace(context: HvacDecisionContext): HvacRepairReplaceResult {
  const reasonCodes: string[] = [];
  // FRD §12.3: always disclosed for the first slice — no technician
  // assessment integration exists yet.
  const limitationCodes: string[] = ['NO_TECHNICIAN_ASSESSMENT_ON_FILE'];
  const knownFactors: string[] = [];
  const unknownFactors: string[] = [];

  const ageYears = context.ageYears;
  if (ageYears === undefined) {
    limitationCodes.push('INSTALL_DATE_UNKNOWN');
    unknownFactors.push('AGE');
  } else {
    knownFactors.push('AGE');
  }
  const effectiveAgeYears = ageYears ?? HVAC_LIFESPAN_YEARS * 0.6;

  if (context.condition === 'UNKNOWN') {
    limitationCodes.push('CONDITION_UNKNOWN');
    unknownFactors.push('CONDITION');
  } else {
    knownFactors.push('CONDITION');
  }

  const quoteAmountCents = context.scenarioQuoteAmountCents ?? context.currentQuoteAmountCents;
  const replacementCostCents = context.recordedReplacementCostCents ?? quoteAmountCents;
  if (replacementCostCents === null) {
    limitationCodes.push('REPLACEMENT_COST_RANGE_UNAVAILABLE');
    unknownFactors.push('REPLACEMENT_COST');
  } else {
    knownFactors.push('REPLACEMENT_COST');
  }

  // Score: 0 leans REPAIR, 100 leans REPLACE.
  let score = (effectiveAgeYears / HVAC_LIFESPAN_YEARS) * 60;
  if (effectiveAgeYears >= HVAC_LIFESPAN_YEARS) {
    reasonCodes.push('SYSTEM_AT_OR_BEYOND_TYPICAL_LIFESPAN');
  } else if (effectiveAgeYears <= HVAC_LIFESPAN_YEARS * 0.25) {
    reasonCodes.push('SYSTEM_RELATIVELY_NEW');
  }

  const conditionScore = conditionAdjustment(context.condition) * 100;
  score += conditionScore;
  if (context.condition === 'POOR') reasonCodes.push('CONDITION_POOR');

  const referenceReplacementCostCents = replacementCostCents ?? HVAC_TYPICAL_REPLACEMENT_COST_CENTS;
  const repairSpendRatio = context.repairSpendCentsLast30Months / referenceReplacementCostCents;
  const repairSpendContribution = Math.min(repairSpendRatio, 1) * 40;
  score += repairSpendContribution;
  if (repairSpendRatio >= 0.35) {
    reasonCodes.push('ELEVATED_REPAIR_SPEND');
  } else if (context.repairEventCountLast30Months === 0) {
    reasonCodes.push('NO_RECENT_REPAIR_SPEND');
  }

  if (context.ownershipHorizonMonths !== null) {
    knownFactors.push('OWNERSHIP_HORIZON');
    const remainingLifeMonths = Math.max(0, HVAC_LIFESPAN_YEARS - effectiveAgeYears) * 12;
    if (context.ownershipHorizonMonths < remainingLifeMonths * 0.5) {
      score -= 15;
      reasonCodes.push('OWNERSHIP_HORIZON_SHORTER_THAN_REMAINING_LIFE');
    }
  } else {
    unknownFactors.push('OWNERSHIP_HORIZON');
  }

  if (context.repairReplaceApproach === 'MAXIMIZE_RELIABILITY') {
    score += 10;
    reasonCodes.push('APPROACH_MAXIMIZE_RELIABILITY');
  } else if (context.repairReplaceApproach === 'MINIMIZE_UPFRONT_COST') {
    score -= 10;
    reasonCodes.push('APPROACH_MINIMIZE_UPFRONT_COST');
  }

  if (!context.warrantyActive) {
    reasonCodes.push('NO_ACTIVE_WARRANTY');
  } else {
    reasonCodes.push('ACTIVE_WARRANTY_REDUCES_REPAIR_RISK');
    score -= 5;
  }

  score = Math.max(0, Math.min(100, score));
  const verdict: HvacRepairReplaceVerdict = score >= 55 ? 'REPLACE' : score <= 25 ? 'REPAIR' : 'MONITOR';

  const knownCount = knownFactors.length;
  const confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW' = knownCount >= 4 ? 'HIGH' : knownCount >= 2 ? 'MEDIUM' : 'LOW';

  return {
    verdict,
    score,
    reasonCodes,
    limitationCodes,
    confidenceBreakdown: { label: confidenceLabel, knownFactors, unknownFactors },
    engineVersion: HVAC_ENGINE_VERSION,
    contextContractVersion: DECISION_CONTEXT_CONTRACTS.HVAC_REPAIR_REPLACE.version,
  };
}

const REPAIR_HISTORY_LOOKBACK_MONTHS = 30;

// FRD §12.2/Phase 8C: composition-level outcomes (an optional enhancer timed
// out) are distinct from evaluation-level outcomes (a field was simply never
// recorded) — evaluateHvacRepairReplace is a pure function over already-
// resolved context values and has no way to know *why* a value is null, so
// this is returned alongside the context rather than folded into it, and
// merged into the eventual RecommendationSnapshot.limitationCodes by the
// caller (decisionThreadService.ts) together with evaluation.limitationCodes.
export interface HvacDecisionContextComposition {
  context: HvacDecisionContext;
  compositionLimitationCodes: string[];
}

export async function composeHvacDecisionContext(
  propertyId: string,
  inventoryItemId: string,
  preferences: {
    ownershipHorizonMonths: number | null;
    repairReplaceApproach: HvacDecisionContext['repairReplaceApproach'];
  },
): Promise<HvacDecisionContextComposition | null> {
  const contract = DECISION_CONTEXT_CONTRACTS.HVAC_REPAIR_REPLACE;

  // Required facts: a timeout here is treated exactly like "item not found"
  // (FRD §12.2 "a typed degraded or blocked result"; a deliberate scope
  // decision for the first slice — see Phase 8C plan — rather than a new
  // partial-context type). Any non-timeout error still propagates.
  const itemLookup = await withEnhancerTimeout(
    () => prisma.inventoryItem.findFirst({
      where: { id: inventoryItemId, propertyId, category: 'HVAC' },
      select: {
        id: true, name: true, condition: true, installedOn: true, purchasedOn: true,
        replacementCostCents: true, warrantyId: true,
        warranty: { select: { expiryDate: true } },
      },
    }),
    contract.requiredFactLatencyMs,
    'HVAC_IDENTITY_LOOKUP_TIMED_OUT',
  );
  const item = itemLookup.value;
  if (!item) return null;

  const lookbackDate = new Date();
  lookbackDate.setMonth(lookbackDate.getMonth() - REPAIR_HISTORY_LOOKBACK_MONTHS);
  const repairHistoryLookup = await withEnhancerTimeout(
    () => prisma.homeEvent.findMany({
      where: {
        propertyId, inventoryItemId, isCurrent: true,
        type: { in: ['REPAIR', 'MAINTENANCE'] },
        occurredAt: { gte: lookbackDate },
      },
      select: { amount: true },
    }),
    contract.requiredFactLatencyMs,
    'HVAC_REPAIR_HISTORY_LOOKUP_TIMED_OUT',
  );
  if (repairHistoryLookup.value === null) return null;
  const repairEvents = repairHistoryLookup.value;
  const repairSpendCentsLast30Months = repairEvents.reduce(
    (sum, event) => sum + (event.amount ? Math.round(Number(event.amount) * 100) : 0),
    0,
  );

  // Optional enhancer: a timeout is omitted and disclosed, never blocking.
  const workspaceLookup = await withEnhancerTimeout(
    () => prisma.quoteComparisonWorkspace.findFirst({
      where: { propertyId, inventoryItemId },
      orderBy: { updatedAt: 'desc' },
      select: {
        selectedVendorName: true, selectedQuoteAmount: true,
        quotes: { orderBy: { createdAt: 'desc' }, take: 1, select: { vendorName: true, quoteAmount: true } },
      },
    }),
    contract.maximumEnhancerLatencyMs,
    'HVAC_CURRENT_QUOTE_LOOKUP_TIMED_OUT',
  );
  const workspace = workspaceLookup.value;
  const bestQuote = workspace
    ? (workspace.selectedQuoteAmount ? { vendorName: workspace.selectedVendorName, amount: workspace.selectedQuoteAmount } : workspace.quotes[0] ? { vendorName: workspace.quotes[0].vendorName, amount: workspace.quotes[0].quoteAmount } : null)
    : null;

  return {
    context: {
      propertyId,
      inventoryItemId: item.id,
      itemName: item.name,
      ageYears: ageYearsFromDate(item.installedOn ?? item.purchasedOn),
      condition: item.condition,
      repairSpendCentsLast30Months,
      repairEventCountLast30Months: repairEvents.length,
      warrantyActive: Boolean(item.warranty?.expiryDate && item.warranty.expiryDate.getTime() > Date.now()),
      currentQuoteAmountCents: bestQuote?.amount ? Math.round(Number(bestQuote.amount) * 100) : null,
      currentQuoteVendor: bestQuote?.vendorName ?? null,
      recordedReplacementCostCents: item.replacementCostCents ?? null,
      ownershipHorizonMonths: preferences.ownershipHorizonMonths,
      repairReplaceApproach: preferences.repairReplaceApproach,
    },
    compositionLimitationCodes: workspaceLookup.limitationCodes,
  };
}
