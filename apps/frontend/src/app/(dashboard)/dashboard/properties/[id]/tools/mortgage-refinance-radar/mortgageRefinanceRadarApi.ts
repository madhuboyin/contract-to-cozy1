// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/mortgage-refinance-radar/mortgageRefinanceRadarApi.ts
import { api } from '@/lib/api/client';
import type { PropertyContextEnvelope } from '@/components/property-context/propertyContextTypes';
import type { PropertyFinancingProfile } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────

export type RefinanceRadarState = 'OPEN' | 'CLOSED';
export type RefinanceConfidenceLevel = 'WEAK' | 'GOOD' | 'STRONG';
export type RefinanceScenarioTerm = 'THIRTY_YEAR' | 'TWENTY_YEAR' | 'FIFTEEN_YEAR';
export type RefinanceObjective =
  | 'BALANCED'
  | 'LOWER_PAYMENT'
  | 'FASTER_PAYOFF'
  | 'LOWER_TOTAL_COST';

export type RateTrendSummary = {
  current30yr: number | null;
  current15yr: number | null;
  prior30yr: number | null;
  deltaWeeks: number;
  trend30yr: 'RISING' | 'FALLING' | 'STABLE' | 'UNKNOWN';
  trendLabel: string;
};

export type MissedOpportunityInsight = {
  hasMissedOpportunity: boolean;
  bestHistoricalRate30yr: number | null;
  bestHistoricalDate: string | null;
  bestMonthlySavingsAtPeak: number | null;
  deltaVsCurrent: number | null;
  summary: string;
};

export type RadarStatusAvailable = {
  available: true;
  radarState: RefinanceRadarState;
  confidenceLevel: RefinanceConfidenceLevel | null;
  currentRatePct: number;
  marketRatePct: number;
  rateGapPct: number;
  loanBalance: number;
  monthlySavings: number;
  breakEvenMonths: number | null;
  lifetimeSavings: number;
  closingCostAssumptionUsd: number;
  remainingTermMonths: number;
  lastEvaluatedAt: string | null;
  trendSummary: RateTrendSummary;
  radarSummary: string;
  missedOpportunitySummary: MissedOpportunityInsight | null;
  notQualifiedReasons: string[];
  triggerRatePct?: number | null;
  triggerRateExplanation?: string;
  topDecisionFactors?: string[];
  mortgageDataAsOf?: string | null;
  mortgageDataFreshness?: 'CURRENT' | 'AGING' | 'STALE' | 'UNKNOWN';
  mortgageDataAgeDays?: number | null;
  marketDataAsOf?: string | null;
  marketDataFreshness?: 'CURRENT' | 'AGING' | 'STALE' | 'UNKNOWN';
  marketDataAgeDays?: number | null;
  marketDataSource?: string | null;
  alertReadiness?: 'READY' | 'REVIEW_MORTGAGE_DATA' | 'WAITING_FOR_MARKET_DATA';
  freshnessWarnings?: string[];
  eligibilityContext?: {
    valueSource: 'APPRAISED_VALUE' | 'PURCHASE_PRICE_FALLBACK' | 'UNKNOWN';
    valueConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
    estimatedPropertyValueUsd: number | null;
    propertyValueAsOf: string | null;
    firstLienLtvPct: number | null;
    combinedLtvPct: number | null;
    estimatedEquityUsd: number | null;
    leverageBand:
      | 'LOWER_LEVERAGE'
      | 'HIGHER_LEVERAGE'
      | 'VERY_HIGH_LEVERAGE'
      | 'UNKNOWN';
    hasSecondMortgage: boolean;
    secondMortgageBalanceUsd: number | null;
    hasMortgageInsurance: boolean;
    occupancyStatus: string;
    propertyType: string;
    propertyState: string;
    loanType: string;
    conformingLimitUsd: number | null;
    conformingContext:
      | 'WITHIN_CONFIGURED_LIMIT'
      | 'ABOVE_CONFIGURED_LIMIT'
      | 'NOT_CONFIGURED';
    programPathways: Array<{
      program:
        | 'CONVENTIONAL_RATE_TERM'
        | 'FHA_STREAMLINE'
        | 'VA_IRRRL'
        | 'JUMBO_REFINANCE'
        | 'ARM_TO_FIXED'
        | 'PMI_REVIEW'
        | 'SECOND_LIEN_COORDINATION';
      relevance:
        | 'CURRENT_LOAN_PATH'
        | 'POTENTIAL_PATH'
        | 'CONDITIONAL'
        | 'NOT_APPLICABLE';
      title: string;
      summary: string;
      requirementsToConfirm: string[];
      cautions: string[];
      planningOnly: true;
    }>;
    warnings: string[];
    followUpActions: Array<
      | 'UPDATE_PROPERTY_VALUE'
      | 'CONFIRM_SECOND_LIEN_BALANCE'
      | 'REVIEW_MORTGAGE_INSURANCE'
      | 'CONFIRM_LOAN_PROGRAM'
    >;
  };
  disclaimer: string;
};

export type RadarStatusUnavailable = {
  available: false;
  reason: 'MISSING_MORTGAGE_DATA' | 'NO_MORTGAGE' | 'NO_RATE_DATA' | 'PROPERTY_NOT_FOUND';
  missingFields?: Array<'currentMortgageBalance' | 'interestRate' | 'remainingTerm'>;
  trendSummary?: RateTrendSummary;
  rateDataFreshnessAt?: string | null;
  shouldPromptForMortgageDetails?: boolean;
};

export type RadarStatusDTO = (RadarStatusAvailable | RadarStatusUnavailable) & {
  propertyContext?: PropertyContextEnvelope;
  propertyContextVersion?: string | null;
};

export type RefinanceOpportunityDTO = {
  id: string;
  propertyId: string;
  currentRatePct: number;
  marketRatePct: number;
  rateGapPct: number;
  loanBalance: number;
  monthlySavings: number;
  breakEvenMonths: number;
  lifetimeSavings: number;
  confidenceLevel: RefinanceConfidenceLevel;
  radarState: RefinanceRadarState;
  evaluationDate: string;
  triggerDate: string | null;
  closingCostAssumptionUsd: number | null;
  remainingTermMonths: number | null;
  createdAt: string;
  estimatedAprPct: number | null;
  cashToCloseUsd: number | null;
  costBreakdown: RefinanceCostBreakdown | null;
};

export type ScenarioAssumptions = {
  loanBalance: number;
  currentRatePct: number;
  remainingTermMonths: number;
  closingCostSource: 'PROVIDED_AMOUNT' | 'PROVIDED_PCT' | 'DEFAULT_2_5_PCT';
  closingCostPctUsed: number;
  discountPoints: number;
  additionalFeesUsd: number;
  lenderCreditsUsd: number;
  escrowFundingUsd: number;
  prepaymentPenaltyUsd: number;
  extraPrincipalUsd: number;
  recastPrincipalUsd: number;
  cashOutAmountUsd: number;
  borrowerCreditBand: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'LIMITED' | 'UNKNOWN';
  aprMethodology: 'MODELED_FROM_NOTE_PAYMENT_AND_NET_UPFRONT_COSTS';
};

export type RefinanceCostBreakdown = {
  baseClosingCostsUsd: number;
  discountPoints: number;
  discountPointsUsd: number;
  additionalFeesUsd: number;
  escrowFundingUsd: number;
  prepaymentPenaltyUsd: number;
  lenderCreditsUsd: number;
  grossClosingCostsUsd: number;
  netClosingCostsUsd: number;
};

export type RefinanceScenarioResult = {
  propertyContext?: PropertyContextEnvelope;
  propertyContextVersion: string;
  targetRatePct: number;
  targetTerm: RefinanceScenarioTerm;
  targetTermMonths: number;
  currentMonthlyPayment: number;
  newMonthlyPayment: number;
  monthlySavings: number;
  breakEvenMonths: number | null;
  lifetimeSavings: number;
  closingCostUsd: number;
  payoffDeltaMonths: number;
  totalInterestRemainingCurrent: number;
  totalInterestNewLoan: number;
  rateGapPct: number;
  estimatedAprPct: number;
  cashToCloseUsd: number;
  costBreakdown: RefinanceCostBreakdown;
  scenarioDate: string;
  currentEstimatedPayoffDate: string;
  newEstimatedPayoffDate: string;
  objective: RefinanceObjective;
  recommendedTerm: RefinanceScenarioTerm;
  recommendationExplanation: string;
  alternatives: Array<{
    targetTerm: RefinanceScenarioTerm;
    targetTermMonths: number;
    newMonthlyPayment: number;
    monthlySavings: number;
    breakEvenMonths: number | null;
    lifetimeSavings: number;
    payoffDeltaMonths: number;
    totalInterestNewLoan: number;
    estimatedAprPct: number;
    isRecommended: boolean;
    tradeoffs: string[];
  }>;
  decisionAlternatives: Array<{
    kind: 'RETAIN_CURRENT' | 'EXTRA_PRINCIPAL' | 'RECAST' | 'CASH_OUT_REFINANCE';
    label: string;
    principalAfterActionUsd: number;
    monthlyPaymentUsd: number;
    upfrontCashUsd: number;
    estimatedTotalInterestUsd: number;
    payoffMonths: number;
    guidance: string;
  }>;
  assumptions: ScenarioAssumptions;
  disclaimer: string;
};

export type RefinanceScenarioSnapshotDTO = {
  id: string;
  propertyId: string;
  targetRatePct: number;
  targetTerm: RefinanceScenarioTerm;
  targetTermMonths: number;
  closingCostUsd: number;
  monthlySavings: number | null;
  breakEvenMonths: number | null;
  lifetimeSavings: number | null;
  isSaved: boolean;
  createdAt: string;
  estimatedAprPct: number | null;
  cashToCloseUsd: number | null;
  costBreakdown: RefinanceCostBreakdown | null;
};

export type MortgageRateSnapshotDTO = {
  id: string;
  date: string;
  rate30yr: number;
  rate15yr: number;
  source: string;
  sourceRef: string | null;
  createdAt: string;
};

export type RefinanceTransitionDTO = {
  id: string;
  transitionType: 'OPEN' | 'UPDATE' | 'CLOSED';
  previousState: RefinanceRadarState | null;
  nextState: RefinanceRadarState;
  snapshotId: string;
  opportunityId: string | null;
  materialChangeReasons: string[];
  occurredAt: string;
};

export type RateHistoryDTO = {
  snapshots: MortgageRateSnapshotDTO[];
  trendSummary: RateTrendSummary;
  transitions?: RefinanceTransitionDTO[];
  initialRadarState?: RefinanceRadarState;
};

export type OpportunityHistoryDTO = {
  opportunities: RefinanceOpportunityDTO[];
  total: number;
  limit: number;
  offset: number;
};

export type RefinanceAlertPreferenceDTO = {
  homeEnabled: true;
  emailEnabled: boolean;
  pushAvailable: false;
  cadence: 'IMMEDIATE' | 'DAILY_DIGEST' | 'WEEKLY_BRIEF' | 'MUTED';
  sensitivity: 'CONSERVATIVE' | 'BALANCED' | 'EARLY';
  quietStart: string | null;
  quietEnd: string | null;
  timezone: string;
  explicitEmailConsent: boolean;
  externalDeliveryEnabled: boolean;
};

export type RefinanceLoanEstimateInput = {
  id: string;
  lenderName: string;
  loanAmountUsd: number;
  loanTermYears: number;
  loanType: 'FIXED' | 'ARM' | 'OTHER';
  noteRatePct: number;
  aprPct: number;
  monthlyPrincipalAndInterestUsd: number;
  monthlyMortgageInsuranceUsd?: number;
  estimatedTotalMonthlyPaymentUsd?: number;
  loanCostsUsd: number;
  lenderCreditsUsd: number;
  discountPointsPct?: number;
  discountPointsUsd?: number;
  cashToCloseUsd: number;
  cashToCloseDirection?: 'FROM_BORROWER' | 'TO_BORROWER' | 'UNKNOWN';
  fiveYearTotalPaidUsd?: number;
  fiveYearPrincipalPaidUsd?: number;
  issuedDate?: string;
  rateLockStatus?: 'LOCKED' | 'NOT_LOCKED' | 'UNKNOWN';
  rateLockExpirationDate?: string;
};

export type LoanEstimateMetric =
  | 'APR'
  | 'MONTHLY_PRINCIPAL_AND_INTEREST'
  | 'ESTIMATED_TOTAL_MONTHLY_PAYMENT'
  | 'NET_LOAN_COSTS'
  | 'CASH_TO_CLOSE'
  | 'FIVE_YEAR_BORROWING_COST';

export type RefinanceLoanEstimateComparison = {
  offers: Array<
    RefinanceLoanEstimateInput & {
      netLoanCostsUsd: number;
      fiveYearBorrowingCostUsd: number | null;
      bestMetrics: LoanEstimateMetric[];
      cautions: string[];
    }
  >;
  leaders: Partial<Record<LoanEstimateMetric, string[]>>;
  costTradeoffs: Array<{
    baselineOfferId: string;
    baselineLenderName: string;
    premiumOfferId: string;
    premiumLenderName: string;
    incrementalNetLoanCostsUsd: number;
    monthlyPaymentSavingsUsd: number;
    breakEvenMonths: number;
    withinNewLoanTerm: boolean;
  }>;
  summary: string[];
  missingFiveYearCostOfferIds: string[];
  disclaimer: string;
};

export type SavedRefinanceLoanEstimateComparison = {
  id: string;
  propertyId: string;
  label: string | null;
  offers: RefinanceLoanEstimateInput[];
  comparison: RefinanceLoanEstimateComparison;
  createdAt: string;
  updatedAt: string;
};

export type LoanEstimateExtractionConfidence = 'HIGH' | 'MEDIUM' | 'MISSING';

export type LoanEstimateExtractedField<T> = {
  value: T | null;
  confidence: LoanEstimateExtractionConfidence;
  sourceLabel: string;
};

export type RefinanceLoanEstimateExtraction = {
  fields: {
    loanAmountUsd: LoanEstimateExtractedField<number>;
    loanTermYears: LoanEstimateExtractedField<number>;
    loanType: LoanEstimateExtractedField<'FIXED' | 'ARM' | 'OTHER'>;
    noteRatePct: LoanEstimateExtractedField<number>;
    aprPct: LoanEstimateExtractedField<number>;
    monthlyPrincipalAndInterestUsd: LoanEstimateExtractedField<number>;
    monthlyMortgageInsuranceUsd: LoanEstimateExtractedField<number>;
    estimatedTotalMonthlyPaymentUsd: LoanEstimateExtractedField<number>;
    loanCostsUsd: LoanEstimateExtractedField<number>;
    lenderCreditsUsd: LoanEstimateExtractedField<number>;
    discountPointsPct: LoanEstimateExtractedField<number>;
    discountPointsUsd: LoanEstimateExtractedField<number>;
    cashToCloseUsd: LoanEstimateExtractedField<number>;
    cashToCloseDirection: LoanEstimateExtractedField<
      'FROM_BORROWER' | 'TO_BORROWER' | 'UNKNOWN'
    >;
    fiveYearTotalPaidUsd: LoanEstimateExtractedField<number>;
    fiveYearPrincipalPaidUsd: LoanEstimateExtractedField<number>;
    issuedDate: LoanEstimateExtractedField<string>;
  };
  extractedFieldCount: number;
  requiredFieldCount: number;
  requiredFieldsFound: number;
  textLayerDetected: boolean;
  extractionMethod: 'PDF_TEXT' | 'IMAGE_OCR' | 'PDF_OCR';
  documentConfidencePct: number | null;
  pageCount: number;
  pageIntegrity?: {
    status:
      | 'COMPLETE'
      | 'PARTIAL'
      | 'DUPLICATE'
      | 'OUT_OF_ORDER'
      | 'UNVERIFIED';
    detectedPages: Array<1 | 2 | 3>;
    missingPages: Array<1 | 2 | 3>;
    duplicatePages: Array<1 | 2 | 3>;
    outOfOrder: boolean;
  };
  reviewRequired: true;
  warnings: string[];
};

// ─── API Functions ────────────────────────────────────────────────────────────

export async function getRadarStatus(
  propertyId: string,
  source?: 'direct' | 'property_overview' | 'home_portfolio',
): Promise<RadarStatusDTO | null> {
  const query = source ? `?source=${encodeURIComponent(source)}` : '';
  const res = await api.get(`/api/properties/${propertyId}/refinance-radar${query}`);
  const status = res.data?.radarStatus as RadarStatusDTO | undefined;
  return status ? { ...status, propertyContext: res.data?.propertyContext } : null;
}

export async function evaluateRadar(propertyId: string): Promise<RadarStatusDTO | null> {
  const res = await api.post(`/api/properties/${propertyId}/refinance-radar/evaluate`, {});
  const status = res.data?.radarStatus as RadarStatusDTO | undefined;
  return status ? { ...status, propertyContext: res.data?.propertyContext } : null;
}

export async function getOpportunityHistory(
  propertyId: string,
  limit = 20,
  offset = 0,
): Promise<OpportunityHistoryDTO> {
  const res = await api.get(
    `/api/properties/${propertyId}/refinance-radar/history?limit=${limit}&offset=${offset}`,
  );
  return res.data as OpportunityHistoryDTO;
}

export async function getMissedOpportunity(
  propertyId: string,
): Promise<MissedOpportunityInsight | null> {
  const res = await api.get(`/api/properties/${propertyId}/refinance-radar/missed-opportunity`);
  return (res.data?.missedOpportunity as MissedOpportunityInsight) ?? null;
}

export async function getRateHistory(
  propertyId: string,
  limit = 12,
): Promise<RateHistoryDTO> {
  const res = await api.get(
    `/api/properties/${propertyId}/refinance-radar/rates?limit=${limit}`,
  );
  return res.data as RateHistoryDTO;
}

export async function getRefinanceAlertPreference(
  propertyId: string,
): Promise<RefinanceAlertPreferenceDTO> {
  const res = await api.get(
    `/api/properties/${propertyId}/refinance-radar/alert-preferences`,
  );
  return res.data.preference as RefinanceAlertPreferenceDTO;
}

export async function updateRefinanceAlertPreference(
  propertyId: string,
  preference: Pick<
    RefinanceAlertPreferenceDTO,
    | 'emailEnabled'
    | 'cadence'
    | 'sensitivity'
    | 'quietStart'
    | 'quietEnd'
    | 'timezone'
  >,
): Promise<RefinanceAlertPreferenceDTO> {
  const res = await api.put(
    `/api/properties/${propertyId}/refinance-radar/alert-preferences`,
    preference,
  );
  return res.data.preference as RefinanceAlertPreferenceDTO;
}

export async function compareRefinanceLoanEstimates(
  propertyId: string,
  offers: RefinanceLoanEstimateInput[],
): Promise<RefinanceLoanEstimateComparison> {
  const res = await api.post(
    `/api/properties/${propertyId}/refinance-radar/loan-estimates/compare`,
    { offers },
  );
  return res.data.comparison as RefinanceLoanEstimateComparison;
}

export async function exportLoanEstimateComparisonMarkdown(
  propertyId: string,
  offers: RefinanceLoanEstimateInput[],
): Promise<{ markdown: string; filename: string }> {
  const response = await api.postText(
    `/api/properties/${propertyId}/refinance-radar/loan-estimates/export-markdown`,
    { offers },
  );
  return {
    markdown: response.data,
    filename:
      response.filename ??
      `mortgage-refinance-loan-estimate-comparison-${propertyId}.md`,
  };
}

export async function exportLoanEstimateHandoffMarkdown(
  propertyId: string,
  input: {
    offers: RefinanceLoanEstimateInput[];
    selectedOfferId: string;
    acknowledgements: {
      figuresVerified: true;
      sameLoanRequestConfirmed: true;
      manualSharingUnderstood: true;
    };
  },
): Promise<{ markdown: string; filename: string }> {
  const response = await api.postText(
    `/api/properties/${propertyId}/refinance-radar/loan-estimates/handoff-markdown`,
    input,
  );
  return {
    markdown: response.data,
    filename:
      response.filename ??
      `mortgage-refinance-lender-discussion-${propertyId}.md`,
  };
}

export async function extractRefinanceLoanEstimate(
  propertyId: string,
  files: File[],
): Promise<RefinanceLoanEstimateExtraction> {
  const form = new FormData();
  files.forEach((file) => form.append('files', file));
  const res = await api.postFormData<{
    extraction: RefinanceLoanEstimateExtraction;
  }>(
    `/api/properties/${propertyId}/refinance-radar/loan-estimates/extract`,
    form,
  );
  if (!res.success || !('data' in res)) {
    throw new Error('The Loan Estimate could not be extracted.');
  }
  return res.data.extraction;
}

export async function saveRefinanceLoanEstimateComparison(
  propertyId: string,
  input: { label?: string; offers: RefinanceLoanEstimateInput[] },
): Promise<SavedRefinanceLoanEstimateComparison> {
  const res = await api.post(
    `/api/properties/${propertyId}/refinance-radar/loan-estimates/saved`,
    input,
  );
  return res.data
    .savedComparison as SavedRefinanceLoanEstimateComparison;
}

export async function getSavedRefinanceLoanEstimateComparisons(
  propertyId: string,
): Promise<SavedRefinanceLoanEstimateComparison[]> {
  const res = await api.get(
    `/api/properties/${propertyId}/refinance-radar/loan-estimates/saved`,
  );
  return (
    (res.data
      ?.savedComparisons as SavedRefinanceLoanEstimateComparison[]) ?? []
  );
}

export async function deleteSavedRefinanceLoanEstimateComparison(
  propertyId: string,
  comparisonId: string,
): Promise<void> {
  await api.delete(
    `/api/properties/${propertyId}/refinance-radar/loan-estimates/saved/${comparisonId}`,
  );
}

export async function runScenario(
  propertyId: string,
  body: {
    targetRate: number;
    targetTerm: RefinanceScenarioTerm;
    closingCostAmount?: number;
    discountPoints?: number;
    additionalFeesAmount?: number;
    lenderCreditsAmount?: number;
    escrowFundingAmount?: number;
    prepaymentPenaltyAmount?: number;
    extraPrincipalAmount?: number;
    recastPrincipalAmount?: number;
    recastFeeAmount?: number;
    cashOutAmount?: number;
    borrowerCreditBand?: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'LIMITED' | 'UNKNOWN';
    objective?: RefinanceObjective;
    saveScenario?: boolean;
  },
): Promise<RefinanceScenarioResult> {
  const res = await api.post(`/api/properties/${propertyId}/refinance-scenario`, body);
  return {
    ...(res.data?.scenario as RefinanceScenarioResult),
    propertyContext: res.data?.propertyContext,
  };
}

export async function exportScenarioMarkdown(
  propertyId: string,
  body: Parameters<typeof runScenario>[1],
): Promise<{ markdown: string; filename: string }> {
  const response = await api.postText(
    `/api/properties/${propertyId}/refinance-scenario/export-markdown`,
    { ...body, saveScenario: false },
  );
  return {
    markdown: response.data,
    filename:
      response.filename ?? `mortgage-refinance-scenario-${propertyId}.md`,
  };
}

export async function recordRefinanceFeedback(
  propertyId: string,
  body: {
    feedback: 'HELPFUL' | 'NOT_NOW' | 'NOT_RELEVANT';
    context: 'RADAR' | 'OPPORTUNITY' | 'SCENARIO';
  },
): Promise<void> {
  await api.post(`/api/properties/${propertyId}/refinance-radar/feedback`, body);
}

export async function recordRefinanceTelemetry(
  propertyId: string,
  body: {
    event: 'HOME_CARD_OPENED';
    source: 'HOME_PORTFOLIO' | 'PROPERTY_OVERVIEW';
  },
): Promise<void> {
  await api.post(`/api/properties/${propertyId}/refinance-radar/telemetry`, body);
}

export async function getSavedScenarios(
  propertyId: string,
): Promise<RefinanceScenarioSnapshotDTO[]> {
  const res = await api.get(`/api/properties/${propertyId}/refinance-scenario/saved`);
  return (res.data?.scenarios as RefinanceScenarioSnapshotDTO[]) ?? [];
}

/**
 * Read the canonical mortgage profile owned by Financing Center.
 *
 * The radar deliberately does not maintain a second copy of these inputs.
 * This read lets the unavailable state preserve and display facts the user
 * has already supplied instead of presenting a blank duplicate form.
 */
export async function getFinancingMortgageProfile(
  propertyId: string,
): Promise<PropertyFinancingProfile | null> {
  return api.getFinancingProfile(propertyId);
}

export async function saveFinancingProfile(
  propertyId: string,
  body: {
    mortgageBalance: number;
    interestRate: number; // decimal form, e.g. 0.0625 for 6.25%
    remainingTermMonths: number;
    monthlyPayment?: number;
  },
): Promise<void> {
  await api.put(`/api/properties/${propertyId}/financing/profile`, {
    currentMortgageBalanceCents: Math.round(body.mortgageBalance * 100),
    interestRateBps: Math.round(body.interestRate * 10_000),
    remainingTermMonths: body.remainingTermMonths,
    ...(body.monthlyPayment != null ? { monthlyPaymentCents: Math.round(body.monthlyPayment * 100) } : {}),
    mortgageBalanceAsOfDate: new Date().toISOString(),
  });
}
