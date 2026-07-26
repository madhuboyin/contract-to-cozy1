const test = require('node:test');
const assert = require('node:assert/strict');

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
      }),
      analytics('refinance_loan_estimate_markdown_exported'),
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
  assert.equal(metrics.funnel.loanEstimateDocumentsExtracted, 1);
  assert.equal(metrics.funnel.loanEstimateImageOcrExtractions, 1);
  assert.equal(metrics.funnel.loanEstimatePagesProcessed, 3);
  assert.equal(metrics.funnel.loanEstimateMarkdownExports, 1);
  assert.equal(metrics.funnel.loanEstimateComparisonsDeleted, 1);
  assert.equal(metrics.decisionQuality.medianProjectedMonthlySavingsUsd, 325);
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
    currentlyOpenProperties: 0,
  });
  assert.equal(metrics.population.eligibleProfileActivationRate, null);
  assert.equal(metrics.monitoring.evaluationCoverageRate, null);
  assert.equal(metrics.funnel.homeToRadarConversionRate, null);
  assert.equal(metrics.decisionQuality.helpfulRate, null);
});
