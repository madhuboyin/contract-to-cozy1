const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  ServicePriceRadarEngine,
} = require('../../src/services/servicePriceRadar.engine.ts');
const {
  selectBestQualifiedBenchmark,
} = require('../../src/services/servicePriceRadar.service.ts');
const {
  createServicePriceRadarBodySchema,
} = require('../../src/validators/servicePriceRadar.validators.ts');
const {
  evaluateQuoteComparability,
  evaluateQuoteReadiness,
} = require('../../src/services/quoteComparability.service.ts');
const {
  canTransitionServiceQuoteDecision,
} = require('../../src/services/serviceQuoteDecisionTransitions.ts');
const {
  canonicalCapabilityRegistry,
} = require('../../src/productFramework/capabilities/index.ts');

const evaluatedAt = new Date('2026-07-28T12:00:00.000Z');

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

function property(overrides = {}) {
  return {
    propertyId: 'property-1',
    homeownerProfileId: 'profile-1',
    dwellingType: 'SINGLE_FAMILY_DETACHED',
    propertySize: 1900,
    sizeBand: 'MEDIUM',
    yearBuilt: 1995,
    city: 'Hoboken',
    state: 'NJ',
    zipCode: '07030',
    systems: {
      heatingType: null,
      coolingType: null,
      waterHeaterType: null,
      roofType: null,
      foundationType: null,
      sidingType: null,
      hasDrainageIssues: null,
    },
    ...overrides,
  };
}

function benchmark(overrides = {}) {
  return {
    id: 'benchmark-1',
    releaseId: 'release-1',
    normalizedScopeKey: 'hvac:heat_pump_replacement',
    serviceCategory: 'HVAC',
    serviceSubcategory: 'heat_pump_replacement',
    regionType: 'STATE',
    regionKey: 'NJ',
    homeType: null,
    sizeBand: null,
    unit: 'JOB',
    quantityLow: 1,
    quantityHigh: 1,
    currency: 'USD',
    baseLow: 6000,
    baseHigh: 10000,
    baseMedian: 8000,
    percentileLow: 0.25,
    percentileHigh: 0.75,
    sampleSize: 40,
    laborFactor: 1,
    materialFactor: 1,
    complexityFactorJson: null,
    observationNotes: null,
    sourceId: 'source-1',
    sourceKey: 'reviewed-provider',
    sourceName: 'Reviewed Provider',
    sourceUrl: 'https://example.com/methodology',
    licenseSummary: 'Licensed for homeowner-facing aggregate comparisons.',
    sourceRightsStatus: 'APPROVED',
    sourceReviewStatus: 'APPROVED',
    sourceIsActive: true,
    sourceHealthStatus: 'HEALTHY',
    sourceHealthCheckedAt: new Date('2026-07-28T10:00:00.000Z'),
    releaseVersion: '2026-07',
    releaseStatus: 'ACTIVE',
    releaseQualityStatus: 'PASSED',
    observationStart: new Date('2026-01-01T00:00:00.000Z'),
    observationEnd: new Date('2026-06-30T23:59:59.000Z'),
    publishedAt: new Date('2026-07-05T00:00:00.000Z'),
    retrievedAt: new Date('2026-07-06T00:00:00.000Z'),
    effectiveAt: new Date('2026-07-10T00:00:00.000Z'),
    expiresAt: new Date('2026-10-10T00:00:00.000Z'),
    methodologySummary: 'Observed completed jobs normalized by equipment size and scope.',
    geographyDefinitionJson: { type: 'state' },
    cohortDefinitionJson: { service: 'heat-pump replacement' },
    percentileDefinitionJson: { low: 'p25', high: 'p75' },
    reviewedAt: new Date('2026-07-08T00:00:00.000Z'),
    activatedAt: new Date('2026-07-10T00:00:00.000Z'),
    importRunStatus: 'VALIDATED',
    importChecksumSha256: 'a'.repeat(64),
    ...overrides,
  };
}

function input(quoteAmount) {
  return {
    serviceCategory: 'HVAC',
    serviceSubcategory: 'heat_pump_replacement',
    serviceLabelRaw: '3 ton heat pump replacement',
    quoteAmount,
    quoteCurrency: 'USD',
  };
}

function qualifiedMatch(record = benchmark()) {
  return {
    matched: true,
    qualified: true,
    benchmark: record,
    qualificationReasons: [],
  };
}

function completeProposal(overrides = {}) {
  return {
    id: 'quote-1',
    vendorName: 'Example HVAC',
    quoteAmount: 8200,
    serviceCategory: 'HVAC',
    scopeKind: 'REPLACEMENT',
    serviceLocation: 'attic',
    quoteDate: '2026-07-28T12:00:00.000Z',
    scopeSummary: 'Replace the attic air handler.',
    lineItems: [
      { description: 'Air handler replacement', kind: 'EQUIPMENT', quantity: 1, unit: 'each', unitPrice: 7000, total: 7000 },
      { description: 'Installation labor', kind: 'LABOR', quantity: 8, unit: 'hour', unitPrice: 150, total: 1200 },
    ],
    terms: [
      { type: 'INCLUSION', value: 'Equipment and installation' },
      { type: 'EXCLUSION', value: 'Electrical panel upgrades' },
      { type: 'WARRANTY', value: '10-year parts, 1-year labor' },
      { type: 'PAYMENT', value: '20% deposit; balance on completion' },
    ],
    homeownerConfirmedAt: '2026-07-28T13:00:00.000Z',
    ...overrides,
  };
}

test('qualified verdict truth table preserves every pricing boundary', () => {
  const engine = new ServicePriceRadarEngine();
  const baseline = engine.evaluate(property(), input(8000), [], qualifiedMatch());
  const low = baseline.expectedLow;
  const high = baseline.expectedHigh;
  const cases = [
    { amount: low * 0.79, verdict: 'UNDERPRICED' },
    { amount: low * 0.8, verdict: 'FAIR' },
    { amount: high, verdict: 'FAIR' },
    { amount: high * 1.25, verdict: 'HIGH' },
    { amount: high * 1.251, verdict: 'VERY_HIGH' },
  ];

  for (const entry of cases) {
    const result = engine.evaluate(property(), input(entry.amount), [], qualifiedMatch());
    assert.equal(result.verdict, entry.verdict, `quote amount ${entry.amount}`);
    assert.equal(result.pricingFactorsJson.benchmark.evidenceLevel, 'QUALIFIED_BENCHMARK');
  }
});

test('unavailable, stale, nonmatching, and ambiguous evidence all fail closed', () => {
  const candidates = [
    benchmark({
      id: 'stale',
      expiresAt: new Date('2026-07-28T11:59:59.000Z'),
    }),
  ];
  const stale = selectBestQualifiedBenchmark(
    candidates,
    property(),
    'heat_pump_replacement',
    evaluatedAt,
  );
  assert.equal(stale.qualified, false);
  assert.ok(stale.qualificationReasons.includes('RELEASE_NOT_CURRENT'));

  const nonmatching = selectBestQualifiedBenchmark(
    [benchmark({ regionKey: 'CA' })],
    property(),
    'heat_pump_replacement',
    evaluatedAt,
  );
  assert.deepEqual(nonmatching.qualificationReasons, ['NO_MATCHING_BENCHMARK']);

  const ambiguous = selectBestQualifiedBenchmark(
    [benchmark(), benchmark({ id: 'benchmark-2', releaseId: 'release-2' })],
    property(),
    'heat_pump_replacement',
    evaluatedAt,
  );
  assert.deepEqual(ambiguous, {
    matched: false,
    qualified: false,
    benchmark: null,
    qualificationReasons: ['AMBIGUOUS_BENCHMARK_MATCH'],
  });

  const result = new ServicePriceRadarEngine().evaluate(
    property(),
    input(8000),
    [],
    ambiguous,
  );
  assert.equal(result.verdict, 'INSUFFICIENT_DATA');
  assert.equal(result.pricingFactorsJson.benchmark.evidenceLevel, 'CATEGORY_HEURISTIC_ONLY');
  assert.ok(result.explanationJson.limitations.some((item) => /cannot determine/i.test(item)));
});

test('regulated categories and unsafe amount boundaries are rejected before evaluation', () => {
  for (const serviceCategory of ['INSURANCE', 'ATTORNEY', 'FINANCE']) {
    const result = createServicePriceRadarBodySchema.safeParse({
      serviceCategory,
      quoteAmount: 500,
    });
    assert.equal(result.success, false, serviceCategory);
    assert.match(result.error.issues[0].message, /not supported/i);
  }

  for (const quoteAmount of [0, -1, 250000.01, Number.POSITIVE_INFINITY]) {
    assert.equal(createServicePriceRadarBodySchema.safeParse({
      serviceCategory: 'HVAC',
      quoteAmount,
    }).success, false, String(quoteAmount));
  }
});

test('structured scope blocks ambiguous units and unreconciled totals', () => {
  const missingUnit = evaluateQuoteReadiness(completeProposal({
    lineItems: [{ description: 'Ductwork', quantity: 40, total: 2000 }],
  }));
  assert.equal(missingUnit.stage, 'REVIEW_READY');
  assert.ok(missingUnit.ambiguities.some((item) => item.key.endsWith('.unit')));

  const unreconciled = evaluateQuoteReadiness(completeProposal({
    lineItems: [{ description: 'Ductwork', quantity: 40, unit: 'foot', unitPrice: 50, total: 500 }],
  }));
  assert.equal(unreconciled.stage, 'REVIEW_READY');
  assert.ok(unreconciled.ambiguities.some((item) => item.key.endsWith('.total')));

  const differentUnits = evaluateQuoteComparability([
    completeProposal(),
    completeProposal({
      id: 'quote-2',
      lineItems: [
        { description: 'Condenser replacement', kind: 'EQUIPMENT', quantity: 1, unit: 'each', total: 7000 },
        { description: 'Installation labor', kind: 'LABOR', quantity: 1, unit: 'job', total: 1200 },
      ],
    }),
  ]);
  assert.equal(differentUnits.status, 'NOT_COMPARABLE');
});

test('authorization, persistence, idempotency, and delete gates remain wired', () => {
  const radarRoutes = source('../../src/routes/servicePriceRadar.routes.ts');
  const quoteRoutes = source('../../src/routes/quoteComparison.routes.ts');
  const quoteService = source('../../src/services/quoteComparison.service.ts');
  const journeyService = source('../../src/services/serviceQuoteDecisionJourney.service.ts');

  for (const routes of [radarRoutes, quoteRoutes]) {
    assert.match(routes, /router\.use\(authenticate\)/);
    assert.match(routes, /propertyAuthMiddleware/);
  }
  assert.match(quoteRoutes, /router\.delete\(/);
  assert.match(quoteService, /quoteComparisonQuote\.findFirst\(\{\s*where: \{ id: quoteId, workspaceId \}/);
  assert.match(quoteService, /QUOTE_LINKED_TO_FINALIZATION/);
  assert.match(quoteService, /SERVICE_QUOTE_PROPOSALS_LOCKED/);
  assert.match(journeyService, /idempotencyKey = `service-quote-decision:/);
  assert.match(journeyService, /homeEvent\.findFirst\(\{\s*where: \{ propertyId: input\.propertyId, idempotencyKey \}/);
});

test('cross-stage outcomes are bounded and commercial handoffs cannot skip linked records', () => {
  const stages = [
    'QUOTE_INTAKE',
    'PRICE_REVIEW',
    'SCOPE_REVIEW',
    'COMPARISON',
    'NEGOTIATION',
    'FINALIZATION',
    'BOOKING',
    'SCHEDULED',
    'COMPLETED',
    'CLOSED',
  ];
  for (const stage of stages) {
    assert.equal(canTransitionServiceQuoteDecision(stage, stage), true);
  }
  assert.equal(canTransitionServiceQuoteDecision('COMPARISON', 'FINALIZATION'), true);
  assert.equal(canTransitionServiceQuoteDecision('FINALIZATION', 'BOOKING'), true);
  assert.equal(canTransitionServiceQuoteDecision('BOOKING', 'SCHEDULED'), true);
  assert.equal(canTransitionServiceQuoteDecision('SCHEDULED', 'COMPLETED'), true);
  assert.equal(canTransitionServiceQuoteDecision('QUOTE_INTAKE', 'BOOKING'), false);
  assert.equal(canTransitionServiceQuoteDecision('COMPARISON', 'BOOKING'), false);
  assert.equal(canTransitionServiceQuoteDecision('CLOSED', 'COMPARISON'), false);

  const finalization = source('../../src/services/priceFinalization.service.ts');
  const booking = source('../../src/services/booking.service.ts');
  const radar = source('../../src/services/servicePriceRadar.service.ts');
  assert.match(finalization, /toStage: 'FINALIZATION'/);
  assert.match(finalization, /toStage: 'BOOKING'/);
  assert.match(booking, /toStage: 'SCHEDULED'/);
  assert.doesNotMatch(radar, /Book this service|book while the price is right/i);
});

test('golden contextual readiness requires explicit quote intent on an accepted context', () => {
  const fixtures = JSON.parse(source(
    '../fixtures/servicePriceRadar/contextualReadiness.golden.json',
  ));
  const capability = canonicalCapabilityRegistry.getById('service-price-radar');
  assert.ok(capability);
  assert.equal(capability.recommendation.requiresExplicitTrigger, true);

  for (const fixture of fixtures) {
    const acceptedContext = capability.destination.acceptedContext
      .includes(fixture.contextType);
    const explicitSignal = fixture.signalIntentFamilies.some((signal) =>
      capability.recommendation.triggerFamilies.includes(signal));
    assert.equal(
      acceptedContext && explicitSignal,
      fixture.expectedCandidate,
      fixture.id,
    );
  }
});
