const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const { ASK_SEMANTIC_DOMAINS } = require('../../src/services/ask/semantic/phase0/semanticOntologyBaseline.ts');
const { executeCrossDomainWaves, buildSeededCrossDomainSnapshot } = require('../../src/services/ask/semantic/waves/index.ts');
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
