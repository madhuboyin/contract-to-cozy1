const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const { ASK_SEMANTIC_DOMAINS } = require('../../src/services/ask/semantic/phase0/semanticOntologyBaseline.ts');
const { executeCrossDomainWaves, buildSeededCrossDomainSnapshot } = require('../../src/services/ask/semantic/waves/index.ts');
const { dataPointReadResult } = require('../../src/services/ask/handlers/dataPointRead.handler.ts');
const {
  ASK_PHASE6_CALIBRATION_VERSION,
  ASK_PHASE6_EVALUATION_VERSION,
  ASK_PHASE6_PROVIDER_VERSION,
  GeminiSemanticUnderstandingProvider,
  PHASE6_SEALED_EVALUATION_CASES,
  SEMANTIC_RISK_STRATUM_POLICIES,
  SealedOfflineStructuredProvider,
  buildPhase6CalibrationAndEvaluationSummary,
  classifySemanticRiskStratum,
  evaluateRiskStratifiedCalibration,
  executeTwoStageProviderRetrieval,
  extractMultidimensionalConfidence,
  interpretWithSemanticProducers,
  resolveDefaultSemanticProviderPolicy,
  runPhase6EndToEndEvaluation,
  validateAndMapMinimizedSpanToRaw,
} = require('../../src/services/ask/semantic/phase6/index.ts');
const { buildSemanticTextEnvelope } = require('../../src/services/ask/semantic/phase2a/placeholderSpanMap.ts');

test('Track P two-stage provider orchestration preserves stable facet IDs, dependencies, bounded concurrency, and 6-facet overflow', async () => {
  const provider = new SealedOfflineStructuredProvider('NOMINAL');
  const prompt = [
    'which property tax bills are still unpaid',
    'what claims are still open',
    'which projects still need a permit',
    'show maintenance tasks due next month',
    'are any of my appliances affected by recalls',
    'show my saved results',
    'what buyer deadlines are due before closing',
  ].join(', ');

  const result = await executeTwoStageProviderRetrieval({
    rawText: prompt,
    provider,
    enforceConcurrencyOverflow: true,
  });

  assert.equal(ASK_PHASE6_PROVIDER_VERSION, 'phase6-provider-orchestrator-1.0.0');
  assert.equal(result.status, 'MATCH');
  assert.equal(result.unionStage2Used, false);
  assert.equal(result.plan.facets.length, 6);
  assert.equal(result.overflowFacets.length, 1);
  assert.equal(result.overflowFacets[0].reasonCode, 'DOMAIN_NOT_SEARCHED');
  assert.ok(result.stage2CallCount >= 2);
  assert.ok(result.maxObservedStage2Concurrency <= 3);

  // Verify Stage 1 FACET_SPANS preserves cross-facet dependsOnIndexes -> stable facet IDs
  const depPrompt = 'check my home status: which appliances have a warranty, and which claim documents are missing?';
  const depRes = await executeTwoStageProviderRetrieval({
    rawText: depPrompt,
    provider,
  });
  assert.equal(depRes.status, 'MATCH');
  assert.equal(depRes.plan.facets.length, 2);
  assert.deepEqual(depRes.plan.facets[1].dependsOn, [depRes.plan.facets[0].id]);
  assert.equal(depRes.plan.facets[0].domainCandidates[0].id, 'domain.warranties_coverage');
});

test('Track P supports Stage 1 FLAT_DOMAIN_LIST single-union Stage 2 fallback and rejects invalid minimized spans', async () => {
  const flatProvider = new SealedOfflineStructuredProvider('FLAT_STAGE_ONE');
  const flatResult = await executeTwoStageProviderRetrieval({
    rawText: 'which property tax bills are unpaid and what claims are open?',
    provider: flatProvider,
  });

  assert.equal(flatResult.status, 'MATCH');
  assert.equal(flatResult.unionStage2Used, true);
  assert.equal(flatResult.stage2CallCount, 1);
  assert.ok(flatResult.plan.facets.length >= 2);

  // Bijection check with protected placeholders
  const raw = 'show replacement cost for my Carrier Furnace ($6,800) in Basement';
  const envelope = buildSemanticTextEnvelope(raw, {
    dynamicEntities: [
      { kind: 'ITEM', entityId: 'entity.inventory_item', recordId: 'item-furnace', names: ['Carrier Furnace'], authorized: true },
      { kind: 'ROOM', entityId: 'entity.room', recordId: 'room-basement', names: ['Basement'], authorized: true },
    ],
  });
  const goodSpanCheck = validateAndMapMinimizedSpanToRaw(
    { start: 0, end: envelope.minimizedText.length, text: envelope.minimizedText },
    envelope,
  );
  assert.equal(goodSpanCheck.ok, true);
  assert.equal(goodSpanCheck.rawSpan.text, raw);

  const badSpanCheck = validateAndMapMinimizedSpanToRaw(
    { start: 0, end: 5, text: 'BOGUS' },
    envelope,
  );
  assert.equal(badSpanCheck.ok, false);
  assert.match(badSpanCheck.reason, /min_span_text_mismatch/);

  const invalidProvider = new SealedOfflineStructuredProvider('INVALID_MINIMIZED_SPAN');
  const invalidResult = await executeTwoStageProviderRetrieval({
    rawText: 'show my warranty coverage for Bosch Fridge',
    provider: invalidProvider,
  });
  assert.equal(invalidResult.status, 'SCHEMA_INVALID');
});

test('Track P enforces deterministic-first short-circuit, dual-producer reconciliation, provider outages (FR-UND-6), and §22.3 external approval gate', async () => {
  // Deterministic complete -> production short-circuits provider call cleanly
  const detPrompt = 'which property tax bills are still unpaid?';
  const shortCircuit = await interpretWithSemanticProducers({
    rawText: detPrompt,
    evaluationMode: 'PRODUCTION_SHORT_CIRCUIT',
    provider: new SealedOfflineStructuredProvider('NOMINAL'),
  });
  assert.equal(shortCircuit.shortCircuitedProvider, true);
  assert.equal(shortCircuit.reconciliationStatus, 'DETERMINISTIC_ONLY');
  assert.equal(shortCircuit.providerResult, null);

  // Provider incremental expansion on paraphrase missed by deterministic parser
  const paraphrasePrompt = 'show appliances lacking protection coverage';
  const paraphraseRes = await interpretWithSemanticProducers({
    rawText: paraphrasePrompt,
    evaluationMode: 'PRODUCTION_SHORT_CIRCUIT',
    provider: new SealedOfflineStructuredProvider('NOMINAL'),
  });
  assert.equal(paraphraseRes.shortCircuitedProvider, false);
  assert.equal(paraphraseRes.reconciliationStatus, 'PROVIDER_INCREMENTAL');
  assert.equal(paraphraseRes.plan.outcome, 'MATCH');
  assert.equal(paraphraseRes.plan.facets[0].domainCandidates[0].id, 'domain.warranties_coverage');

  // Execute the provider plan end-to-end against seeded snapshot
  const snapshot = buildSeededCrossDomainSnapshot();
  const execParaphrase = await executeCrossDomainWaves({
    rawText: paraphrasePrompt,
    snapshot,
    role: 'OWNER',
    propertyAuthorized: true,
    planOverride: paraphraseRes.plan,
  });
  assert.equal(execParaphrase.status, 'ANSWERED');
  assert.ok(execParaphrase.facetResults.some((r) => r.recordIds.includes('item-water-heater')));

  // Dual-producer material disagreement detection
  const disagreeRes = await interpretWithSemanticProducers({
    rawText: detPrompt,
    evaluationMode: 'DUAL_PRODUCER',
    provider: new SealedOfflineStructuredProvider('MATERIAL_DISAGREEMENT'),
  });
  assert.equal(disagreeRes.reconciliationStatus, 'MATERIAL_DISAGREEMENT');
  assert.ok(disagreeRes.disagreements.length >= 1);

  // FR-UND-6 outage resilience: deterministic path unaffected when provider fails
  const outageWithDet = await interpretWithSemanticProducers({
    rawText: detPrompt,
    evaluationMode: 'DUAL_PRODUCER',
    provider: new SealedOfflineStructuredProvider('OUTAGE'),
  });
  assert.equal(outageWithDet.plan.outcome, 'MATCH');
  assert.equal(outageWithDet.reconciliationStatus, 'DETERMINISTIC_ONLY');

  // Unmatched request with provider outage preserves PROVIDER_UNAVAILABLE transparently
  const outageNoDet = await interpretWithSemanticProducers({
    rawText: paraphrasePrompt,
    evaluationMode: 'DUAL_PRODUCER',
    provider: new SealedOfflineStructuredProvider('OUTAGE'),
  });
  assert.equal(outageNoDet.plan.outcome, 'PROVIDER_UNAVAILABLE');

  // §22.3 owner approval gate blocks unapproved live Gemini calls unless opted in explicitly
  const defaultPolicy = resolveDefaultSemanticProviderPolicy({});
  assert.equal(defaultPolicy.approvalStatus, 'UNRESOLVED_OWNER_APPROVAL');
  const geminiBlocked = await executeTwoStageProviderRetrieval({
    rawText: detPrompt,
    provider: new GeminiSemanticUnderstandingProvider(),
    policy: defaultPolicy,
  });
  assert.equal(geminiBlocked.status, 'PROVIDER_UNAVAILABLE');
  assert.match(geminiBlocked.failureReason ?? '', /owner sign-off/i);
});

test('Phase 6 6-stratum PAV calibration enforces 11-feature vectors and Wilson 95% bounds on high-confidence errors', () => {
  assert.equal(ASK_PHASE6_CALIBRATION_VERSION, 'phase6-risk-calibration-1.0.0');
  assert.equal(Object.keys(SEMANTIC_RISK_STRATUM_POLICIES).length, 6);

  const detPrompt = 'compare my property tax this year vs last year';
  const compareFacet = {
    id: 'facet_compare',
    sourceSpan: { start: 0, end: detPrompt.length, text: detPrompt },
    requestClass: 'DATA_QUERY',
    domainCandidates: [{ id: 'domain.property_profile', score: 0.96 }],
    subject: null,
    relations: [],
    polarity: 'POSITIVE',
    projection: 'COMPARE',
    fields: [],
    where: null,
    sort: [],
    limit: null,
    time: null,
    groupBy: [],
    targetCandidates: [{ id: 'query.property_tax_bill.compare_years', score: 0.95 }],
    requiredSlots: [],
    dependsOn: [],
    evidence: {
      jobMatch: 'query.property_tax_bill.compare_years',
      subjectNamed: true,
      relationNamed: false,
      projectionNamed: true,
      polarityNamed: true,
    },
    confidenceSignals: { grammarComplete: true, unresolvedSpanCount: 0 },
  };
  const compareStratum = classifySemanticRiskStratum({
    outcome: 'MATCH',
    facet: compareFacet,
  });
  assert.equal(compareStratum, 'AGGREGATE_OR_COMPARISON_READ');

  const features = extractMultidimensionalConfidence({
    stratum: compareStratum,
    facet: compareFacet,
    entityResolved: true,
    producerKind: 'RECONCILED',
    providerAvailable: true,
    shortCircuitedProvider: false,
    schemaValid: true,
  });
  assert.equal(features.vector.languageLocale, 'en-US');

  // Injecting incorrect high-confidence outputs must fail statistical Wilson bound checks
  const badCalibration = evaluateRiskStratifiedCalibration([
    {
      caseId: 'bad-high-1',
      stratum: 'WRITE_OR_CONSEQUENTIAL_ACTION',
      rawScore: 0.96,
      highConfidenceAdmitted: true,
      correct: false,
    },
    {
      caseId: 'bad-high-2',
      stratum: 'WRITE_OR_CONSEQUENTIAL_ACTION',
      rawScore: 0.95,
      highConfidenceAdmitted: true,
      correct: false,
    },
  ]);
  assert.equal(badCalibration.overallPassed, false);
  assert.ok(badCalibration.failedStrata.includes('WRITE_OR_CONSEQUENTIAL_ACTION'));
  assert.equal(badCalibration.totalIncorrectHighConfidence, 2);
});

test('Phase 6 end-to-end evaluation harness passes all FR-EVAL-4 gates across all 15 domains as SEALED_PROXY', async () => {
  const report = await runPhase6EndToEndEvaluation();

  assert.equal(report.version, ASK_PHASE6_EVALUATION_VERSION);
  assert.equal(report.evaluationNature, 'SEALED_PROXY');
  assert.equal(report.isRealHomeownerTrafficDistribution, false);
  assert.equal(report.passed, true);
  assert.deepEqual(report.failedDomains, []);
  assert.deepEqual(report.failedStrata, []);

  assert.equal(report.frEval3Metrics.perDomainCoverageProfiles.length, ASK_SEMANTIC_DOMAINS.length);
  assert.equal(report.frEval3Metrics.wrongAnswerRate, 0);
  assert.equal(report.frEval3Metrics.falseDeclineRate, 0);
  assert.equal(report.frEval3Metrics.internalIdentifierLeakCount, 0);
  assert.equal(report.frEval3Metrics.protectedSpanRoundTripAccuracy, 1);
  assert.equal(report.frEval3Metrics.replayReauthorizationRedactionAccuracy, 1);
  assert.equal(report.frEval3Metrics.sixFacetCompletenessAndOverflowRate, 1);
  assert.equal(report.frEval3Metrics.conflictedPopulationProjectionAccuracy, 1);
  assert.equal(report.frEval3Metrics.replayQueryCountBounds.passed, true);
  assert.ok(report.frEval3Metrics.providerExpandedIncrementalCoverageRate > 0);

  // Verify FR-EVAL-1 separation of domain correctness vs language coverage
  for (const domainTelemetry of report.frEval3Metrics.perDomainTelemetry) {
    assert.equal(domainTelemetry.correctnessState, 'ENABLED_FOR_DECLARED_SCOPE');
    assert.ok(domainTelemetry.combinedResolvedRate >= domainTelemetry.deterministicResolvedRate);
  }

  // Verify §19 #22 requirement-to-evidence matrix and §22 openness
  assert.ok(PHASE6_SEALED_EVALUATION_CASES.length >= 25);
  assert.ok(report.requirementToEvidenceMatrix.some((r) => r.requirementId === 'FR-EVAL-1..6' && r.status === 'SEALED_PROXY_VERIFIED'));
  assert.ok(report.requirementToEvidenceMatrix.some((r) => r.requirementId === '§22.1..7' && r.status === 'OWNER_DECISION_OPEN'));

  const summary = await buildPhase6CalibrationAndEvaluationSummary();
  assert.equal(summary.passed, true);
  assert.equal(summary.evaluationNature, 'SEALED_PROXY');
  assert.equal(summary.passedGateCount, summary.totalGateCount);
});

test('Phase 6 review fixes: repeated span mapping, strict calibration bound, budget enforcement, strict domains, and production handler wiring', async () => {
  // 1. P1 #3: Repeated identical substrings must map to distinct raw offsets
  const repeatedRaw = 'claims open and claims open';
  const repeatedEnvelope = buildSemanticTextEnvelope(repeatedRaw);
  const firstIdx = repeatedRaw.indexOf('claims open');
  const secondIdx = repeatedRaw.indexOf('claims open', firstIdx + 1);
  const firstMap = validateAndMapMinimizedSpanToRaw(
    { start: firstIdx, end: firstIdx + 'claims open'.length, text: 'claims open' },
    repeatedEnvelope,
  );
  const secondMap = validateAndMapMinimizedSpanToRaw(
    { start: secondIdx, end: secondIdx + 'claims open'.length, text: 'claims open' },
    repeatedEnvelope,
  );
  assert.equal(firstMap.ok, true);
  assert.equal(secondMap.ok, true);
  assert.equal(firstMap.rawSpan.start, firstIdx);
  assert.equal(secondMap.rawSpan.start, secondIdx);
  assert.notEqual(secondMap.rawSpan.start, firstMap.rawSpan.start);

  // Also verify repeated phrase after placeholder & collapsed spaces maps to second raw occurrence
  const spacedRaw = 'my furnace claims open   and   claims open';
  const spacedEnvelope = buildSemanticTextEnvelope(spacedRaw, {
    dynamicEntities: [
      { kind: 'ITEM', entityId: 'entity.inventory_item', recordId: 'item-furnace', names: ['furnace'], authorized: true },
    ],
  });
  const secondSpacedMinStart = spacedEnvelope.minimizedText.lastIndexOf('claims open');
  const secondSpacedMap = validateAndMapMinimizedSpanToRaw(
    { start: secondSpacedMinStart, end: secondSpacedMinStart + 'claims open'.length, text: 'claims open' },
    spacedEnvelope,
  );
  assert.equal(secondSpacedMap.ok, true);
  assert.equal(secondSpacedMap.rawSpan.start, spacedRaw.lastIndexOf('claims open'));
  assert.equal(secondSpacedMap.rawSpan.text, 'claims open');

  // 2. P1 #2: Small-N observations (upper95 ~ 79.35%) must NOT pass FR-EVAL-4 Wilson < 1% calibration gate
  const smallNReport = evaluateRiskStratifiedCalibration([
    { caseId: 's1', stratum: 'REVERSIBLE_PROPERTY_READ', rawScore: 0.95, highConfidenceAdmitted: true, correct: true },
    { caseId: 's2', stratum: 'AGGREGATE_OR_COMPARISON_READ', rawScore: 0.95, highConfidenceAdmitted: true, correct: true },
    { caseId: 's3', stratum: 'RECOMMENDATION_OR_MATERIAL_ANALYSIS', rawScore: 0.95, highConfidenceAdmitted: true, correct: true },
    { caseId: 's4', stratum: 'AMBIGUOUS_SLOT_OR_ENTITY', rawScore: 0.95, highConfidenceAdmitted: true, correct: true },
    { caseId: 's5', stratum: 'WRITE_OR_CONSEQUENTIAL_ACTION', rawScore: 0.95, highConfidenceAdmitted: true, correct: true },
    { caseId: 's6', stratum: 'SAFETY_OR_RESTRICTED_BOUNDARY', rawScore: 0.95, highConfidenceAdmitted: true, correct: true },
  ]);
  assert.equal(smallNReport.overallPassed, false);
  assert.equal(smallNReport.failedStrata.length, 6);
  for (const stratum of smallNReport.strata) {
    assert.ok(stratum.incorrectHighConfidenceUpper95Bound >= 0.01);
    assert.equal(stratum.gatePassed, false);
  }

  // 3. P2 #4: Enforce maxStage1LatencyMs, maxStage2LatencyMs, and maxEstimatedCostUsdPerTurn budgets
  const approvedPolicy = {
    approvalStatus: 'APPROVED_FOR_STRUCTURED_PLANNING',
    recordedDecisionNote: 'test approved',
    budgets: {
      maxStage1LatencyMs: 600,
      maxStage2LatencyMs: 1200,
      maxEstimatedCostUsdPerTurn: 0.015,
      maxConcurrentStage2Calls: 3,
      maxAdmittedFacets: 6,
    },
  };
  const stage1LatencyBreach = await executeTwoStageProviderRetrieval({
    rawText: 'which claims are still open?',
    policy: approvedPolicy,
    provider: {
      providerId: 'slow-s1',
      version: '1.0.0',
      isExternalNetworkProvider: false,
      async runStageOne() {
        return {
          mode: 'FLAT_DOMAIN_LIST',
          domainIds: ['domain.warranties_coverage'],
          latencyMs: 650,
          estimatedCostUsd: 0.001,
        };
      },
      async runStageTwo() {
        throw new Error('should not run stage2 after stage1 latency breach');
      },
    },
  });
  assert.equal(stage1LatencyBreach.status, 'PROVIDER_UNAVAILABLE');
  assert.match(stage1LatencyBreach.failureReason ?? '', /PROVIDER_BUDGET_EXCEEDED:stage1_latency/);

  const costBreach = await executeTwoStageProviderRetrieval({
    rawText: 'which claims are still open?',
    policy: approvedPolicy,
    provider: {
      providerId: 'expensive-s2',
      version: '1.0.0',
      isExternalNetworkProvider: false,
      async runStageOne() {
        return {
          mode: 'FLAT_DOMAIN_LIST',
          domainIds: ['domain.warranties_coverage'],
          latencyMs: 10,
          estimatedCostUsd: 0.005,
        };
      },
      async runStageTwo() {
        return {
          proposals: [],
          latencyMs: 20,
          estimatedCostUsd: 0.012,
        };
      },
    },
  });
  assert.equal(costBreach.status, 'PROVIDER_UNAVAILABLE');
  assert.match(costBreach.failureReason ?? '', /PROVIDER_BUDGET_EXCEEDED:cost/);

  const stage2LatencyBreach = await executeTwoStageProviderRetrieval({
    rawText: 'which claims are still open?',
    policy: approvedPolicy,
    provider: {
      providerId: 'slow-s2',
      version: '1.0.0',
      isExternalNetworkProvider: false,
      async runStageOne(input) {
        assert.equal(input.timeoutMs, 600);
        return {
          mode: 'FLAT_DOMAIN_LIST',
          domainIds: ['domain.warranties_coverage'],
          latencyMs: 10,
          estimatedCostUsd: 0.001,
        };
      },
      async runStageTwo(input) {
        assert.equal(input.timeoutMs, 1200);
        return {
          proposals: [],
          latencyMs: 1250,
          estimatedCostUsd: 0.001,
        };
      },
    },
  });
  assert.equal(stage2LatencyBreach.status, 'PROVIDER_UNAVAILABLE');
  assert.match(stage2LatencyBreach.failureReason ?? '', /PROVIDER_BUDGET_EXCEEDED:stage2_latency/);

  // 4. P2 #5: Unknown/hallucinated provider domain must return SCHEMA_INVALID (never coerced to property_profile)
  const badDomainFlat = await executeTwoStageProviderRetrieval({
    rawText: 'which claims are still open?',
    policy: approvedPolicy,
    provider: {
      providerId: 'bad-domain-flat',
      version: '1.0.0',
      isExternalNetworkProvider: false,
      async runStageOne() {
        return {
          mode: 'FLAT_DOMAIN_LIST',
          domainIds: ['domain.hallucinated_fake'],
          latencyMs: 5,
          estimatedCostUsd: 0.001,
        };
      },
      async runStageTwo() {
        throw new Error('should not call stage2 for invalid domain');
      },
    },
  });
  assert.equal(badDomainFlat.status, 'SCHEMA_INVALID');
  assert.match(badDomainFlat.failureReason ?? '', /invalid_provider_domain:domain\.hallucinated_fake/);

  const badDomainSpanPrompt = 'which appliances have no warranty';
  const badDomainSpan = await executeTwoStageProviderRetrieval({
    rawText: badDomainSpanPrompt,
    policy: approvedPolicy,
    provider: {
      providerId: 'bad-domain-span',
      version: '1.0.0',
      isExternalNetworkProvider: false,
      async runStageOne() {
        return {
          mode: 'FACET_SPANS',
          facets: [{
            preliminarySpan: { start: 0, end: badDomainSpanPrompt.length, text: badDomainSpanPrompt },
            domainCandidates: [{ id: 'domain.hallucinated_fake', score: 0.9 }],
          }],
          latencyMs: 5,
          estimatedCostUsd: 0.001,
        };
      },
      async runStageTwo() {
        throw new Error('should not call stage2 for invalid domain');
      },
    },
  });
  assert.equal(badDomainSpan.status, 'SCHEMA_INVALID');
  assert.match(badDomainSpan.failureReason ?? '', /invalid_provider_domain:domain\.hallucinated_fake/);

  // 5. P1 #1: Production dataPointReadResult connects to Phase 6 orchestration
  const propertyAccess = require('../../src/services/propertyAccess.service.ts');
  const { prisma } = require('../../src/lib/prisma.ts');
  const origResolveAccess = propertyAccess.resolvePropertyAccess;
  const origFindMany = new Map();
  const origFindUnique = new Map();
  const origFindFirst = new Map();

  const findManyStubs = [
    ['inventoryRoom', () => []],
    ['inventoryItem', () => [
      { id: 'item-wh', propertyId: 'prop-p6-1', name: 'Water Heater', category: 'PLUMBING', warrantyId: null, purchaseCostCents: 180000, replacementCostCents: 220000, purchasedOn: null, installedOn: null },
    ]],
    ['warranty', () => []],
    ['propertyMaintenanceTask', () => []],
    ['document', () => []],
    ['claim', () => [
      { id: 'claim-1', propertyId: 'prop-p6-1', title: 'Roof Hail Claim', status: 'OPEN', openedAt: new Date('2026-09-01T00:00:00Z'), estimatedLossCents: 500000, documents: [], checklistItems: [] },
    ]],
    ['propertyDocument', () => []],
    ['claimDocument', () => []],
  ];
  const findUniqueStubs = [
    ['property', () => ({ id: 'prop-p6-1', state: 'NY', timezone: 'America/New_York', closingDate: null, lastAppraisedValue: null })],
  ];

  propertyAccess.resolvePropertyAccess = async () => ({ allowed: true, role: 'OWNER', propertyId: 'prop-p6-1', userId: 'user-1' });
  for (const [model, fn] of findManyStubs) {
    if (prisma[model]) {
      origFindMany.set(model, prisma[model].findMany);
      prisma[model].findMany = async () => fn();
    }
  }
  for (const [model, fn] of findUniqueStubs) {
    if (prisma[model]) {
      origFindUnique.set(model, prisma[model].findUnique);
      prisma[model].findUnique = async () => fn();
    }
  }

  try {
    // (a) Paraphrase missed deterministically is expanded via Phase 6 provider in production handler
    const expandedRead = await dataPointReadResult(
      'user-1',
      'prop-p6-1',
      'which appliances are lacking protection coverage?',
      undefined,
      { semanticProvider: new SealedOfflineStructuredProvider('NOMINAL'), semanticProviderPolicy: approvedPolicy },
    );
    assert.equal(expandedRead.status, 'ANSWERED');
    assert.equal(expandedRead.parameters.providerOrchestration.reconciliationStatus, 'PROVIDER_INCREMENTAL');
    assert.match(JSON.stringify(expandedRead.blocks), /Water Heater/);

    // (b) Deterministic query short-circuits provider cleanly in PRODUCTION_SHORT_CIRCUIT
    let providerCalls = 0;
    const countingProvider = {
      providerId: 'counting-spy',
      version: '1.0.0',
      isExternalNetworkProvider: false,
      async runStageOne() {
        providerCalls += 1;
        throw new Error('must short-circuit deterministic query');
      },
      async runStageTwo() {
        providerCalls += 1;
        throw new Error('must short-circuit deterministic query');
      },
    };
    const detProdRead = await dataPointReadResult(
      'user-1',
      'prop-p6-1',
      'which claims are open?',
      undefined,
      { semanticProvider: countingProvider, semanticProviderPolicy: approvedPolicy },
    );
    assert.equal(detProdRead.status, 'ANSWERED');
    assert.equal(providerCalls, 0);
    assert.match(detProdRead.blocks[0].body, /Roof Hail Claim/);

    // (c) DUAL_PRODUCER material disagreement fails closed rather than guessing
    const disagreeProdRead = await dataPointReadResult(
      'user-1',
      'prop-p6-1',
      'which claims are open?',
      undefined,
      {
        semanticProvider: new SealedOfflineStructuredProvider('MATERIAL_DISAGREEMENT'),
        semanticProviderPolicy: approvedPolicy,
        evaluationMode: 'DUAL_PRODUCER',
      },
    );
    assert.equal(disagreeProdRead.reasonCode, 'DATA_POINT_SEMANTIC_AGREEMENT_REQUIRED');
    assert.equal(disagreeProdRead.parameters.providerOrchestration.reconciliationStatus, 'MATERIAL_DISAGREEMENT');

    // (d) Outage on paraphrase degrades transparently without crash
    const outageProdRead = await dataPointReadResult(
      'user-1',
      'prop-p6-1',
      'which appliances are lacking protection coverage?',
      undefined,
      { semanticProvider: new SealedOfflineStructuredProvider('OUTAGE'), semanticProviderPolicy: approvedPolicy },
    );
    assert.equal(outageProdRead.reasonCode, 'PROVIDER_UNAVAILABLE');
  } finally {
    propertyAccess.resolvePropertyAccess = origResolveAccess;
    for (const [model, orig] of origFindMany.entries()) prisma[model].findMany = orig;
    for (const [model, orig] of origFindUnique.entries()) prisma[model].findUnique = orig;
    for (const [model, orig] of origFindFirst.entries()) prisma[model].findFirst = orig;
  }
});
