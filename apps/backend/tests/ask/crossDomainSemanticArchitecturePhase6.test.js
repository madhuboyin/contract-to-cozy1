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
  ASK_SEMANTIC_PROVIDER_BUDGET_APPROVED_AT,
  ASK_SEMANTIC_PROVIDER_BUDGET_POLICY_VERSION,
  APPROVED_SEMANTIC_PROVIDER_BUDGETS,
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

  // Independent gates block live calls unless homeowner text, provider terms,
  // and semantic-provider activation are all explicitly approved.
  const defaultPolicy = resolveDefaultSemanticProviderPolicy({});
  assert.equal(defaultPolicy.approvalStatus, 'UNRESOLVED_OWNER_APPROVAL');
  for (const env of [
    { ASK_SEMANTIC_PROVIDER_APPROVED: 'true' },
    { ASK_UNDERSTANDING_PROVIDER_TERMS_RECORDED: 'true' },
    { ASK_UNDERSTANDING_HOMEOWNER_TEXT_APPROVED: 'true' },
    { ASK_SEMANTIC_PROVIDER_APPROVED: 'true', ASK_UNDERSTANDING_PROVIDER_TERMS_RECORDED: 'true' },
    { ASK_SEMANTIC_PROVIDER_APPROVED: 'true', ASK_UNDERSTANDING_HOMEOWNER_TEXT_APPROVED: 'true' },
  ]) {
    assert.equal(resolveDefaultSemanticProviderPolicy(env).approvalStatus, 'UNRESOLVED_OWNER_APPROVAL');
  }
  assert.equal(resolveDefaultSemanticProviderPolicy({
    ASK_SEMANTIC_PROVIDER_APPROVED: 'true',
    ASK_UNDERSTANDING_PROVIDER_TERMS_RECORDED: 'true',
    ASK_UNDERSTANDING_HOMEOWNER_TEXT_APPROVED: 'true',
  }).approvalStatus, 'APPROVED_FOR_STRUCTURED_PLANNING');
  const geminiBlocked = await executeTwoStageProviderRetrieval({
    rawText: detPrompt,
    provider: new GeminiSemanticUnderstandingProvider(),
    policy: defaultPolicy,
  });
  assert.equal(geminiBlocked.status, 'PROVIDER_UNAVAILABLE');
  assert.match(geminiBlocked.failureReason ?? '', /missing .*approval/i);
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

test('Phase 6 end-to-end evaluation harness passes all sealed-proxy invariants across all 15 domains and reports correlated metamorphic checks separately from independent Wilson bounds', async () => {
  const report = await runPhase6EndToEndEvaluation();

  assert.equal(report.version, ASK_PHASE6_EVALUATION_VERSION);
  assert.equal(report.evaluationNature, 'SEALED_PROXY');
  assert.equal(report.isRealHomeownerTrafficDistribution, false);
  assert.equal(report.corpusProvenance.corpusType, 'INTERNAL_DEVELOPER_PROXY');
  assert.equal(report.corpusProvenance.independentlyAuthored, false);
  assert.equal(report.corpusProvenance.heldOutFromImplementation, false);
  assert.equal(report.providerEvaluationDisclosure.providerKind, 'OFFLINE_SIMULATOR');
  assert.equal(report.providerEvaluationDisclosure.liveExternalModelEvaluated, false);
  assert.equal(report.entryPathTelemetry.totalCases, PHASE6_SEALED_EVALUATION_CASES.length);
  assert.equal(report.entryPathTelemetry.persistedAskExecutionFlowExercised, false);
  assert.equal(report.entryPathTelemetry.allRoutedCapabilityInvokedCount, PHASE6_SEALED_EVALUATION_CASES.length);
  assert.equal(report.entryPathTelemetry.allRoutedCapabilityResolvedCount, PHASE6_SEALED_EVALUATION_CASES.length);
  assert.equal(
    report.entryPathTelemetry.separateLegacyOpExecutedCount,
    report.entryPathTelemetry.routedToSeparateLegacyOpCount,
  );
  assert.equal(
    report.entryPathTelemetry.separateLegacyOpResolvedCount,
    report.entryPathTelemetry.routedToSeparateLegacyOpCount,
  );
  assert.ok(report.entryPathTelemetry.semanticEntryPromotedCount > 0);
  assert.equal(
    report.entryPathTelemetry.entryCapabilityResolvedCount,
    report.entryPathTelemetry.entryCapabilityExecutedCount,
  );
  assert.ok(report.frEval3Metrics.legacyGrammarAgreementEvidence.comparedDimensions.includes('semanticJob'));
  assert.ok(report.frEval3Metrics.legacyGrammarAgreementEvidence.comparedDimensions.includes('materialFilters'));
  assert.ok(report.frEval3Metrics.legacyGrammarAgreementEvidence.disagreedCollisionCount >= 1);
  assert.equal(report.sealedProxyInvariantsPassed, true);
  assert.equal(report.statisticalWilsonClaimStatus, 'INSUFFICIENT_INDEPENDENT_SAMPLES');
  assert.equal(report.passed, false);
  assert.deepEqual(report.failedDomains, []);
  assert.equal(report.failedStrata.length, 6);
  assert.equal(report.riskStratifiedCalibration.calibrationEvaluationMode, 'LEAVE_ONE_OUT_CV');
  assert.equal(report.riskStratifiedCalibration.observedZeroErrorPassed, true);
  assert.equal(report.riskStratifiedCalibration.overallPassed, false);
  assert.equal(report.riskStratifiedCalibration.totalIncorrectHighConfidence, 0);
  assert.equal(report.riskStratifiedCalibration.totalObservations, PHASE6_SEALED_EVALUATION_CASES.length);
  assert.equal(report.correlatedMetamorphicEvidence.suitePassed, true);
  assert.equal(
    report.correlatedMetamorphicEvidence.phase6InvarianceVariantsPassed,
    PHASE6_SEALED_EVALUATION_CASES.length,
  );
  assert.match(report.correlatedMetamorphicEvidence.note, /excluded from independent binomial sample counts/i);

  assert.equal(report.frEval3Metrics.perDomainCoverageProfiles.length, ASK_SEMANTIC_DOMAINS.length);
  assert.equal(report.frEval3Metrics.wrongAnswerRate, 0);
  assert.equal(report.frEval3Metrics.falseDeclineRate, 0);
  assert.equal(report.frEval3Metrics.internalIdentifierLeakCount, 0);
  assert.equal(report.frEval3Metrics.protectedSpanRoundTripAccuracy, 1);
  assert.equal(report.frEval3Metrics.replayReauthorizationRedactionAccuracy, 1);
  assert.equal(report.frEval3Metrics.sixFacetCompletenessAndOverflowRate, 1);
  assert.equal(report.frEval3Metrics.conflictedPopulationProjectionAccuracy, 1);
  assert.equal(report.frEval3Metrics.replayQueryCountBounds.passed, true);
  assert.equal(report.frEval3Metrics.replayQueryCountBounds.measuredFromRealPath, true);
  assert.equal(report.frEval3Metrics.macroDomainLower95Summary.sufficientPerDomainSamplesFor90PctBound, false);
  assert.ok(report.frEval3Metrics.providerExpandedIncrementalCoverageRate > 0);

  // Verify FR-EVAL-1 separation of domain correctness vs language coverage
  for (const domainTelemetry of report.frEval3Metrics.perDomainTelemetry) {
    assert.equal(domainTelemetry.correctnessState, 'ENABLED_FOR_DECLARED_SCOPE');
    assert.ok(domainTelemetry.combinedResolvedRate >= domainTelemetry.deterministicResolvedRate);
  }

  // Verify §19 #22 requirement-to-evidence matrix and §22 openness
  assert.ok(PHASE6_SEALED_EVALUATION_CASES.length >= 25);
  assert.ok(report.requirementToEvidenceMatrix.some((r) => r.requirementId === 'FR-EVAL-1..6' && r.status === 'DEVELOPER_PROXY_UNHELD'));
  assert.ok(report.requirementToEvidenceMatrix.some((r) => r.requirementId === '§22.1..7' && r.status === 'OWNER_DECISION_OPEN'));

  const summary = await buildPhase6CalibrationAndEvaluationSummary();
  assert.equal(summary.sealedProxyInvariantsPassed, true);
  assert.equal(summary.statisticalWilsonClaimStatus, 'INSUFFICIENT_INDEPENDENT_SAMPLES');
  assert.equal(summary.passed, false);
  assert.equal(summary.evaluationNature, 'SEALED_PROXY');
  assert.equal(summary.calibrationObservedZeroErrorPassed, true);
  assert.equal(summary.calibrationOverallPassed, false);
  assert.deepEqual(
    summary.report.frEval4ProductGates.filter((g) => !g.passed).map((g) => g.gateId),
    [
      'GATE_END_TO_END_MACRO_RESOLVED_CI',
      'GATE_WILSON_95_UPPER_BOUND_UNDER_1PCT',
      'GATE_INDEPENDENT_HELD_OUT_PROVENANCE',
      'GATE_LIVE_EXTERNAL_PROVIDER_EVALUATED',
    ],
  );
  assert.equal(summary.passedGateCount, summary.totalGateCount - 4);
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
  assert.equal(ASK_SEMANTIC_PROVIDER_BUDGET_POLICY_VERSION, 'semantic-provider-budget-1.0.0');
  assert.equal(ASK_SEMANTIC_PROVIDER_BUDGET_APPROVED_AT, '2026-11-16');
  assert.deepEqual(APPROVED_SEMANTIC_PROVIDER_BUDGETS, {
    maxStage1LatencyMs: 600,
    maxStage2LatencyMs: 1200,
    maxEstimatedCostUsdPerTurn: 0.015,
    maxConcurrentStage2Calls: 3,
    maxAdmittedFacets: 6,
  });
  const approvedPolicy = {
    approvalStatus: 'APPROVED_FOR_STRUCTURED_PLANNING',
    recordedDecisionNote: 'test approved',
    budgets: { ...APPROVED_SEMANTIC_PROVIDER_BUDGETS },
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
    ['inventoryRoom', () => [
      { id: 'room-sunroom', propertyId: 'prop-p6-1', name: 'Sunroom Annex' },
    ]],
    ['inventoryItem', () => [
      { id: 'item-wh', propertyId: 'prop-p6-1', name: 'Water Heater', brand: null, modelNumber: null, category: 'PLUMBING', roomId: 'room-sunroom', warrantyApplicabilities: [], purchaseCostCents: 180000, replacementCostCents: 220000, purchasedOn: null, installedOn: null },
      { id: 'item-thermador', propertyId: 'prop-p6-1', name: 'Thermador Column', brand: 'Thermador', modelNumber: 'T30IR905', category: 'APPLIANCE', roomId: 'room-sunroom', warrantyApplicabilities: [{ warrantyId: 'war-1' }], purchaseCostCents: 450000, replacementCostCents: 520000, purchasedOn: null, installedOn: null },
    ]],
    ['warranty', () => [
      { id: 'war-1', propertyId: 'prop-p6-1', inventoryItemId: 'item-thermador', providerName: 'Sub-Zero Assure', category: 'APPLIANCE', expiryDate: new Date('2028-01-01T00:00:00Z') },
    ]],
    ['propertyMaintenanceTask', () => []],
    ['document', () => []],
    ['claim', () => [
      { id: 'claim-1', propertyId: 'prop-p6-1', title: 'Roof Hail Claim', status: 'OPEN', openedAt: new Date('2026-09-01T00:00:00Z'), estimatedLossCents: 500000, documents: [], checklistItems: [] },
    ]],
    ['quoteComparisonQuote', () => [
      {
        id: 'quote-alpine',
        vendorName: 'Alpine Roofing Co',
        quoteAmount: 9800,
        serviceLocation: 'Roof',
        serviceCategory: 'ROOFING',
        serviceLabelRaw: 'Roofing',
        scopeSummary: 'Architectural shingle replacement',
        workspace: { propertyId: 'prop-p6-1', scopeSummary: 'Roofing', serviceCategory: 'ROOFING' },
      },
      {
        id: 'quote-pinnacle',
        vendorName: 'Pinnacle Exteriors',
        quoteAmount: 10400,
        serviceLocation: 'Roof',
        serviceCategory: 'ROOFING',
        serviceLabelRaw: 'Roofing',
        scopeSummary: 'Architectural shingle replacement',
        workspace: { propertyId: 'prop-p6-1', scopeSummary: 'Roofing', serviceCategory: 'ROOFING' },
      },
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

    // (e) Legacy-matched phrasing outside deterministic coverage runs Phase 6 BEFORE legacy rejection
    const legacyBlockedWithoutProvider = await dataPointReadResult(
      'user-1',
      'prop-p6-1',
      'list appliances lacking protection coverage details',
    );
    assert.equal(legacyBlockedWithoutProvider.reasonCode, 'DATA_POINT_SEMANTIC_AGREEMENT_REQUIRED');

    const expandedBeforeLegacy = await dataPointReadResult(
      'user-1',
      'prop-p6-1',
      'list appliances lacking protection coverage details',
      undefined,
      { semanticProvider: new SealedOfflineStructuredProvider('NOMINAL'), semanticProviderPolicy: approvedPolicy },
    );
    assert.equal(expandedBeforeLegacy.status, 'ANSWERED');
    assert.equal(expandedBeforeLegacy.parameters.providerOrchestration.reconciliationStatus, 'PROVIDER_INCREMENTAL');
    assert.match(JSON.stringify(expandedBeforeLegacy.blocks), /Water Heater/);

    // (f) Property-backed identifiers (custom item, room, contractor/quote vendor) are masked as indexed
    // placeholders BEFORE provider calls and bound back to authorized record IDs on execution.
    const seenMinimizedPrompts = [];
    const seenPlaceholders = [];
    const piiRedactionSpyProvider = {
      providerId: 'pii-redaction-spy',
      version: '1.0.0',
      isExternalNetworkProvider: true,
      async runStageOne(input) {
        seenMinimizedPrompts.push(input.minimizedText);
        seenPlaceholders.push(...input.placeholderTokens);
        return {
          mode: 'FACET_SPANS',
          facets: [{
            preliminarySpan: { start: 0, end: input.minimizedText.length, text: input.minimizedText },
            domainCandidates: [{ id: 'domain.warranties_coverage', score: 0.94 }],
          }],
          latencyMs: 5,
          estimatedCostUsd: 0.001,
        };
      },
      async runStageTwo(input) {
        seenMinimizedPrompts.push(input.minimizedText);
        const facetId = input.assignedFacets[0].stableFacetId;
        return {
          proposals: [{
            stableFacetId: facetId,
            requestClass: 'DATA_QUERY',
            domainId: 'domain.warranties_coverage',
            subject: { entityId: 'entity.inventory_item', recordId: null },
            relations: [{
              semanticRelationId: 'relation.inventory_item.warranty',
              predicateId: 'predicate.inventory_item.has_no_warranty_record',
              targetEntityId: 'entity.warranty',
            }],
            polarity: 'NEGATIVE',
            projection: 'LIST',
            fields: [],
            where: {
              kind: 'PREDICATE',
              predicateId: 'predicate.inventory_item.has_no_warranty_record',
              relationPathId: 'path.inventory_item.warranty',
            },
            time: null,
            requiredSlots: [],
            jobMatch: 'query.inventory_item.warranty_relation',
          }],
          latencyMs: 5,
          estimatedCostUsd: 0.002,
        };
      },
    };
    const customEntityRead = await dataPointReadResult(
      'user-1',
      'prop-p6-1',
      'is Thermador Column in Sunroom Annex lacking protection plan besides Alpine Roofing Co?',
      undefined,
      { semanticProvider: piiRedactionSpyProvider, semanticProviderPolicy: approvedPolicy },
    );
    assert.equal(customEntityRead.status, 'ANSWERED');
    assert.ok(seenMinimizedPrompts.length >= 2);
    for (const minPrompt of seenMinimizedPrompts) {
      assert.doesNotMatch(minPrompt, /Thermador Column/i);
      assert.doesNotMatch(minPrompt, /Sunroom Annex/i);
      assert.doesNotMatch(minPrompt, /Alpine Roofing Co/i);
      assert.match(minPrompt, /\[ITEM_1\]/);
      assert.match(minPrompt, /\[ROOM_1\]/);
      assert.match(minPrompt, /\[VENDOR_1\]/);
    }
    assert.ok(seenPlaceholders.includes('[ITEM_1]'));
    assert.ok(seenPlaceholders.includes('[ROOM_1]'));
    assert.ok(seenPlaceholders.includes('[VENDOR_1]'));
    // Execution bound the authorized item record (Thermador Column -> has warranty -> excluded from uncovered list)
    assert.equal(
      customEntityRead.parameters.semanticExecutionReceipt.resolvedRecordIds.includes('item-wh'),
      false,
    );
    assert.equal(
      customEntityRead.parameters.providerOrchestration.reconciliationStatus,
      'PROVIDER_INCREMENTAL',
    );

    // (g) Entry-path rescue: prompt routed by legacy cascade to REMOTE_FALLBACK GROUNDED_GUIDANCE
    // is promoted at the real Ask entry boundary and executed cleanly through capabilityInvoke.
    const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
    const { resolveAskSemanticEntryDecision } = require('../../src/services/ask/semantic/semanticEntryDispatcher.ts');
    const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');

    const fallbackParaphrase = 'show appliances lacking protection coverage';
    const rawCascade = resolveAskRoutingCascade(fallbackParaphrase, { propertyId: 'prop-p6-1' });
    assert.equal(rawCascade.operation.operationId, 'GROUNDED_GUIDANCE');
    const entryDecision = resolveAskSemanticEntryDecision({
      rawMessage: fallbackParaphrase,
      routingStage: rawCascade.stage,
      routingOperationId: rawCascade.operation.operationId,
      requiresClarification: rawCascade.requiresClarification,
      hasSemanticProvider: true,
    });
    assert.equal(entryDecision.shouldDispatchToSemanticEntry, true);

    const invokedFallbackResult = await capabilityInvoke(
      'GROUNDED_GUIDANCE',
      {
        userId: 'user-1',
        propertyId: 'prop-p6-1',
        sessionId: 'sess-entry-1',
        executionId: 'exec-entry-1',
        message: fallbackParaphrase,
        launchContext: null,
      },
      {
        propertyAccess: { allowed: true, role: 'OWNER', propertyId: 'prop-p6-1', userId: 'user-1' },
        semanticProvider: new SealedOfflineStructuredProvider('NOMINAL'),
        semanticProviderPolicy: approvedPolicy,
        semanticEvaluationMode: 'DUAL_PRODUCER',
      },
    );
    assert.equal(invokedFallbackResult.status, 'ANSWERED');
    assert.equal(invokedFallbackResult.parameters.providerOrchestration.reconciliationStatus, 'PROVIDER_INCREMENTAL');
    assert.match(JSON.stringify(invokedFallbackResult.blocks), /Water Heater/);

    // (h) Calibration out-of-fold CV never reports 0.0000 in-sample ECE on a single observation
    const singleObsCal = evaluateRiskStratifiedCalibration([
      { caseId: 'only-one', stratum: 'WRITE_OR_CONSEQUENTIAL_ACTION', rawScore: 0.94, highConfidenceAdmitted: true, correct: true },
    ]);
    const writeSummary = singleObsCal.strata.find((s) => s.stratum === 'WRITE_OR_CONSEQUENTIAL_ACTION');
    assert.equal(writeSummary.eceEvaluated, false);
    assert.equal(writeSummary.expectedCalibrationError, null);
    assert.equal(writeSummary.eceEvaluationMode, 'INSUFFICIENT_FOR_OUT_OF_FOLD');

    const heldOutCal = evaluateRiskStratifiedCalibration(
      [
        { caseId: 'eval-1', stratum: 'WRITE_OR_CONSEQUENTIAL_ACTION', rawScore: 0.95, highConfidenceAdmitted: true, correct: false },
      ],
      {
        calibrationFitObservations: [
          { caseId: 'fit-1', stratum: 'WRITE_OR_CONSEQUENTIAL_ACTION', rawScore: 0.94, highConfidenceAdmitted: true, correct: true },
        ],
      },
    );
    const heldOutWrite = heldOutCal.strata.find((s) => s.stratum === 'WRITE_OR_CONSEQUENTIAL_ACTION');
    assert.equal(heldOutWrite.eceEvaluated, true);
    assert.equal(heldOutWrite.eceEvaluationMode, 'HELD_OUT_SPLIT');
    assert.equal(heldOutWrite.expectedCalibrationError, 1);
    assert.equal(heldOutCal.totalIncorrectHighConfidence, 1);
  } finally {
    propertyAccess.resolvePropertyAccess = origResolveAccess;
    for (const [model, orig] of origFindMany.entries()) prisma[model].findMany = orig;
    for (const [model, orig] of origFindUnique.entries()) prisma[model].findUnique = orig;
    for (const [model, orig] of origFindFirst.entries()) prisma[model].findFirst = orig;
  }
});
