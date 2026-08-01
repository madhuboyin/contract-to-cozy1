const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  aggregateRefinanceRadarMetrics,
} = require('../../dist/services/adminAnalytics/refinanceRadarMetricsService');

const from = new Date('2026-07-01T00:00:00.000Z');
const to = new Date('2026-07-31T23:59:59.999Z');
const snapshotCreatedAt = new Date('2026-07-10T12:00:00.000Z');

function analytics(eventName, propertyId = 'property-1', metadataJson = {}) {
  return {
    eventName,
    propertyId,
    valueNumeric: null,
    metadataJson,
  };
}

test('aggregates refinance activation, coverage, funnel, quality, and guardrails', () => {
  const metrics = aggregateRefinanceRadarMetrics({
    from,
    to,
    profiles: [
      {
        mortgageStatus: 'MORTGAGED',
        currentMortgageBalanceCents: 300_000_00,
        interestRateBps: 675,
        remainingTermMonths: 300,
      },
      {
        mortgageStatus: 'MORTGAGED',
        currentMortgageBalanceCents: 250_000_00,
        interestRateBps: null,
        remainingTermMonths: 240,
      },
      {
        mortgageStatus: 'NO_MORTGAGE',
        currentMortgageBalanceCents: null,
        interestRateBps: null,
        remainingTermMonths: null,
      },
    ],
    snapshots: [{ id: 'snapshot-1', createdAt: snapshotCreatedAt }],
    claims: [{
      propertyId: 'property-1',
      snapshotId: 'snapshot-1',
      status: 'COMPLETED',
      completedAt: new Date('2026-07-10T20:00:00.000Z'),
      snapshot: { createdAt: snapshotCreatedAt },
    }],
    domainEvents: [
      {
        type: 'REFINANCE_OPPORTUNITY_OPENED',
        propertyId: 'property-1',
        payload: {
          opportunityId: 'opportunity-1',
          processingOutcome: {
            status: 'SUPPRESSED',
            reason: 'INPUTS_NOT_CURRENT',
          },
        },
      },
      {
        type: 'REFINANCE_DATA_REQUIRED',
        propertyId: 'property-2',
        payload: {},
      },
    ],
    analyticsEvents: [
      analytics('refinance_home_status_checked'),
      analytics('refinance_home_card_opened'),
      analytics('refinance_opportunity_viewed'),
      analytics('refinance_scenario_run'),
      analytics('refinance_scenario_saved'),
      analytics('refinance_scenario_markdown_exported'),
      analytics('refinance_loan_estimates_compared'),
      analytics('refinance_loan_estimate_comparison_saved'),
      analytics('refinance_loan_estimate_extracted', 'property-1', {
        extractionMethod: 'IMAGE_OCR',
        pageCount: 3,
        pageSetStatus: 'COMPLETE',
      }),
      analytics('refinance_loan_estimate_extracted', 'property-1', {
        extractionMethod: 'PDF_OCR',
        pageCount: 3,
        pageSetStatus: 'PARTIAL',
      }),
      analytics('refinance_loan_estimate_markdown_exported'),
      analytics('refinance_loan_estimate_handoff_package_exported'),
      analytics('refinance_loan_estimate_comparison_deleted'),
      analytics('refinance_feedback_recorded', 'property-1', {
        feedback: 'HELPFUL',
      }),
    ],
    opportunities: [{
      id: 'opportunity-1',
      monthlySavings: 325,
      breakEvenMonths: 22,
    }],
    notifications: [
      {
        entityId: 'property-1',
        createdAt: new Date('2026-07-10T12:00:00.000Z'),
      },
      {
        entityId: 'property-1',
        createdAt: new Date('2026-07-20T12:00:00.000Z'),
      },
    ],
    decisions: [],
    currentlyOpenProperties: 1,
  });

  assert.equal(metrics.population.eligibleProfileActivationRate, 0.5);
  assert.equal(metrics.monitoring.coverageWithin24HoursRate, 1);
  assert.equal(metrics.transitions.opened, 1);
  assert.equal(metrics.transitions.dataRequired, 1);
  assert.equal(metrics.funnel.homeToRadarConversionRate, 1);
  assert.equal(metrics.funnel.scenarioRuns, 2);
  assert.equal(metrics.funnel.scenariosSaved, 1);
  assert.equal(metrics.funnel.loanEstimateComparisons, 1);
  assert.equal(metrics.funnel.loanEstimateComparisonsSaved, 1);
  assert.equal(metrics.funnel.loanEstimateDocumentsExtracted, 2);
  assert.equal(metrics.funnel.loanEstimateImageOcrExtractions, 1);
  assert.equal(metrics.funnel.loanEstimatePdfOcrExtractions, 1);
  assert.equal(metrics.funnel.loanEstimatePageSetIssues, 1);
  assert.equal(metrics.funnel.loanEstimatePagesProcessed, 6);
  assert.equal(metrics.funnel.loanEstimateMarkdownExports, 1);
  assert.equal(metrics.funnel.loanEstimateHandoffPackages, 1);
  assert.equal(metrics.funnel.loanEstimateComparisonsDeleted, 1);
  assert.equal(metrics.decisionQuality.aggregateValuesSuppressed, true);
  assert.equal(metrics.decisionQuality.medianProjectedMonthlySavingsUsd, null);
  assert.equal(metrics.decisionQuality.helpfulRate, 1);
  assert.equal(metrics.guardrails.inputsNotCurrentSuppressions, 1);
  assert.equal(metrics.notifications.duplicateExternalAlerts, 1);
});

test('returns null rates instead of dividing by zero', () => {
  const metrics = aggregateRefinanceRadarMetrics({
    from,
    to,
    profiles: [],
    snapshots: [],
    claims: [],
    domainEvents: [],
    analyticsEvents: [],
    opportunities: [],
    notifications: [],
    decisions: [],
    currentlyOpenProperties: 0,
  });
  assert.equal(metrics.population.eligibleProfileActivationRate, null);
  assert.equal(metrics.monitoring.evaluationCoverageRate, null);
  assert.equal(metrics.funnel.homeToRadarConversionRate, null);
  assert.equal(metrics.decisionQuality.helpfulRate, null);
});

function outcomeDecision(index, overrides = {}) {
  const propertyId = `property-${index}`;
  return {
    id: `decision-${index}`,
    propertyId,
    status: 'CLOSED',
    radarOpportunityId: `opportunity-${index}`,
    scenarioSnapshotId: `scenario-${index}`,
    loanEstimateComparisonId: `comparison-${index}`,
    selectedOfferId: `offer-${index}`,
    nextReviewAt: null,
    createdAt: new Date('2026-07-02T12:00:00.000Z'),
    updatedAt: new Date('2026-07-05T12:00:00.000Z'),
    completedAt: new Date('2026-07-05T12:00:00.000Z'),
    metadataJson: {
      verifiedClosing: {
        confirmedAt: '2026-07-05T12:00:00.000Z',
        canonicalFinancingWritebackCompleted: true,
        priorMortgage: { monthlyPaymentCents: 240000 },
        newMortgage: { monthlyPaymentCents: 200000, closingCostCents: 900000 },
      },
    },
    radarOpportunity: { monthlySavings: 350, closingCostAssumption: 8000 },
    scenarioSnapshot: { monthlySavings: 375, closingCost: 8500 },
    history: [
      { fromStatus: null, toStatus: 'PROCEEDING', occurredAt: new Date('2026-07-02T12:00:00.000Z') },
      { fromStatus: 'PROCEEDING', toStatus: 'OFFER_SELECTED', occurredAt: new Date('2026-07-03T12:00:00.000Z') },
      { fromStatus: 'OFFER_SELECTED', toStatus: 'APPLICATION_IN_PROGRESS', occurredAt: new Date('2026-07-04T12:00:00.000Z') },
      { fromStatus: 'APPLICATION_IN_PROGRESS', toStatus: 'CLOSED', occurredAt: new Date('2026-07-05T12:00:00.000Z') },
    ],
    ...overrides,
  };
}

function outcomeInput(decisions, overrides = {}) {
  return {
    from,
    to,
    profiles: [],
    snapshots: [],
    claims: [],
    domainEvents: decisions.map((decision, index) => ({
      type: 'REFINANCE_OPPORTUNITY_OPENED',
      propertyId: decision.propertyId,
      createdAt: new Date('2026-07-01T12:00:00.000Z'),
      payload: { opportunityId: `opportunity-${index + 1}` },
    })),
    analyticsEvents: decisions.map((decision) =>
      analytics('refinance_loan_estimates_compared', decision.propertyId)),
    opportunities: [],
    notifications: [],
    decisions,
    currentlyOpenProperties: 0,
    ...overrides,
  };
}

test('a durable synthetic journey appears in the full decision funnel', () => {
  const metrics = aggregateRefinanceRadarMetrics(outcomeInput([outcomeDecision(1)], {
    analyticsEvents: [
      analytics('refinance_loan_estimates_compared'),
      analytics('refinance_scenario_markdown_exported'),
      analytics('refinance_loan_estimate_handoff_package_exported'),
    ],
  }));

  assert.equal(metrics.funnel.opportunityToDecisionRate, 1);
  assert.equal(metrics.funnel.medianOpenToDecisionHours, 24);
  assert.equal(metrics.funnel.quoteComparisonToSelectionRate, 1);
  assert.equal(metrics.funnel.selectionToApplicationRate, 1);
  assert.equal(metrics.funnel.applicationToCloseRate, 1);
  assert.equal(metrics.funnel.refinanceClosings, 1);
  assert.equal(metrics.verifiedOutcomes.canonicalMortgageWritebackCompletionRate, 1);
  assert.equal(metrics.verifiedOutcomes.aggregateValuesSuppressed, true);
  assert.equal(metrics.verifiedOutcomes.medianRecordedMonthlySavingsUsd, null);
  assert.equal(metrics.privacy.rawMortgageValuesIncluded, false);
  assert.equal(metrics.privacy.propertyLevelRowsIncluded, false);
  assert.doesNotMatch(JSON.stringify(metrics), /property-1|currentMortgageBalance|interestRateBps/);
});

test('verified outcome aggregates appear only after the low-volume privacy floor', () => {
  const decisions = Array.from({ length: 5 }, (_, index) => outcomeDecision(index + 1));
  const metrics = aggregateRefinanceRadarMetrics(outcomeInput(decisions));

  assert.equal(metrics.verifiedOutcomes.aggregateValuesSuppressed, false);
  assert.equal(metrics.verifiedOutcomes.distinctPropertyCount, 5);
  assert.equal(metrics.verifiedOutcomes.medianProjectedMonthlySavingsUsd, 375);
  assert.equal(metrics.verifiedOutcomes.medianRecordedMonthlySavingsUsd, 400);
  assert.equal(metrics.verifiedOutcomes.medianMonthlySavingsVarianceUsd, 25);
  assert.equal(metrics.verifiedOutcomes.medianProjectedClosingCostUsd, 8500);
  assert.equal(metrics.verifiedOutcomes.medianRecordedClosingCostUsd, 9000);
  assert.equal(metrics.verifiedOutcomes.medianClosingCostVarianceUsd, 500);
});

test('views and exports never infer a decision or completion', () => {
  const metrics = aggregateRefinanceRadarMetrics(outcomeInput([], {
    analyticsEvents: [
      analytics('refinance_opportunity_viewed'),
      analytics('refinance_scenario_markdown_exported'),
      analytics('refinance_loan_estimate_markdown_exported'),
      analytics('refinance_loan_estimate_handoff_package_exported'),
    ],
  }));

  assert.equal(metrics.funnel.decisionsRecorded, 0);
  assert.equal(metrics.funnel.applicationsStarted, 0);
  assert.equal(metrics.funnel.refinanceClosings, 0);
  assert.equal(metrics.verifiedOutcomes.verifiedClosingCount, 0);
});

test('deferred returns, stale reviews, reopened journeys, and distribution stay distinct', () => {
  const returned = outcomeDecision(1, {
    status: 'PROCEEDING',
    completedAt: null,
    metadataJson: {},
    history: [
      { fromStatus: null, toStatus: 'DEFERRED', occurredAt: new Date('2026-07-02T12:00:00.000Z') },
      { fromStatus: 'DEFERRED', toStatus: 'EXPLORING', occurredAt: new Date('2026-07-03T12:00:00.000Z') },
      { fromStatus: 'EXPLORING', toStatus: 'PROCEEDING', occurredAt: new Date('2026-07-04T12:00:00.000Z') },
    ],
  });
  const stale = outcomeDecision(2, {
    status: 'DEFERRED',
    nextReviewAt: new Date('2026-07-10T12:00:00.000Z'),
    completedAt: null,
    metadataJson: {},
    history: [
      { fromStatus: null, toStatus: 'DEFERRED', occurredAt: new Date('2026-07-02T12:00:00.000Z') },
    ],
  });
  const metrics = aggregateRefinanceRadarMetrics(outcomeInput([returned, stale]));

  assert.equal(metrics.funnel.deferredDecisions, 2);
  assert.equal(metrics.funnel.returnedAfterDeferral, 1);
  assert.equal(metrics.funnel.deferToReturnRate, 0.5);
  assert.deepEqual(metrics.funnel.decisionDistribution, { PROCEEDING: 1, DEFERRED: 1 });
  assert.equal(metrics.funnel.staleOrReopenedDecisions, 2);
  assert.equal(metrics.funnel.staleOrReopenedDecisionRate, 1);
});

test('controlled optimization opens only after usefulness and duplicate samples pass', () => {
  const metrics = aggregateRefinanceRadarMetrics(outcomeInput([], {
    analyticsEvents: Array.from({ length: 20 }, () => analytics('refinance_feedback_recorded', 'property-1', { feedback: 'HELPFUL' })),
    notifications: Array.from({ length: 20 }, (_, index) => ({
      entityId: `property-${index + 1}`,
      createdAt: new Date(`2026-07-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`),
    })),
  }));

  assert.equal(metrics.controlledOptimization.usefulnessGate, 'PASS');
  assert.equal(metrics.controlledOptimization.duplicateGate, 'PASS');
  assert.equal(metrics.controlledOptimization.optimizationApproved, true);
});

test('the aggregate report requires admin role, MFA, and analytics capability', () => {
  const routes = fs.readFileSync(
    path.resolve(process.cwd(), 'src/routes/adminAnalytics.routes.ts'),
    'utf8',
  );
  assert.match(routes, /router\.use\('\/admin\/analytics', authenticate, requireMfa, requireRole\(UserRole\.ADMIN\), requireCapability\('ANALYTICS_VIEW'\)\)/);
  assert.match(routes, /'\/admin\/analytics\/refinance-radar'/);
});
