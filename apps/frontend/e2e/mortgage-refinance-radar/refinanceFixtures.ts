import type { Page, Route } from '@playwright/test';

export const REFINANCE_IDS = {
  open: 'refi-open',
  update: 'refi-update',
  closed: 'refi-closed',
  partial: 'refi-partial',
  noMortgage: 'refi-no-mortgage',
  noRates: 'refi-no-rates',
  staleMortgage: 'refi-stale-mortgage',
  staleRates: 'refi-stale-rates',
  error: 'refi-error',
} as const;

const now = '2026-08-01T12:00:00.000Z';

function profile(propertyId: string, partial = false) {
  return {
    id: `profile-${propertyId}`,
    propertyId,
    mortgageStatus: 'ACTIVE',
    mortgageType: 'CONVENTIONAL_30',
    currentMortgageBalanceCents: 32000000,
    mortgageBalanceAsOfDate: partial ? undefined : '2026-07-28T12:00:00.000Z',
    interestRateBps: partial ? undefined : 675,
    remainingTermMonths: partial ? undefined : 300,
    monthlyPaymentCents: 228000,
    hasSecondMortgage: false,
    hasPMI: false,
    createdAt: now,
    updatedAt: now,
  };
}

function availableStatus(
  propertyId: string,
  options: { state?: 'OPEN' | 'CLOSED'; staleMortgage?: boolean; staleRates?: boolean } = {},
) {
  const state = options.state ?? 'OPEN';
  return {
    available: true,
    radarState: state,
    confidenceLevel: state === 'OPEN' ? 'GOOD' : null,
    currentRatePct: 6.75,
    marketRatePct: state === 'OPEN' ? 5.625 : 6.5,
    rateGapPct: state === 'OPEN' ? 1.125 : 0.25,
    loanBalance: 320000,
    monthlySavings: state === 'OPEN' ? 386 : 42,
    breakEvenMonths: state === 'OPEN' ? 21 : 190,
    lifetimeSavings: state === 'OPEN' ? 82400 : 2100,
    closingCostAssumptionUsd: 8000,
    remainingTermMonths: 300,
    lastEvaluatedAt: now,
    trendSummary: {
      current30yr: state === 'OPEN' ? 5.625 : 6.5,
      current15yr: 5.125,
      prior30yr: 6.125,
      deltaWeeks: 4,
      trend30yr: state === 'OPEN' ? 'FALLING' : 'STABLE',
      trendLabel: state === 'OPEN' ? 'Rates are lower than four weeks ago.' : 'Rates are broadly stable.',
    },
    radarSummary: state === 'OPEN'
      ? 'Current benchmark rates suggest meaningful modeled savings worth exploring.'
      : 'Current benchmark rates do not create a compelling modeled refinance benefit.',
    missedOpportunitySummary: {
      hasMissedOpportunity: false,
      bestHistoricalRate30yr: null,
      bestHistoricalDate: null,
      bestMonthlySavingsAtPeak: null,
      deltaVsCurrent: null,
      summary: 'No stronger recent opportunity was identified.',
    },
    notQualifiedReasons: state === 'CLOSED' ? ['The modeled rate gap is below the action threshold.'] : [],
    triggerRatePct: 5.95,
    triggerRateExplanation: 'An approximate 30-year benchmark of 5.95% or lower may meet the modeled threshold.',
    topDecisionFactors: state === 'OPEN'
      ? ['The modeled monthly reduction exceeds the monitoring threshold.', 'Estimated costs recover within the modeled review window.']
      : ['The rate gap is currently too small.', 'Estimated costs take too long to recover.'],
    mortgageDataAsOf: options.staleMortgage ? '2025-10-01T12:00:00.000Z' : '2026-07-28T12:00:00.000Z',
    mortgageDataFreshness: options.staleMortgage ? 'STALE' : 'CURRENT',
    mortgageDataAgeDays: options.staleMortgage ? 304 : 4,
    marketDataAsOf: options.staleRates ? '2026-06-15T12:00:00.000Z' : '2026-07-30T12:00:00.000Z',
    marketDataFreshness: options.staleRates ? 'STALE' : 'CURRENT',
    marketDataAgeDays: options.staleRates ? 47 : 2,
    marketDataSource: 'Freddie Mac PMMS via FRED/MORTGAGE30US',
    alertReadiness: options.staleMortgage
      ? 'REVIEW_MORTGAGE_DATA'
      : options.staleRates
        ? 'WAITING_FOR_MARKET_DATA'
        : 'READY',
    freshnessWarnings: options.staleMortgage
      ? ['Confirm the current mortgage balance before relying on alerts.']
      : options.staleRates
        ? ['The market benchmark is outside the normal weekly update window.']
        : [],
    eligibilityContext: {
      valueSource: 'APPRAISED_VALUE',
      valueConfidence: 'HIGH',
      estimatedPropertyValueUsd: 510000,
      propertyValueAsOf: '2026-06-01T12:00:00.000Z',
      firstLienLtvPct: 62.7,
      combinedLtvPct: 62.7,
      estimatedEquityUsd: 190000,
      leverageBand: 'LOWER_LEVERAGE',
      hasSecondMortgage: false,
      secondMortgageBalanceUsd: null,
      hasMortgageInsurance: false,
      occupancyStatus: 'OWNER_OCCUPIED',
      propertyType: 'SINGLE_FAMILY',
      propertyState: 'NC',
      loanType: 'CONVENTIONAL_30',
      conformingLimitUsd: 806500,
      conformingContext: 'WITHIN_CONFIGURED_LIMIT',
      programPathways: [],
      warnings: [],
      followUpActions: [],
    },
    disclaimer: 'Educational planning estimate only. A national benchmark is not a personalized lender offer.',
    propertyContextVersion: `acceptance-${propertyId}-v1`,
  };
}

function rateHistory(propertyId: string, update = false) {
  return {
    snapshots: [
      { id: `${propertyId}-rate-1`, date: '2026-07-02', rate30yr: 6.125, rate15yr: 5.5, source: 'FRED', sourceRef: 'MORTGAGE30US', createdAt: now },
      { id: `${propertyId}-rate-2`, date: '2026-07-30', rate30yr: 5.625, rate15yr: 5.125, source: 'FRED', sourceRef: 'MORTGAGE30US', createdAt: now },
    ],
    trendSummary: {
      current30yr: 5.625,
      current15yr: 5.125,
      prior30yr: 6.125,
      deltaWeeks: 4,
      trend30yr: 'FALLING',
      trendLabel: 'Rates fell over the fixture window.',
    },
    transitions: [{
      id: `${propertyId}-transition`,
      transitionType: update ? 'UPDATE' : 'OPEN',
      previousState: update ? 'OPEN' : 'CLOSED',
      nextState: 'OPEN',
      snapshotId: `${propertyId}-rate-2`,
      opportunityId: `${propertyId}-opportunity`,
      materialChangeReasons: update ? ['MONTHLY_SAVINGS_CHANGED'] : ['STATE_CHANGED'],
      occurredAt: now,
    }],
    initialRadarState: update ? 'OPEN' : 'CLOSED',
  };
}

const alertPreference = {
  homeEnabled: true,
  emailEnabled: false,
  pushEnabled: false,
  pushAvailable: false,
  hasActivePushSubscription: false,
  pushPublicKey: null,
  cadence: 'MUTED',
  sensitivity: 'BALANCED',
  quietStart: '21:00',
  quietEnd: '07:00',
  timezone: 'America/New_York',
  explicitEmailConsent: false,
  explicitPushConsent: false,
  externalDeliveryEnabled: false,
  pushDeliveryEnabled: false,
  rolloutMode: 'DISABLED',
  recipientInRolloutCohort: false,
};

function rankedAction(options: {
  id: string;
  rank: number;
  priority: 'NOW' | 'SOON' | 'PLAN' | 'CONSIDER';
  title: string;
  sourceKind: string;
  safetyTier: 'LOW_CONSEQUENCE' | 'MATERIAL_FINANCIAL' | 'REGULATED_COVERAGE' | 'SAFETY_EMERGENCY';
}) {
  return {
    id: options.id,
    priority: options.priority,
    signal: options.title,
    whyItMatters: options.id.startsWith('refinance:')
      ? 'Current benchmark rates create a material modeled savings opportunity for this property.'
      : 'A safety issue should be handled before financial optimization.',
    recommendedAction: options.title,
    expectedOutcome: options.id.startsWith('refinance:')
      ? 'Compare a personalized offer before deciding whether to proceed.'
      : 'Reduce immediate risk to the home.',
    timing: { dueAt: null, windowStart: null, windowEnd: null, rationale: 'Canonical ranker order.' },
    evidence: [{ id: `${options.id}:evidence`, label: 'Fixture evidence', source: 'Acceptance fixture', freshness: 'CURRENT', confidence: 0.9 }],
    assumptions: [],
    confidence: { score: 0.9, label: 'HIGH', missing: [] },
    primaryCta: {
      label: options.id.startsWith('refinance:') ? 'Review refinance outlook' : 'Review safety action',
      href: options.id.startsWith('refinance:')
        ? '/dashboard/properties/refi-home-actions/tools/mortgage-refinance-radar'
        : '/dashboard/properties/refi-home-actions/maintenance',
    },
    secondaryCtas: [],
    lineageId: `${options.id}:lineage`,
    state: 'OPEN',
    job: options.id.startsWith('refinance:') ? 'DECIDE' : 'STAY_AHEAD',
    source: { kind: options.sourceKind, entityId: options.id, version: 'fixture-v1' },
    governance: { safetyTier: options.safetyTier },
    feedbackControls: options.id.startsWith('refinance:') ? ['DEFER', 'NOT_RELEVANT', 'NO_MORTGAGE'] : ['ACKNOWLEDGE'],
    ranking: {
      rank: options.rank,
      score: 100 - options.rank,
      explanation: 'Ordered by the canonical shared action ranker.',
      components: { consequence: 1, urgency: 1, confidence: 1, householdRelevance: 1, actionability: 1, missingContextPenalty: 0 },
    },
    deduplication: { canonicalKey: options.id, mergedActionIds: [] },
    workItem: null,
  };
}

function unifiedHome(includeRefinance: boolean) {
  const safety = rankedAction({
    id: 'safety:electrical', rank: 1, priority: 'NOW', title: 'Address the electrical safety issue',
    sourceKind: 'INCIDENT', safetyTier: 'MATERIAL_FINANCIAL',
  });
  const refinance = rankedAction({
    id: 'refinance:open', rank: 2, priority: 'SOON', title: 'Review your refinance opportunity',
    sourceKind: 'MORTGAGE_REFINANCE', safetyTier: 'MATERIAL_FINANCIAL',
  });
  const actions = includeRefinance ? [safety, refinance] : [safety];
  return {
    contractVersion: 'phase2-home-v1',
    property: { id: 'refi-home-actions', name: '123 Refinance Way', address: 'Raleigh, NC 27601', dwellingType: 'SINGLE_FAMILY', updatedAt: now },
    propertyContext: { contextVersion: 'refi-home-actions-v1', scopes: [], completenessPercent: 100, knownFactCount: 8, missingFactCount: 0, conflictedFactCount: 0, staleFactCount: 0, warningCount: 0 },
    attention: { actions, totalCount: actions.length, planHref: '/dashboard/properties/refi-home-actions/plan', firstValueInsight: null },
    decisions: [],
    capabilitySuggestions: { contractVersion: 'capability-suggestions-v1', registryVersion: 'fixture', recommendationVersion: 'capability-recommendation-v1', contextVersion: 'fixture', generatedAt: now, status: 'AVAILABLE', surface: 'HOME', suggestions: [] },
    activeMajorMoment: null,
    glance: {
      recordCompleteness: 100, knownPropertyFacts: 8, trackedSystems: 2, verifiedSystems: 2,
      documentCount: 1, verifiedDocumentCount: 1, coverageGapCount: 0, openWorkCount: actions.length,
      recentChanges: [], recordHref: '/dashboard/properties/refi-home-actions', systemsHref: '/dashboard/properties/refi-home-actions/systems',
      coverageHref: '/dashboard/properties/refi-home-actions/coverage', workHref: '/dashboard/properties/refi-home-actions/plan',
    },
    diagnostics: { candidateCount: actions.length, surfacedCount: actions.length, duplicateCount: 0, suppressedCount: 0, snoozedCount: 0, promotedCount: includeRefinance ? 1 : 0, personalization: { status: 'AVAILABLE', evaluatedCount: actions.length, activeCount: actions.length }, emptyStateReason: null },
    generatedAt: now,
  };
}

function scenarioResult() {
  const alternative = {
    targetTerm: 'THIRTY_YEAR',
    targetTermMonths: 360,
    newMonthlyPayment: 1840,
    monthlySavings: 440,
    breakEvenMonths: 19,
    lifetimeSavings: 78500,
    payoffDeltaMonths: 60,
    totalInterestNewLoan: 342000,
    estimatedAprPct: 5.82,
    isRecommended: true,
    tradeoffs: ['A longer term may extend the payoff date.'],
  };
  return {
    propertyContextVersion: 'acceptance-context-v1',
    targetRatePct: 5.625,
    targetTerm: 'THIRTY_YEAR',
    targetTermMonths: 360,
    currentMonthlyPayment: 2280,
    newMonthlyPayment: 1840,
    monthlySavings: 440,
    breakEvenMonths: 19,
    lifetimeSavings: 78500,
    closingCostUsd: 8000,
    payoffDeltaMonths: 60,
    totalInterestRemainingCurrent: 420500,
    totalInterestNewLoan: 342000,
    rateGapPct: 1.125,
    estimatedAprPct: 5.82,
    cashToCloseUsd: 8000,
    costBreakdown: {
      baseClosingCostsUsd: 8000,
      discountPoints: 0,
      discountPointsUsd: 0,
      additionalFeesUsd: 0,
      escrowFundingUsd: 0,
      prepaymentPenaltyUsd: 0,
      lenderCreditsUsd: 0,
      grossClosingCostsUsd: 8000,
      netClosingCostsUsd: 8000,
    },
    scenarioDate: now,
    currentEstimatedPayoffDate: '2051-08-01T12:00:00.000Z',
    newEstimatedPayoffDate: '2056-08-01T12:00:00.000Z',
    objective: 'BALANCED',
    recommendedTerm: 'THIRTY_YEAR',
    recommendationExplanation: 'This modeled term preserves a lower payment while showing the payoff tradeoff.',
    alternatives: [alternative],
    decisionAlternatives: [{
      kind: 'RETAIN_CURRENT',
      label: 'Keep current mortgage',
      principalAfterActionUsd: 320000,
      monthlyPaymentUsd: 2280,
      upfrontCashUsd: 0,
      estimatedTotalInterestUsd: 420500,
      payoffMonths: 300,
      guidance: 'Avoids new closing costs.',
    }],
    assumptions: {
      loanBalance: 320000,
      currentRatePct: 6.75,
      remainingTermMonths: 300,
      closingCostSource: 'DEFAULT_2_5_PCT',
      closingCostPctUsed: 0.025,
      discountPoints: 0,
      additionalFeesUsd: 0,
      lenderCreditsUsd: 0,
      escrowFundingUsd: 0,
      prepaymentPenaltyUsd: 0,
      extraPrincipalUsd: 0,
      recastPrincipalUsd: 0,
      cashOutAmountUsd: 0,
      borrowerCreditBand: 'UNKNOWN',
      aprMethodology: 'MODELED_FROM_NOTE_PAYMENT_AND_NET_UPFRONT_COSTS',
    },
    disclaimer: 'Educational planning estimate only; confirm terms with an official Loan Estimate.',
  };
}

async function fulfill(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ success: status < 400, data }),
  });
}

export async function installRefinanceRoutes(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('ctc_cookie_consent', 'essential');
  });
  let currentDecision: Record<string, unknown> | null = null;
  let currentProfile = profile(REFINANCE_IDS.open);
  let errorReads = 0;
  let savedComparisons: Array<Record<string, unknown>> = [];
  let refinanceHomeActionVisible = true;
  const mutations: Array<{ method: string; path: string; body: Record<string, unknown> }> = [];

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const propertyMatch = path.match(/^\/api\/properties\/([^/]+)/);
    const propertyId = propertyMatch?.[1] ?? REFINANCE_IDS.open;
    const method = request.method();
    const body = request.postDataJSON?.() as Record<string, unknown> | null;
    if (method !== 'GET' && body) mutations.push({ method, path, body });

    if (path === '/api/csrf-token') return fulfill(route, { csrfToken: 'refinance-acceptance-csrf' });
    if (path === '/api/properties/refi-home-actions/home') {
      return fulfill(route, unifiedHome(refinanceHomeActionVisible));
    }
    if (path.includes('/home-actions/refinance%3Aopen/commands') && method === 'POST') {
      refinanceHomeActionVisible = false;
      return fulfill(route, { actionId: 'refinance:open', command: body?.command, state: 'DISMISSED', recordedAt: now });
    }
    if (path.endsWith('/radar/events')) return fulfill(route, { items: [] });
    if (path === `/api/properties/${propertyId}`) {
      return fulfill(route, { id: propertyId, address: '123 Refinance Way', city: 'Raleigh', state: 'NC', zipCode: '27601' });
    }
    if (path.endsWith('/financing/profile')) {
      if (method === 'PUT') {
        currentProfile = { ...currentProfile, ...body, propertyId, updatedAt: now };
        return fulfill(route, { profile: currentProfile });
      }
      if (propertyId === REFINANCE_IDS.partial) return fulfill(route, { profile: profile(propertyId, true) });
      if (propertyId === REFINANCE_IDS.noMortgage) return fulfill(route, { profile: null });
      return fulfill(route, { profile: { ...currentProfile, propertyId } });
    }
    if (path.endsWith('/refinance-radar/rates')) {
      return fulfill(route, rateHistory(propertyId, propertyId === REFINANCE_IDS.update));
    }
    if (path.endsWith('/refinance-radar/alert-preferences')) {
      return fulfill(route, { preference: { ...alertPreference, ...(body ?? {}) } });
    }
    if (path.endsWith('/refinance-radar/decision')) {
      if (method === 'GET') return fulfill(route, { decision: currentDecision });
      const status = String(body?.status ?? 'EXPLORING');
      const history = [
        ...((currentDecision?.history as unknown[]) ?? []),
        { id: `history-${Date.now()}`, fromStatus: currentDecision?.status ?? null, toStatus: status, rationale: body?.rationale ?? null, occurredAt: now },
      ];
      currentDecision = {
        id: 'decision-acceptance',
        propertyId,
        recordedByUserId: 'acceptance-user',
        status,
        radarOpportunityId: `${propertyId}-opportunity`,
        scenarioSnapshotId: body?.scenarioSnapshotId ?? currentDecision?.scenarioSnapshotId ?? null,
        loanEstimateComparisonId: body?.loanEstimateComparisonId ?? currentDecision?.loanEstimateComparisonId ?? null,
        selectedOfferId: body?.selectedOfferId ?? currentDecision?.selectedOfferId ?? null,
        rationale: body?.rationale ?? null,
        nextReviewAt: body?.nextReviewAt ?? null,
        decidedAt: now,
        completedAt: status === 'CLOSED' || status === 'DECLINED' || status === 'ABANDONED' ? now : null,
        version: Number(currentDecision?.version ?? 0) + 1,
        createdAt: now,
        updatedAt: now,
        history,
      };
      if (status === 'CLOSED' && body?.completedMortgage) {
        const completed = body.completedMortgage as Record<string, number | string>;
        currentProfile = {
          ...currentProfile,
          currentMortgageBalanceCents: Number(completed.currentMortgageBalanceUsd) * 100,
          interestRateBps: Number(completed.interestRatePct) * 100,
          remainingTermMonths: Number(completed.remainingTermMonths),
        };
      }
      return fulfill(route, { decision: currentDecision, idempotent: false });
    }
    if (path.includes('/refinance-radar/decision/') && method === 'DELETE') {
      currentDecision = null;
      return route.fulfill({ status: 204, body: '' });
    }
    if (path.endsWith('/refinance-scenario/saved')) return fulfill(route, { scenarios: [] });
    if (path.endsWith('/refinance-scenario') && method === 'POST') {
      return fulfill(route, { scenario: scenarioResult() });
    }
    if (path.endsWith('/loan-estimates/saved')) {
      if (method === 'POST') {
        const offers = (body?.offers as unknown[]) ?? [];
        const saved = { id: 'saved-comparison', propertyId, label: body?.label ?? null, offers, comparison: comparisonFrom(offers), createdAt: now, updatedAt: now };
        savedComparisons = [saved];
        return fulfill(route, { savedComparison: saved }, 201);
      }
      return fulfill(route, { savedComparisons });
    }
    if (path.includes('/loan-estimates/saved/') && method === 'DELETE') {
      savedComparisons = [];
      return route.fulfill({ status: 204, body: '' });
    }
    if (path.endsWith('/loan-estimates/compare')) {
      return fulfill(route, { comparison: comparisonFrom((body?.offers as unknown[]) ?? []) });
    }
    if (path.endsWith('/refinance-radar/feedback')) return fulfill(route, {});
    if (path.endsWith('/refinance-radar/evaluate')) {
      return fulfill(route, { radarStatus: availableStatus(propertyId) });
    }
    if (path.endsWith('/refinance-radar')) {
      if (propertyId === REFINANCE_IDS.error && errorReads++ === 0) {
        return fulfill(route, { message: 'Acceptance fixture load failure' }, 500);
      }
      if (propertyId === REFINANCE_IDS.partial) {
        return fulfill(route, { radarStatus: { available: false, reason: 'MISSING_MORTGAGE_DATA', missingFields: ['interestRate', 'remainingTerm'] } });
      }
      if (propertyId === REFINANCE_IDS.noMortgage) return fulfill(route, { radarStatus: { available: false, reason: 'NO_MORTGAGE' } });
      if (propertyId === REFINANCE_IDS.noRates) return fulfill(route, { radarStatus: { available: false, reason: 'NO_RATE_DATA' } });
      const status = propertyId === REFINANCE_IDS.closed
        ? availableStatus(propertyId, { state: 'CLOSED' })
        : propertyId === REFINANCE_IDS.staleMortgage
          ? availableStatus(propertyId, { staleMortgage: true })
          : propertyId === REFINANCE_IDS.staleRates
            ? availableStatus(propertyId, { state: 'CLOSED', staleRates: true })
            : availableStatus(propertyId);
      return fulfill(route, { radarStatus: status });
    }
    return fulfill(route, {});
  });

  return {
    mutations,
    decision: () => currentDecision,
    financingProfile: () => currentProfile,
  };
}

function comparisonFrom(rawOffers: unknown[]) {
  const offers = rawOffers.map((raw, index) => {
    const offer = raw as Record<string, unknown>;
    return {
      ...offer,
      netLoanCostsUsd: Number(offer.loanCostsUsd ?? 0) - Number(offer.lenderCreditsUsd ?? 0),
      fiveYearBorrowingCostUsd: Number(offer.fiveYearTotalPaidUsd ?? 0) - Number(offer.fiveYearPrincipalPaidUsd ?? 0),
      bestMetrics: index === 0 ? ['APR', 'NET_LOAN_COSTS'] : ['MONTHLY_PRINCIPAL_AND_INTEREST'],
      cautions: [],
    };
  });
  return {
    offers,
    leaders: {},
    costTradeoffs: [],
    summary: ['The highlighted figures compare disclosed metrics, not overall lender quality.'],
    missingFiveYearCostOfferIds: [],
    disclaimer: 'Official Loan Estimate figures control. This is not a lender recommendation or approval.',
  };
}
