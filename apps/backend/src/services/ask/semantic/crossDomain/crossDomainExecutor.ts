import { PERMIT_CATEGORY_LABELS, PERMIT_OFFICIAL_STATUS_LABELS, PERMIT_REPORTED_STATUS_LABELS } from '../../support/permitTrackerRead';
import { buildFreeTextClarification, buildPayloadClarification } from '../../support/clarificationContract';
import type { AskClarification } from '../../../../productFramework/ask/ask.contract';
import { EMERGENCY_BOUNDARY_BODY, EMERGENCY_BOUNDARY_TITLE } from '../../support/emergencyBoundary';
import {
  buildSemanticReadReceipt,
  type SemanticReadReceipt,
} from '../semanticExecutionReceipt';
import {
  verifySemanticReadReceiptEntailment,
  type SemanticReceiptEntailmentVerdict,
} from '../semanticReceiptEntailment';
import { ASK_SEMANTIC_PLAN_VERSION, type SemanticFacet, type SemanticRequestPlan, type SemanticWhereExpression } from '../semanticRequestPlan';
import { ASK_SEMANTIC_DOMAINS, type SemanticDomainId } from '../governance/semanticOntologyBaseline';
import type { AskListRecordKind, AskPresentationFamily } from '../../../../productFramework/ask/ask.contract';
import { buildSliceAnalysisPresentation, wholeDollars, type SliceAnalysisInput } from '../slice/analysisPresentation';
import {
  ENTITY_TYPE_OF_RECORD_KIND,
  UNCONFIRMED_LIST_SUFFIX,
  buildSliceRichPresentation,
  verifyRichPresentationPopulationEquivalence,
  type SlicePresentationRow,
  type SliceRichPresentationEquivalenceReport,
} from '../slice/richPresentationAdapter';
import { OPEN_CLAIM_STATUSES, claimItemActions } from '../../handlers/claims.handler';
import { prisma } from '../../../../lib/prisma';
import { DATA_POINT_BY_ID } from '../../dataPoint/dataPointCatalogue';
import { humanizeEnumTokensInCopy, humanizePresentationToken } from '../containment/presentationHumanizer';
import { TIME_SERIES_REGISTRY } from '../../dataPoint/queryShapeRegistries';
import { visibleInventoryItemWhere } from '../../../riskAssetApplicability';
import { type DynamicPlaceholderEntityCandidate } from '../slice/placeholderSpanMap';
import { type AskPresentationBlock } from '../../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../../askOperationRegistry';
import { getAskSavedPage } from '../../askSaved.service';
import { safeTimezone } from '../../support/propertyContext';
import { computeMonthlyPayment } from '../../../tools/mortgageMath';
import { parseSellHoldRentOverrides } from '../../../toolOverrideContract';
import {
  executeSemanticSlice,
  loadSlicePropertySnapshot,
  type SliceAuthorizationContext,
  type SlicePropertySnapshot,
} from '../slice/sliceExecutor';
import {
  assignMixedStackFacetOwnership,
  tryNormalizeToCanonicalSection5Domain,
  type MixedStackFacetOwnershipAssignment,
} from './domainRolloutManifest';
import {
  applyCrossDomainFollowUpRefinement,
  mayNeedDynamicQuoteResolution,
  parseCrossDomainSemanticRequest,
  type CrossDomainClarification,
  type CrossDomainClarificationCandidate,
  type DynamicQuoteCandidate,
  type PlanOverflowFacet,
} from './crossDomainPlanBuilder';

export type AskUserRole = SliceAuthorizationContext['role'];

export interface CrossDomainExtendedItemRecord {
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
  /** Recorded model number; an item without one cannot be matched against a recall. */
  readonly modelNumber?: string | null;
}

export interface CrossDomainWarrantyRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly providerName: string;
  readonly category: string;
  readonly expiryDate: string;
}

export interface CrossDomainExtendedMaintenanceTaskMeta {
  readonly taskId: string;
  readonly category: 'PLUMBING' | 'ELECTRICAL' | 'HVAC' | 'GENERAL';
}

export interface CrossDomainInsurancePolicyRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly carrierName: string;
  readonly policyNumber: string;
  readonly deductibleCents: number;
  /** False when no deductible is recorded on the policy (the cents above is then a placeholder 0, never a $0 deductible). Absent means recorded. */
  readonly deductibleRecorded?: boolean;
  readonly annualPremiumCents: number;
  readonly expiryDate: string;
}

export interface CrossDomainClaimRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly title: string;
  readonly slug: string;
  readonly status: 'OPEN' | 'CLOSED' | 'UNDER_REVIEW';
  readonly requiredDocumentTypes: readonly string[];
  /** Claim.type (WATER_DAMAGE, FIRE_SMOKE, STORM_WIND_HAIL, THEFT_VANDALISM, LIABILITY, ...). Absent only on fixtures; a stored claim always has one. */
  readonly claimType?: string;
  /** The stored Claim.status (DRAFT, IN_PROGRESS, ...), which `status` collapses. Absent only on fixtures. */
  readonly rawStatus?: string;
}

export interface CrossDomainDocumentRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly title: string;
  readonly documentType: string;
  readonly lifecycleStatus: 'ACTIVE' | 'ARCHIVED' | 'TRASHED';
  readonly visibleToRoles: readonly AskUserRole[];
}

export interface CrossDomainClaimDocLink {
  readonly id: string;
  readonly claimId: string;
  readonly documentId: string;
}

export interface CrossDomainHomeEventRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly title: string;
  readonly eventCategory: 'REPAIR' | 'UPGRADE' | 'INSPECTION' | 'OTHER';
  readonly occurredAt: string;
  readonly actualCostCents: number | null;
}

export interface CrossDomainTaxBillRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly taxYear: number;
  readonly amountCents: number;
  readonly status: 'PAID' | 'UNPAID' | 'OVERDUE';
  readonly lifecycleStatus: 'ACTIVE' | 'SUPERSEDED';
}

export interface CrossDomainFinanceSlots {
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

export interface CrossDomainRecallRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly title: string;
  readonly severity: 'HIGH' | 'MEDIUM' | 'LOW';
  readonly affectedInventoryItemId: string;
}

export interface CrossDomainEnvironmentalRiskRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly hazardType: string;
  readonly severity: 'HIGH' | 'MODERATE' | 'LOW';
  readonly windowStartIso: string;
  readonly windowEndIso: string;
  readonly sourceAvailable: boolean;
  readonly lastUpdatedIso: string;
}

export interface CrossDomainInspectionFindingRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly inspectionReportId: string;
  readonly inspectionReportTitle: string;
  readonly title: string;
  readonly status: 'ACTION_REQUIRED' | 'MONITORING' | 'RESOLVED';
}

export interface CrossDomainBuyerTaskRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly title: string;
  readonly isContingency: boolean;
  readonly status: 'OPEN' | 'COMPLETED';
  readonly dueAt: string;
}

export interface CrossDomainSellerReadinessRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly title: string;
  /** PENDING = open or committed to (`PURSUING`); COMPLETED = resolved; WAIVED = the homeowner decided to disclose rather than fix, so it is not "still to finish". */
  readonly status: 'PENDING' | 'COMPLETED' | 'WAIVED';
  readonly requirementClass?: string;
  readonly category?: string;
}

export interface CrossDomainProjectRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly title: string;
  readonly status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  readonly permitStatus: 'CONFIRMED_NOT_REQUIRED' | 'NEEDS_PERMIT' | 'UNKNOWN' | 'APPROVED';
}

/** A permit record. `officialStatus` is the authority's; `reportedStatus` is the household's or contractor's word and never stands in for it. */
export interface CrossDomainPermitRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly category: string;
  readonly permitNumber: string | null;
  readonly officialStatus: string;
  readonly reportedStatus: string | null;
}

export interface CrossDomainContractorQuoteRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly roomTag: string;
  readonly scopeText?: string | null;
  readonly vendorName: string;
  readonly amountCents: number;
  readonly timelineDays: number;
  readonly warrantyMonths: number;
}

/** Raw item columns for field-absence reads. Loaded only for that job; absent means "not loaded", never "all recorded". */
export interface CrossDomainInventoryFieldRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly name: string;
  readonly values: Readonly<Record<string, string | number | Date | null | undefined>>;
}

/** Registered absence-eligible item fields: semantic field id -> catalogued data point (the catalogue owns column, family and audience floor). */
export const INVENTORY_ABSENCE_FIELD_POINT_IDS: Readonly<Record<string, string>> = Object.freeze({
  'field.inventory_item.serial_number': 'item.serial',
  'field.inventory_item.model_number': 'item.model',
  'field.inventory_item.installed_on': 'item.installedOn',
  'field.inventory_item.purchased_on': 'item.purchasedOn',
  'field.inventory_item.purchase_cost': 'item.purchaseCost',
  'field.inventory_item.replacement_cost': 'item.replacementCost',
  'field.inventory_item.last_serviced_on': 'item.lastServicedOn',
});

/** One tax year of a registered time series (active, non-superseded record). `value` is dollars, null when no amount is recorded. */
export interface CrossDomainTaxSeriesRow {
  readonly id: string;
  readonly propertyId: string;
  readonly taxYear: number;
  readonly value: number | null;
}

/** Registered tax series: semantic field id -> declared time series (the declaration owns entity, column, ordering and period cap). */
export const TAX_SERIES_FIELD_POINT_IDS: Readonly<Record<string, string>> = Object.freeze({
  'field.tax_bill.tax_amount': 'taxBill.amount',
  'field.tax_assessment.total_assessed_value': 'taxAssessment.totalAssessedValue',
});

export interface CrossDomainSavedResultRecord {
  readonly id: string;
  readonly propertyId: string;
  readonly title: string;
  readonly savedType: string;
  readonly minimumRole: AskUserRole;
  readonly serializedPlan?: string;
}

export interface CrossDomainPropertySnapshot extends SlicePropertySnapshot {
  readonly timezone: string;
  readonly closingDateIso: string | null;
  readonly extendedItems: readonly CrossDomainExtendedItemRecord[];
  /** Present only when the plan needs field-absence reads (`query.inventory_item.field_absence`). */
  readonly inventoryFieldRecords?: readonly CrossDomainInventoryFieldRecord[];
  /** Present only when the plan needs `query.property_tax.change_over_time`; keyed by declared time-series data point id, oldest year first. */
  readonly taxSeries?: Readonly<Record<string, readonly CrossDomainTaxSeriesRow[]>>;
  readonly warranties: readonly CrossDomainWarrantyRecord[];
  readonly maintenanceTaskMeta: readonly CrossDomainExtendedMaintenanceTaskMeta[];
  readonly insurancePolicies: readonly CrossDomainInsurancePolicyRecord[];
  readonly claims: readonly CrossDomainClaimRecord[];
  readonly documents: readonly CrossDomainDocumentRecord[];
  readonly claimDocLinks: readonly CrossDomainClaimDocLink[];
  readonly homeEvents: readonly CrossDomainHomeEventRecord[];
  readonly taxBills: readonly CrossDomainTaxBillRecord[];
  readonly financeSlots: CrossDomainFinanceSlots | null;
  readonly recalls: readonly CrossDomainRecallRecord[];
  readonly environmentalRisks: readonly CrossDomainEnvironmentalRiskRecord[];
  readonly inspectionFindings: readonly CrossDomainInspectionFindingRecord[];
  readonly buyerTasks: readonly CrossDomainBuyerTaskRecord[];
  readonly sellerReadinessItems: readonly CrossDomainSellerReadinessRecord[];
  readonly projects: readonly CrossDomainProjectRecord[];
  readonly permits: readonly CrossDomainPermitRecord[];
  readonly contractorQuotes: readonly CrossDomainContractorQuoteRecord[];
  readonly savedResults: readonly CrossDomainSavedResultRecord[];
  readonly savedResultsState?: {
    readonly status: 'AVAILABLE' | 'UNAVAILABLE';
    readonly reason?: string;
    readonly partial?: boolean;
  };
}

export interface CrossDomainFacetExecutionResult {
  readonly facetId: string;
  readonly jobMatch?: string | null;
  readonly owner: MixedStackFacetOwnershipAssignment;
  readonly status: 'EXECUTED' | 'PARTIAL_MISSING_SLOTS' | 'UNRESOLVED' | 'BLOCKED';
  readonly summary: string;
  readonly recordIds: readonly string[];
  readonly rows?: ReadonlyArray<{ readonly id: string; readonly label: string; readonly subtitle?: string; readonly entityType?: string; readonly actions?: ReadonlyArray<Record<string, unknown>> }>;
  /** Records the answer could not confirm. Never part of `recordIds` or the receipt's confirmed population; a compound answer shows them as their own collection. */
  readonly unconfirmedRows?: ReadonlyArray<{ readonly id: string; readonly label: string; readonly subtitle?: string }>;
  readonly missingSlots: readonly string[];
  readonly redactedFieldIds: readonly string[];
  readonly receipt: SemanticReadReceipt | null;
  readonly entailment: SemanticReceiptEntailmentVerdict | null;
  readonly presentationEquivalence: SliceRichPresentationEquivalenceReport | null;
  /** This facet's own homeowner-facing blocks (summary, list, boundary, evidence), already free of internal identifiers. */
  readonly blocks?: readonly AskPresentationBlock[];
  readonly metrics?: Readonly<Record<string, number | string | boolean | null>>;
}

export interface CrossDomainExecutionResult {
  readonly status: 'ANSWERED' | 'PARTIAL' | 'CLARIFY' | 'NONE_FITS' | 'BOUNDARY' | 'FORBIDDEN';
  readonly rawText: string;
  readonly answer: string;
  readonly clarification: CrossDomainClarification | null;
  readonly facetResults: readonly CrossDomainFacetExecutionResult[];
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

const humanizeEnumTokens = humanizeEnumTokensInCopy;

/**
 * A summary says what the records mean, not which records they are: when it names two or more of the rows listed right below it, the enumeration is cut and the sentence before it
 * is kept ("3 maintenance tasks due in December 2026: A, B, C." becomes "3 maintenance tasks due in December 2026.").
 */
export function withoutRowEnumeration(summary: string, labels: readonly string[]): string {
  if (labels.length === 0) return summary;
  // Only the sentence that lists the rows is shortened; a disclosure that follows it ("2 have no confirmed status, so ...") is kept as it is.
  const sentences = summary.split(/(?<=\.)\s+(?=[A-Z0-9])/);
  const trimmed = sentences.map((sentence) => {
    const present = labels.filter((label) => label.length > 0 && sentence.includes(label));
    // Two or more rows named, or a single row named as the whole tail of the sentence ("1 open claim: Water-damage claim."), is the list said again.
    const listsRows = present.length >= 2 || (present.length === 1 && labels.length === 1 && sentence.endsWith(`: ${present[0]}.`));
    if (!listsRows) return sentence;
    const first = Math.min(...present.map((label) => sentence.indexOf(label)));
    const colon = sentence.lastIndexOf(': ', first);
    const head = (colon >= 0 ? sentence.slice(0, colon) : sentence.slice(0, first)).trim().replace(/[:,(\s]+$/, '');
    return head.length > 0 ? `${head}.` : sentence;
  });
  return trimmed.join(' ');
}

/** The list kind whose canonical domain renderer a source type's rows belong to. Source types without one render through the shared list. */
const RECORD_KIND_OF_SOURCE_TYPE: Readonly<Record<string, AskListRecordKind>> = {
  InventoryItem: 'INVENTORY_ITEM', PropertyMaintenanceTask: 'MAINTENANCE_TASK', Claim: 'CLAIM', PropertyPermitRecord: 'PERMIT', Warranty: 'WARRANTY', HomeEvent: 'HOME_EVENT',
};

function finalizeReceiptAndPresentation(input: {
  readonly facet: SemanticFacet;
  readonly snapshot: CrossDomainPropertySnapshot;
  readonly role: AskUserRole;
  readonly projection: SemanticReadReceipt['projection'];
  readonly operationAdapter: string;
  readonly sourceType: string;
  readonly predicateIds: readonly string[];
  readonly rows: ReadonlyArray<Pick<SlicePresentationRow, 'id' | 'label' | 'subtitle' | 'groupKey' | 'description' | 'meta' | 'status' | 'entityType' | 'actions'>>;
  /** Block id of the list; the claim list uses the one the canonical claim renderer is selected by. */
  readonly listId?: string;
  readonly title: string;
  readonly summaryBody: string;
  readonly variantId: string;
  readonly unknownCount?: number;
  readonly conflictedCount?: number;
  /** Declared for analyses and comparisons; a list or a direct answer is derived from the rows. */
  readonly family?: AskPresentationFamily;
  /** An analysis is presented as a conclusion with key facts, assumptions and a note, never as a list of rows. */
  readonly analysis?: Omit<SliceAnalysisInput, 'receipt'>;
}): {
  readonly receipt: SemanticReadReceipt;
  readonly entailment: SemanticReceiptEntailmentVerdict;
  readonly equivalence: SliceRichPresentationEquivalenceReport;
  readonly rows: ReadonlyArray<{ readonly id: string; readonly label: string; readonly subtitle?: string }>;
  readonly blocks: readonly AskPresentationBlock[];
} {
  const resolvedRecordIds = input.rows.map((r) => r.id);
  const cleanRows = input.rows.map((r) => ({ ...r, label: humanizeEnumTokens(r.label), ...(r.subtitle ? { subtitle: humanizeEnumTokens(r.subtitle) } : {}) }));
  const cleanTitle = humanizeEnumTokens(input.title);
  const cleanSummary = input.projection === 'LIST' ? withoutRowEnumeration(humanizeEnumTokens(input.summaryBody), input.rows.map((r) => r.label)) : humanizeEnumTokens(input.summaryBody);
  const unknownCount = input.unknownCount ?? 0;
  const conflictedCount = input.conflictedCount ?? 0;
  const confirmedCount = resolvedRecordIds.length;
  const displayedCount = input.projection === 'COUNT' ? 0 : resolvedRecordIds.length;
  const renderedBody = input.projection === 'COUNT' && !new RegExp(`\\b${confirmedCount}\\b`).test(cleanSummary)
    ? `${confirmedCount} ${cleanSummary}`
    : cleanSummary;

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

  const blocks = input.analysis ? buildSliceAnalysisPresentation({ receipt, ...input.analysis }) : buildSliceRichPresentation({
    receipt,
    title: cleanTitle,
    summaryBody: renderedBody,
    ...(input.listId ? { listId: input.listId } : {}),
    ...(RECORD_KIND_OF_SOURCE_TYPE[input.sourceType] ? { recordKind: RECORD_KIND_OF_SOURCE_TYPE[input.sourceType] } : {}),
    ...(input.family ? { family: input.family } : input.projection === 'COUNT' || input.projection === 'AGGREGATE' || input.projection === 'EXISTS' ? { family: 'DIRECT_ANSWER' as const } : {}),
    rows: input.projection === 'COUNT' ? [] : cleanRows,
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

  return { receipt, entailment, equivalence, rows: cleanRows, blocks };
}

/**
 * Computes cumulative year-by-year net owning vs renting comparison and crossover year.
 * Returns null crossoverYear if owning does not overtake renting within the evaluation window.
 */
function computeOwnVsRentBreakEven(slots: CrossDomainFinanceSlots): {
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
  slots: CrossDomainFinanceSlots,
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

function quoteMatchesRequestedScope(quote: CrossDomainContractorQuoteRecord, requestedScope: string): boolean {
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

function firstPredicateAtom(where: SemanticWhereExpression | null): Extract<SemanticWhereExpression, { kind: 'PREDICATE' }> | null {
  if (!where) return null;
  if (where.kind === 'PREDICATE') return where;
  if (where.kind === 'NOT') return firstPredicateAtom(where.operand);
  for (const op of where.operands) {
    const found = firstPredicateAtom(op);
    if (found) return found;
  }
  return null;
}

const centsLabel = (cents: number): string => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function executeNewStackFacet(
  facet: SemanticFacet,
  owner: MixedStackFacetOwnershipAssignment,
  snapshot: CrossDomainPropertySnapshot,
  role: AskUserRole,
  priorResultsById: ReadonlyMap<string, CrossDomainFacetExecutionResult>,
): CrossDomainFacetExecutionResult {
  const job = facet.evidence.jobMatch;
  const adapterId = owner.adapterId;
  const visibleItems = snapshot.extendedItems.filter((item) => item.propertyId === snapshot.propertyId && !item.isHidden);
  const redactedFieldIds: string[] = [];

  if (job === 'query.maintenance_task.filter' && firstPredicateAtom(facet.where)?.enumStatus === 'COMPLETED') {
    // Completed maintenance. A cost is the recorded actual cost; only when none is recorded is the estimate used, and it is labelled "estimated". A task with neither is
    // unknown (never $0) and is named, not counted as under the threshold. The comparison is strictly greater than.
    const threshold = firstPredicateAtom(facet.where)?.amountOverCents;
    const hasThreshold = typeof threshold === 'number';
    const restricted = hasThreshold && !canSeeRole(role, 'EDITOR');
    if (restricted) redactedFieldIds.push('field.maintenance_task.cost');
    const completed = snapshot.maintenanceTasks.filter((task) => task.propertyId === snapshot.propertyId && task.status === 'COMPLETED');
    const costOf = (task: (typeof completed)[number]): { cents: number; estimated: boolean } | null => {
      if (typeof task.actualCostCents === 'number') return { cents: task.actualCostCents, estimated: false };
      if (typeof task.estimatedCostCents === 'number') return { cents: task.estimatedCostCents, estimated: true };
      return null;
    };
    const matched = hasThreshold && !restricted ? completed.filter((task) => { const cost = costOf(task); return cost !== null && cost.cents > threshold; }) : completed;
    const unknown = hasThreshold && !restricted ? completed.filter((task) => costOf(task) === null) : [];
    const rowFor = (task: (typeof completed)[number]) => {
      const cost = costOf(task);
      const parts = [
        hasThreshold && cost ? `${centsLabel(cost.cents)}${cost.estimated ? ' (estimated)' : ''}` : null,
        task.completedOn ? `Completed ${task.completedOn}` : null,
      ].filter(Boolean);
      return { id: task.id, label: task.title, ...(parts.length > 0 ? { subtitle: parts.join(' · ') } : {}) };
    };
    const rows = matched.map(rowFor);
    const unknownNote = unknown.length > 0
      ? ` ${unknown.length} other completed task${unknown.length === 1 ? ' has' : 's have'} no recorded cost and ${unknown.length === 1 ? 'was' : 'were'} excluded.`
      : '';
    const summary = restricted
      ? 'Maintenance costs are redacted for the VIEWER role.'
      : hasThreshold
        ? (matched.length === 0
          ? `No completed maintenance task has a recorded cost over ${centsLabel(threshold!)}.${unknownNote}`
          : `${matched.length} completed maintenance task${matched.length === 1 ? '' : 's'} ${matched.length === 1 ? 'has' : 'have'} a recorded cost over ${centsLabel(threshold!)}.${unknownNote}`)
        : (matched.length === 0 ? 'No completed maintenance tasks are recorded.' : `${matched.length} completed maintenance task${matched.length === 1 ? ' is' : 's are'} recorded.`);
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'LIST',
      operationAdapter: adapterId,
      sourceType: 'PropertyMaintenanceTask',
      predicateIds: evaluateWherePredicates(facet.where),
      rows: restricted ? [] : rows,
      title: hasThreshold ? `Completed maintenance over ${centsLabel(threshold!)}` : 'Completed maintenance tasks',
      summaryBody: summary,
      variantId: 'variant.maintenance_list',
    });
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const blocks = finalized.blocks.map((block): AskPresentationBlock => {
      if (block.type !== 'GROUPED_LIST') return block;
      return {
        ...block,
        id: 'maintenance-groups',
        title: hasThreshold ? `Completed tasks over ${centsLabel(threshold!)}` : 'Completed maintenance tasks',
        description: `${rows.length} confirmed ${rows.length === 1 ? 'match' : 'matches'}. Open a task for its current maintenance record.`,
        sections: block.sections.map((section) => ({
          ...section,
          items: section.items.map((item) => {
            const facts = rowById.get(item.id)?.subtitle?.split(' · ').filter(Boolean) ?? [];
            return {
              ...item,
              meta: facts,
              status: 'COMPLETED',
              entityType: 'MAINTENANCE_TASK',
              actions: [],
              amountLabel: facts.find((fact) => fact.startsWith('$')) ?? null,
              timingLabel: facts.find((fact) => fact.startsWith('Completed ')) ?? null,
            };
          }),
        })),
      };
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary,
      recordIds: restricted ? [] : rows.map((r) => r.id),
      rows: finalized.rows,
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
      blocks,
    };
  }

  if (job === 'query.maintenance_task.filter') {
    const categories = firstPredicateTargetCategorySet(facet.where);
    const amountOverCents = firstPredicateAtom(facet.where)?.amountOverCents;
    const hasAmountThreshold = typeof amountOverCents === 'number';
    const costRestricted = hasAmountThreshold && !canSeeRole(role, 'EDITOR');
    if (costRestricted) redactedFieldIds.push('field.maintenance_task.cost');
    const costOf = (task: CrossDomainPropertySnapshot['maintenanceTasks'][number]): { cents: number; estimated: boolean } | null => {
      if (typeof task.actualCostCents === 'number') return { cents: task.actualCostCents, estimated: false };
      if (typeof task.estimatedCostCents === 'number') return { cents: task.estimatedCostCents, estimated: true };
      return null;
    };
    const metaByTaskId = new Map(snapshot.maintenanceTaskMeta.map((m) => [m.taskId, m.category]));
    const refLocalYmd = localYmdInTimeZone(snapshot.asOfDate, snapshot.timezone);
    // A calendar-month constraint ("due next month") applies to every branch, including a category question ("plumbing tasks next month"); it used to be read
    // only when no category was named, so the month was silently dropped there (FR-PLAN-5).
    const monthWindow = facet.time?.kind === 'CALENDAR_PERIOD' && facet.time.unit === 'MONTH'
      ? targetYearMonthInTimeZone(snapshot.asOfDate, facet.time.offset, snapshot.timezone)
      : null;
    const dueInWindow = (task: { nextDueDate?: string | Date | null }): boolean => {
      if (!monthWindow) return true;
      if (!task.nextDueDate) return false;
      const dueParts = datePartsInTimeZone(task.nextDueDate as Date | string, snapshot.timezone);
      return dueParts.year === monthWindow.year && dueParts.month === monthWindow.month;
    };
    const timeMatches = snapshot.maintenanceTasks.filter((task) => {
      if (task.propertyId !== snapshot.propertyId) return false;
      if (categories && categories.length > 0) {
        const taskCat = metaByTaskId.get(task.id) ?? 'GENERAL';
        return categories.includes(taskCat) && (task.status === 'PENDING' || task.status === 'IN_PROGRESS') && dueInWindow(task);
      }
      if (monthWindow) {
        return task.status === 'PENDING' && dueInWindow(task);
      }
      return task.status === 'PAST_DUE' || (task.status === 'PENDING' && Boolean(task.nextDueDate) && localYmdInTimeZone(task.nextDueDate, snapshot.timezone) < refLocalYmd);
    });
    const matches = hasAmountThreshold && !costRestricted
      ? timeMatches.filter((task) => { const cost = costOf(task); return cost !== null && cost.cents > amountOverCents; })
      : costRestricted ? [] : timeMatches;
    const unknownCost = hasAmountThreshold && !costRestricted ? timeMatches.filter((task) => costOf(task) === null) : [];
    // The window is stated in the answer so the result can be audited against what "next month" meant.
    const windowLabel = monthWindow
      ? `${new Date(Date.UTC(monthWindow.year, monthWindow.month - 1, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} ${monthWindow.year}`
      : null;
    const rows = matches.map((m) => {
      const cost = costOf(m);
      return {
        id: m.id,
        label: m.title,
        subtitle: [m.nextDueDate ? `Due ${m.nextDueDate}` : null, cost ? `${cost.estimated ? 'Estimated cost' : 'Recorded cost'} ${centsLabel(cost.cents)}` : 'Cost not recorded'].filter(Boolean).join(' · '),
      };
    });
    const unknownCostNote = unknownCost.length
      ? ` ${unknownCost.length} otherwise-matching task${unknownCost.length === 1 ? ' has' : 's have'} no recorded estimate or actual cost and ${unknownCost.length === 1 ? 'was' : 'were'} left out.`
      : '';
    const summary = costRestricted
      ? 'Maintenance costs are available to a contributor or owner, so this cost-filtered list is not shown.'
      : windowLabel
      ? (matches.length === 0
        ? `No maintenance tasks due in ${windowLabel} have ${hasAmountThreshold ? `a recorded cost over ${centsLabel(amountOverCents)}` : 'a matching due date'} (the whole calendar month, in your home’s time zone).${unknownCostNote}`
        : `${matches.length} maintenance task(s) due in ${windowLabel}${hasAmountThreshold ? ` with a recorded cost over ${centsLabel(amountOverCents)}` : ''} (the whole calendar month, in your home’s time zone): ${matches.map((m) => m.title).join(', ')}.${unknownCostNote}`)
      : (matches.length === 0 ? 'No matching maintenance tasks found.' : `${matches.length} maintenance task(s): ${matches.map((m) => m.title).join(', ')}.`);
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
      blocks: finalized.blocks,
    };
  }

  // Wave 1/4: missing manual and/or receipt. The plan's own conditions are evaluated: "neither a manual nor a receipt" (both missing) and "missing a manual or a receipt"
  // (at least one missing). The branch used to filter on "both missing" whatever the plan said.
  if (job === 'query.inventory_item.relation_boolean' && facet.relations.some((r) => r.semanticRelationId === 'relation.inventory_item.manual_document')) {
    const documentHeld = (item: { manualDocumentId?: string | null; receiptDocumentId?: string | null }, predicateId: string) => (predicateId === 'predicate.inventory_item.has_manual_record' ? Boolean(item.manualDocumentId) : Boolean(item.receiptDocumentId));
    const evaluateDocuments = (expr: SemanticWhereExpression | null | undefined, item: { manualDocumentId?: string | null; receiptDocumentId?: string | null }): boolean => {
      if (!expr) return !item.manualDocumentId && !item.receiptDocumentId;
      if (expr.kind === 'PREDICATE') return documentHeld(item, expr.predicateId);
      if (expr.kind === 'NOT') return !evaluateDocuments(expr.operand, item);
      return expr.kind === 'AND' ? expr.operands.every((operand) => evaluateDocuments(operand, item)) : expr.operands.some((operand) => evaluateDocuments(operand, item));
    };
    const eitherMissing = facet.where?.kind === 'OR';
    const matches = visibleItems.filter((item) => evaluateDocuments(facet.where, item));
    const rows = matches.map((m) => ({ id: m.id, label: m.name }));
    const summary = eitherMissing
      ? `${matches.length} inventory item(s) are missing a manual, a receipt, or both: ${matches.map((m) => m.name).join(', ')}.`
      : `${matches.length} inventory item(s) have neither a manual nor a receipt: ${matches.map((m) => m.name).join(', ')}.`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: facet.projection === 'COUNT' ? 'COUNT' : 'LIST',
      operationAdapter: adapterId,
      sourceType: 'InventoryItem',
      predicateIds: evaluateWherePredicates(facet.where),
      rows,
      title: eitherMissing ? 'Items missing a manual or a receipt' : 'Items without manual or receipt',
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
      blocks: finalized.blocks,
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
    const sub = executeSemanticSlice({
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
            // The governed next step the slice chose for this row survives the compound assembly (Action Enrichment FRD).
            ...(item.entityType && item.actions && item.actions.length > 0 ? { entityType: item.entityType, actions: item.actions as ReadonlyArray<Record<string, unknown>> } : {}),
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
      blocks: sub.operationResult.blocks,
    };
  }

  // Change over time ("how has my property tax changed"): the declared time series, one active record per tax year, oldest first.
  if (job === 'query.property_tax.change_over_time') {
    const fieldId = facet.fields[0]?.fieldId ?? '';
    const pointId = TAX_SERIES_FIELD_POINT_IDS[fieldId] ?? '';
    const point = DATA_POINT_BY_ID.get(pointId);
    const blocked = (summary: string, extraRedacted: readonly string[] = []): CrossDomainFacetExecutionResult => ({
      facetId: facet.id, owner, status: 'BLOCKED', summary, recordIds: [], missingSlots: [],
      redactedFieldIds: [...redactedFieldIds, ...extraRedacted], receipt: null, entailment: null, presentationEquivalence: null,
    });
    if (!point) return blocked('That tax history is not one I can show yet.');
    const requiredRole: AskUserRole = point.audience === 'OWNER' ? 'OWNER' : point.audience === 'CONTRIBUTOR' ? 'EDITOR' : 'VIEWER';
    if (!canSeeRole(role, requiredRole)) return blocked(`${point.label} is only shown to the home’s ${requiredRole === 'OWNER' ? 'owner' : 'owner and contributors'}, so I can't show how it changed.`, [fieldId]);
    const rawSeries = snapshot.taxSeries?.[pointId];
    if (!rawSeries) return blocked('I could not load your tax history right now, so I will not say how it changed.');

    const label = pointId === 'taxAssessment.totalAssessedValue' ? 'total assessed value' : 'property tax bill';
    const money = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
    const series = rawSeries.filter((row) => row.propertyId === snapshot.propertyId).sort((a, b) => a.taxYear - b.taxYear || a.id.localeCompare(b.id));
    const known = series.filter((row): row is CrossDomainTaxSeriesRow & { value: number } => row.value !== null);
    const lines: string[] = [];
    let title: string;
    if (series.length === 0) {
      title = `No ${label} history recorded`;
      lines.push(`I don’t have any active ${label} records for this home, so there is no change to show.`);
    } else if (known.length < 2) {
      title = `Only ${known.length === 1 ? 'one' : 'no'} ${label} on record`;
      lines.push(`I have ${series.length} tax ${plural(series.length, 'year', 'years')} on record${known.length === 1 ? `: ${known[0].taxYear} was ${money(known[0].value)}` : ' with no amount'}. I need at least two years with an amount to show a change.`);
    } else {
      const first = known[0];
      const last = known[known.length - 1];
      const diff = last.value - first.value;
      const pct = first.value ? (diff / first.value) * 100 : null;
      title = `${label[0].toUpperCase()}${label.slice(1)}: ${diff === 0 ? 'unchanged' : diff > 0 ? 'up' : 'down'} since ${first.taxYear}`;
      lines.push(`${known.map((row, i) => `${row.taxYear}: ${money(row.value)}${i ? ` (${row.value - known[i - 1].value >= 0 ? '+' : '−'}${money(Math.abs(row.value - known[i - 1].value))})` : ''}`).join('; ')}.`);
      lines.push(`From ${first.taxYear} to ${last.taxYear} it ${diff === 0 ? 'did not change' : `${diff > 0 ? 'rose' : 'fell'} by ${money(Math.abs(diff))}${pct === null ? '' : ` (${Math.abs(pct).toFixed(1)}%)`}`}.`);
      if (known.length < series.length) lines.push(`${series.length - known.length} ${plural(series.length - known.length, 'year has', 'years have')} no amount recorded and ${plural(series.length - known.length, 'is', 'are')} left out.`);
      lines.push('Based on the active tax records on file, one per tax year.');
    }
    // Years with no recorded amount are an unknown population, never folded into the change.
    const rows = known.map((row) => ({ id: row.id, label: String(row.taxYear), subtitle: money(row.value) }));
    const summary = lines.join(' ');
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'TIMELINE',
      operationAdapter: adapterId,
      sourceType: pointId === 'taxAssessment.totalAssessedValue' ? 'PropertyTaxAssessmentRecord' : 'PropertyTaxBillRecord',
      predicateIds: ['predicate.property_tax.history'],
      rows,
      unknownCount: series.length - known.length,
      title,
      summaryBody: summary,
      variantId: 'variant.property_tax_history',
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
      blocks: finalized.blocks,
    };
  }

  // Field absence ("which appliances have no serial number recorded"): items whose registered column holds nothing. "Not recorded" is
  // reported as exactly that; it never claims the real-world value does not exist (FR-QUERY-4).
  if (job === 'query.inventory_item.field_absence' || job === 'query.inventory_item.service_gap') {
    const fieldId = facet.fields[0]?.fieldId ?? '';
    const point = DATA_POINT_BY_ID.get(INVENTORY_ABSENCE_FIELD_POINT_IDS[fieldId] ?? '');
    const blocked = (summary: string, extraRedacted: readonly string[] = []): CrossDomainFacetExecutionResult => ({
      facetId: facet.id, owner, status: 'BLOCKED', summary, recordIds: [], missingSlots: [],
      redactedFieldIds: [...redactedFieldIds, ...extraRedacted], receipt: null, entailment: null, presentationEquivalence: null,
    });
    if (!point) return blocked('That item detail is not one I can check for missing records yet.');
    // Audience floors come from the data-point catalogue (CONTRIBUTOR maps to the executor's EDITOR rank). The same floor gates the
    // existence of a gap, not only its value: a viewer is never told which items lack a restricted field.
    const requiredRole: AskUserRole = point.audience === 'OWNER' ? 'OWNER' : point.audience === 'CONTRIBUTOR' ? 'EDITOR' : 'VIEWER';
    if (!canSeeRole(role, requiredRole)) return blocked(`The ${point.label.replace(/^The /, '').toLowerCase()} is only shown to the home’s ${requiredRole === 'OWNER' ? 'owner' : 'owner and contributors'}, so I can't check which items lack it.`, [fieldId]);
    if (!snapshot.inventoryFieldRecords) return blocked('I could not load your inventory details right now, so I will not say which items are missing a value.');

    // Service gap ("not serviced in over a year" / "never serviced"): the last-service date against an elapsed window. Items with no
    // service date at all are an UNKNOWN population when a window is asked (nothing proves they were left unserviced), and the
    // confirmed gap is only what a recorded date proves.
    if (job === 'query.inventory_item.service_gap') {
      const window = facet.time?.kind === 'ELAPSED_WINDOW' ? facet.time : null;
      const asOf = /^(\d{4})-(\d{2})-(\d{2})/.exec(snapshot.asOfDate);
      if (facet.time && !window) return blocked('I could not read the time window in that question.');
      if (!asOf) return blocked('I could not tell today’s date, so I will not judge how long ago items were serviced.');
      const records = snapshot.inventoryFieldRecords.filter((record) => record.propertyId === snapshot.propertyId);
      const dateOf = (value: unknown): string | null => {
        if (value === null || value === undefined || value === '') return null;
        const text = value instanceof Date ? value.toISOString() : String(value);
        return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
      };
      let cutoff: string | null = null;
      if (window) {
        const cut = new Date(Date.UTC(Number(asOf[1]), Number(asOf[2]) - 1, Number(asOf[3])));
        if (window.unit === 'YEAR') cut.setUTCFullYear(cut.getUTCFullYear() - window.count);
        else cut.setUTCMonth(cut.getUTCMonth() - window.count);
        cutoff = cut.toISOString().slice(0, 10);
      }
      const byName = (a: { name: string; id: string }, b: { name: string; id: string }) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
      const undated = records.filter((record) => dateOf(record.values[point.field]) === null).sort(byName);
      const confirmed = (cutoff
        ? records.filter((record) => { const d = dateOf(record.values[point.field]); return d !== null && d < cutoff; })
        : undated).sort(byName);
      const unknown = cutoff ? undated : [];
      const windowText = window ? `${window.count} ${window.unit === 'YEAR' ? 'year' : 'month'}${window.count === 1 ? '' : 's'}` : '';
      const projection: SemanticReadReceipt['projection'] = facet.projection === 'COUNT' ? 'COUNT' : facet.projection === 'DETAIL' ? 'DETAIL' : 'LIST';
      const named = (list: ReadonlyArray<{ name: string }>) => `${list.slice(0, 10).map((record) => record.name).join('; ')}${list.length > 10 ? `; and ${list.length - 10} more` : ''}`;
      const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
      const lines: string[] = [];
      if (cutoff) {
        lines.push(confirmed.length === 0
          ? `Every item with a service date was serviced within ${windowText}.`
          : projection === 'COUNT'
            ? `${confirmed.length} of your items ${plural(confirmed.length, 'was', 'were')} last serviced more than ${windowText} ago.`
            : `${named(confirmed)} ${plural(confirmed.length, 'was', 'were')} last serviced more than ${windowText} ago.`);
        if (unknown.length > 0) lines.push(`${unknown.length} more ${plural(unknown.length, 'has', 'have')} no service date at all, so ${plural(unknown.length, 'it may', 'they may')} have been serviced without being recorded.`);
      } else {
        lines.push(confirmed.length === 0
          ? 'Every item has a service date recorded.'
          : projection === 'COUNT'
            ? `${confirmed.length} of your items ${plural(confirmed.length, 'has', 'have')} no service recorded.`
            : `${named(confirmed)} ${plural(confirmed.length, 'has', 'have')} no service recorded.`);
        if (confirmed.length > 0) lines.push('“Not recorded” means nothing is saved for it yet, not that it was never serviced.');
      }
      const rows = confirmed.map((record) => ({ id: record.id, label: record.name }));
      const summary = lines.join(' ');
      const finalized = finalizeReceiptAndPresentation({
        facet,
        snapshot,
        role,
        projection,
        operationAdapter: adapterId,
        sourceType: 'InventoryItem',
        predicateIds: ['predicate.inventory_item.service_gap'],
        rows,
        unknownCount: unknown.length,
        title: cutoff
          ? (confirmed.length === 0 ? 'Nothing is overdue for service' : `${confirmed.length} ${plural(confirmed.length, 'item', 'items')} not serviced in over ${windowText}`)
          : (confirmed.length === 0 ? 'Every item has a service date' : `${confirmed.length} ${plural(confirmed.length, 'item has', 'items have')} no service recorded`),
        summaryBody: summary,
        variantId: 'variant.inventory_service_gap',
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
      blocks: finalized.blocks,
      };
    }

    const label = point.label.replace(/^The /, '').replace(/^When it was /, '').toLowerCase();
    const isMissing = (value: unknown): boolean => value === null || value === undefined || (point.family === 'text' && String(value).trim() === '');
    const missing = snapshot.inventoryFieldRecords
      .filter((record) => record.propertyId === snapshot.propertyId)
      .filter((record) => isMissing(record.values[point.field]))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const rows = missing.map((record) => ({ id: record.id, label: record.name }));
    const projection: SemanticReadReceipt['projection'] = facet.projection === 'COUNT' ? 'COUNT' : facet.projection === 'DETAIL' ? 'DETAIL' : 'LIST';
    const names = `${missing.slice(0, 10).map((record) => record.name).join('; ')}${missing.length > 10 ? `; and ${missing.length - 10} more` : ''}`;
    const summary = [
      missing.length === 0
        ? `None of your inventory items is missing a ${label}.`
        : projection === 'COUNT'
          ? `${missing.length} of your items ${missing.length === 1 ? 'has' : 'have'} no ${label} recorded.`
          : `${names} ${missing.length === 1 ? 'has' : 'have'} no ${label} recorded.`,
      ...(missing.length > 0 ? ['“Not recorded” means nothing is saved for it yet, not that it does not exist.'] : []),
    ].join(' ');
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection,
      operationAdapter: adapterId,
      sourceType: 'InventoryItem',
      predicateIds: ['predicate.inventory_item.field_not_recorded'],
      rows,
      title: missing.length === 0 ? `Every item has its ${label} recorded` : `${missing.length} ${missing.length === 1 ? 'item has' : 'items have'} no ${label} recorded`,
      summaryBody: summary,
      variantId: 'variant.inventory_field_absence',
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
      blocks: finalized.blocks,
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
      blocks: finalized.blocks,
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
      blocks: finalized.blocks,
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
        ? 'No insurance policy is recorded for this home, so no deductible can be determined.'
        : policies.length === 1
          ? (policies[0].deductibleRecorded === false
            ? `A ${policies[0].carrierName} policy is recorded, but no deductible is recorded on it, so I can’t tell you the amount.`
            : `Insurance deductible: $${(policies[0].deductibleCents / 100).toFixed(2)} (${policies[0].carrierName}).`)
          : `Deductibles by policy: ${policies.map((p) => `${p.carrierName} ${p.deductibleRecorded === false ? 'not recorded' : `$${(p.deductibleCents / 100).toFixed(2)}`}`).join('; ')}.`;
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
      blocks: finalized.blocks,
    };
  }

  if (job === 'query.claim.filter') {
    // The plan's own conditions are applied: status (open) and/or claim type. This branch used to ignore `facet.where` and always listed open claims.
    const atoms: Array<Extract<SemanticWhereExpression, { kind: 'PREDICATE' }>> = [];
    const collect = (expr: SemanticWhereExpression | null | undefined): void => {
      if (!expr) return;
      if (expr.kind === 'PREDICATE') atoms.push(expr);
      else if (expr.kind === 'NOT') collect(expr.operand);
      else expr.operands.forEach(collect);
    };
    collect(facet.where);
    const wantsOpen = atoms.some((atom) => atom.predicateId === 'predicate.claim.has_status' && atom.enumStatus === 'OPEN');
    const wantedTypes = [...new Set(atoms.filter((atom) => atom.predicateId === 'predicate.claim.has_type').map((atom) => String(atom.enumStatus)))];
    const inProperty = snapshot.claims.filter((c) => c.propertyId === snapshot.propertyId);
    // "Open" is the claims page's own definition (draft, in progress, submitted, under review), so this answer and that page agree.
    const matchesStatus = (c: CrossDomainClaimRecord) => !wantsOpen || (c.rawStatus ? OPEN_CLAIM_STATUSES.includes(c.rawStatus) : c.status === 'OPEN');
    const untyped = wantedTypes.length > 0 ? inProperty.filter((c) => matchesStatus(c) && !c.claimType) : [];
    const openClaims = inProperty.filter((c) => matchesStatus(c) && (wantedTypes.length === 0 || (c.claimType !== undefined && wantedTypes.includes(c.claimType))));
    const CLAIM_TYPE_WORDS: Record<string, string> = {
      WATER_DAMAGE: 'water damage', FIRE_SMOKE: 'fire or smoke', STORM_WIND_HAIL: 'storm, wind or hail', THEFT_VANDALISM: 'theft or vandalism', LIABILITY: 'liability',
    };
    const typeWords = wantedTypes.map((claimType) => CLAIM_TYPE_WORDS[claimType] ?? claimType.toLowerCase().replace(/_/g, ' ')).join(' or ');
    const kind = `${wantsOpen ? 'open ' : ''}${typeWords ? `${typeWords} ` : ''}claim`;
    // The same row the claims list builds: it opens the canonical claim inline, with its legal status changes.
    const claimActions = claimItemActions((role === 'VIEWER' ? 'VIEWER' : 'CONTRIBUTOR') as Parameters<typeof claimItemActions>[0]);
    const rows = openClaims.map((c) => ({
      id: c.id, label: c.title,
      ...(c.claimType ? { description: `Filed as ${c.claimType.toLowerCase().replace(/_/g, ' ')}` } : {}),
      meta: [(c.rawStatus ?? c.status).toLowerCase().replace(/_/g, ' ')],
      status: c.rawStatus ?? c.status, entityType: 'CLAIM', actions: claimActions,
    }));
    const summary = wantedTypes.length === 0
      ? `${openClaims.length} open claim(s): ${openClaims.map((c) => c.title).join(', ')}.`
      : openClaims.length === 0
        ? `No ${kind}s are recorded (by the type each claim was filed under).`
        : `${openClaims.length} ${kind}${openClaims.length === 1 ? '' : 's'} (by the type each claim was filed under): ${openClaims.map((c) => c.title).join(', ')}.`;
    const summaryWithNote = untyped.length > 0 ? `${summary} ${untyped.length} claim${untyped.length === 1 ? ' has' : 's have'} no recorded type and ${untyped.length === 1 ? 'is' : 'are'} not counted.` : summary;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'LIST',
      operationAdapter: adapterId,
      sourceType: 'Claim',
      predicateIds: facet.relations.length > 0 ? [...new Set(facet.relations.map((r) => r.predicateId))] : ['predicate.claim.has_status'],
      rows,
      listId: 'incident-claim-list',
      title: wantedTypes.length === 0 ? 'Open claims' : `${kind.charAt(0).toUpperCase()}${kind.slice(1)}s`,
      summaryBody: summaryWithNote,
      variantId: 'variant.open_claims',
    });
    return {
      facetId: facet.id,
      owner,
      status: 'EXECUTED',
      summary: summaryWithNote,
      recordIds: rows.map((r) => r.id),
      rows: finalized.rows,
      missingSlots: [],
      redactedFieldIds,
      receipt: finalized.receipt,
      entailment: finalized.entailment,
      presentationEquivalence: finalized.equivalence,
      blocks: finalized.blocks,
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
            missingRows.push({ id: `${claim.id}:${reqType}`, label: `${claim.title}: missing ${humanizePresentationToken(reqType)}` });
          }
        }
      }
      // A claim that lists no required documents cannot be "missing" any: it was not checked. Saying "no missing documents" over such claims would read as
      // "everything required is present", which nothing here established.
      const claimsWithRequirements = authorizedClaims.filter((claim) => claim.requiredDocumentTypes.length > 0).length;
      const unchecked = authorizedClaims.length - claimsWithRequirements;
      const uncheckedNote = unchecked > 0 && claimsWithRequirements > 0 ? ` ${unchecked} other claim${unchecked === 1 ? ' lists' : 's list'} no required documents, so ${unchecked === 1 ? 'it was' : 'they were'} not checked.` : '';
      const summary = missingRows.length > 0
        ? `${missingRows.length} missing claim document requirement(s): ${missingRows.map((r) => r.label).join(', ')}.${uncheckedNote}`
        : authorizedClaims.length === 0
          ? 'No claims are recorded, so there are no claim documents to check.'
          : claimsWithRequirements === 0
            ? `${authorizedClaims.length} claim${authorizedClaims.length === 1 ? ' is' : 's are'} recorded, but ${authorizedClaims.length === 1 ? 'it lists no' : 'none of them lists any'} required documents, so I can’t tell whether anything is missing.`
            : `Nothing is missing: every required document type listed for ${claimsWithRequirements} claim${claimsWithRequirements === 1 ? '' : 's'} has a linked document.${uncheckedNote}`;
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
      blocks: finalized.blocks,
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
      blocks: finalized.blocks,
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
      : `Total repair spend in ${targetYear}: $${(totalCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} across ${events.length} ${events.length === 1 ? 'repair' : 'repairs'}.`;
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
      blocks: finalized.blocks,
      metrics: { totalRepairSpendCents: restricted ? null : totalCents, targetYear },
    };
  }

  if (job === 'query.property_tax_bill.compare_years') {
    const refYear = datePartsInTimeZone(snapshot.asOfDate, snapshot.timezone).year;
    const activeBills = snapshot.taxBills.filter((b) => b.propertyId === snapshot.propertyId && b.lifecycleStatus === 'ACTIVE');
    const thisYearBill = activeBills.find((b) => b.taxYear === refYear) ?? null;
    const lastYearBill = activeBills.find((b) => b.taxYear === refYear - 1) ?? null;
    const comparedBills = [lastYearBill, thisYearBill].filter((b): b is CrossDomainTaxBillRecord => b !== null);
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
      blocks: finalized.blocks,
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
      blocks: finalized.blocks,
    };
  }

  if (job === 'job.finance.own_rent_break_even' || job === 'job.finance.refinance_break_even') {
    const slots = snapshot.financeSlots;
    const missingSlots: string[] = [];
    if (job === 'job.finance.own_rent_break_even') {
      // The saved Sell/Hold/Rent analysis compares selling now, keeping the home to live in, and renting it OUT. It is not the owning-versus-renting-as-a-tenant comparison
      // this question asks for, so it never supplies the verdict (live UI review 2026-11-21, P0 #1). The verdict comes from the crossover model, which needs the rent a tenant
      // would pay for a comparable home and the home's value; without them the answer says plainly that it cannot be worked out yet and shows the saved analysis only as
      // separate context.
      const hasSavedNet =
        typeof slots?.netHoldCents === 'number' && Number.isFinite(slots.netHoldCents)
        && typeof slots?.netRentCents === 'number' && Number.isFinite(slots.netRentCents);
      const savedWinner = typeof slots?.sellHoldRentWinner === 'string' && slots.sellHoldRentWinner.trim().length > 0 ? slots.sellHoldRentWinner.toUpperCase() : null;

      if (!slots?.horizonYears) missingSlots.push('horizonYears');
      if (!slots?.monthlyRentCents) missingSlots.push('monthlyRentCents');
      if (!slots?.homeValueCents) missingSlots.push('homeValueCents');

      const ownRentResult = missingSlots.length === 0 && slots
        ? computeOwnVsRentBreakEven({ ...slots, netHoldCents: null, netRentCents: null, sellHoldRentWinner: null })
        : null;
      const status = missingSlots.length > 0 ? 'PARTIAL_MISSING_SLOTS' : 'EXECUTED';
      const formatSignedDollars = (cents: number): string =>
        cents < 0 ? `-$${(Math.abs(cents) / 100).toFixed(2)}` : `$${(cents / 100).toFixed(2)}`;
      // The saved analysis, said in words and kept apart from the answer: HOLD keeps the home to live in, RENT keeps it and rents it OUT, SELL sells now.
      const winnerWords: Record<string, string> = {
        SELL: 'it favors selling now',
        HOLD: 'it favors keeping the home to live in',
        RENT: 'it favors keeping the home and renting it out',
      };
      const wholeDollars = (cents: number): string => `$${Math.round(cents / 100).toLocaleString('en-US')}`;
      const savedHorizon = Math.max(1, Math.round(slots?.horizonYears ?? 5));
      const savedAdvantageWords = hasSavedNet
        ? (slots!.netHoldCents! - slots!.netRentCents!) < 0
          ? `renting it out beats keeping the home by ${wholeDollars(Math.abs(slots!.netHoldCents! - slots!.netRentCents!))} over ${savedHorizon} years`
          : `keeping the home beats renting it out by ${wholeDollars(slots!.netHoldCents! - slots!.netRentCents!)} over ${savedHorizon} years`
        : null;
      const savedAnalysisContext = savedWinner || hasSavedNet
        ? ` Your saved Sell/Hold/Rent analysis is a different comparison (selling now, living in the home, or renting it out): ${[savedWinner ? (winnerWords[savedWinner] ?? `winner ${savedWinner}`) : null, savedAdvantageWords].filter(Boolean).join('; ')}.`
        : '';
      const missingWords: Record<string, string> = {
        horizonYears: 'how many years you plan to stay',
        monthlyRentCents: 'the monthly rent for a comparable home you would rent as a tenant',
        homeValueCents: 'your home’s value',
      };

      const baseSummary = ownRentResult === null
        ? `I can’t determine the owning-versus-renting break-even yet. It needs ${missingSlots.map((slot) => missingWords[slot] ?? slot).join(', ')}.${savedAnalysisContext}`
        : ownRentResult.crossoverYear === null
          ? `Owning does not beat renting within the 30-year analysis window at $${(slots!.monthlyRentCents! / 100).toFixed(2)}/mo rent and $${(slots!.homeValueCents! / 100).toFixed(2)} home value (estimated ${ownRentResult.horizonYears}-year net advantage ${ownRentResult.ownAdvantageAtHorizonCents !== null ? formatSignedDollars(ownRentResult.ownAdvantageAtHorizonCents) : 'unavailable'}).`
          : ownRentResult.breaksEvenWithinHorizon
            ? `Owning beats renting starting in year ${ownRentResult.crossoverYear} (within your ${ownRentResult.horizonYears}-year horizon${ownRentResult.ownAdvantageAtHorizonCents !== null && ownRentResult.cumulativeRentAtHorizonCents !== null ? `; estimated net owning advantage ${formatSignedDollars(ownRentResult.ownAdvantageAtHorizonCents)} vs $${(ownRentResult.cumulativeRentAtHorizonCents / 100).toFixed(2)} cumulative rent` : ''}).`
            : `Owning beats renting in year ${ownRentResult.crossoverYear}, which is beyond your ${ownRentResult.horizonYears}-year horizon.`;
      const summary = baseSummary;

      const rows = status === 'EXECUTED'
        ? [{
            id: snapshot.propertyId,
            label: 'Own-vs-rent break-even analysis',
            ...(!ownRentResult?.hasPersistedOutcome && ownRentResult?.crossoverYear !== null && ownRentResult?.crossoverYear !== undefined
              ? { subtitle: `Crossover year ${ownRentResult.crossoverYear} (${ownRentResult.horizonYears}-year horizon)` }
              : {}),
          }]
        : [];
      // The presentation: a conclusion with key facts and assumptions, or what cannot be determined yet. The receipt keeps its one analysis result; nothing is rendered as a row.
      const ownRentAnalysis: Omit<SliceAnalysisInput, 'receipt'> = ownRentResult === null
        ? {
            headline: 'I can’t determine the owning-versus-renting break-even yet.',
            supportLine: `It needs ${missingSlots.map((slot) => missingWords[slot] ?? slot).join(', ')}.`,
            cannotDetermine: true,
            ...(savedAnalysisContext ? { note: { title: 'About your saved analysis', body: savedAnalysisContext.trim() } } : {}),
          }
        : (() => {
            const horizon = ownRentResult.horizonYears;
            const rentNow = wholeDollars(slots!.monthlyRentCents!);
            const homeValue = wholeDollars(slots!.homeValueCents!);
            const advantage = ownRentResult.ownAdvantageAtHorizonCents;
            const headline = ownRentResult.crossoverYear === null
              ? 'Owning does not beat renting within 30 years.'
              : ownRentResult.breaksEvenWithinHorizon
                ? `Owning beats renting starting in year ${ownRentResult.crossoverYear}.`
                : `Owning beats renting in year ${ownRentResult.crossoverYear}, beyond your ${horizon}-year horizon.`;
            return {
              headline,
              supportLine: `At ${rentNow} a month in rent and a ${homeValue} home, over ${horizon} years.`,
              facts: [
                ...(ownRentResult.crossoverYear !== null ? [{ label: 'Break-even year', value: `Year ${ownRentResult.crossoverYear}` }] : []),
                ...(advantage !== null ? [{ label: advantage >= 0 ? `Estimated owning advantage at ${horizon} years` : `Estimated renting advantage at ${horizon} years`, value: wholeDollars(Math.abs(advantage)) }] : []),
                ...(ownRentResult.cumulativeRentAtHorizonCents !== null ? [{ label: `Rent paid over ${horizon} years`, value: wholeDollars(ownRentResult.cumulativeRentAtHorizonCents) }] : []),
              ],
              assumptions: [
                `Monthly rent for a comparable home: ${rentNow}, rising 3% a year`,
                `Home value: ${homeValue}, growing 3.5% a year`,
                `80% financed at ${((slots!.currentRateBps ?? 650) / 100).toFixed(2)}%${slots!.currentRateBps ? '' : ' (assumed)'}`,
                'Carrying costs of 2.2% of the home’s value a year',
                'Selling and closing costs of 6% of the home’s value',
              ],
            };
          })();
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
        family: 'ANALYSIS',
        analysis: ownRentAnalysis,
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
      blocks: finalized.blocks,
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
    const refiMissingWords: Record<string, string> = {
      currentRateBps: 'your current rate', candidateRateBps: 'the new rate you are considering', closingCostsCents: 'the closing costs', loanBalanceCents: 'your loan balance',
    };
    const refiAnalysis: Omit<SliceAnalysisInput, 'receipt'> = missingSlots.length > 0 || !refiResult
      ? {
          headline: 'I can’t work out the refinance break-even yet.',
          supportLine: `It needs ${missingSlots.map((slot) => refiMissingWords[slot] ?? slot).join(', ')}.`,
          cannotDetermine: true,
        }
      : (() => {
          const current = `${(slots!.currentRateBps! / 100).toFixed(2)}%`;
          const candidate = `${(slots!.candidateRateBps! / 100).toFixed(2)}%`;
          const noSavings = refiResult.monthlySavingsCents !== null && refiResult.monthlySavingsCents <= 0;
          const headline = noSavings
            ? 'Refinancing would not lower your monthly payment at these rates.'
            : refiResult.breaksEvenWithinHorizon
              ? `Refinancing breaks even in ${refiResult.breakEvenMonths} ${refiResult.breakEvenMonths === 1 ? 'month' : 'months'}.`
              : `Refinancing breaks even in ${refiResult.breakEvenMonths} ${refiResult.breakEvenMonths === 1 ? 'month' : 'months'}, longer than your ${horizonYears}-year horizon.`;
          return {
            headline,
            supportLine: `From ${current} to ${candidate} with ${wholeDollars(slots!.closingCostsCents!)} in closing costs.`,
            facts: [
              ...(refiResult.monthlySavingsCents !== null ? [{ label: 'Monthly savings', value: wholeDollars(refiResult.monthlySavingsCents) }] : []),
              ...(refiResult.breakEvenMonths !== null ? [{ label: 'Break-even', value: `${refiResult.breakEvenMonths} ${refiResult.breakEvenMonths === 1 ? 'month' : 'months'}` }] : []),
              { label: 'Your horizon', value: `${horizonYears} ${horizonYears === 1 ? 'year' : 'years'}` },
            ],
            assumptions: [
              `Current rate ${current}, new rate ${candidate}`,
              `Closing costs of ${wholeDollars(slots!.closingCostsCents!)}`,
              ...(typeof slots!.loanBalanceCents === 'number' && slots!.loanBalanceCents > 0 ? [`Loan balance of ${wholeDollars(slots!.loanBalanceCents)}`] : []),
            ],
          };
        })();
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
      family: 'ANALYSIS',
      analysis: refiAnalysis,
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
      blocks: finalized.blocks,
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
    // "None found" is only as strong as the data it was matched on: an item with no model number recorded cannot be matched to a recall, and a match list
    // is not a guarantee that no recall exists. So the answer says what was checked and what could not be.
    const unmatchable = visibleItems.filter((item) => !item.modelNumber).length;
    const summary = matches.length > 0
      ? `${matches.length} recall match(es) to review: ${matches.map((m) => m.title).join(', ')}.`
      : visibleItems.length === 0
        ? 'No inventory items are recorded, so there is nothing to check recalls against.'
        : `No open recall matches are recorded for your ${visibleItems.length} item${visibleItems.length === 1 ? '' : 's'}.${unmatchable > 0 ? ` ${unmatchable} of them ${unmatchable === 1 ? 'has' : 'have'} no model number recorded, so ${unmatchable === 1 ? 'it' : 'they'} can’t be matched against recalls.` : ''} This reflects the recall matches already found for this home, not a guarantee that no recall exists.`;
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
      blocks: finalized.blocks,
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
      blocks: finalized.blocks,
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
      blocks: finalized.blocks,
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
      blocks: finalized.blocks,
    };
  }

  if (job === 'job.seller.listing_readiness') {
    const mine = snapshot.sellerReadinessItems.filter((s) => s.propertyId === snapshot.propertyId);
    // Most urgent first: what blocks a sale, then what needs a professional, then what needs checking, then improvements and presentation.
    const CLASS_ORDER = ['MATERIAL_BLOCKER', 'PROFESSIONAL_DECISION', 'VERIFICATION_NEEDED', 'OPTIONAL_IMPROVEMENT', 'PRESENTATION'];
    const CLASS_LABEL: Record<string, string> = {
      MATERIAL_BLOCKER: 'Could block a sale', PROFESSIONAL_DECISION: 'Needs a professional’s decision', VERIFICATION_NEEDED: 'Needs checking',
      OPTIONAL_IMPROVEMENT: 'Optional improvements', PRESENTATION: 'Presentation',
    };
    const rank = (item: { requirementClass?: string }) => { const index = CLASS_ORDER.indexOf(item.requirementClass ?? ''); return index < 0 ? CLASS_ORDER.length : index; };
    const pending = mine.filter((s) => s.status === 'PENDING').sort((a, b) => rank(a) - rank(b));
    const waived = mine.filter((s) => s.status === 'WAIVED').length;
    const rows = pending.map((s) => ({ id: s.id, label: s.title, groupKey: CLASS_LABEL[s.requirementClass ?? ''] ?? 'Other' }));
    const counts = CLASS_ORDER.map((cls) => ({ cls, count: pending.filter((s) => s.requirementClass === cls).length })).filter((entry) => entry.count > 0);
    const breakdown = counts.length > 0 ? ` ${counts.map((entry) => `${entry.count} ${CLASS_LABEL[entry.cls].toLowerCase()}`).join(', ')}.` : '';
    const mostUrgent = pending.slice(0, 5).map((p) => p.title);
    const summary = pending.length === 0
      ? `No seller readiness items are still open before listing.${waived > 0 ? ` ${waived} waived item${waived === 1 ? ' is' : 's are'} not counted.` : ''}`
      : `${pending.length} seller readiness item${pending.length === 1 ? ' is' : 's are'} still open before listing.${breakdown} Most urgent: ${mostUrgent.join(', ')}${pending.length > mostUrgent.length ? `, and ${pending.length - mostUrgent.length} more below` : ''}.${waived > 0 ? ` ${waived} waived item${waived === 1 ? ' is' : 's are'} not counted.` : ''}`;
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
      blocks: finalized.blocks,
    };
  }

  if (job === 'query.permit.filter') {
    // Permit records. The authority's status (`officialStatus`) decides open, expired and finaled; what the household reported is shown beside it and never replaces it.
    // "Open" means not yet closed out: the official status is not finaled, expired or voided. A record whose official status is not confirmed counts as open, and is named.
    const view = firstPredicateAtom(facet.where)?.enumStatus === 'EXPIRED' ? 'EXPIRED' : firstPredicateAtom(facet.where)?.enumStatus === 'FINALED' ? 'FINALED' : 'OPEN';
    const records = snapshot.permits.filter((permit) => permit.propertyId === snapshot.propertyId);
    const closed = new Set(['FINALED', 'EXPIRED', 'VOIDED']);
    const matched = records.filter((permit) => (view === 'OPEN' ? !closed.has(permit.officialStatus) : permit.officialStatus === view));
    const unconfirmed = matched.filter((permit) => permit.officialStatus === 'UNKNOWN');
    const nameOf = (permit: CrossDomainPermitRecord) => `${PERMIT_CATEGORY_LABELS[permit.category] ?? permit.category} permit${permit.permitNumber ? ` ${permit.permitNumber}` : ''}`;
    const subtitleOf = (permit: CrossDomainPermitRecord) => {
      const official = PERMIT_OFFICIAL_STATUS_LABELS[permit.officialStatus] ?? permit.officialStatus;
      const reported = permit.reportedStatus ? PERMIT_REPORTED_STATUS_LABELS[permit.reportedStatus] ?? null : null;
      return permit.officialStatus === 'UNKNOWN' && reported ? `${official} · reported by the household: ${reported}` : `Official: ${official}`;
    };
    // Reported closed out by the household, not confirmed by the authority: never counted as finaled or expired, but said.
    const reportedOnly = view === 'OPEN' ? [] : records.filter((permit) => permit.officialStatus === 'UNKNOWN' && permit.reportedStatus === (view === 'FINALED' ? 'COMPLETED_REPORTED' : 'EXPIRED_REPORTED'));
    const rows = matched.map((permit) => ({ id: permit.id, label: nameOf(permit), subtitle: subtitleOf(permit) }));
    const viewWord = view === 'OPEN' ? 'open' : view === 'EXPIRED' ? 'expired' : 'finaled';
    const definition = view === 'OPEN' ? ' (not finaled, expired or voided)' : '';
    const unconfirmedNote = unconfirmed.length > 0
      ? ` ${unconfirmed.length} ${unconfirmed.length === 1 ? 'has' : 'have'} no confirmed official status, so ${unconfirmed.length === 1 ? 'it is' : 'they are'} counted as open on what the household reported.`
      : '';
    const reportedNote = reportedOnly.length > 0
      ? ` ${reportedOnly.length} more ${reportedOnly.length === 1 ? 'is' : 'are'} reported ${viewWord} by the household but not confirmed by the authority, so not counted here: ${reportedOnly.map(nameOf).join(', ')}.`
      : '';
    const summary = records.length === 0
      ? 'No permits are recorded for this home. That is not the same as nothing having been permitted: records may exist with the permitting office that have not been added.'
      : matched.length === 0
        ? `No ${viewWord} permits are recorded${definition}; ${records.length} permit${records.length === 1 ? ' is' : 's are'} recorded in all.${reportedNote}`
        : `${matched.length} ${viewWord} permit(s)${definition}: ${matched.map((permit) => `${nameOf(permit)} (${subtitleOf(permit)})`).join(', ')}.${unconfirmedNote}${reportedNote}`;
    const finalized = finalizeReceiptAndPresentation({
      facet,
      snapshot,
      role,
      projection: 'LIST',
      operationAdapter: adapterId,
      sourceType: 'PropertyPermitRecord',
      predicateIds: evaluateWherePredicates(facet.where),
      rows,
      title: `${viewWord[0].toUpperCase()}${viewWord.slice(1)} permits`,
      summaryBody: summary,
      variantId: 'variant.permit_record_list',
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
      blocks: finalized.blocks,
    };
  }

  if (job === 'query.project.needs_permit') {
    const active = snapshot.projects.filter((p) => p.propertyId === snapshot.propertyId && p.status === 'ACTIVE');
    // Confirmed and unknown are separate collections (UI review 2026-11-21, P0 #2): only a project confirmed as needing a permit is a match; one whose permit requirement is not
    // recorded is listed apart under its own heading and never counted as confirmed. Projects confirmed as not needing a permit are not shown.
    const confirmedProjects = active.filter((p) => p.permitStatus === 'NEEDS_PERMIT');
    const unknownProjects = active.filter((p) => p.permitStatus === 'UNKNOWN');
    const unknownCount = unknownProjects.length;
    const confirmedNeedsCount = confirmedProjects.length;
    const rows = confirmedProjects.map((p) => ({ id: p.id, label: p.title, subtitle: 'Permit needed' }));
    const unconfirmedRows = unknownProjects.map((p) => ({ id: p.id, label: p.title, subtitle: 'Permit requirement not recorded' }));
    const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
    const summary = confirmedNeedsCount > 0
      ? `${plural(confirmedNeedsCount, 'project needs', 'projects need')} a permit.${unknownCount > 0 ? ` ${plural(unknownCount, 'more has', 'more have')} no permit requirement recorded.` : ''}`
      : unknownCount > 0
        ? `No projects are confirmed as needing a permit. ${plural(unknownCount, 'has', 'have')} no permit requirement recorded.`
        : 'No active projects need a permit.';
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
    const blocks = buildSliceRichPresentation({
      receipt,
      title: 'Project permit requirements',
      summaryBody: summary,
      rows: rows.map((r) => ({ id: r.id, label: r.label, subtitle: r.subtitle })),
      unconfirmedRows,
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
      unconfirmedRows,
      missingSlots: [],
      redactedFieldIds,
      receipt,
      entailment,
      presentationEquivalence: equivalence,
      blocks,
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
          .filter((q): q is CrossDomainContractorQuoteRecord => Boolean(q))
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
      family: 'COMPARISON',
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
      blocks: finalized.blocks,
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
      blocks: finalized.blocks,
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
export async function executeCrossDomainSnapshot(input: {
  readonly rawText: string;
  readonly snapshot: CrossDomainPropertySnapshot;
  readonly role: AskUserRole;
  readonly propertyAuthorized: boolean;
  readonly enabledDomains?: ReadonlySet<SemanticDomainId>;
  readonly allowLegacyFallback?: boolean;
  readonly planOverride?: SemanticRequestPlan;
  /** A typed clarification choice, re-applied to this same message (see the clarification cards): which reading of "no manual or receipt", or which two quotes. */
  readonly documentMode?: 'EITHER_MISSING' | 'BOTH_MISSING';
  readonly boundQuoteIds?: readonly [string, string];
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
        ...(input.documentMode ? { documentMode: input.documentMode } : {}),
        ...(input.boundQuoteIds ? { boundQuoteIds: input.boundQuoteIds } : {}),
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
      answer: EMERGENCY_BOUNDARY_BODY,
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

  const resultsById = new Map<string, CrossDomainFacetExecutionResult>();
  const orderedResults: CrossDomainFacetExecutionResult[] = [];
  const executionCountByFacetId: Record<string, number> = {};

  for (const facet of parsed.plan.facets) {
    executionCountByFacetId[facet.id] = (executionCountByFacetId[facet.id] ?? 0) + 1;
    const owner = ownershipByFacetId.get(facet.id)!;
    let facetResult: CrossDomainFacetExecutionResult;

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

    const enrichedFacetResult: CrossDomainFacetExecutionResult = {
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
  // A part that was not answered is named in plain words, so the homeowner never reads a missing section as "nothing found" (FR-PLAN-5).
  const overflowNote = parsed.overflowFacets.length > 0 ? ` ${notAnsweredNote(parsed.overflowFacets)}` : '';

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
  readonly savedResult: CrossDomainSavedResultRecord;
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
  return executeCrossDomainSnapshot({
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

function normalizeCrossDomainRole(role: string): AskUserRole {
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

function mapClaimStatus(status: string): CrossDomainClaimRecord['status'] {
  const upper = status.toUpperCase();
  if (upper === 'CLOSED' || upper === 'SETTLED' || upper === 'DENIED') return 'CLOSED';
  if (upper === 'UNDER_REVIEW' || upper === 'SUBMITTED' || upper === 'IN_REVIEW') return 'UNDER_REVIEW';
  return 'OPEN';
}

function mapTaxStatus(status: string): CrossDomainTaxBillRecord['status'] {
  const upper = status.toUpperCase();
  if (upper === 'PAID') return 'PAID';
  if (upper === 'OVERDUE' || upper === 'DELINQUENT') return 'OVERDUE';
  return 'UNPAID';
}

function mapInspectionStatus(status: string): CrossDomainInspectionFindingRecord['status'] {
  const upper = status.toUpperCase();
  if (upper === 'RESOLVED' || upper === 'WAIVED') return 'RESOLVED';
  if (upper === 'MONITORING' || upper === 'DEFERRED') return 'MONITORING';
  return 'ACTION_REQUIRED';
}

function mapProjectStatus(status: string): CrossDomainProjectRecord['status'] {
  const upper = status.toUpperCase();
  if (upper === 'COMPLETED') return 'COMPLETED';
  if (upper === 'CANCELLED' || upper === 'ARCHIVED') return 'CANCELLED';
  return 'ACTIVE';
}

function mapPermitStatus(applicability: string): CrossDomainProjectRecord['permitStatus'] {
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
    permits: [],
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

  const needSlice = (
    hasDomain('domain.inventory')
    || hasDomain('domain.maintenance')
    || hasDomain('domain.warranties_coverage')
    || hasJob(
      'query.maintenance_task.filter',
      'query.inventory_item.relation_boolean',
      'query.inventory_item.warranty_relation',
      'job.inventory.replacement_guidance',
      'query.inventory_item.field_read',
      'query.inventory_item.field_absence',
      'query.inventory_item.service_gap',
      'query.warranty.filter',
      'job.risk.recall_review',
    )
  );
  const needWarranties = hasDomain('domain.warranties_coverage') || hasJob('query.warranty.filter');
  const needInventoryFields = hasJob('query.inventory_item.field_absence', 'query.inventory_item.service_gap');
  const needTaxSeries = hasJob('query.property_tax.change_over_time');
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
  // Only the permit job reads permit records; a project or quote read in the same domain does not.
  const needPermits = hasJob('query.permit.filter');
  const needQuotes = hasDomain('domain.projects_quotes_vendors') || hasJob('job.projects.quote_comparison');
  const needFinance = hasDomain('domain.ownership_costs_finance') || hasJob('job.finance.own_rent_break_even', 'job.finance.refinance_break_even');
  const needSaved = loadAll
    ? Boolean(userId)
    : hasDomain('domain.account_household_preferences') || hasJob('job.saved_results.lookup');

  const slicePromise: Promise<SlicePropertySnapshot> = needSlice
    ? loadSlicePropertySnapshot(propertyId)
    : Promise.resolve({
        propertyId,
        asOfDate: new Date().toISOString().slice(0, 10),
        rooms: [],
        items: [],
        maintenanceTasks: [],
      });
  const prismaAny = prisma as unknown as Record<string, { findUnique?: Function; findFirst?: Function; findMany?: Function } | undefined>;

  const [
    sliceSnapshot,
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
    permitRows,
    projectRows,
    quoteRows,
    riskMatchRows,
    sellHoldRentRow,
    toolOverrideRows,
    refinanceScenarioRow,
    refinanceOppRow,
    inventoryFieldRows,
    taxSeriesRows,
  ] = await Promise.all([
    slicePromise,
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
            type: true,
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
              select: { id: true, title: true, status: true, requirementClass: true, category: true },
            },
          },
        })
      : Promise.resolve(null),
    needPermits && typeof prismaAny.propertyPermitRecord?.findMany === 'function'
      ? prisma.propertyPermitRecord.findMany({
          where: { propertyId, isActive: true },
          orderBy: [{ status: 'asc' }, { issueDate: 'desc' }],
          take: 500,
          select: { id: true, propertyId: true, category: true, permitNumber: true, status: true, reportedStatus: true },
        })
      : Promise.resolve([]),
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
    needInventoryFields && typeof prismaAny.inventoryItem?.findMany === 'function'
      ? prisma.inventoryItem.findMany({
          where: { propertyId, ...visibleInventoryItemWhere() },
          select: {
            id: true,
            propertyId: true,
            name: true,
            ...Object.fromEntries(Object.values(INVENTORY_ABSENCE_FIELD_POINT_IDS).map((pointId) => [DATA_POINT_BY_ID.get(pointId)!.field, true])),
          },
        })
      : Promise.resolve(null),
    needTaxSeries
      ? Promise.all(TIME_SERIES_REGISTRY.map(async (declaration) => {
          const delegateName = declaration.historyEntity === 'PropertyTaxBillRecord' ? 'propertyTaxBillRecord' : 'propertyTaxAssessmentRecord';
          const delegate = prismaAny[delegateName];
          const column = DATA_POINT_BY_ID.get(declaration.dataPointId)!.field;
          if (typeof delegate?.findMany !== 'function') return [declaration.dataPointId, null] as const;
          // Declared ordering and dedup: the latest `maxPeriods` active, non-superseded records, one per tax year, oldest first.
          const rows: Array<any> = await delegate.findMany({
            where: { propertyId, status: 'ACTIVE', supersededById: null },
            select: { id: true, propertyId: true, taxYear: true, [column]: true },
            orderBy: [{ taxYear: 'desc' }, { id: 'asc' }],
            take: declaration.maxPeriods,
          });
          return [declaration.dataPointId, rows.reverse().map((row) => ({
            id: String(row.id),
            propertyId: String(row.propertyId ?? propertyId),
            taxYear: Number(row.taxYear),
            value: row[column] === null || row[column] === undefined ? null : typeof row[column] === 'object' && 'toNumber' in row[column] ? (row[column] as { toNumber(): number }).toNumber() : Number(row[column]),
          }))] as const;
        })).then((entries) => Object.fromEntries(entries.filter(([, rows]) => rows !== null)))
      : Promise.resolve(null),
  ]);

  const activeDocumentRows = (documentRows as Array<any>).filter((doc) => doc.deletedAt === null || doc.deletedAt === undefined);
  const manualDocByItem = new Map<string, string>();
  const receiptDocByItem = new Map<string, string>();
  const propertyDocuments: CrossDomainDocumentRecord[] = activeDocumentRows.map((doc) => {
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

  const extendedItems: CrossDomainExtendedItemRecord[] = sliceSnapshot.items.map((item) => {
    const cond = (item.condition ?? '').toUpperCase();
    return {
      id: item.id,
      propertyId: item.propertyId,
      name: item.name,
      modelNumber: item.modelNumber ?? null,
      category: (['APPLIANCE', 'HVAC', 'PLUMBING', 'ELECTRICAL'].includes(item.category.toUpperCase())
        ? item.category.toUpperCase()
        : 'OTHER') as CrossDomainExtendedItemRecord['category'],
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

  const claimDocLinks: CrossDomainClaimDocLink[] = [];
  const claims: CrossDomainClaimRecord[] = (claimRows as Array<any>).map((claim) => {
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
      ...(claim.type ? { claimType: String(claim.type) } : {}),
      ...(claim.status ? { rawStatus: String(claim.status) } : {}),
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
  const financeSlots: CrossDomainFinanceSlots | null = hasAnyFinanceSlot
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

  let savedResults: CrossDomainSavedResultRecord[] = [];
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
    ...sliceSnapshot,
    asOfDate: localYmdInTimeZone(new Date(), propertyTimezone),
    timezone: propertyTimezone,
    closingDateIso,
    extendedItems,
    ...(taxSeriesRows ? { taxSeries: taxSeriesRows as Record<string, CrossDomainTaxSeriesRow[]> } : {}),
    ...(inventoryFieldRows ? {
      inventoryFieldRecords: (inventoryFieldRows as Array<any>).map((row) => ({
        id: String(row.id),
        propertyId: String(row.propertyId ?? propertyId),
        name: String(row.name ?? 'inventory item'),
        values: Object.fromEntries(Object.values(INVENTORY_ABSENCE_FIELD_POINT_IDS).map((pointId) => {
          const column = DATA_POINT_BY_ID.get(pointId)!.field;
          return [column, row[column] ?? null];
        })),
      })),
    } : {}),
    warranties: (warrantyRows as Array<any>).map((w) => ({
      id: w.id,
      propertyId: w.propertyId ?? propertyId,
      providerName: w.providerName,
      category: String(w.category),
      expiryDate: w.expiryDate ? new Date(w.expiryDate).toISOString().slice(0, 10) : '',
    })),
    maintenanceTaskMeta: sliceSnapshot.maintenanceTasks.map((t) => ({
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
      deductibleRecorded: typeof p.deductibleCents === 'number' || (p.deductibleAmount !== null && p.deductibleAmount !== undefined),
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
      status: String(s.status).toUpperCase() === 'RESOLVED' ? 'COMPLETED' : String(s.status).toUpperCase() === 'WAIVED' ? 'WAIVED' : 'PENDING',
      ...(s.requirementClass ? { requirementClass: String(s.requirementClass) } : {}),
      ...(s.category ? { category: String(s.category) } : {}),
    })),
    permits: (permitRows as Array<any>).map((p) => ({
      id: p.id,
      propertyId: p.propertyId ?? propertyId,
      category: String(p.category),
      permitNumber: p.permitNumber ?? null,
      officialStatus: String(p.status),
      reportedStatus: p.reportedStatus ? String(p.reportedStatus) : null,
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

const CLARIFICATION_OPERATION = 'DATA_POINT_READ';

/**
 * The card for a cross-domain clarification. Each button carries a typed choice that is re-applied to the original message (see support/clarificationContract.ts): "no manual or
 * receipt" is the two readings (at least one missing / both missing); a choice of three quotes is the three pairs; anything else (more candidates than a card can hold as pairs,
 * or a card that would violate the contract, such as two pairs that read the same) is a plain question answered in the homeowner's own words. This used to be no card at all.
 */
function crossDomainClarificationCard(clarification: CrossDomainClarification): { clarification: AskClarification; parameters: Record<string, unknown> } {
  if (clarification.reasonCode === 'AMBIGUOUS_NEGATIVE_COORDINATION') {
    return buildPayloadClarification({
      question: 'Your question can be read two ways. Which do you mean?',
      options: [
        { operationId: CLARIFICATION_OPERATION, label: 'Items missing a manual or a receipt (at least one)', payload: { kind: 'DOCUMENT_MISSING', mode: 'EITHER_MISSING' } },
        { operationId: CLARIFICATION_OPERATION, label: 'Items missing both a manual and a receipt', payload: { kind: 'DOCUMENT_MISSING', mode: 'BOTH_MISSING' } },
      ],
    });
  }
  if (clarification.reasonCode === 'AMBIGUOUS_QUOTE_SELECTION') {
    const candidates = clarification.candidateRecords ?? [];
    const amount = (candidate: CrossDomainClarificationCandidate) => (candidate.subtitle ? candidate.subtitle.split(' · ')[0] : '');
    const named = (candidate: CrossDomainClarificationCandidate) => `${candidate.label}${amount(candidate) ? ` (${amount(candidate)})` : ''}`;
    if (candidates.length === 3) {
      try {
        const pairs: Array<readonly [CrossDomainClarificationCandidate, CrossDomainClarificationCandidate]> = [[candidates[0], candidates[1]], [candidates[0], candidates[2]], [candidates[1], candidates[2]]];
        return buildPayloadClarification({
          question: clarification.question,
          options: pairs.map(([first, second]) => ({
            operationId: CLARIFICATION_OPERATION,
            label: `${named(first)} vs ${named(second)}`.slice(0, 160),
            payload: { kind: 'QUOTE_PAIR' as const, quoteIds: [first.id, second.id] as [string, string] },
          })),
        });
      } catch {
        // Two pairs that read the same (the same contractor and amount twice): not a choice the homeowner can tell apart, so they name the two instead.
      }
    }
    return buildFreeTextClarification({ question: `${clarification.question} Tell me the two contractors, for example “${candidates[0]?.label ?? 'Acme'} and ${candidates[1]?.label ?? 'Bravo'}”.`, operationId: CLARIFICATION_OPERATION });
  }
  return buildFreeTextClarification({ question: clarification.question, operationId: CLARIFICATION_OPERATION });
}

/** A part of the question that was not answered, in plain words: a missing section must never read as "nothing found" (FR-PLAN-5). Empty when every part was answered. */
function notAnsweredNote(overflowFacets: readonly PlanOverflowFacet[]): string {
  if (overflowFacets.length === 0) return '';
  const parts = overflowFacets.map((o) => `“${o.label.replace(/[?.!]+$/, '').trim()}”`);
  return `I couldn’t answer ${parts.join(' or ')} here, so ${parts.length === 1 ? 'that part isn’t' : 'those parts aren’t'} included in this answer.`;
}

/** An analysis facet is one result with its own conclusion, assumptions and note; it is never a row in a collection. */
function isAnalysisFacet(facet: CrossDomainFacetExecutionResult): boolean {
  return facet.blocks?.some((block) => block.type === 'SUMMARY' && block.presentationFamily === 'ANALYSIS') === true;
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
    const card = crossDomainClarificationCard(execution.clarification);
    const blocks: AskPresentationBlock[] = [
      {
        type: 'SUMMARY',
        id: 'cross-domain-clarification-required',
        title: 'Please clarify what you mean',
        body: card.clarification.question,
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
              meta: [] as string[],
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
      clarification: card.clarification,
      // The stored clarification is the card's (what a press is checked against); the raw cross-domain clarification stays inside crossDomainExecution.
      parameters: {
        crossDomainExecution: execution,
        ...card.parameters,
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
          title: EMERGENCY_BOUNDARY_TITLE,
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
  const domainTitle = (domainId: string): string => ASK_SEMANTIC_DOMAINS.find((domain) => domain.domainId === domainId)?.title ?? 'Your home record';
  const facetTitle = (facetResult: CrossDomainFacetExecutionResult): string => {
    if (facetResult.jobMatch?.startsWith('query.claim.')) return 'Claims';
    if (facetResult.jobMatch?.startsWith('query.permit.')) return 'Permits';
    return domainTitle(facetResult.owner.domainId);
  };
  const blocks: AskPresentationBlock[] = [];

  const onlyFacet = execution.facetResults.length === 1 ? execution.facetResults[0] : null;
  if (onlyFacet?.blocks && onlyFacet.blocks.length > 0) {
    // A single answered facet owns its complete, homeowner-facing presentation (its answer variant id, summary wording, rows with their
    // state badges, conflict/unknown boundary and a plain provenance line). The wrapper must not rebuild it with internal ids.
    blocks.push(...onlyFacet.blocks);
    // The answered section owns its presentation, so the unanswered part is said on that section's summary instead of being left out of sight.
    const note = notAnsweredNote(execution.overflowFacets);
    const summaryIndex = blocks.findIndex((block) => block.type === 'SUMMARY');
    if (note && summaryIndex >= 0) {
      const summary = blocks[summaryIndex];
      if (summary.type === 'SUMMARY') blocks[summaryIndex] = { ...summary, title: `${summary.title} (partly answered)`, body: `${summary.body} ${note}`, tone: 'CAUTION' };
    }
  } else {
    const answerDomains = [...new Set(execution.facetResults.map(facetTitle))];
    const claimFacet = execution.facetResults.find((facet) => facet.jobMatch?.startsWith('query.claim.'));
    const permitFacet = execution.facetResults.find((facet) => facet.jobMatch?.startsWith('query.permit.'));
    const isClaimsAndPermits = Boolean(claimFacet && permitFacet && execution.facetResults.length === 2);
    const answerTitle = isClaimsAndPermits
      ? 'Open claims and pending permits'
      : answerDomains.length === 1
      ? answerDomains[0]
      : answerDomains.length === 2
        ? `${answerDomains[0]} and ${answerDomains[1]}`
        : answerDomains.length > 2
          ? `${answerDomains.slice(0, -1).join(', ')}, and ${answerDomains.at(-1)}`
          : execution.facetResults.length > 1 ? 'Home record results' : 'Home record result';
    const answerBody = isClaimsAndPermits && claimFacet && permitFacet
      ? `${claimFacet.recordIds.length} open ${claimFacet.recordIds.length === 1 ? 'claim' : 'claims'} · ${permitFacet.recordIds.length > 0 ? `${permitFacet.recordIds.length} pending ${permitFacet.recordIds.length === 1 ? 'permit' : 'permits'}` : 'No recorded pending permits'}.`
      : humanizeEnumTokens(execution.answer);
    blocks.push({
      type: 'SUMMARY',
      // Preserve the receipt's declared answer variant at the final Ask boundary. The provisional delivery gate verifies this identity.
      id: primaryReceipt?.answerVariantId ?? 'cross-domain-summary',
      title: answerTitle,
      body: answerBody,
      presentationFamily: 'ENTITY_LIST',
      tone: execution.status === 'PARTIAL' ? 'CAUTION' : 'DEFAULT',
      actions: [],
    });
    const listSections = execution.facetResults
      // Claims and permits retain symmetric sections in a compound answer, including an explicit zero-record section.
      .filter((f) => !isAnalysisFacet(f) && (f.recordIds.length > 0 || f.jobMatch?.startsWith('query.claim.') || f.jobMatch?.startsWith('query.permit.')) && f.receipt && f.receipt.projection !== 'COUNT')
      .map((facetResult) => {
        const rowById = new Map((facetResult.rows ?? []).map((row) => [row.id, row]));
        const sourceType = facetResult.receipt?.provenance.sourceType;
        const entityType = sourceType === 'Claim' ? 'CLAIM' : sourceType === 'PropertyPermitRecord' ? 'PERMIT_RECORD' : sourceType && RECORD_KIND_OF_SOURCE_TYPE[sourceType] ? ENTITY_TYPE_OF_RECORD_KIND[RECORD_KIND_OF_SOURCE_TYPE[sourceType]] : undefined;
        return {
          id: `section-${facetResult.facetId}`,
          title: isClaimsAndPermits && sourceType === 'Claim' ? 'Open claims' : isClaimsAndPermits && sourceType === 'PropertyPermitRecord' ? 'Pending permits' : facetTitle(facetResult),
          count: facetResult.recordIds.length,
          sourceType,
          items: facetResult.recordIds.map((id) => {
            const row = rowById.get(id);
            return {
              id,
              title: row?.label && row.label.trim().length > 0 ? row.label : 'Record',
              ...(row?.subtitle ? { description: row.subtitle } : {}),
              ...(row?.subtitle ? { status: row.subtitle } : {}),
              ...(row?.entityType ? { entityType: row.entityType } : entityType ? { entityType } : {}),
              meta: row?.subtitle ? [row.subtitle] : [] as string[],
              actions: (row?.actions ?? []) as never[],
            };
          }),
        };
      });
    // Compound execution must preserve the canonical inline-detail surface for grounded claims and permits. Flattening
    // these facets into the generic list made rows look interactive while leaving them as static labels.
    for (const section of listSections.filter((candidate) => candidate.sourceType === 'Claim' || candidate.sourceType === 'PropertyPermitRecord')) {
      blocks.push({
        type: 'GROUPED_LIST',
        id: section.sourceType === 'Claim' ? 'incident-claim-list' : 'permit-tracker-permits',
        recordKind: section.sourceType === 'Claim' ? 'CLAIM' : 'PERMIT',
        title: section.title,
        sections: [{ id: section.id, title: section.title, count: section.count, items: section.items }],
        actions: [],
        filters: [],
        listDensity: 'DENSE',
      });
    }
    const genericCandidates = listSections.filter((candidate) => candidate.sourceType !== 'Claim' && candidate.sourceType !== 'PropertyPermitRecord');
    // One record kind across the generic sections means the canonical renderer for that kind applies, whatever this block's id is.
    const genericKinds = new Set(genericCandidates.map((candidate) => RECORD_KIND_OF_SOURCE_TYPE[candidate.sourceType ?? ''] ?? null));
    const genericKind = genericKinds.size === 1 ? [...genericKinds][0] : null;
    const genericSections = genericCandidates.map(({ sourceType: _sourceType, ...section }) => section);
    if (genericSections.length > 0) {
      blocks.push({
        type: 'GROUPED_LIST',
        id: 'cross-domain-grouped-list',
        ...(genericKind ? { recordKind: genericKind } : {}),
        title: 'Matching home records',
        sections: genericSections,
        actions: [],
        filters: [],
        listDensity: 'DENSE',
      });
    }
    // An analysis facet's assumptions and notes ride along in a compound answer; its conclusion is already in the combined summary.
    for (const facetResult of execution.facetResults.filter(isAnalysisFacet)) {
      blocks.push(...(facetResult.blocks ?? []).filter((block) => block.type === 'ASSUMPTIONS' || block.type === 'LIMITATION'));
    }
    // Records a facet could not confirm are their own collection under their own heading, never mixed into the matches above.
    for (const facetResult of execution.facetResults) {
      if (!facetResult.unconfirmedRows || facetResult.unconfirmedRows.length === 0) continue;
      blocks.push({
        type: 'GROUPED_LIST',
        id: `section-${facetResult.facetId}${UNCONFIRMED_LIST_SUFFIX}`,
        title: 'Needs confirmation',
        sections: [{
          id: `section-${facetResult.facetId}-unconfirmed`,
          title: 'Needs confirmation',
          count: facetResult.unconfirmedRows.length,
          items: facetResult.unconfirmedRows.map((row) => ({
            id: row.id,
            title: row.label && row.label.trim().length > 0 ? row.label : 'Record',
            ...(row.subtitle ? { description: row.subtitle } : {}),
            meta: [] as string[],
          })),
        }],
        actions: [],
        filters: [],
        listDensity: 'DENSE',
      });
    }
    if (isClaimsAndPermits && permitFacet?.summary.startsWith('No permits are recorded for this home.')) {
      blocks.push({
        type: 'BOUNDARY', id: 'permit-record-availability', title: 'About permit records', severity: 'INFO',
        body: 'Permit records may exist with the local permitting office even when they have not been added to this home record.', suggestions: [],
      });
    }
    blocks.push({
      type: 'EVIDENCE',
      id: 'cross-domain-evidence',
      title: 'Where this comes from',
      items: execution.facetResults.map((facetResult) => ({
        label: 'Your home record',
        source: domainTitle(facetResult.owner.domainId),
        observedAt: facetResult.receipt?.provenance.observedAt ?? new Date().toISOString(),
      })),
    });
  }

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
  readonly documentMode?: 'EITHER_MISSING' | 'BOTH_MISSING';
  readonly boundQuoteIds?: readonly [string, string];
}): Promise<{
  readonly execution: CrossDomainExecutionResult;
  readonly operationResult: AskOperationResult;
  readonly snapshot: CrossDomainPropertySnapshot;
}> {
  const activePlan = input.planOverride ?? null;
  const parsed = activePlan ? null : parseCrossDomainSemanticRequest(input.rawText, {
    ...(input.documentMode ? { documentMode: input.documentMode } : {}),
    ...(input.boundQuoteIds ? { boundQuoteIds: input.boundQuoteIds } : {}),
  });
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
  const execution = await executeCrossDomainSnapshot({
    rawText: input.rawText,
    snapshot,
    role: normalizeCrossDomainRole(input.role),
    propertyAuthorized: input.propertyAuthorized,
    planOverride: activePlan ?? undefined,
    ...(input.documentMode ? { documentMode: input.documentMode } : {}),
    ...(input.boundQuoteIds ? { boundQuoteIds: input.boundQuoteIds } : {}),
  });
  return {
    execution,
    operationResult: buildOperationResultFromCrossDomainExecution(execution),
    snapshot,
  };
}
