const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  aggregateServiceQuoteDecisionMetrics,
} = require('../../src/services/adminAnalytics/serviceQuoteDecisionMetricsService.ts');
const {
  outcomeConsentAllows,
} = require('../../src/services/serviceQuoteDecisionAnalytics.service.ts');
const {
  serviceQuoteOutcomeConsentSchema,
} = require('../../src/validators/quoteComparison.validators.ts');

const from = new Date('2026-07-01T00:00:00.000Z');
const to = new Date('2026-07-31T23:59:59.999Z');

function workspace(overrides = {}) {
  return {
    id: 'workspace-1',
    propertyId: 'property-1',
    outcome: 'COMPLETED',
    journeyStage: 'COMPLETED',
    outcomeMeasurementConsentedAt: new Date('2026-07-10T00:00:00.000Z'),
    outcomeMeasurementConsentRevokedAt: null,
    quotes: [{
      readinessStage: 'COMPARISON_READY',
      homeownerConfirmedAt: new Date('2026-07-05T00:00:00.000Z'),
    }],
    transitions: [{ toStage: 'COMPARISON', outcome: 'OPEN' }],
    booking: { status: 'COMPLETED', finalPrice: 3100, completedAt: new Date() },
    ...overrides,
  };
}

test('outcome consent is explicit, scoped, and revocable', () => {
  const consent = {
    outcomeMeasurementConsentJson: {
      finalPrice: true,
      changeOrders: false,
      policyVersion: 'service-quote-outcomes-v1',
    },
    outcomeMeasurementConsentedAt: new Date(),
    outcomeMeasurementConsentRevokedAt: null,
  };
  assert.equal(outcomeConsentAllows(consent, 'finalPrice'), true);
  assert.equal(outcomeConsentAllows(consent, 'changeOrders'), false);
  assert.equal(outcomeConsentAllows({
    ...consent,
    outcomeMeasurementConsentRevokedAt: new Date(),
  }, 'finalPrice'), false);

  assert.equal(serviceQuoteOutcomeConsentSchema.safeParse({
    consented: true,
    finalPrice: false,
    changeOrders: false,
    policyVersion: 'service-quote-outcomes-v1',
  }).success, false);
  assert.equal(serviceQuoteOutcomeConsentSchema.safeParse({
    consented: false,
    finalPrice: false,
    changeOrders: false,
    policyVersion: 'service-quote-outcomes-v1',
  }).success, true);
});

test('operator metrics separate evidence, outcomes, and consented learning data', () => {
  const report = aggregateServiceQuoteDecisionMetrics({
    from,
    to,
    workspaces: [workspace()],
    checks: [
      {
        serviceCategory: 'HVAC',
        pricingFactorsJson: { benchmark: { evidenceLevel: 'QUALIFIED_BENCHMARK' } },
      },
      {
        serviceCategory: 'HVAC',
        pricingFactorsJson: { benchmark: { evidenceLevel: 'CATEGORY_HEURISTIC_ONLY' } },
      },
    ],
    analyticsEvents: [
      { eventName: 'service_quote_clarification_requested', propertyId: 'property-1', valueNumeric: null },
      { eventName: 'service_quote_scope_changed_after_warning', propertyId: 'property-1', valueNumeric: null },
      { eventName: 'service_quote_work_completed', propertyId: 'property-1', valueNumeric: 3100 },
    ],
    benchmarkSources: [{
      isActive: true,
      rightsStatus: 'APPROVED',
      reviewStatus: 'APPROVED',
      health: { status: 'HEALTHY' },
    }],
  });

  assert.equal(report.funnel.explicitDecisions, 1);
  assert.equal(report.funnel.completedWork, 1);
  assert.equal(report.evidence.qualifiedCoverageRate, 0.5);
  assert.equal(report.decisionQuality.scopeChangesAfterWarnings, 1);
  assert.equal(report.consent.verifiedFinalPriceCaptures, 1);
  assert.equal(report.governedLearning.eligibleForInternalBenchmarkDerivation, false);
});

test('internal benchmark derivation stays gated until both privacy minimums pass', () => {
  const verifiedEvents = Array.from({ length: 20 }, (_, index) => ({
    eventName: 'service_quote_work_completed',
    propertyId: `property-${index % 10}`,
    valueNumeric: 1000 + index,
  }));
  const report = aggregateServiceQuoteDecisionMetrics({
    from,
    to,
    workspaces: [],
    checks: [],
    analyticsEvents: verifiedEvents,
    benchmarkSources: [],
  });
  assert.equal(report.governedLearning.verifiedObservationCount, 20);
  assert.equal(report.governedLearning.distinctPropertyCount, 10);
  assert.equal(report.governedLearning.eligibleForInternalBenchmarkDerivation, true);
  assert.match(report.governedLearning.rules.join(' '), /cannot activate itself/i);
});

