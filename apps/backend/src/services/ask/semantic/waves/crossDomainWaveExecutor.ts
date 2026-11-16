import {
  buildSemanticReadReceipt,
  type SemanticReadReceipt,
} from '../semanticExecutionReceipt';
import {
  verifySemanticReadReceiptEntailment,
  type SemanticReceiptEntailmentVerdict,
} from '../semanticReceiptEntailment';
import { ASK_SEMANTIC_PLAN_VERSION, type SemanticFacet, type SemanticRequestPlan, type SemanticWhereExpression } from '../semanticRequestPlan';
import { type SemanticDomainId } from '../phase0/semanticOntologyBaseline';
import {
  buildPhase2aRichPresentation,
  verifyRichPresentationPopulationEquivalence,
  type Phase2aRichPresentationEquivalenceReport,
} from '../phase2a/phase2aRichPresentationAdapter';
import { prisma } from '../../../../lib/prisma';
import { visibleInventoryItemWhere } from '../../../riskAssetApplicability';
import { type DynamicPlaceholderEntityCandidate } from '../phase2a/placeholderSpanMap';
import { type AskPresentationBlock } from '../../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../../askOperationRegistry';
import { getAskSavedPage } from '../../askSaved.service';
import { safeTimezone } from '../../support/propertyContext';
import { computeMonthlyPayment } from '../../../tools/mortgageMath';
import { parseSellHoldRentOverrides } from '../../../toolOverrideContract';
import {
  executePhase2aVerticalSlice,
  loadPhase2aPropertySnapshot,
  type Phase2aAuthorizationContext,
  type Phase2aPropertySnapshot,
} from '../phase2a/phase2aSliceExecutor';
import {
  assignMixedStackFacetOwnership,
  tryNormalizeToCanonicalSection5Domain,
  type MixedStackFacetOwnershipAssignment,
} from './domainWaveManifest';
import {
  applyCrossDomainFollowUpRefinement,
  mayNeedDynamicQuoteResolution,
  parseCrossDomainSemanticRequest,
  type CrossDomainClarification,
  type DynamicQuoteCandidate,
  type PlanOverflowFacet,
} from './crossDomainPlanBuilder';

export type AskUserRole = Phase2aAuthorizationContext['role'];

export interface WaveExtendedItemRecord {
  readonly id: string;
  readonly slug?: string;
  readonly propertyId: string;
  readonly name: string;
  readonly category: 'APPLIANCE' | 'HVAC' | 'PLUMBING' | 'ELECTRICAL' | 'OTHER';
  readonly purchaseCostCents: number | null;
  readonly replacementCostCents: number | null;
  readonly installedOn: string | null;
  readonly condition: 'GOOD' | 'FAIR' | 'POOR' | null;
  readonly manualDocumentId: string | null;
  readonly receiptDocumentId: string | null;
  readonly roomId: string | null;
  readonly isHidden?: boolean;
}

export interface WaveWarrantyRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly providerName: string;
  readonly category: string;
  readonly expiryDate: string;
}

export interface WaveExtendedMaintenanceTaskMeta {
  readonly taskId: string;
  readonly category: 'PLUMBING' | 'ELECTRICAL' | 'HVAC' | 'GENERAL';
}

export interface WaveInsurancePolicyRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly carrierName: string;
  readonly policyNumber: string;
  readonly deductibleCents: number;
  readonly annualPremiumCents: number;
  readonly expiryDate: string;
}

export interface WaveClaimRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly title: string;
  readonly slug: string;
  readonly status: 'OPEN' | 'CLOSED' | 'UNDER_REVIEW';
  readonly requiredDocumentTypes: readonly string[];
}

export interface WaveDocumentRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly title: string;
  readonly documentType: string;
  readonly lifecycleStatus: 'ACTIVE' | 'ARCHIVED' | 'TRASHED';
  readonly visibleToRoles: readonly AskUserRole[];
}

export interface WaveClaimDocLink {
  readonly id: string;
  readonly claimId: string;
  readonly documentId: string;
}

export interface WaveHomeEventRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly title: string;
  readonly eventCategory: 'REPAIR' | 'UPGRADE' | 'INSPECTION' | 'OTHER';
  readonly occurredAt: string;
  readonly actualCostCents: number | null;
}

export interface WaveTaxBillRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly taxYear: number;
  readonly amountCents: number;
  readonly status: 'PAID' | 'UNPAID' | 'OVERDUE';
  readonly lifecycleStatus: 'ACTIVE' | 'SUPERSEDED';
}

export interface WaveFinanceSlots {
  readonly monthlyRentCents: number | null;
  readonly homeValueCents: number | null;
  readonly horizonYears: number | null;
  readonly currentRateBps: number | null;
  readonly candidateRateBps: number | null;
  readonly closingCostsCents: number | null;
  readonly loanBalanceCents?: number | null;
  readonly remainingTermMonths?: number | null;
  readonly monthlySavingsCents?: number | null;
  readonly breakEvenMonths?: number | null;
  readonly netHoldCents?: number | null;
  readonly netRentCents?: number | null;
  readonly sellHoldRentWinner?: string | null;
}

export interface WaveRecallRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly title: string;
  readonly severity: 'HIGH' | 'MEDIUM' | 'LOW';
  readonly affectedInventoryItemId: string;
}

export interface WaveEnvironmentalRiskRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly hazardType: string;
  readonly severity: 'HIGH' | 'MODERATE' | 'LOW';
  readonly windowStartIso: string;
  readonly windowEndIso: string;
  readonly sourceAvailable: boolean;
  readonly lastUpdatedIso: string;
}

export interface WaveInspectionFindingRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly inspectionReportId: string;
  readonly inspectionReportTitle: string;
  readonly title: string;
  readonly status: 'ACTION_REQUIRED' | 'MONITORING' | 'RESOLVED';
}

export interface WaveBuyerTaskRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly title: string;
  readonly isContingency: boolean;
  readonly status: 'OPEN' | 'COMPLETED';
  readonly dueAt: string;
}

export interface WaveSellerReadinessRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly title: string;
  readonly status: 'PENDING' | 'COMPLETED';
}

export interface WaveProjectRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly title: string;
  readonly status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  readonly permitStatus: 'CONFIRMED_NOT_REQUIRED' | 'NEEDS_PERMIT' | 'UNKNOWN' | 'APPROVED';
}

export interface WaveContractorQuoteRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly roomTag: string;
  readonly scopeText?: string | null;
  readonly vendorName: string;
  readonly amountCents: number;
  readonly timelineDays: number;
  readonly warrantyMonths: number;
}

export interface WaveSavedResultRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly title: string;
  readonly savedType: string;
  readonly minimumRole: AskUserRole;
  readonly serializedPlan?: string;
}

export interface CrossDomainPropertySnapshot extends Phase2aPropertySnapshot {
  readonly timezone: string;
  readonly closingDateIso: string | null;
  readonly extendedItems: readonly WaveExtendedItemRecord[];
  readonly warranties: readonly WaveWarrantyRecord[];
  readonly maintenanceTaskMeta: readonly WaveExtendedMaintenanceTaskMeta[];
  readonly insurancePolicies: readonly WaveInsurancePolicyRecord[];
  readonly claims: readonly WaveClaimRecord[];
  readonly documents: readonly WaveDocumentRecord[];
  readonly claimDocLinks: readonly WaveClaimDocLink[];
  readonly homeEvents: readonly WaveHomeEventRecord[];
  readonly taxBills: readonly WaveTaxBillRecord[];
  readonly financeSlots: WaveFinanceSlots | null;
  readonly recalls: readonly WaveRecallRecord[];
  readonly environmentalRisks: readonly WaveEnvironmentalRiskRecord[];
  readonly inspectionFindings: readonly WaveInspectionFindingRecord[];
  readonly buyerTasks: readonly WaveBuyerTaskRecord[];
  readonly sellerReadinessItems: readonly WaveSellerReadinessRecord[];
  readonly projects: readonly WaveProjectRecord[];
  readonly contractorQuotes: readonly WaveContractorQuoteRecord[];
  readonly savedResults: readonly WaveSavedResultRecord[];
  readonly savedResultsState?: {
    readonly status: 'AVAILABLE' | 'UNAVAILABLE';
    readonly reason?: string;
    readonly partial?: boolean;
  };
}

export interface WaveFacetExecutionResult {
  readonly facetId: string;
  readonly jobMatch?: string | null;
  readonly owner: MixedStackFacetOwnershipAssignment;
  readonly status: 'EXECUTED' | 'PARTIAL_MISSING_SLOTS' | 'UNRESOLVED' | 'BLOCKED';
  readonly summary: string;
  readonly recordIds: readonly string[];
  readonly rows?: ReadonlyArray<{ readonly id: string; readonly label: string; readonly subtitle?: string }>;
  readonly missingSlots: readonly string[];
  readonly redactedFieldIds: readonly string[];
  readonly receipt: SemanticReadReceipt | null;
  readonly entailment: SemanticReceiptEntailmentVerdict | null;
  readonly presentationEquivalence: Phase2aRichPresentationEquivalenceReport | null;
  readonly metrics?: Readonly<Record<string, number | string | boolean | null>>;
}

export interface CrossDomainExecutionResult {
  readonly status: 'ANSWERED' | 'PARTIAL' | 'CLARIFY' | 'NONE_FITS' | 'BOUNDARY' | 'FORBIDDEN';
  readonly rawText: string;
  readonly answer: string;
  readonly clarification: CrossDomainClarification | null;
  readonly facetResults: readonly WaveFacetExecutionResult[];
  readonly overflowFacets: readonly PlanOverflowFacet[];
  readonly executionCountByFacetId: Readonly<Record<string, number>>;
  readonly redactedFieldIds: readonly string[];
}

const ROLE_RANK: Readonly<Record<AskUserRole, number>> = {
  VIEWER: 1,
  EDITOR: 2,
  OWNER: 3,
};

function canSeeRole(role: AskUserRole, minimumRole: AskUserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimumRole];
}

function datePartsInTimeZone(dateInput: Date | string, timeZone: string): { year: number; month: number; day: number } {
  const raw = typeof dateInput === 'string' ? dateInput.trim() : dateInput.toISOString();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    return {
      year: Number(dateOnly[1]),
      month: Number(dateOnly[2]),
      day: Number(dateOnly[3]),
    };
  }
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) {
    return { year: 1970, month: 1, day: 1 };
  }
  const tz = safeTimezone(timeZone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return {
    year: Number(parts.find((p) => p.type === 'year')?.value ?? date.getUTCFullYear()),
    month: Number(parts.find((p) => p.type === 'month')?.value ?? (date.getUTCMonth() + 1)),
    day: Number(parts.find((p) => p.type === 'day')?.value ?? date.getUTCDate()),
  };
}

function localYmdInTimeZone(dateInput: Date | string, timeZone: string): string {
  const { year, month, day } = datePartsInTimeZone(dateInput, timeZone);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function targetYearMonthInTimeZone(referenceDate: string, offsetMonths: number, timeZone: string): { year: number; month: number } {
  const base = datePartsInTimeZone(referenceDate, timeZone);
  const shifted = new Date(Date.UTC(base.year, base.month - 1 + offsetMonths, 15));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
  };
}

function weekWindowYmd(referenceDate: string, timeZone: string): { startYmd: string; endYmd: string } {
  const base = datePartsInTimeZone(referenceDate, timeZone);
  const start = new Date(Date.UTC(base.year, base.month - 1, base.day - 1));
  const end = new Date(Date.UTC(base.year, base.month - 1, base.day + 7));
  return {
    startYmd: start.toISOString().slice(0, 10),
    endYmd: end.toISOString().slice(0, 10),
  };
}

function finalizeReceiptAndPresentation(input: {
  readonly facet: SemanticFacet;
  readonly snapshot: CrossDomainPropertySnapshot;
  readonly role: AskUserRole;
  readonly projection: SemanticReadReceipt['projection'];
  readonly operationAdapter: string;
  readonly sourceType: string;
  readonly predicateIds: readonly string[];
  readonly rows: ReadonlyArray<{ readonly id: string; readonly label: string; readonly subtitle?: string }>;
  readonly title: string;
  readonly summaryBody: string;
  readonly variantId: string;
  readonly unknownCount?: number;
  readonly conflictedCount?: number;
}): {
  readonly receipt: SemanticReadReceipt;
  readonly entailment: SemanticReceiptEntailmentVerdict;
  readonly equivalence: Phase2aRichPresentationEquivalenceReport;
  readonly rows: ReadonlyArray<{ readonly id: string; readonly label: string; readonly subtitle?: string }>;
} {
  const resolvedRecordIds = input.rows.map((r) => r.id);
  const unknownCount = input.unknownCount ?? 0;
  const conflictedCount = input.conflictedCount ?? 0;
  const confirmedCount = resolvedRecordIds.length;
  const displayedCount = input.projection === 'COUNT' ? 0 : resolvedRecordIds.length;
  const renderedBody = input.projection === 'COUNT' && !new RegExp(`\\b${confirmedCount}\\b`).test(input.summaryBody)
    ? `${confirmedCount} ${input.summaryBody}`
    : input.summaryBody;

  const receipt = buildSemanticReadReceipt({
    facetId: input.facet.id,
    requestClass: input.facet.requestClass === 'CAPABILITY' ? 'CAPABILITY' : 'DATA_QUERY',
    entityId: input.facet.subject?.entityId ?? 'entity.property',
    operationAdapter: input.operationAdapter,
    projection: input.projection,
    predicateIds: input.predicateIds.length > 0 ? input.predicateIds : [`predicate.${input.facet.subject?.entityId ?? 'property'}.read`],
    resolvedRecordIds,
    confirmedCount,
    conflictedCount,
    unknownCount,
    displayedCount,
    propertyId: input.snapshot.propertyId,
    role: input.role,
    sourceType: input.sourceType,
    observedAt: `${input.snapshot.asOfDate.slice(0, 10)}T00:00:00.000Z`,
    answerVariantId: input.variantId,
  });

  const blocks = buildPhase2aRichPresentation({
    receipt,
    title: input.title,
    summaryBody: renderedBody,
    rows: input.projection === 'COUNT' ? [] : input.rows.map((r) => ({ id: r.id, label: r.label, subtitle: r.subtitle })),
  });

  const entailment = verifySemanticReadReceiptEntailment({
    status: 'ANSWERED',
    blocks,
    suggestions: [],
    confirmation: null,
    clarification: null,
    parameters: { semanticExecutionReceipt: receipt },
  });
  if (entailment.outcome !== 'PASS') {
    throw new Error(`Wave receipt entailment failed (${input.facet.evidence.jobMatch}): ${entailment.reasonCodes.join(', ')}`);
  }

  const equivalence = verifyRichPresentationPopulationEquivalence(receipt, blocks);
  if (!equivalence.ok) {
    throw new Error(`Wave presentation equivalence failed (${input.facet.evidence.jobMatch}): ${equivalence.reasons.join(', ')}`);
  }

  return { receipt, entailment, equivalence, rows: input.rows };
}

/**
 * Computes cumulative year-by-year net owning vs renting comparison and crossover year.
 * Returns null crossoverYear if owning does not overtake renting within the evaluation window.
 */
function computeOwnVsRentBreakEven(slots: WaveFinanceSlots): {
  readonly horizonYears: number;
  readonly crossoverYear: number | null;
  readonly breaksEvenWithinHorizon: boolean;
  readonly cumulativeRentAtHorizonCents: number | null;
  readonly netOwningCostAtHorizonCents: number | null;
  readonly ownAdvantageAtHorizonCents: number | null;
  readonly sellHoldRentWinner: string | null;
  readonly hasPersistedOutcome: boolean;
  readonly hasPersistedNet: boolean;
  readonly hasMonthlyRentInput: boolean;
} {
  const horizonYears = Math.max(1, Math.round(slots.horizonYears ?? 5));
  const hasMonthlyRentInput =
    typeof slots.monthlyRentCents === 'number'
    && Number.isFinite(slots.monthlyRentCents)
    && slots.monthlyRentCents > 0;
  const hasHomeValueInput =
    typeof slots.homeValueCents === 'number'
    && Number.isFinite(slots.homeValueCents)
    && slots.homeValueCents > 0;

  let fallbackCrossoverYear: number | null = null;
  let cumulativeRentAtHorizonCents: number | null = null;
  let netOwningCostAtHorizonCents: number | null = null;

  if (hasMonthlyRentInput && hasHomeValueInput) {
    const monthlyRentCents = slots.monthlyRentCents!;
    const homeValue = slots.homeValueCents!;
    const financingRate = (slots.currentRateBps ?? 650) / 10000;
    const maxYears = Math.max(horizonYears, 30);

    let cumRentCents = 0;
    let cumCarryingCents = 0;
    let cumFinancingCents = 0;
    let cumAppreciationCents = 0;
    const transactionFrictionCents = Math.round(homeValue * 0.06);

    for (let year = 1; year <= maxYears; year += 1) {
      cumRentCents += Math.round(monthlyRentCents * 12 * Math.pow(1.03, year - 1));
      const appreciatedValue = homeValue * Math.pow(1.035, year - 1);
      cumCarryingCents += Math.round(appreciatedValue * 0.022);
      cumFinancingCents += Math.round(homeValue * 0.8 * financingRate);
      cumAppreciationCents += Math.round(appreciatedValue * 0.035);
      const netOwningCostCents = cumCarryingCents + cumFinancingCents + transactionFrictionCents - cumAppreciationCents;

      if (fallbackCrossoverYear === null && netOwningCostCents <= cumRentCents) {
        fallbackCrossoverYear = year;
      }
      if (year === horizonYears) {
        cumulativeRentAtHorizonCents = cumRentCents;
        netOwningCostAtHorizonCents = netOwningCostCents;
      }
    }
  }

  const hasPersistedNet =
    typeof slots.netHoldCents === 'number'
    && Number.isFinite(slots.netHoldCents)
    && typeof slots.netRentCents === 'number'
    && Number.isFinite(slots.netRentCents);
  const persistedAdvantageCents = hasPersistedNet
    ? Math.round(slots.netHoldCents! - slots.netRentCents!)
    : null;
  const winnerUpper = slots.sellHoldRentWinner ? slots.sellHoldRentWinner.toUpperCase() : null;
  const hasPersistedOutcome = hasPersistedNet || winnerUpper !== null;

  if (hasPersistedOutcome) {
    const persistedOwningBeatsRent =
      winnerUpper === 'HOLD' || winnerUpper === 'OWN'
        ? (persistedAdvantageCents !== null ? persistedAdvantageCents >= 0 : true)
        : winnerUpper !== null
          ? false
          : persistedAdvantageCents! >= 0;

    return {
      horizonYears,
      // Never fabricate an exact crossover year unless a genuine monthly-rent assumption was available.
      crossoverYear: persistedOwningBeatsRent && hasMonthlyRentInput && hasHomeValueInput
        ? (fallbackCrossoverYear !== null && fallbackCrossoverYear <= horizonYears ? fallbackCrossoverYear : horizonYears)
        : null,
      breaksEvenWithinHorizon: persistedOwningBeatsRent,
      cumulativeRentAtHorizonCents,
      netOwningCostAtHorizonCents,
      ownAdvantageAtHorizonCents:
        persistedAdvantageCents
        ?? (cumulativeRentAtHorizonCents !== null && netOwningCostAtHorizonCents !== null
          ? cumulativeRentAtHorizonCents - netOwningCostAtHorizonCents
          : null),
      sellHoldRentWinner: slots.sellHoldRentWinner ?? null,
      hasPersistedOutcome: true,
      hasPersistedNet,
      hasMonthlyRentInput,
    };
  }

  const ownAdvantageAtHorizonCents =
    cumulativeRentAtHorizonCents !== null && netOwningCostAtHorizonCents !== null
      ? cumulativeRentAtHorizonCents - netOwningCostAtHorizonCents
      : null;

  return {
    horizonYears,
    crossoverYear: fallbackCrossoverYear,
    breaksEvenWithinHorizon:
      (ownAdvantageAtHorizonCents !== null && ownAdvantageAtHorizonCents >= 0)
      || (fallbackCrossoverYear !== null && fallbackCrossoverYear <= horizonYears),
    cumulativeRentAtHorizonCents,
    netOwningCostAtHorizonCents,
    ownAdvantageAtHorizonCents,
    sellHoldRentWinner: null,
    hasPersistedOutcome: false,
    hasPersistedNet: false,
    hasMonthlyRentInput,
  };
}

/**
 * Evaluates refinance monthly savings and break-even months against a horizon (in years).
 * Uses canonical persisted fields when available, otherwise computes via mortgageMath.
 */
function computeRefinanceBreakEven(
  slots: WaveFinanceSlots,
  horizonYears: number,
): {
  readonly monthlySavingsCents: number | null;
  readonly breakEvenMonths: number | null;
  readonly breaksEvenWithinHorizon: boolean | null;
  readonly missingComputationInput: string | null;
} {
  const closingCostsCents = slots.closingCostsCents!;
  const currentRateBps = slots.currentRateBps!;
  const candidateRateBps = slots.candidateRateBps!;

  let monthlySavingsCents: number | null =
    typeof slots.monthlySavingsCents === 'number' && Number.isFinite(slots.monthlySavingsCents)
      ? Math.round(slots.monthlySavingsCents)
      : null;

  if (monthlySavingsCents === null && typeof slots.loanBalanceCents === 'number' && slots.loanBalanceCents > 0) {
    const remainingTermMonths = Math.max(12, Math.round(slots.remainingTermMonths ?? 360));
    const oldPaymentDollars = computeMonthlyPayment({
      balanceNow: slots.loanBalanceCents / 100,
      annualRate: currentRateBps / 10000,
      remainingTermMonths,
    });
    const newPaymentDollars = computeMonthlyPayment({
      balanceNow: slots.loanBalanceCents / 100,
      annualRate: candidateRateBps / 10000,
      remainingTermMonths,
    });
    monthlySavingsCents = Math.round((oldPaymentDollars - newPaymentDollars) * 100);
  }

  let breakEvenMonths: number | null =
    typeof slots.breakEvenMonths === 'number' && Number.isFinite(slots.breakEvenMonths)
      ? Math.round(slots.breakEvenMonths)
      : null;

  if (breakEvenMonths === null && monthlySavingsCents !== null) {
    breakEvenMonths = monthlySavingsCents > 0 ? Math.ceil(closingCostsCents / monthlySavingsCents) : null;
  }

  if (monthlySavingsCents === null && breakEvenMonths === null) {
    return {
      monthlySavingsCents: null,
      breakEvenMonths: null,
      breaksEvenWithinHorizon: null,
      missingComputationInput: 'loanBalanceCents',
    };
  }

  const horizonMonths = Math.max(1, Math.round(horizonYears)) * 12;
  const breaksEvenWithinHorizon =
    monthlySavingsCents !== null && monthlySavingsCents <= 0
      ? false
      : breakEvenMonths !== null && breakEvenMonths > 0 && breakEvenMonths <= horizonMonths;

  return {
    monthlySavingsCents,
    breakEvenMonths,
    breaksEvenWithinHorizon,
    missingComputationInput: null,
  };
}

function quoteMatchesRequestedScope(quote: WaveContractorQuoteRecord, requestedScope: string): boolean {
  const scopeNorm = requestedScope.trim().toLowerCase();
  if (!scopeNorm) return true;
  const haystack = `${quote.roomTag ?? ''} ${quote.scopeText ?? ''} ${quote.vendorName ?? ''}`.toLowerCase();
  if (haystack.includes(scopeNorm)) return true;
  if (scopeNorm === 'bathroom' && /\bbath\b/.test(haystack)) return true;
  if (scopeNorm === 'roof' && /\broof(ing)?\b/.test(haystack)) return true;
  if (scopeNorm === 'roofing' && /\broof(ing)?\b/.test(haystack)) return true;
  return false;
}

function evaluateWherePredicates(where: SemanticWhereExpression | null): string[] {
  if (!where) return [];
  if (where.kind === 'PREDICATE') return [where.predicateId];
  if (where.kind === 'NOT') return evaluateWherePredicates(where.operand);
  return where.operands.flatMap(evaluateWherePredicates);
}

function firstPredicateTargetCategorySet(where: SemanticWhereExpression | null): readonly string[] | null {
  if (!where) return null;
  if (where.kind === 'PREDICATE') return where.targetCategorySet ?? null;
  if (where.kind === 'NOT') return firstPredicateTargetCategorySet(where.operand);
  for (const op of where.operands) {
    const found = firstPredicateTargetCategorySet(op);
    if (found) return found;
  }
  return null;
}

function executeNewStackFacet(
  facet: SemanticFacet,
  owner: MixedStackFacetOwnershipAssignment,
  snapshot: CrossDomainPropertySnapshot,
  role: AskUserRole,
  priorResultsById: ReadonlyMap<string, WaveFacetExecutionResult>,
): WaveFacetExecutionResult {
  const job = facet.evidence.jobMatch;
  const adapterId = owner.adapterId;
  const visibleItems = snapshot.extendedItems.filter((item) => item.propertyId === snapshot.propertyId && !item.isHidden);
  const redactedFieldIds: string[] = [];

  if (job === 'query.maintenance_task.filter') {
    const categories = firstPredicateTargetCategorySet(facet.where);
    const metaByTaskId = new Map(snapshot.maintenanceTaskMeta.map((m) => [m.taskId, m.category]));
    const refLocalYmd = localYmdInTimeZone(snapshot.asOfDate, snapshot.timezone);
    const matches = snapshot.maintenanceTasks.filter((task) => {
      if (task.propertyId !== snapshot.propertyId) return false;
      if (categories && categories.length > 0) {
        const taskCat = metaByTaskId.get(task.id) ?? 'GENERAL';
        return categories.includes(taskCat) && (task.status === 'PENDING' || task.status === 'IN_PROGRESS');
      }
      if (facet.time?.kind === 'CALENDAR_PERIOD' && facet.time.unit === 'MONTH') {
        if (task.status !== 'PENDING' || !task.nextDueDate) return false;
        const targetYm = targetYearMonthInTimeZone(snapshot.asOfDate, facet.time.offset, snapshot.timezone);
        const dueParts = datePartsInTimeZone(task.nextDueDate, snapshot.timezone);
        return dueParts.year === targetYm.year && dueParts.month === targetYm.month;
      }
      return task.status === 'PAST_DUE' || (task.status === 'PENDING' && Boolean(task.nextDueDate) && localYmdInTimeZone(task.nextDueDate, snapshot.timezone) < refLocalYmd);
    });
    const rows = matches.map((m) => ({ id: m.id, label: m.title, subtitle: `Due ${m.nextDueDate}` }));
    const summary = matches.length === 0 ? 'No matching maintenance tasks found.' : `${matches.length} maintenance task(s): ${matches.map((m) => m.title).join(', ')}.`;
    const predIds = evaluateWherePredicates(facet.where);
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'LIST',
      operationAdapter: adapterId,
      sourceType: 'PropertyMaintenanceTask',
      predicateIds: predIds.length > 0 ? predIds : ['predicate.maintenance_task.matches_filter'],
      rows,
      title: 'Maintenance tasks',
      summaryBody: summary,
      variantId: 'variant.maintenance_list',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      rows: finalized.rows,
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  // Wave 1/4: Neither manual nor receipt
  if (job === 'query.inventory_item.relation_boolean' && facet.relations.some((r) => r.semanticRelationId === 'relation.inventory_item.manual_document')) {
    const matches = visibleItems.filter((item) => !item.manualDocumentId && !item.receiptDocumentId);
    const rows = matches.map((m) => ({ id: m.id, label: m.name }));
    const summary = `${matches.length} inventory item(s) have neither a manual nor a receipt: ${matches.map((m) => m.name).join(', ')}.`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: facet.projection === 'COUNT' ? 'COUNT' : 'LIST',
      operationAdapter: adapterId,
      sourceType: 'InventoryItem',
      predicateIds: evaluateWherePredicates(facet.where),
      rows,
      title: 'Items without manual or receipt',
      summaryBody: summary,
      variantId: 'variant.inventory_missing_docs',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      rows: finalized.rows,
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  // Phase 2A single-slice vertical reads & replacement guidance
  if (
    job === 'query.inventory_item.relation_boolean'
    || job === 'query.inventory_item.warranty_relation'
    || job === 'job.inventory.replacement_guidance'
  ) {
    const rawQuery = job === 'job.inventory.replacement_guidance' ? 'should I repair or replace my furnace' : facet.sourceSpan.text;
    const planOverrideForFacet: SemanticRequestPlan | undefined =
      job !== 'job.inventory.replacement_guidance'
      && !facet.confidenceSignals.grammarComplete
      && facet.requiredSlots.every((s) => s.state === 'RESOLVED')
        ? {
            schemaVersion: ASK_SEMANTIC_PLAN_VERSION,
            producer: { kind: 'PROVIDER', version: 'cross-domain-wave-forwarded' },
            outcome: 'MATCH',
            rawText: rawQuery,
            normalizedText: rawQuery,
            minimizedText: rawQuery,
            unresolvedSpans: [],
            facets: [{
              ...facet,
              sourceSpan: { start: 0, end: rawQuery.length, text: rawQuery },
              dependsOn: [],
              confidenceSignals: { grammarComplete: true, unresolvedSpanCount: 0 },
            }],
          }
        : undefined;
    const sub = executePhase2aVerticalSlice({
      rawText: rawQuery,
      snapshot,
      auth: { propertyId: snapshot.propertyId, role, propertyAuthorized: true },
      planOverride: planOverrideForFacet,
    });
    const summaryBlock = sub.operationResult.blocks.find((b) => b.type === 'SUMMARY');
    const summaryText = summaryBlock && summaryBlock.type === 'SUMMARY' ? summaryBlock.body : sub.status;
    const groupedBlock = sub.operationResult.blocks.find((b) => b.type === 'GROUPED_LIST');
    const subRows = groupedBlock && groupedBlock.type === 'GROUPED_LIST'
      ? groupedBlock.sections.flatMap((section) =>
          section.items.map((item) => ({
            id: item.id,
            label: item.title,
            ...(item.description ? { subtitle: item.description } : {}),
          })),
        )
      : [];
    return {
      facetId: facet.id,
      owner,
      status: sub.status === 'ANSWERED' ? 'EXECUTED' : 'BLOCKED',
      summary: summaryText,
      recordIds: sub.receipt?.resolvedRecordIds ?? [...sub.activeEntityIds],
      rows: subRows,
      missingSlots: [],
      redactedFieldIds: [...sub.redactedFields],
      receipt: sub.receipt,
      entailment: sub.entailment,
      presentationEquivalence: sub.presentationEquivalence,
    };
  }

  if (job === 'query.inventory_item.field_read') {
    const target = visibleItems.find((i) => !facet.subject?.recordId || i.slug === facet.subject.recordId || i.id === facet.subject.recordId || i.name.toLowerCase().includes(facet.subject.recordId.replace(/-/g, ' ')));
    const rows = target ? [{ id: target.id, label: target.name }] : [];
    const wantsReplacementCost = facet.fields.some((f) => f.fieldId === 'field.inventory_item.replacement_cost');
    let summary = target ? `${target.name}: installed ${target.installedOn ?? 'unknown'}.` : 'Matching item not found.';
    if (target && wantsReplacementCost) {
      if (!canSeeRole(role, 'EDITOR')) {
        redactedFieldIds.push('field.inventory_item.replacement_cost');
        summary = `${target.name}: replacement cost redacted for ${role}.`;
      } else {
        summary = `${target.name}: replacement cost $${((target.replacementCostCents ?? 0) / 100).toFixed(2)}.`;
      }
    }
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'DETAIL',
      operationAdapter: adapterId,
      sourceType: 'InventoryItem',
      predicateIds: ['predicate.inventory_item.has_warranty_record'],
      rows,
      title: 'Inventory item detail',
      summaryBody: summary,
      variantId: 'variant.inventory_field_detail',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      rows: finalized.rows,
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  if (job === 'query.warranty.filter') {
    const refLocalYmd = localYmdInTimeZone(snapshot.asOfDate, snapshot.timezone);
    const expired = snapshot.warranties.filter(
      (w) => w.propertyId === snapshot.propertyId && Boolean(w.expiryDate) && localYmdInTimeZone(w.expiryDate, snapshot.timezone) < refLocalYmd,
    );
    const rows = expired.map((w) => ({ id: w.id, label: w.providerName, subtitle: `Expired ${w.expiryDate}` }));
    const summary = `${expired.length} expired warranty record(s): ${expired.map((w) => w.providerName).join(', ')}.`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'LIST',
      operationAdapter: adapterId,
      sourceType: 'Warranty',
      predicateIds: ['predicate.warranty.matches_filter'],
      rows,
      title: 'Expired warranties',
      summaryBody: summary,
      variantId: 'variant.expired_warranties',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      rows: finalized.rows,
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  if (job === 'query.insurance_policy.field_read') {
    const policies = snapshot.insurancePolicies.filter((p) => p.propertyId === snapshot.propertyId);
    const rows = policies.map((p) => ({ id: p.id, label: p.carrierName }));
    const restricted = !canSeeRole(role, 'EDITOR');
    if (restricted) redactedFieldIds.push('field.insurance_policy.deductible');
    const summary = restricted
      ? 'Insurance deductible requires EDITOR or OWNER role (redacted).'
      : policies.length === 0
        ? 'No insurance policies recorded.'
        : `Insurance deductible: $${(policies[0].deductibleCents / 100).toFixed(2)} (${policies[0].carrierName}).`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'DETAIL',
      operationAdapter: adapterId,
      sourceType: 'InsurancePolicy',
      predicateIds: ['predicate.warranty.matches_filter'],
      rows,
      title: 'Insurance policy deductible',
      summaryBody: summary,
      variantId: restricted ? 'variant.insurance_redacted' : 'variant.insurance_deductible',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      rows: finalized.rows,
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  if (job === 'query.claim.filter') {
    const openClaims = snapshot.claims.filter((c) => c.propertyId === snapshot.propertyId && c.status === 'OPEN');
    const rows = openClaims.map((c) => ({ id: c.id, label: c.title, subtitle: c.status }));
    const summary = `${openClaims.length} open claim(s): ${openClaims.map((c) => c.title).join(', ')}.`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'LIST',
      operationAdapter: adapterId,
      sourceType: 'Claim',
      predicateIds: ['predicate.claim.has_status'],
      rows,
      title: 'Open claims',
      summaryBody: summary,
      variantId: 'variant.open_claims',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      rows: finalized.rows,
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  if (job === 'query.claim.documents') {
    const isMissingMode = facet.where?.kind === 'PREDICATE' && facet.where.predicateId === 'predicate.claim.missing_required_document';
    const depIds = facet.dependsOn.flatMap((depId) => priorResultsById.get(depId)?.recordIds ?? []);
    const targetSlug = facet.where?.kind === 'PREDICATE' ? facet.where.targetRecordId : undefined;
    const authorizedClaims = snapshot.claims.filter((c) =>
      c.propertyId === snapshot.propertyId
      && (depIds.length === 0 || depIds.includes(c.id))
      && (!targetSlug || c.slug === targetSlug || c.title.toLowerCase().includes(targetSlug.replace(/-/g, ' '))),
    );
    const claimIds = new Set(authorizedClaims.map((c) => c.id));
    const visibleDocs = snapshot.documents.filter((doc) =>
      doc.propertyId === snapshot.propertyId
      && doc.lifecycleStatus === 'ACTIVE'
      && doc.visibleToRoles.includes(role),
    );
    const visibleDocMap = new Map(visibleDocs.map((d) => [d.id, d]));

    if (isMissingMode) {
      const missingRows: Array<{ id: string; label: string }> = [];
      for (const claim of authorizedClaims) {
        const linkedTypes = new Set(
          snapshot.claimDocLinks
            .filter((link) => link.claimId === claim.id && visibleDocMap.has(link.documentId))
            .map((link) => visibleDocMap.get(link.documentId)!.documentType),
        );
        for (const reqType of claim.requiredDocumentTypes) {
          if (!linkedTypes.has(reqType)) {
            missingRows.push({ id: `${claim.id}:${reqType}`, label: `${claim.title}: missing ${reqType}` });
          }
        }
      }
      const summary = missingRows.length === 0 ? 'No missing claim documents.' : `${missingRows.length} missing claim document requirement(s): ${missingRows.map((r) => r.label).join(', ')}.`;
      const finalized = finalizeReceiptAndPresentation({
        facet,
        snapshot,
        role,
        projection: 'LIST',
        operationAdapter: adapterId,
        sourceType: 'ClaimDocument',
        predicateIds: ['predicate.claim.missing_required_document'],
        rows: missingRows,
        title: 'Missing claim documents',
        summaryBody: summary,
        variantId: 'variant.claim_missing_docs',
      });
      return {
        facetId: facet.id,
        owner,
        status: 'EXECUTED',
        summary,
        recordIds: missingRows.map((r) => r.id),
        rows: finalized.rows,
        missingSlots: [],
        redactedFieldIds,
        receipt: finalized.receipt,
        entailment: finalized.entailment,
        presentationEquivalence: finalized.equivalence,
      };
    }

    const visibleLinkedDocs = snapshot.claimDocLinks
      .filter((link) => claimIds.has(link.claimId) && visibleDocMap.has(link.documentId))
      .map((link) => visibleDocMap.get(link.documentId)!);
    const rows = visibleLinkedDocs.map((d) => ({ id: d.id, label: d.title, subtitle: d.documentType }));
    const summary = `${visibleLinkedDocs.length} authorized document(s) for claim: ${visibleLinkedDocs.map((d) => d.title).join(', ')}.`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'LIST',
      operationAdapter: adapterId,
      sourceType: 'ClaimDocument',
      predicateIds: ['predicate.claim.has_visible_document'],
      rows,
      title: 'Claim documents',
      summaryBody: summary,
      variantId: 'variant.claim_visible_docs',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      rows: finalized.rows,
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  if (job === 'query.home_event.repair_spend_aggregate') {
    const refYear = datePartsInTimeZone(snapshot.asOfDate, snapshot.timezone).year;
    const targetYear = refYear - 1;
    const events = snapshot.homeEvents.filter((evt) =>
      evt.propertyId === snapshot.propertyId
      && evt.eventCategory === 'REPAIR'
      && Boolean(evt.occurredAt)
      && datePartsInTimeZone(evt.occurredAt, snapshot.timezone).year === targetYear
      && typeof evt.actualCostCents === 'number',
    );
    const totalCents = events.reduce((acc, e) => acc + (e.actualCostCents ?? 0), 0);
    const restricted = !canSeeRole(role, 'EDITOR');
    if (restricted) redactedFieldIds.push('field.home_event.actual_cost');
    const summary = restricted
      ? 'Financial repair spend redacted for VIEWER role.'
      : `Total repair spend in ${targetYear} (${snapshot.timezone}): $${(totalCents / 100).toFixed(2)} across ${events.length} repair event(s).`;
    const rows = events.map((e) => ({ id: e.id, label: e.title }));
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'AGGREGATE',
      operationAdapter: adapterId,
      sourceType: 'HomeEvent',
      predicateIds: ['predicate.home_event.is_repair_cost'],
      rows,
      title: `Repair spend (${targetYear})`,
      summaryBody: summary,
      variantId: 'variant.repair_spend_aggregate',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      rows: finalized.rows,
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
      metrics: { totalRepairSpendCents: restricted ? null : totalCents, targetYear },
    };
  }

  if (job === 'query.property_tax_bill.compare_years') {
    const refYear = datePartsInTimeZone(snapshot.asOfDate, snapshot.timezone).year;
    const activeBills = snapshot.taxBills.filter((b) => b.propertyId === snapshot.propertyId && b.lifecycleStatus === 'ACTIVE');
    const thisYearBill = activeBills.find((b) => b.taxYear === refYear) ?? null;
    const lastYearBill = activeBills.find((b) => b.taxYear === refYear - 1) ?? null;
    const comparedBills = [lastYearBill, thisYearBill].filter((b): b is WaveTaxBillRecord => b !== null);
    const deltaCents = thisYearBill && lastYearBill ? thisYearBill.amountCents - lastYearBill.amountCents : null;
    const summary = deltaCents !== null
      ? `Property tax changed by $${(deltaCents / 100).toFixed(2)} (${refYear - 1}: $${(lastYearBill!.amountCents / 100).toFixed(2)} vs ${refYear}: $${(thisYearBill!.amountCents / 100).toFixed(2)}).`
      : 'Tax bill comparison incomplete: one or more year records missing.';
    const rows = comparedBills.map((b) => ({ id: b.id, label: `Tax bill ${b.taxYear}` }));
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'COMPARE',
      operationAdapter: adapterId,
      sourceType: 'PropertyTaxBillRecord',
      predicateIds: ['predicate.property_tax_bill.for_period'],
      rows,
      title: 'Property tax comparison',
      summaryBody: summary,
      variantId: 'variant.tax_bill_compare',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      rows: finalized.rows,
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
      metrics: { deltaCents },
    };
  }

  if (job === 'query.property_tax_bill.unpaid') {
    const unpaid = snapshot.taxBills.filter((b) => b.propertyId === snapshot.propertyId && b.lifecycleStatus === 'ACTIVE' && b.status === 'UNPAID');
    const rows = unpaid.map((b) => ({ id: b.id, label: `Unpaid tax bill ${b.taxYear}` }));
    const summary = `${unpaid.length} unpaid tax bill(s).`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'LIST',
      operationAdapter: adapterId,
      sourceType: 'PropertyTaxBillRecord',
      predicateIds: ['predicate.property_tax_bill.is_unpaid'],
      rows,
      title: 'Unpaid tax bills',
      summaryBody: summary,
      variantId: 'variant.tax_bills_unpaid',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      rows: finalized.rows,
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  if (job === 'job.finance.own_rent_break_even' || job === 'job.finance.refinance_break_even') {
    const slots = snapshot.financeSlots;
    const missingSlots: string[] = [];
    if (job === 'job.finance.own_rent_break_even') {
      const hasPersistedNet =
        typeof slots?.netHoldCents === 'number'
        && Number.isFinite(slots.netHoldCents)
        && typeof slots?.netRentCents === 'number'
        && Number.isFinite(slots.netRentCents);
      const hasPersistedOutcome =
        hasPersistedNet
        || (typeof slots?.sellHoldRentWinner === 'string' && slots.sellHoldRentWinner.trim().length > 0);

      if (!slots?.horizonYears) missingSlots.push('horizonYears');
      if (!hasPersistedOutcome) {
        if (!slots?.monthlyRentCents) missingSlots.push('monthlyRentCents');
        if (!slots?.homeValueCents) missingSlots.push('homeValueCents');
      }

      const ownRentResult = missingSlots.length === 0 && slots ? computeOwnVsRentBreakEven(slots) : null;
      const status = missingSlots.length > 0 ? 'PARTIAL_MISSING_SLOTS' : 'EXECUTED';
      const formatSignedDollars = (cents: number): string =>
        cents < 0 ? `-$${(Math.abs(cents) / 100).toFixed(2)}` : `$${(cents / 100).toFixed(2)}`;
      const persistedMeta = ownRentResult && (ownRentResult.sellHoldRentWinner || ownRentResult.ownAdvantageAtHorizonCents !== null)
        ? ` (${[
            ownRentResult.sellHoldRentWinner ? `winner: ${ownRentResult.sellHoldRentWinner}` : null,
            ownRentResult.ownAdvantageAtHorizonCents !== null
              ? `net owning advantage ${formatSignedDollars(ownRentResult.ownAdvantageAtHorizonCents)}`
              : null,
          ].filter(Boolean).join('; ')})`
        : '';

      const summary = ownRentResult === null
        ? `Cannot compute own-vs-rent break-even without missing required financial inputs: ${missingSlots.join(', ')}.`
        : ownRentResult.hasPersistedOutcome && !ownRentResult.breaksEvenWithinHorizon
          ? `Owning does not beat renting within your ${ownRentResult.horizonYears}-year horizon per persisted analysis${persistedMeta}.`
          : ownRentResult.hasPersistedOutcome && ownRentResult.crossoverYear === null
            ? `Persisted analysis favors owning over renting within your ${ownRentResult.horizonYears}-year horizon${persistedMeta}; an exact crossover year requires a monthly-rent assumption.`
            : ownRentResult.crossoverYear === null
              ? `Owning does not beat renting within the 30-year analysis window at $${(slots!.monthlyRentCents! / 100).toFixed(2)}/mo rent and $${(slots!.homeValueCents! / 100).toFixed(2)} home value (estimated ${ownRentResult.horizonYears}-year net advantage ${ownRentResult.ownAdvantageAtHorizonCents !== null ? formatSignedDollars(ownRentResult.ownAdvantageAtHorizonCents) : 'unavailable'}).`
              : ownRentResult.breaksEvenWithinHorizon
                ? `Owning beats renting starting in year ${ownRentResult.crossoverYear} (within your ${ownRentResult.horizonYears}-year horizon${ownRentResult.ownAdvantageAtHorizonCents !== null && ownRentResult.cumulativeRentAtHorizonCents !== null ? `; estimated net owning advantage ${formatSignedDollars(ownRentResult.ownAdvantageAtHorizonCents)} vs $${(ownRentResult.cumulativeRentAtHorizonCents / 100).toFixed(2)} cumulative rent` : ''}).`
                : `Owning beats renting in year ${ownRentResult.crossoverYear}, which is beyond your ${ownRentResult.horizonYears}-year horizon.`;

      const rows = status === 'EXECUTED'
        ? [{
            id: snapshot.propertyId,
            label: 'Own-vs-rent break-even analysis',
            ...(ownRentResult?.crossoverYear !== null && ownRentResult?.crossoverYear !== undefined
              ? { subtitle: `Crossover year ${ownRentResult.crossoverYear} (${ownRentResult.horizonYears}-year horizon)` }
              : {}),
          }]
        : [];
      const finalized = finalizeReceiptAndPresentation({
        facet,
        snapshot,
        role,
        projection: 'DETAIL',
        operationAdapter: adapterId,
        sourceType: 'Property',
        predicateIds: ['predicate.property.evaluates_break_even'],
        rows,
        title: 'Own-vs-rent break-even analysis',
        summaryBody: summary,
        variantId: 'variant.finance_break_even',
        unknownCount: missingSlots.length > 0 ? missingSlots.length : 0,
      });
      return {
        facetId: facet.id,
        owner,
        status,
        summary,
        recordIds: rows.map((r) => r.id),
        rows: finalized.rows,
        missingSlots,
        redactedFieldIds,
        receipt: finalized.receipt,
        entailment: finalized.entailment,
        presentationEquivalence: finalized.equivalence,
        metrics: ownRentResult
          ? {
              monthlyRentCents: slots!.monthlyRentCents,
              homeValueCents: slots!.homeValueCents,
              horizonYears: ownRentResult.horizonYears,
              crossoverYear: ownRentResult.crossoverYear,
              breaksEvenWithinHorizon: ownRentResult.breaksEvenWithinHorizon,
              cumulativeRentAtHorizonCents: ownRentResult.cumulativeRentAtHorizonCents,
              netOwningCostAtHorizonCents: ownRentResult.netOwningCostAtHorizonCents,
              ownAdvantageAtHorizonCents: ownRentResult.ownAdvantageAtHorizonCents,
              ...(ownRentResult.sellHoldRentWinner ? { sellHoldRentWinner: ownRentResult.sellHoldRentWinner } : {}),
            }
          : undefined,
      };
    }

    if (!slots?.currentRateBps) missingSlots.push('currentRateBps');
    if (!slots?.candidateRateBps) missingSlots.push('candidateRateBps');
    if (!slots?.closingCostsCents) missingSlots.push('closingCostsCents');
    const resolvedHorizonSlot = facet.requiredSlots.some(
      (slot) => slot.slotId === 'slot.refinance.horizon_years' && slot.state === 'RESOLVED',
    );
    const horizonYears = resolvedHorizonSlot ? 3 : Math.max(1, Math.round(slots?.horizonYears ?? 3));

    const refiResult = missingSlots.length === 0 && slots ? computeRefinanceBreakEven(slots, horizonYears) : null;
    if (refiResult?.missingComputationInput) {
      missingSlots.push(refiResult.missingComputationInput);
    }

    const status = missingSlots.length > 0 ? 'PARTIAL_MISSING_SLOTS' : 'EXECUTED';
    const horizonMonths = horizonYears * 12;
    const summary = missingSlots.length > 0 || !refiResult
      ? `Cannot compute refinance break-even without missing required financial inputs: ${missingSlots.join(', ')}.`
      : refiResult.monthlySavingsCents !== null && refiResult.monthlySavingsCents <= 0
        ? `No — refinancing from ${(slots!.currentRateBps! / 100).toFixed(2)}% to ${(slots!.candidateRateBps! / 100).toFixed(2)}% does not produce positive monthly savings.`
        : refiResult.breaksEvenWithinHorizon
          ? `Yes — refinancing breaks even in ${refiResult.breakEvenMonths} month(s) (within your ${horizonYears}-year / ${horizonMonths}-month horizon), saving $${((refiResult.monthlySavingsCents ?? 0) / 100).toFixed(2)}/mo on $${((slots!.closingCostsCents ?? 0) / 100).toFixed(2)} closing costs.`
          : `No — refinancing breaks even in ${refiResult.breakEvenMonths} month(s), exceeding your ${horizonYears}-year (${horizonMonths}-month) horizon${refiResult.monthlySavingsCents !== null ? ` (saving $${(refiResult.monthlySavingsCents / 100).toFixed(2)}/mo)` : ''}.`;

    const rows = status === 'EXECUTED'
      ? [{
          id: snapshot.propertyId,
          label: 'Refinance break-even analysis',
          ...(refiResult?.breakEvenMonths !== null && refiResult?.breakEvenMonths !== undefined
            ? { subtitle: `${refiResult.breakEvenMonths} mo break-even (${horizonYears}-year horizon)` }
            : {}),
        }]
      : [];
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'DETAIL',
      operationAdapter: adapterId,
      sourceType: 'Property',
      predicateIds: ['predicate.property.evaluates_break_even'],
      rows,
      title: 'Refinance break-even analysis',
      summaryBody: summary,
      variantId: 'variant.finance_break_even',
      unknownCount: missingSlots.length > 0 ? missingSlots.length : 0,
    });
    return {
      facetId: facet.id,
      owner,
      status,
      summary,
      recordIds: rows.map((r) => r.id),
      rows: finalized.rows,
      missingSlots,
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
      metrics: status === 'EXECUTED' && refiResult
        ? {
            currentRateBps: slots!.currentRateBps,
            candidateRateBps: slots!.candidateRateBps,
            closingCostsCents: slots!.closingCostsCents,
            breaksEvenWithinHorizon: refiResult.breaksEvenWithinHorizon,
            breakEvenMonths: refiResult.breakEvenMonths,
            monthlySavingsCents: refiResult.monthlySavingsCents,
            horizonYears,
            horizonMonths,
          }
        : undefined,
    };
  }

  if (job === 'job.risk.recall_review') {
    const visibleItemIds = new Set(visibleItems.map((i) => i.id));
    const matches = snapshot.recalls.filter((r) => r.propertyId === snapshot.propertyId && visibleItemIds.has(r.affectedInventoryItemId));
    const rows = matches.map((m) => ({ id: m.id, label: m.title, subtitle: `Item ${m.affectedInventoryItemId}` }));
    const summary = matches.length === 0 ? 'No recalls affect visible inventory items.' : `${matches.length} active recall(s): ${matches.map((m) => m.title).join(', ')}.`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'DETAIL',
      operationAdapter: adapterId,
      sourceType: 'RecallMatch',
      predicateIds: ['predicate.recall.affects_inventory_item'],
      rows,
      title: 'Active recalls & affected items',
      summaryBody: summary,
      variantId: 'variant.recall_review',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      rows: finalized.rows,
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  if (job === 'job.risk.environment_weekly') {
    const win = weekWindowYmd(snapshot.asOfDate, snapshot.timezone);
    const risks = snapshot.environmentalRisks.filter((r) => {
      if (r.propertyId !== snapshot.propertyId) return false;
      const startYmd = r.windowStartIso ? localYmdInTimeZone(r.windowStartIso, snapshot.timezone) : win.startYmd;
      const endYmd = r.windowEndIso ? localYmdInTimeZone(r.windowEndIso, snapshot.timezone) : win.endYmd;
      return endYmd >= win.startYmd && startYmd <= win.endYmd;
    });
    const rows = risks.map((r) => ({ id: r.id, label: r.hazardType, subtitle: r.severity }));
    const freshness = risks[0]?.lastUpdatedIso ?? `${snapshot.asOfDate.slice(0, 10)}T00:00:00.000Z`;
    const sourceAvailable = risks.length > 0 ? risks.every((r) => r.sourceAvailable) : true;
    const summary = `${risks.length} environmental risk(s) this week (sourceAvailable=${sourceAvailable}, updated=${freshness}).`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'LIST',
      operationAdapter: adapterId,
      sourceType: 'EnvironmentalRisk',
      predicateIds: ['predicate.environmental_risk.active_in_week'],
      rows,
      title: 'Weekly environmental risks',
      summaryBody: summary,
      variantId: 'variant.environment_weekly',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      rows: finalized.rows,
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
      metrics: { sourceAvailable, freshness },
    };
  }

  if (job === 'query.inspection_finding.actionable') {
    const findings = snapshot.inspectionFindings.filter((f) => f.propertyId === snapshot.propertyId && f.status === 'ACTION_REQUIRED');
    const rows = findings.map((f) => ({ id: f.id, label: f.title, subtitle: f.inspectionReportTitle }));
    const summary = `${findings.length} actionable inspection finding(s): ${findings.map((f) => `${f.title} (${f.inspectionReportTitle})`).join(', ')}.`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'LIST',
      operationAdapter: adapterId,
      sourceType: 'InspectionFinding',
      predicateIds: ['predicate.inspection_report.has_actionable_finding'],
      rows,
      title: 'Actionable inspection findings',
      summaryBody: summary,
      variantId: 'variant.inspection_findings',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      rows: finalized.rows,
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  if (job === 'query.buyer_task.before_closing' || job === 'job.buyer.contingency_deadlines') {
    const closingMs = snapshot.closingDateIso ? new Date(snapshot.closingDateIso).getTime() : Number.POSITIVE_INFINITY;
    const tasks = snapshot.buyerTasks.filter((t) =>
      t.propertyId === snapshot.propertyId
      && t.status === 'OPEN'
      && (job === 'job.buyer.contingency_deadlines' ? t.isContingency : new Date(t.dueAt).getTime() <= closingMs),
    );
    const rows = tasks.map((t) => ({ id: t.id, label: t.title, subtitle: `Due ${t.dueAt}` }));
    const summary = `${tasks.length} open buyer task(s): ${tasks.map((t) => t.title).join(', ')}.`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'LIST',
      operationAdapter: adapterId,
      sourceType: 'BuyerTaskEntity',
      predicateIds: ['predicate.buyer_checklist.has_active_task'],
      rows,
      title: 'Buyer closing tasks',
      summaryBody: summary,
      variantId: 'variant.buyer_tasks',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      rows: finalized.rows,
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  if (job === 'job.seller.listing_readiness') {
    const pending = snapshot.sellerReadinessItems.filter((s) => s.propertyId === snapshot.propertyId && s.status === 'PENDING');
    const rows = pending.map((s) => ({ id: s.id, label: s.title }));
    const summary = `${pending.length} seller readiness item(s) still pending before listing: ${pending.map((p) => p.title).join(', ')}.`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'LIST',
      operationAdapter: adapterId,
      sourceType: 'SellerReadinessEntity',
      predicateIds: ['predicate.sale_case.has_readiness_item'],
      rows,
      title: 'Seller readiness',
      summaryBody: summary,
      variantId: 'variant.seller_readiness',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      rows: finalized.rows,
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  if (job === 'query.project.needs_permit') {
    const active = snapshot.projects.filter((p) => p.propertyId === snapshot.propertyId && p.status === 'ACTIVE');
    const needsOrUnknown = active.filter((p) => p.permitStatus === 'NEEDS_PERMIT' || p.permitStatus === 'UNKNOWN');
    const unknownCount = needsOrUnknown.filter((p) => p.permitStatus === 'UNKNOWN').length;
    const confirmedNeedsCount = needsOrUnknown.filter((p) => p.permitStatus === 'NEEDS_PERMIT').length;
    const rows = needsOrUnknown.map((p) => ({ id: p.id, label: p.title, subtitle: p.permitStatus }));
    const summary = `${confirmedNeedsCount} project(s) confirmed needing permit, ${unknownCount} permit requirement(s) unknown (confirmed not-required excluded).`;
    const receipt = buildSemanticReadReceipt({
      facetId: facet.id,
      requestClass: 'DATA_QUERY',
      entityId: 'entity.project',
      operationAdapter: adapterId,
      projection: 'LIST',
      predicateIds: ['predicate.project.needs_permit_or_unresolved'],
      resolvedRecordIds: rows.map((r) => r.id),
      confirmedCount: rows.length,
      conflictedCount: 0,
      unknownCount,
      displayedCount: rows.length,
      propertyId: snapshot.propertyId,
      role,
      sourceType: 'HomeRenovationCase',
      observedAt: `${snapshot.asOfDate.slice(0, 10)}T00:00:00.000Z`,
      answerVariantId: 'variant.project_permit_status',
    });
    const blocks = buildPhase2aRichPresentation({
      receipt,
      title: 'Project permit requirements',
      summaryBody: summary,
      rows: rows.map((r) => ({ id: r.id, label: r.label, subtitle: r.subtitle })),
    });
    const entailment = verifySemanticReadReceiptEntailment({
      status: 'ANSWERED',
      blocks,
      suggestions: [],
      confirmation: null,
      clarification: null,
      parameters: { semanticExecutionReceipt: receipt },
    });
    const equivalence = verifyRichPresentationPopulationEquivalence(receipt, blocks);
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      rows,
      missingSlots: [],
      redactedFieldIds,
      receipt,
      entailment,
      presentationEquivalence: equivalence,
      metrics: { confirmedNeedsCount, unknownCount },
    };
  }

  if (job === 'job.projects.quote_comparison') {
    const requestedScope = extractQuoteWhereScope(facet.where);
    const boundQuoteIds = extractQuoteWhereBoundIds(facet.where);
    const propertyQuotes = snapshot.contractorQuotes.filter((q) => q.propertyId === snapshot.propertyId);
    const matchingQuotes = requestedScope
      ? propertyQuotes.filter((q) => quoteMatchesRequestedScope(q, requestedScope))
      : propertyQuotes;
    const pool = requestedScope ? matchingQuotes : propertyQuotes;
    const resolvedBoundQuotes = boundQuoteIds.length > 0
      ? boundQuoteIds
          .map((id) => pool.find((q) => q.id === id))
          .filter((q): q is WaveContractorQuoteRecord => Boolean(q))
      : [];
    const exactPairResolved = boundQuoteIds.length > 0
      ? resolvedBoundQuotes.length === 2
      : matchingQuotes.length === 2;
    const isAmbiguousMultiQuote = boundQuoteIds.length === 0 && matchingQuotes.length > 2;
    const chosen = exactPairResolved
      ? (boundQuoteIds.length > 0 ? resolvedBoundQuotes : matchingQuotes)
      : isAmbiguousMultiQuote
        ? []
        : matchingQuotes;
    const rows = chosen.map((q) => ({ id: q.id, label: q.vendorName, subtitle: `$${(q.amountCents / 100).toFixed(2)} · ${q.timelineDays} days` }));
    const summary = exactPairResolved
      ? `Compared ${chosen[0].vendorName} ($${(chosen[0].amountCents / 100).toFixed(2)}) vs ${chosen[1].vendorName} ($${(chosen[1].amountCents / 100).toFixed(2)}).`
      : isAmbiguousMultiQuote
        ? `Found ${matchingQuotes.length}${requestedScope ? ` ${requestedScope}` : ''} contractor quotes (${matchingQuotes.map((q) => `${q.vendorName} ($${(q.amountCents / 100).toFixed(2)})`).join(', ')}); please specify which two quotes to compare.`
        : requestedScope
          ? `Need at least two ${requestedScope} contractor quotes to compare (found ${matchingQuotes.length}).`
          : `Need two contractor quotes to compare (found ${matchingQuotes.length}).`;
    const delta = exactPairResolved ? chosen[0].amountCents - chosen[1].amountCents : null;
    const unknownCount = exactPairResolved
      ? 0
      : isAmbiguousMultiQuote
        ? matchingQuotes.length
        : Math.max(1, 2 - matchingQuotes.length);
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'COMPARE',
      operationAdapter: adapterId,
      sourceType: 'ContractorQuote',
      predicateIds: ['predicate.contractor_quote.compared_in_scope'],
      rows,
      title: 'Contractor quote comparison',
      summaryBody: summary,
      variantId: 'variant.quote_comparison',
      unknownCount,
    });
    return {
      facetId: facet.id,
      owner,
      status: exactPairResolved ? 'EXECUTED' : 'PARTIAL_MISSING_SLOTS',
      summary,
      recordIds: rows.map((r) => r.id),
      rows: finalized.rows,
      missingSlots: exactPairResolved ? [] : ['slot.quotes.two_resolved_quotes'],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
      metrics: {
        deltaCents: delta,
        candidateCount: matchingQuotes.length,
        ...(boundQuoteIds.length > 0 ? { boundQuoteIds: boundQuoteIds.join(',') } : {}),
        ...(isAmbiguousMultiQuote ? { ambiguousQuoteSelection: true } : {}),
        ...(requestedScope ? { requestedScope } : {}),
      },
    };
  }

  if (job === 'job.saved_results.lookup') {
    const savedState = snapshot.savedResultsState;
    const isUnavailable = savedState?.status === 'UNAVAILABLE';
    const visibleSaved = snapshot.savedResults.filter((s) => s.propertyId === snapshot.propertyId && canSeeRole(role, s.minimumRole));
    const rows = visibleSaved.map((s) => ({ id: s.id, label: s.title, subtitle: s.savedType }));
    const summary = isUnavailable
      ? visibleSaved.length > 0
        ? `${visibleSaved.length} saved result(s) loaded, but Saved retrieval was incomplete: ${savedState?.reason ?? 'one or more Saved readers failed.'}`
        : `Saved results could not be loaded: ${savedState?.reason ?? 'Saved retrieval is temporarily unavailable.'}`
      : `${visibleSaved.length} saved result(s) visible to ${role}: ${visibleSaved.map((s) => s.title).join(', ')}.`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'LIST',
      operationAdapter: adapterId,
      sourceType: 'SavedResult',
      predicateIds: ['predicate.saved_result.visible_to_role'],
      rows,
      title: 'Saved items',
      summaryBody: summary,
      variantId: 'variant.saved_results',
      unknownCount: isUnavailable ? 1 : 0,
    });
    return {
      facetId: facet.id,
      owner,
      status: isUnavailable ? 'PARTIAL_MISSING_SLOTS' : 'EXECUTED',
      summary,
      recordIds: rows.map((r) => r.id),
      rows: finalized.rows,
      missingSlots: isUnavailable
        ? [savedState?.partial ? 'saved_results_partial' : 'saved_results_unavailable']
        : [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
    };
  }

  return {
    facetId: facet.id,
    owner,
    status: 'UNRESOLVED',
    summary: `No registered Wave 1-5 handler for ${job}.`,
    recordIds: [],
    missingSlots: [],
    redactedFieldIds,
    receipt: null,
    entailment: null,
    presentationEquivalence: null,
  };
}

function extractQuoteWhereScope(where: SemanticWhereExpression | null): string | null {
  if (!where) return null;
  if (where.kind === 'PREDICATE' && where.predicateId === 'predicate.contractor_quote.compared_in_scope') {
    return where.targetRecordId ?? null;
  }
  if (where.kind === 'AND' || where.kind === 'OR') {
    for (const operand of where.operands) {
      const found = extractQuoteWhereScope(operand);
      if (found) return found;
    }
  }
  return null;
}

function extractQuoteWhereBoundIds(where: SemanticWhereExpression | null): string[] {
  if (!where) return [];
  if (
    where.kind === 'PREDICATE'
    && where.predicateId === 'predicate.contractor_quote.compared_in_scope'
    && Array.isArray(where.targetCategorySet)
  ) {
    return where.targetCategorySet.filter((id): id is string => typeof id === 'string' && id.length > 0);
  }
  if (where.kind === 'AND' || where.kind === 'OR') {
    for (const operand of where.operands) {
      const found = extractQuoteWhereBoundIds(operand);
      if (found.length > 0) return found;
    }
  }
  return [];
}

function toDynamicQuoteCandidates(snapshot?: CrossDomainPropertySnapshot): DynamicQuoteCandidate[] {
  if (!snapshot) return [];
  return snapshot.contractorQuotes
    .filter((q) => q.propertyId === snapshot.propertyId)
    .map((q) => ({
      id: q.id,
      vendorName: q.vendorName,
      roomTag: q.roomTag,
      amountCents: q.amountCents,
    }));
}

/**
 * Unified Cross-Domain Wave 1-5 Executor (§18 Phases 2B-5, §19 #10-#13, #24-#30, #37).
 */
export async function executeCrossDomainWaves(input: {
  readonly rawText: string;
  readonly snapshot: CrossDomainPropertySnapshot;
  readonly role: AskUserRole;
  readonly propertyAuthorized: boolean;
  readonly enabledDomains?: ReadonlySet<SemanticDomainId>;
  readonly allowLegacyFallback?: boolean;
  readonly planOverride?: SemanticRequestPlan;
}): Promise<CrossDomainExecutionResult> {
  if (!input.propertyAuthorized) {
    return {
      status: 'FORBIDDEN',
      rawText: input.rawText,
      answer: 'Access denied for this property.',
      clarification: null,
      facetResults: [],
      overflowFacets: [],
      executionCountByFacetId: {},
      redactedFieldIds: [],
    };
  }

  const parsed = input.planOverride
    ? {
        plan: input.planOverride,
        clarification: null,
        overflowFacets: [],
        requiresUnambiguousCoordination: false,
      }
    : parseCrossDomainSemanticRequest(input.rawText, {
        dynamicQuotes: toDynamicQuoteCandidates(input.snapshot),
      });
  if (parsed.clarification) {
    return {
      status: 'CLARIFY',
      rawText: input.rawText,
      answer: parsed.clarification.question,
      clarification: parsed.clarification,
      facetResults: [],
      overflowFacets: [],
      executionCountByFacetId: {},
      redactedFieldIds: [],
    };
  }

  if (parsed.plan.outcome === 'BOUNDARY') {
    return {
      status: 'BOUNDARY',
      rawText: input.rawText,
      answer: 'Safety boundary triggered: seek immediate emergency help or professional assistance.',
      clarification: null,
      facetResults: [],
      overflowFacets: [],
      executionCountByFacetId: {},
      redactedFieldIds: [],
    };
  }

  if (parsed.plan.outcome !== 'MATCH') {
    return {
      status: 'NONE_FITS',
      rawText: input.rawText,
      answer: 'I could not resolve all terms into a verified semantic request plan.',
      clarification: null,
      facetResults: [],
      overflowFacets: [],
      executionCountByFacetId: {},
      redactedFieldIds: [],
    };
  }

  const ownerships = assignMixedStackFacetOwnership(parsed.plan.facets, {
    enabledDomains: input.enabledDomains,
    allowLegacyFallback: input.allowLegacyFallback,
  });
  const ownershipByFacetId = new Map(ownerships.map((o) => [o.facetId, o]));

  const resultsById = new Map<string, WaveFacetExecutionResult>();
  const orderedResults: WaveFacetExecutionResult[] = [];
  const executionCountByFacetId: Record<string, number> = {};

  for (const facet of parsed.plan.facets) {
    executionCountByFacetId[facet.id] = (executionCountByFacetId[facet.id] ?? 0) + 1;
    const owner = ownershipByFacetId.get(facet.id)!;
    let facetResult: WaveFacetExecutionResult;

    if (owner.owner === 'NEW_STACK') {
      facetResult = executeNewStackFacet(facet, owner, input.snapshot, input.role, resultsById);
    } else if (owner.owner === 'LEGACY_STACK') {
      const legacyExecuted = executeNewStackFacet(facet, owner, input.snapshot, input.role, resultsById);
      facetResult = {
        ...legacyExecuted,
        summary: `[${owner.adapterId}] ${legacyExecuted.summary}`,
      };
    } else {
      facetResult = {
        facetId: facet.id,
        owner,
        status: 'UNRESOLVED',
        summary: `Domain ${owner.domainId} is not yet enabled; remainder preserved without fabrication.`,
        recordIds: [],
        missingSlots: [],
        redactedFieldIds: [],
        receipt: null,
        entailment: null,
        presentationEquivalence: null,
      };
    }

    const enrichedFacetResult: WaveFacetExecutionResult = {
      ...facetResult,
      jobMatch: facet.evidence.jobMatch ?? null,
    };
    resultsById.set(facet.id, enrichedFacetResult);
    orderedResults.push(enrichedFacetResult);
  }

  const allRedacted = Array.from(new Set(orderedResults.flatMap((r) => r.redactedFieldIds)));
  const ambiguousQuoteFacet = orderedResults.find((r) => r.metrics?.ambiguousQuoteSelection === true);
  if (ambiguousQuoteFacet) {
    const requestedScope = typeof ambiguousQuoteFacet.metrics?.requestedScope === 'string'
      ? ambiguousQuoteFacet.metrics.requestedScope
      : null;
    const propertyQuotes = input.snapshot.contractorQuotes.filter((q) => q.propertyId === input.snapshot.propertyId);
    const candidateQuotes = requestedScope
      ? propertyQuotes.filter((q) => quoteMatchesRequestedScope(q, requestedScope))
      : propertyQuotes;
    const clarification: CrossDomainClarification = {
      reasonCode: 'AMBIGUOUS_QUOTE_SELECTION',
      question: requestedScope
        ? `Multiple ${requestedScope} contractor quotes matched (${candidateQuotes.length} found). Which two quotes would you like to compare?`
        : `Multiple contractor quotes matched (${candidateQuotes.length} found). Which two quotes would you like to compare?`,
      options: candidateQuotes.map((q) => q.vendorName),
      candidateRecords: candidateQuotes.map((q) => ({
        id: q.id,
        label: q.vendorName,
        subtitle: `$${(q.amountCents / 100).toFixed(2)}${q.roomTag ? ` · ${q.roomTag}` : ''}`,
      })),
    };
    return {
      status: 'CLARIFY',
      rawText: input.rawText,
      answer: clarification.question,
      clarification,
      facetResults: orderedResults,
      overflowFacets: parsed.overflowFacets,
      executionCountByFacetId,
      redactedFieldIds: allRedacted,
    };
  }

  const hasPartial = orderedResults.some((r) => r.status !== 'EXECUTED') || parsed.overflowFacets.length > 0;
  const overflowNote = parsed.overflowFacets.length > 0
    ? ` Overflow (${parsed.overflowFacets.map((o) => `${o.id}:${o.reasonCode}`).join(', ')}).`
    : '';

  return {
    status: hasPartial ? 'PARTIAL' : 'ANSWERED',
    rawText: input.rawText,
    answer: `${orderedResults.map((r) => r.summary).join(' ')}${overflowNote}`.trim(),
    clarification: null,
    facetResults: orderedResults,
    overflowFacets: parsed.overflowFacets,
    executionCountByFacetId,
    redactedFieldIds: allRedacted,
  };
}

export async function replaySavedCrossDomainResult(input: {
  readonly savedResult: WaveSavedResultRecord;
  readonly currentSnapshot: CrossDomainPropertySnapshot;
  readonly currentRole: AskUserRole;
  readonly propertyAuthorized: boolean;
  readonly rawPromptFallback: string;
}): Promise<CrossDomainExecutionResult> {
  if (!input.propertyAuthorized || !canSeeRole(input.currentRole, input.savedResult.minimumRole)) {
    return {
      status: 'FORBIDDEN',
      rawText: input.rawPromptFallback,
      answer: 'Saved result replay blocked by current authorization or role visibility.',
      clarification: null,
      facetResults: [],
      overflowFacets: [],
      executionCountByFacetId: {},
      redactedFieldIds: [],
    };
  }
  return executeCrossDomainWaves({
    rawText: input.rawPromptFallback,
    snapshot: input.currentSnapshot,
    role: input.currentRole,
    propertyAuthorized: true,
  });
}

export function executeCrossDomainFollowUp(input: {
  readonly priorPrompt: string;
  readonly followUpText: string;
  readonly snapshot?: CrossDomainPropertySnapshot;
}): ReturnType<typeof applyCrossDomainFollowUpRefinement> {
  const dynamicQuotes = toDynamicQuoteCandidates(input.snapshot);
  const prior = parseCrossDomainSemanticRequest(input.priorPrompt, { dynamicQuotes });
  const dynamicEntities = (input.snapshot?.rooms ?? []).map((room) => ({
    kind: 'ROOM' as const,
    entityId: 'entity.room',
    recordId: room.id,
    names: [room.name],
    authorized: true,
  }));
  return applyCrossDomainFollowUpRefinement(prior.plan, input.followUpText, dynamicEntities, dynamicQuotes);
}

function normalizeWaveRole(role: string): AskUserRole {
  const upper = role.toUpperCase();
  if (upper === 'OWNER' || upper === 'ADMIN') return 'OWNER';
  if (upper === 'EDITOR' || upper === 'MEMBER') return 'EDITOR';
  return 'VIEWER';
}

function toCents(decimalOrNumber: unknown): number {
  if (decimalOrNumber === null || decimalOrNumber === undefined) return 0;
  const num = Number(decimalOrNumber);
  return Number.isFinite(num) ? Math.round(num * 100) : 0;
}

function mapClaimStatus(status: string): WaveClaimRecord['status'] {
  const upper = status.toUpperCase();
  if (upper === 'CLOSED' || upper === 'SETTLED' || upper === 'DENIED') return 'CLOSED';
  if (upper === 'UNDER_REVIEW' || upper === 'SUBMITTED' || upper === 'IN_REVIEW') return 'UNDER_REVIEW';
  return 'OPEN';
}

function mapTaxStatus(status: string): WaveTaxBillRecord['status'] {
  const upper = status.toUpperCase();
  if (upper === 'PAID') return 'PAID';
  if (upper === 'OVERDUE' || upper === 'DELINQUENT') return 'OVERDUE';
  return 'UNPAID';
}

function mapInspectionStatus(status: string): WaveInspectionFindingRecord['status'] {
  const upper = status.toUpperCase();
  if (upper === 'RESOLVED' || upper === 'WAIVED') return 'RESOLVED';
  if (upper === 'MONITORING' || upper === 'DEFERRED') return 'MONITORING';
  return 'ACTION_REQUIRED';
}

function mapProjectStatus(status: string): WaveProjectRecord['status'] {
  const upper = status.toUpperCase();
  if (upper === 'COMPLETED') return 'COMPLETED';
  if (upper === 'CANCELLED' || upper === 'ARCHIVED') return 'CANCELLED';
  return 'ACTIVE';
}

function mapPermitStatus(applicability: string): WaveProjectRecord['permitStatus'] {
  const upper = applicability.toUpperCase();
  if (upper === 'CONFIRMED_NOT_REQUIRED' || upper === 'NOT_REQUIRED') return 'CONFIRMED_NOT_REQUIRED';
  if (upper === 'REQUIRED' || upper === 'NEEDS_PERMIT') return 'NEEDS_PERMIT';
  if (upper === 'APPROVED' || upper === 'OBTAINED') return 'APPROVED';
  return 'UNKNOWN';
}

function extractFinanceNumber(obj: unknown, keys: readonly string[]): number | null {
  if (!obj || typeof obj !== 'object') return null;
  const record = obj as Record<string, unknown>;
  for (const key of keys) {
    const raw = record[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string' && raw.trim() && Number.isFinite(Number(raw))) return Number(raw);
  }
  return null;
}

export interface CrossDomainSnapshotLoadScope {
  readonly domains: ReadonlySet<SemanticDomainId>;
  readonly jobs: ReadonlySet<string>;
}

export function deriveSnapshotLoadScope(facets: readonly SemanticFacet[]): CrossDomainSnapshotLoadScope {
  const domains = new Set<SemanticDomainId>();
  const jobs = new Set<string>();
  for (const facet of facets) {
    if (facet.evidence.jobMatch) jobs.add(facet.evidence.jobMatch);
    for (const candidate of facet.domainCandidates) {
      const canonical = tryNormalizeToCanonicalSection5Domain(candidate.id);
      if (canonical) {
        domains.add(canonical);
      }
    }
  }
  return { domains, jobs };
}

function buildMinimalCrossDomainSnapshot(propertyId: string, timeZoneOverride?: string): CrossDomainPropertySnapshot {
  const tz = safeTimezone(timeZoneOverride);
  return {
    propertyId,
    asOfDate: localYmdInTimeZone(new Date(), tz),
    timezone: tz,
    closingDateIso: null,
    rooms: [],
    items: [],
    maintenanceTasks: [],
    extendedItems: [],
    warranties: [],
    maintenanceTaskMeta: [],
    insurancePolicies: [],
    claims: [],
    documents: [],
    claimDocLinks: [],
    homeEvents: [],
    taxBills: [],
    financeSlots: null,
    recalls: [],
    environmentalRisks: [],
    inspectionFindings: [],
    buyerTasks: [],
    sellerReadinessItems: [],
    projects: [],
    contractorQuotes: [],
    savedResults: [],
  };
}

/**
 * Loads a unified cross-domain snapshot for a property from Prisma models + Phase 2A inventory/maintenance snapshot.
 * When `scope` is supplied, retrieval is bounded strictly to the models needed by the admitted facets.
 */
export async function loadCrossDomainPropertySnapshot(
  propertyId: string,
  userId?: string,
  timeZoneOverride?: string,
  scope?: CrossDomainSnapshotLoadScope,
): Promise<CrossDomainPropertySnapshot> {
  const loadAll = !scope;
  const hasDomain = (domainId: SemanticDomainId): boolean => loadAll || scope!.domains.has(domainId);
  const hasJob = (...candidates: readonly string[]): boolean => loadAll || candidates.some((j) => scope!.jobs.has(j));

  const needPhase2a = (
    hasDomain('domain.inventory')
    || hasDomain('domain.maintenance')
    || hasDomain('domain.warranties_coverage')
    || hasJob(
      'query.maintenance_task.filter',
      'query.inventory_item.relation_boolean',
      'query.inventory_item.warranty_relation',
      'job.inventory.replacement_guidance',
      'query.inventory_item.field_read',
      'query.warranty.filter',
      'job.risk.recall_review',
    )
  );
  const needWarranties = hasDomain('domain.warranties_coverage') || hasJob('query.warranty.filter');
  const needDocuments = (
    hasDomain('domain.inventory')
    || hasDomain('domain.documents_records')
    || hasJob('query.claim.documents', 'query.inventory_item.relation_boolean', 'job.inventory.replacement_guidance')
  );
  const needPolicies = hasDomain('domain.insurance_policies') || hasJob('query.insurance_policy.field_read');
  const needClaims = hasDomain('domain.claims') || hasDomain('domain.documents_records') || hasJob('query.claim.filter', 'query.claim.documents');
  const needHomeEvents = hasDomain('domain.timeline_home_events') || hasJob('query.home_event.repair_spend_aggregate');
  const needTaxBills = hasDomain('domain.property_profile') || hasJob('query.property_tax_bill.compare_years', 'query.property_tax_bill.unpaid');
  const needRecalls = hasDomain('domain.risks_recalls_inspections') || hasJob('job.risk.recall_review');
  const needInspections = hasDomain('domain.risks_recalls_inspections') || hasJob('query.inspection_finding.actionable');
  const needRiskMatches = hasDomain('domain.risks_recalls_inspections') || hasJob('job.risk.environment_weekly');
  const needBuyerSeller = (
    hasDomain('domain.buyer_journey')
    || hasDomain('domain.seller_preparation')
    || hasJob('query.buyer_task.before_closing', 'job.buyer.contingency_deadlines', 'job.seller.listing_readiness')
  );
  const needProjects = hasDomain('domain.projects_quotes_vendors') || hasJob('query.project.needs_permit');
  const needQuotes = hasDomain('domain.projects_quotes_vendors') || hasJob('job.projects.quote_comparison');
  const needFinance = hasDomain('domain.ownership_costs_finance') || hasJob('job.finance.own_rent_break_even', 'job.finance.refinance_break_even');
  const needSaved = loadAll
    ? Boolean(userId)
    : hasDomain('domain.account_household_preferences') || hasJob('job.saved_results.lookup');

  const phase2aPromise: Promise<Phase2aPropertySnapshot> = needPhase2a
    ? loadPhase2aPropertySnapshot(propertyId)
    : Promise.resolve({
        propertyId,
        asOfDate: new Date().toISOString().slice(0, 10),
        rooms: [],
        items: [],
        maintenanceTasks: [],
      });
  const prismaAny = prisma as unknown as Record<string, { findUnique?: Function; findFirst?: Function; findMany?: Function } | undefined>;

  const [
    phase2aSnapshot,
    propertyRow,
    warrantyRows,
    documentRows,
    policyRows,
    claimRows,
    homeEventRows,
    taxBillRows,
    recallRows,
    inspectionRows,
    buyerChecklistRow,
    saleCaseRow,
    projectRows,
    quoteRows,
    riskMatchRows,
    sellHoldRentRow,
    toolOverrideRows,
    refinanceScenarioRow,
    refinanceOppRow,
  ] = await Promise.all([
    phase2aPromise,
    typeof prismaAny.property?.findUnique === 'function'
      ? prisma.property.findUnique({
          where: { id: propertyId },
          select: { id: true, state: true, timezone: true, lastAppraisedValue: true },
        })
      : Promise.resolve(null),
    needWarranties && typeof prismaAny.warranty?.findMany === 'function'
      ? prisma.warranty.findMany({
          where: { propertyId },
          select: { id: true, propertyId: true, providerName: true, category: true, expiryDate: true },
        })
      : Promise.resolve([]),
    needDocuments && typeof prismaAny.document?.findMany === 'function'
      ? prisma.document.findMany({
          where: { propertyId, deletedAt: null },
          select: { id: true, propertyId: true, inventoryItemId: true, name: true, description: true, type: true, metadata: true, deletedAt: true },
        })
      : Promise.resolve([]),
    needPolicies && typeof prismaAny.insurancePolicy?.findMany === 'function'
      ? prisma.insurancePolicy.findMany({
          where: { propertyId },
          select: {
            id: true,
            propertyId: true,
            carrierName: true,
            policyNumber: true,
            deductibleCents: true,
            deductibleAmount: true,
            premiumAmount: true,
            expiryDate: true,
          },
        })
      : Promise.resolve([]),
    needClaims && typeof prismaAny.claim?.findMany === 'function'
      ? prisma.claim.findMany({
          where: { propertyId },
          select: {
            id: true,
            propertyId: true,
            title: true,
            status: true,
            documents: {
              select: { id: true, claimId: true, documentId: true, type: true },
            },
            checklistItems: {
              select: { requiredDocTypes: true, required: true },
            },
          },
        })
      : Promise.resolve([]),
    needHomeEvents && typeof prismaAny.homeEvent?.findMany === 'function'
      ? prisma.homeEvent.findMany({
          where: { propertyId, deletedAt: null },
          select: { id: true, propertyId: true, title: true, type: true, occurredAt: true, amount: true },
        })
      : Promise.resolve([]),
    needTaxBills && typeof prismaAny.propertyTaxBillRecord?.findMany === 'function'
      ? prisma.propertyTaxBillRecord.findMany({
          where: { propertyId },
          select: { id: true, propertyId: true, taxYear: true, billAmount: true, status: true, supersededById: true },
        })
      : Promise.resolve([]),
    needRecalls && typeof prismaAny.recallMatch?.findMany === 'function'
      ? prisma.recallMatch.findMany({
          where: { propertyId },
          select: {
            id: true,
            propertyId: true,
            inventoryItemId: true,
            status: true,
            recall: { select: { title: true, severity: true } },
          },
        })
      : Promise.resolve([]),
    needInspections && typeof prismaAny.inspectionFinding?.findMany === 'function'
      ? prisma.inspectionFinding.findMany({
          where: { propertyId },
          select: {
            id: true,
            propertyId: true,
            reportId: true,
            inspectorDescription: true,
            status: true,
            report: { select: { reportType: true, inspectionDate: true } },
          },
        })
      : Promise.resolve([]),
    needBuyerSeller && typeof prismaAny.homeBuyerChecklist?.findUnique === 'function'
      ? prisma.homeBuyerChecklist.findUnique({
          where: { propertyId },
          select: {
            targetCloseDate: true,
            tasks: {
              select: { id: true, title: true, taskType: true, status: true, dueAt: true },
            },
          },
        })
      : Promise.resolve(null),
    needBuyerSeller && typeof prismaAny.propertySaleCase?.findUnique === 'function'
      ? prisma.propertySaleCase.findUnique({
          where: { propertyId },
          select: {
            targetCloseDate: true,
            readinessItems: {
              select: { id: true, title: true, status: true },
            },
          },
        })
      : Promise.resolve(null),
    needProjects && typeof prismaAny.projectRecord?.findMany === 'function'
      ? prisma.projectRecord.findMany({
          where: { propertyId },
          select: { id: true, propertyId: true, name: true, status: true, permitApplicability: true },
        })
      : Promise.resolve([]),
    needQuotes && typeof prismaAny.quoteComparisonQuote?.findMany === 'function'
      ? prisma.quoteComparisonQuote.findMany({
          where: { workspace: { propertyId } },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          select: {
            id: true,
            vendorName: true,
            quoteAmount: true,
            serviceLocation: true,
            serviceCategory: true,
            serviceLabelRaw: true,
            scopeSummary: true,
            workspace: { select: { propertyId: true, scopeSummary: true, serviceCategory: true } },
          },
        })
      : Promise.resolve([]),
    needRiskMatches && typeof prismaAny.homeRiskReplayEventMatch?.findMany === 'function'
      ? prisma.homeRiskReplayEventMatch.findMany({
          where: { propertyId },
          select: {
            id: true,
            propertyId: true,
            impactLevel: true,
            homeRiskEvent: { select: { eventType: true, severity: true, startAt: true, endAt: true, updatedAt: true } },
          },
        })
      : Promise.resolve([]),
    needFinance && typeof prismaAny.sellHoldRentAnalysis?.findFirst === 'function'
      ? prisma.sellHoldRentAnalysis.findFirst({
          where: { propertyId },
          orderBy: { computedAt: 'desc' },
          select: { years: true, winner: true, homeValueNowCents: true, netHoldCents: true, netRentCents: true, drivers: true },
        })
      : Promise.resolve(null),
    needFinance && typeof prismaAny.toolOverride?.findMany === 'function'
      ? prisma.toolOverride.findMany({
          where: { propertyId, toolKey: 'SELL_HOLD_RENT' },
          select: { key: true, value: true },
        })
      : Promise.resolve([]),
    needFinance && typeof prismaAny.refinanceScenarioSnapshot?.findFirst === 'function'
      ? prisma.refinanceScenarioSnapshot.findFirst({
          where: { propertyId },
          orderBy: [{ isSaved: 'desc' }, { createdAt: 'desc' }],
          select: { targetRate: true, targetTerm: true, closingCost: true, monthlySavings: true, breakEvenMonths: true, metadataJson: true },
        })
      : Promise.resolve(null),
    needFinance && typeof prismaAny.refinanceOpportunity?.findFirst === 'function'
      ? prisma.refinanceOpportunity.findFirst({
          where: { propertyId },
          orderBy: { evaluationDate: 'desc' },
          select: {
            currentRate: true,
            marketRate: true,
            loanBalance: true,
            monthlySavings: true,
            breakEvenMonths: true,
            closingCostAssumption: true,
            remainingTermMonths: true,
            metadataJson: true,
          },
        })
      : Promise.resolve(null),
  ]);

  const activeDocumentRows = (documentRows as Array<any>).filter((doc) => doc.deletedAt === null || doc.deletedAt === undefined);
  const manualDocByItem = new Map<string, string>();
  const receiptDocByItem = new Map<string, string>();
  const propertyDocuments: WaveDocumentRecord[] = activeDocumentRows.map((doc) => {
    const typeUpper = String(doc.type ?? 'OTHER').toUpperCase();
    const meta = doc.metadata && typeof doc.metadata === 'object' ? (doc.metadata as Record<string, unknown>) : null;
    const metaKind = String(meta?.documentKind ?? meta?.kind ?? meta?.category ?? meta?.role ?? '').toUpperCase();
    const textHint = `${String(doc.name ?? '')} ${String(doc.description ?? '')} ${metaKind}`.trim();
    const isReceipt = typeUpper === 'INVOICE' || metaKind === 'RECEIPT' || /\breceipt\b|\binvoice\b|\bpurchase\b/i.test(textHint);
    const isManual = metaKind === 'MANUAL' || /\bmanual\b|\bhandbook\b|\bowner'?s?\s+guide\b|\buser\s+guide\b|\binstruction/i.test(textHint);

    if (typeof doc.inventoryItemId === 'string' && doc.inventoryItemId) {
      if (isReceipt && !receiptDocByItem.has(doc.inventoryItemId)) {
        receiptDocByItem.set(doc.inventoryItemId, doc.id);
      }
      if (isManual && !manualDocByItem.has(doc.inventoryItemId)) {
        manualDocByItem.set(doc.inventoryItemId, doc.id);
      }
    }

    return {
      id: doc.id,
      propertyId: doc.propertyId ?? propertyId,
      title: String(doc.name ?? 'Document'),
      documentType: isReceipt ? 'RECEIPT' : isManual ? 'MANUAL' : typeUpper,
      lifecycleStatus: 'ACTIVE',
      visibleToRoles: ['OWNER', 'EDITOR', 'VIEWER'],
    };
  });

  const extendedItems: WaveExtendedItemRecord[] = phase2aSnapshot.items.map((item) => {
    const cond = (item.condition ?? '').toUpperCase();
    return {
      id: item.id,
      propertyId: item.propertyId,
      name: item.name,
      category: (['APPLIANCE', 'HVAC', 'PLUMBING', 'ELECTRICAL'].includes(item.category.toUpperCase())
        ? item.category.toUpperCase()
        : 'OTHER') as WaveExtendedItemRecord['category'],
      purchaseCostCents: item.purchaseCostCents ?? null,
      replacementCostCents: item.replacementCostCents ?? null,
      installedOn: item.installedOn ?? null,
      condition: cond.includes('POOR')
        ? 'POOR'
        : cond.includes('FAIR')
          ? 'FAIR'
          : 'GOOD',
      manualDocumentId: manualDocByItem.get(item.id) ?? null,
      receiptDocumentId: receiptDocByItem.get(item.id) ?? null,
      roomId: item.roomId ?? null,
      isHidden: false,
    };
  });

  const claimDocLinks: WaveClaimDocLink[] = [];
  const claims: WaveClaimRecord[] = (claimRows as Array<any>).map((claim) => {
    const docs = Array.isArray(claim.documents) ? claim.documents : [];
    for (const d of docs) {
      claimDocLinks.push({ id: d.id, claimId: claim.id, documentId: d.documentId });
    }
    const checklistItems = Array.isArray(claim.checklistItems) ? claim.checklistItems : [];
    const reqTypes = Array.from(
      new Set<string>(
        checklistItems.flatMap((ci: any) =>
          Array.isArray(ci.requiredDocTypes) ? ci.requiredDocTypes.map((t: unknown) => String(t)) : [],
        ),
      ),
    );
    return {
      id: claim.id,
      propertyId: claim.propertyId,
      title: claim.title,
      slug: claim.title.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      status: mapClaimStatus(String(claim.status)),
      requiredDocumentTypes: reqTypes,
    };
  });

  const closingDateIso = buyerChecklistRow?.targetCloseDate
    ? new Date(buyerChecklistRow.targetCloseDate).toISOString().slice(0, 10)
    : saleCaseRow?.targetCloseDate
      ? new Date(saleCaseRow.targetCloseDate).toISOString().slice(0, 10)
      : null;

  const propertyTimezone = safeTimezone(timeZoneOverride ?? propertyRow?.timezone);

  const shrDrivers = sellHoldRentRow?.drivers;
  const scenMeta = refinanceScenarioRow?.metadataJson;
  const oppMeta = refinanceOppRow?.metadataJson;

  const horizonYears = sellHoldRentRow?.years ?? extractFinanceNumber(scenMeta, ['horizonYears']);
  const parsedSellHoldRentOverrides = parseSellHoldRentOverrides(
    Array.isArray(toolOverrideRows) ? toolOverrideRows : [],
  );
  const overrideMonthlyRentDollars =
    typeof parsedSellHoldRentOverrides.values.monthlyRentNow === 'number'
      ? parsedSellHoldRentOverrides.values.monthlyRentNow
      : null;
  const shrDriversObj = shrDrivers && typeof shrDrivers === 'object' && !Array.isArray(shrDrivers)
    ? shrDrivers
    : null;
  const extractedMonthlyRentCents =
    (overrideMonthlyRentDollars !== null ? Math.round(overrideMonthlyRentDollars * 100) : null)
    ?? extractFinanceNumber(shrDriversObj, ['monthlyRentCents', 'estimatedMonthlyRentCents'])
    ?? (() => {
      const dollars = extractFinanceNumber(shrDriversObj, ['monthlyRent', 'estimatedMonthlyRent']);
      return dollars !== null ? Math.round(dollars * 100) : null;
    })();
  // Property.lastAppraisedValue is already persisted in cents across backend services and seed data.
  const homeValueCents =
    sellHoldRentRow?.homeValueNowCents
    ?? (typeof propertyRow?.lastAppraisedValue === 'number' ? Math.round(propertyRow.lastAppraisedValue) : null);
  const currentRateRaw =
    refinanceOppRow?.currentRate
    ?? extractFinanceNumber(scenMeta, ['currentRate', 'currentRatePct'])
    ?? extractFinanceNumber(oppMeta, ['currentRate', 'currentRatePct']);
  const currentRateBps = currentRateRaw !== null
    ? Math.round(currentRateRaw * 100)
    : extractFinanceNumber(scenMeta, ['currentRateBps']);
  const candidateRateRaw = refinanceScenarioRow?.targetRate ?? refinanceOppRow?.marketRate ?? null;
  const candidateRateBps = candidateRateRaw !== null ? Math.round(candidateRateRaw * 100) : null;
  const closingCostsCents = refinanceScenarioRow?.closingCost !== null && refinanceScenarioRow?.closingCost !== undefined
    ? toCents(refinanceScenarioRow.closingCost)
    : refinanceOppRow?.closingCostAssumption !== null && refinanceOppRow?.closingCostAssumption !== undefined
      ? toCents(refinanceOppRow.closingCostAssumption)
      : null;
  const loanBalanceCents = refinanceOppRow?.loanBalance !== null && refinanceOppRow?.loanBalance !== undefined
    ? toCents(refinanceOppRow.loanBalance)
    : extractFinanceNumber(scenMeta, ['loanBalanceCents'])
      ?? extractFinanceNumber(oppMeta, ['loanBalanceCents']);
  const scenarioTermRaw = typeof refinanceScenarioRow?.targetTerm === 'number' ? refinanceScenarioRow.targetTerm : null;
  const remainingTermMonths = scenarioTermRaw !== null && scenarioTermRaw > 0
    ? (scenarioTermRaw <= 50 ? Math.round(scenarioTermRaw * 12) : Math.round(scenarioTermRaw))
    : typeof refinanceOppRow?.remainingTermMonths === 'number' && refinanceOppRow.remainingTermMonths > 0
      ? Math.round(refinanceOppRow.remainingTermMonths)
      : extractFinanceNumber(scenMeta, ['remainingTermMonths'])
        ?? extractFinanceNumber(oppMeta, ['remainingTermMonths']);
  const monthlySavingsCents = refinanceScenarioRow?.monthlySavings !== null && refinanceScenarioRow?.monthlySavings !== undefined
    ? toCents(refinanceScenarioRow.monthlySavings)
    : refinanceOppRow?.monthlySavings !== null && refinanceOppRow?.monthlySavings !== undefined
      ? toCents(refinanceOppRow.monthlySavings)
      : extractFinanceNumber(scenMeta, ['monthlySavingsCents'])
        ?? extractFinanceNumber(oppMeta, ['monthlySavingsCents']);
  const breakEvenMonths = typeof refinanceScenarioRow?.breakEvenMonths === 'number'
    ? Math.round(refinanceScenarioRow.breakEvenMonths)
    : typeof refinanceOppRow?.breakEvenMonths === 'number'
      ? Math.round(refinanceOppRow.breakEvenMonths)
      : extractFinanceNumber(scenMeta, ['breakEvenMonths'])
        ?? extractFinanceNumber(oppMeta, ['breakEvenMonths']);
  const netHoldCents = typeof sellHoldRentRow?.netHoldCents === 'number' ? Math.round(sellHoldRentRow.netHoldCents) : null;
  const netRentCents = typeof sellHoldRentRow?.netRentCents === 'number' ? Math.round(sellHoldRentRow.netRentCents) : null;
  const sellHoldRentWinner = typeof sellHoldRentRow?.winner === 'string' && sellHoldRentRow.winner ? sellHoldRentRow.winner : null;

  const hasAnyFinanceSlot = [
    extractedMonthlyRentCents,
    homeValueCents,
    horizonYears,
    currentRateBps,
    candidateRateBps,
    closingCostsCents,
    loanBalanceCents,
    monthlySavingsCents,
    breakEvenMonths,
    netHoldCents,
    netRentCents,
  ].some((v) => v !== null);
  const financeSlots: WaveFinanceSlots | null = hasAnyFinanceSlot
    ? {
        monthlyRentCents: extractedMonthlyRentCents,
        homeValueCents,
        horizonYears,
        currentRateBps,
        candidateRateBps,
        closingCostsCents,
        loanBalanceCents,
        remainingTermMonths,
        monthlySavingsCents,
        breakEvenMonths,
        netHoldCents,
        netRentCents,
        sellHoldRentWinner,
      }
    : null;

  let savedResults: WaveSavedResultRecord[] = [];
  let savedResultsState: CrossDomainPropertySnapshot['savedResultsState'];
  if (needSaved) {
    if (!userId) {
      savedResultsState = { status: 'UNAVAILABLE', reason: 'User identity is required to load Saved results.' };
    } else if (typeof prismaAny.askSavedArtifactPreference?.findMany !== 'function') {
      savedResultsState = { status: 'UNAVAILABLE', reason: 'Saved artifact storage is unavailable.' };
    } else {
      try {
        const savedPage = await getAskSavedPage(userId, propertyId, { limit: 25 });
        savedResults = savedPage.rows.map((row) => ({
          id: row.artifactKey,
          propertyId: row.propertyId,
          title: row.title,
          savedType: row.artifactType,
          minimumRole: row.visibility.sensitivity === 'SENSITIVE' || row.visibility.scope === 'REQUESTER_ONLY' ? 'OWNER' : 'VIEWER',
        }));
        const failedReaders = savedPage.types.filter((entry) => entry.state === 'FAILED');
        savedResultsState = failedReaders.length > 0
          ? {
              status: 'UNAVAILABLE',
              partial: true,
              reason: `Saved readers failed: ${failedReaders.map((entry) => entry.artifactType).join(', ')}.`,
            }
          : { status: 'AVAILABLE' };
      } catch (error) {
        savedResults = [];
        savedResultsState = {
          status: 'UNAVAILABLE',
          reason: error instanceof Error && error.message ? error.message : 'Unable to load Saved results.',
        };
      }
    }
  }

  return {
    ...phase2aSnapshot,
    asOfDate: localYmdInTimeZone(new Date(), propertyTimezone),
    timezone: propertyTimezone,
    closingDateIso,
    extendedItems,
    warranties: (warrantyRows as Array<any>).map((w) => ({
      id: w.id,
      propertyId: w.propertyId ?? propertyId,
      providerName: w.providerName,
      category: String(w.category),
      expiryDate: w.expiryDate ? new Date(w.expiryDate).toISOString().slice(0, 10) : '',
    })),
    maintenanceTaskMeta: phase2aSnapshot.maintenanceTasks.map((t) => ({
      taskId: t.id,
      category: /plumb|leak|water heater|pipe|drain/i.test(t.title)
        ? 'PLUMBING'
        : /electr|panel|breaker|outlet/i.test(t.title)
          ? 'ELECTRICAL'
          : /hvac|furnace|ac|filter|heat/i.test(t.title)
            ? 'HVAC'
            : 'GENERAL',
    })),
    insurancePolicies: (policyRows as Array<any>).map((p) => ({
      id: p.id,
      propertyId: p.propertyId ?? propertyId,
      carrierName: p.carrierName,
      policyNumber: p.policyNumber,
      deductibleCents: typeof p.deductibleCents === 'number' ? p.deductibleCents : toCents(p.deductibleAmount),
      annualPremiumCents: toCents(p.premiumAmount),
      expiryDate: p.expiryDate ? new Date(p.expiryDate).toISOString().slice(0, 10) : '',
    })),
    claims,
    documents: propertyDocuments,
    claimDocLinks,
    homeEvents: (homeEventRows as Array<any>).map((e) => ({
      id: e.id,
      propertyId: e.propertyId,
      title: e.title,
      eventCategory: String(e.type).toUpperCase().includes('REPAIR')
        ? 'REPAIR'
        : String(e.type).toUpperCase().includes('UPGRADE')
          ? 'UPGRADE'
          : String(e.type).toUpperCase().includes('INSPECT')
            ? 'INSPECTION'
            : 'OTHER',
      occurredAt: e.occurredAt ? new Date(e.occurredAt).toISOString() : '',
      actualCostCents: e.amount !== null && e.amount !== undefined ? toCents(e.amount) : null,
    })),
    taxBills: (taxBillRows as Array<any>).map((b) => ({
      id: b.id,
      propertyId: b.propertyId,
      taxYear: b.taxYear,
      amountCents: toCents(b.billAmount),
      status: mapTaxStatus(String(b.status)),
      lifecycleStatus: b.supersededById ? 'SUPERSEDED' : 'ACTIVE',
    })),
    financeSlots,
    recalls: (recallRows as Array<any>)
      .filter((r) => !['DISMISSED', 'RESOLVED'].includes(String(r.status ?? 'OPEN').toUpperCase()))
      .map((r) => ({
      id: r.id,
      propertyId: r.propertyId,
      title: r.recall?.title ?? 'Safety recall match',
      severity: String(r.recall?.severity ?? 'MEDIUM').toUpperCase() === 'HIGH'
        ? 'HIGH'
        : String(r.recall?.severity ?? '').toUpperCase() === 'LOW'
          ? 'LOW'
          : 'MEDIUM',
      affectedInventoryItemId: r.inventoryItemId ?? '',
    })),
    environmentalRisks: (riskMatchRows as Array<any>).map((m) => ({
      id: m.id,
      propertyId: m.propertyId,
      hazardType: String(m.homeRiskEvent?.eventType ?? 'WEATHER_RISK'),
      severity: String(m.impactLevel ?? m.homeRiskEvent?.severity ?? 'MODERATE').toUpperCase() === 'HIGH'
        ? 'HIGH'
        : String(m.impactLevel ?? '').toUpperCase() === 'LOW'
          ? 'LOW'
          : 'MODERATE',
      windowStartIso: m.homeRiskEvent?.startAt ? new Date(m.homeRiskEvent.startAt).toISOString() : '',
      windowEndIso: m.homeRiskEvent?.endAt ? new Date(m.homeRiskEvent.endAt).toISOString() : '',
      sourceAvailable: Boolean(propertyRow?.state ?? true),
      lastUpdatedIso: m.homeRiskEvent?.updatedAt ? new Date(m.homeRiskEvent.updatedAt).toISOString() : '',
    })),
    inspectionFindings: (inspectionRows as Array<any>).map((f) => ({
      id: f.id,
      propertyId: f.propertyId,
      inspectionReportId: f.reportId,
      inspectionReportTitle: f.report?.reportType ? `${String(f.report.reportType)} (${new Date(f.report.inspectionDate).toISOString().slice(0, 10)})` : 'Inspection Report',
      title: f.inspectorDescription,
      status: mapInspectionStatus(String(f.status)),
    })),
    buyerTasks: (Array.isArray(buyerChecklistRow?.tasks) ? buyerChecklistRow.tasks : []).map((t: any) => ({
      id: t.id,
      propertyId,
      title: t.title,
      isContingency: String(t.taskType ?? '').toUpperCase().includes('CONTINGENCY') || /contingenc/i.test(String(t.title)),
      status: String(t.status).toUpperCase() === 'COMPLETED' ? 'COMPLETED' : 'OPEN',
      dueAt: t.dueAt ? new Date(t.dueAt).toISOString() : '',
    })),
    sellerReadinessItems: (Array.isArray(saleCaseRow?.readinessItems) ? saleCaseRow.readinessItems : []).map((s: any) => ({
      id: s.id,
      propertyId,
      title: s.title,
      status: String(s.status).toUpperCase() === 'RESOLVED' ? 'COMPLETED' : 'PENDING',
    })),
    projects: (projectRows as Array<any>).map((p) => ({
      id: p.id,
      propertyId: p.propertyId,
      title: p.name,
      status: mapProjectStatus(String(p.status)),
      permitStatus: mapPermitStatus(String(p.permitApplicability)),
    })),
    contractorQuotes: (quoteRows as Array<any>).map((q) => {
      const scopeParts = [
        q.serviceLocation,
        q.serviceCategory,
        q.serviceLabelRaw,
        q.scopeSummary,
        q.workspace?.scopeSummary,
        q.workspace?.serviceCategory,
      ].filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
      return {
        id: q.id,
        propertyId: q.workspace?.propertyId ?? propertyId,
        roomTag: q.serviceLocation ?? q.serviceCategory ?? 'GENERAL',
        scopeText: scopeParts.join(' '),
        vendorName: q.vendorName,
        amountCents: toCents(q.quoteAmount),
        timelineDays: 0,
        warrantyMonths: 0,
      };
    }),
    savedResults,
    ...(savedResultsState ? { savedResultsState } : {}),
  };
}

export function buildOperationResultFromCrossDomainExecution(execution: CrossDomainExecutionResult): AskOperationResult {
  if (execution.status === 'FORBIDDEN') {
    return {
      status: 'NOT_APPLICABLE',
      reasonCode: 'CROSS_DOMAIN_FORBIDDEN',
      blocks: [
        {
          type: 'SUMMARY',
          id: 'cross-domain-forbidden',
          title: 'Access denied',
          body: execution.answer,
          tone: 'CRITICAL',
          actions: [],
        },
      ],
      suggestions: [],
      parameters: { crossDomainExecution: execution },
    };
  }

  if (execution.status === 'CLARIFY' && execution.clarification) {
    const blocks: AskPresentationBlock[] = [
      {
        type: 'SUMMARY',
        id: 'cross-domain-clarification-required',
        title: 'Please clarify what you mean',
        body: `${execution.clarification.question} (${execution.clarification.options.join(' vs ')})`,
        tone: 'CAUTION',
        actions: [],
      },
    ];
    if (execution.clarification.candidateRecords && execution.clarification.candidateRecords.length > 0) {
      blocks.push({
        type: 'GROUPED_LIST',
        id: 'cross-domain-clarification-candidates',
        title: 'Matching candidates',
        sections: [
          {
            id: 'clarification-candidates',
            title: 'Select two to compare',
            count: execution.clarification.candidateRecords.length,
            items: execution.clarification.candidateRecords.map((candidate) => ({
              id: candidate.id,
              title: candidate.label,
              ...(candidate.subtitle ? { description: candidate.subtitle } : {}),
              meta: ['domain.projects_quotes_vendors'],
            })),
          },
        ],
        actions: [],
        filters: [],
      });
    }
    return {
      status: 'NEEDS_CLARIFICATION',
      reasonCode: execution.clarification.reasonCode,
      blocks,
      suggestions: [],
      parameters: {
        crossDomainExecution: execution,
        clarification: execution.clarification,
      },
    };
  }

  if (execution.status === 'BOUNDARY') {
    return {
      status: 'NOT_APPLICABLE',
      reasonCode: 'SAFETY_BOUNDARY_TRIGGERED',
      blocks: [
        {
          type: 'SUMMARY',
          id: 'cross-domain-safety-boundary',
          title: 'Safety warning triggered',
          body: execution.answer,
          tone: 'CRITICAL',
          actions: [],
        },
      ],
      suggestions: [],
      parameters: { crossDomainExecution: execution },
    };
  }

  if (execution.status === 'NONE_FITS') {
    return {
      status: 'NOT_APPLICABLE',
      reasonCode: 'DATA_POINT_SEMANTIC_AGREEMENT_REQUIRED',
      blocks: [
        {
          type: 'SUMMARY',
          id: 'cross-domain-none-fits',
          title: 'Question could not be safely interpreted',
          body: execution.answer,
          tone: 'CAUTION',
          actions: [],
        },
      ],
      suggestions: [],
      parameters: { crossDomainExecution: execution },
    };
  }

  const primaryReceipt = execution.facetResults.find((f) => f.receipt !== null)?.receipt ?? null;
  const blocks: AskPresentationBlock[] = [
    {
      type: 'SUMMARY',
      // Preserve the receipt's declared answer variant at the final Ask
      // boundary. The provisional delivery gate verifies this identity;
      // replacing it with a generic cross-domain id made otherwise valid
      // warranty COUNT/DETAIL answers fail entailment and get withheld.
      id: primaryReceipt?.answerVariantId ?? 'cross-domain-summary',
      title: execution.facetResults.length > 1 ? 'Cross-domain answer' : 'Property answer',
      body: execution.answer,
      tone: execution.status === 'PARTIAL' ? 'CAUTION' : 'DEFAULT',
      actions: [],
    },
  ];

  const listSections = execution.facetResults
    .filter((f) => f.recordIds.length > 0 && f.receipt && f.receipt.projection !== 'COUNT')
    .map((facetResult) => {
      const rowById = new Map((facetResult.rows ?? []).map((row) => [row.id, row]));
      return {
        id: `section-${facetResult.facetId}`,
        title: facetResult.owner.domainId,
        count: facetResult.recordIds.length,
        items: facetResult.recordIds.map((id) => {
          const row = rowById.get(id);
          return {
            id,
            title: row?.label && row.label.trim().length > 0 ? row.label : id,
            ...(row?.subtitle ? { description: row.subtitle } : {}),
            meta: [facetResult.owner.adapterId],
          };
        }),
      };
    });

  if (listSections.length > 0) {
    blocks.push({
      type: 'GROUPED_LIST',
      id: 'cross-domain-grouped-list',
      title: 'Matched records',
      sections: listSections,
      actions: [],
      filters: [],
    });
  }

  blocks.push({
    type: 'EVIDENCE',
    id: 'cross-domain-evidence',
    title: 'Semantic execution provenance',
    items: execution.facetResults.map((facetResult) => ({
      label: facetResult.owner.adapterId,
      source: facetResult.owner.domainId,
      observedAt: facetResult.receipt?.provenance.observedAt ?? new Date().toISOString(),
    })),
  });

  return {
    status: execution.status === 'PARTIAL' ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: execution.status === 'PARTIAL' ? 'CROSS_DOMAIN_PARTIAL' : undefined,
    blocks,
    suggestions: [],
    parameters: {
      crossDomainExecution: execution,
      ...(primaryReceipt ? { semanticExecutionReceipt: primaryReceipt } : {}),
    },
  };
}

export interface AuthorizedProviderContext {
  readonly dynamicEntities: readonly DynamicPlaceholderEntityCandidate[];
  readonly dynamicQuotes: readonly DynamicQuoteCandidate[];
}

/**
 * Loads lightweight authorized property-backed entity names and quote candidates
 * so homeowner-specific item, room, and contractor/quote identifiers are converted
 * into indexed placeholders before external provider calls (FR-PLAN-3 / FR-ENT).
 */
export async function loadAuthorizedProviderContext(propertyId: string): Promise<AuthorizedProviderContext> {
  const prismaAny = prisma as unknown as Record<string, { findMany?: Function } | undefined>;
  const [rooms, items, quotes] = await Promise.all([
    typeof prismaAny.inventoryRoom?.findMany === 'function'
      ? prisma.inventoryRoom.findMany({
          where: { propertyId },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    typeof prismaAny.inventoryItem?.findMany === 'function'
      ? prisma.inventoryItem.findMany({
          where: { propertyId, ...visibleInventoryItemWhere() },
          select: { id: true, name: true, brand: true, modelNumber: true },
        })
      : Promise.resolve([]),
    typeof prismaAny.quoteComparisonQuote?.findMany === 'function'
      ? prisma.quoteComparisonQuote.findMany({
          where: { workspace: { propertyId } },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          select: { id: true, vendorName: true, quoteAmount: true, serviceLocation: true, serviceCategory: true },
        })
      : Promise.resolve([]),
  ]);

  const dynamicEntities: DynamicPlaceholderEntityCandidate[] = [];
  for (const room of rooms as Array<{ id: string; name?: string | null }>) {
    const name = typeof room.name === 'string' ? room.name.trim() : '';
    if (!name) continue;
    dynamicEntities.push({
      kind: 'ROOM',
      entityId: 'entity.room',
      recordId: room.id,
      names: [name],
      authorized: true,
      safeDisplayLabel: name,
    });
  }

  for (const item of items as Array<{ id: string; name?: string | null; brand?: string | null; modelNumber?: string | null }>) {
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const brand = typeof item.brand === 'string' ? item.brand.trim() : '';
    const model = typeof item.modelNumber === 'string' ? item.modelNumber.trim() : '';
    const candidateNames = Array.from(
      new Set(
        [
          name,
          brand && model ? `${brand} ${model}` : '',
          brand && name ? `${brand} ${name}` : '',
          model,
        ].filter((val) => val.length > 0),
      ),
    );
    if (candidateNames.length === 0) continue;
    dynamicEntities.push({
      kind: 'ITEM',
      entityId: 'entity.inventory_item',
      recordId: item.id,
      names: candidateNames,
      authorized: true,
      safeDisplayLabel: name || candidateNames[0],
    });
  }

  const dynamicQuotes: DynamicQuoteCandidate[] = [];
  for (const quote of quotes as Array<{
    id: string;
    vendorName?: string | null;
    quoteAmount?: unknown;
    serviceLocation?: string | null;
    serviceCategory?: string | null;
  }>) {
    const vendorName = typeof quote.vendorName === 'string' ? quote.vendorName.trim() : '';
    if (!vendorName) continue;
    dynamicQuotes.push({
      id: quote.id,
      vendorName,
      roomTag: quote.serviceLocation ?? quote.serviceCategory ?? 'GENERAL',
      amountCents: toCents(quote.quoteAmount),
    });
    dynamicEntities.push({
      kind: 'VENDOR',
      entityId: 'entity.contractor_quote',
      recordId: quote.id,
      names: [vendorName],
      authorized: true,
      safeDisplayLabel: vendorName,
    });
  }

  return { dynamicEntities, dynamicQuotes };
}

/**
 * Production entry point connecting Cross-Domain Wave 1-5 execution to live Prisma property records.
 */
export async function executeCrossDomainOnProperty(input: {
  readonly propertyId: string;
  readonly userId?: string;
  readonly role: string;
  readonly propertyAuthorized: boolean;
  readonly rawText: string;
  readonly timeZone?: string;
  readonly snapshotOverride?: CrossDomainPropertySnapshot;
  readonly planOverride?: SemanticRequestPlan;
}): Promise<{
  readonly execution: CrossDomainExecutionResult;
  readonly operationResult: AskOperationResult;
  readonly snapshot: CrossDomainPropertySnapshot;
}> {
  const activePlan = input.planOverride ?? null;
  const parsed = activePlan ? null : parseCrossDomainSemanticRequest(input.rawText);
  const snapshot = input.snapshotOverride
    ?? (activePlan && activePlan.outcome === 'MATCH'
      ? await loadCrossDomainPropertySnapshot(
          input.propertyId,
          input.userId,
          input.timeZone,
          deriveSnapshotLoadScope(activePlan.facets),
        )
      : parsed && parsed.plan.outcome === 'MATCH'
        ? await loadCrossDomainPropertySnapshot(
            input.propertyId,
            input.userId,
            input.timeZone,
            deriveSnapshotLoadScope(parsed.plan.facets),
          )
        : parsed && !parsed.clarification && parsed.plan.outcome === 'NONE_FITS' && mayNeedDynamicQuoteResolution(input.rawText)
          ? await loadCrossDomainPropertySnapshot(
              input.propertyId,
              input.userId,
              input.timeZone,
              {
                domains: new Set(['domain.projects_quotes_vendors']),
                jobs: new Set(['job.projects.quote_comparison']),
              },
            )
          : buildMinimalCrossDomainSnapshot(input.propertyId, input.timeZone));
  const execution = await executeCrossDomainWaves({
    rawText: input.rawText,
    snapshot,
    role: normalizeWaveRole(input.role),
    propertyAuthorized: input.propertyAuthorized,
    planOverride: activePlan ?? undefined,
  });
  return {
    execution,
    operationResult: buildOperationResultFromCrossDomainExecution(execution),
    snapshot,
  };
}
