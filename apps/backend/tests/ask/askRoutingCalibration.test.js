const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { retrieveAskOperationCandidates } = require('../../src/services/ask/askSemanticRouter.ts');
const { evaluateAskRoutingQuality } = require('../../src/services/ask/askRoutingQualityEvaluator.ts');
const { ASK_ROUTING_CERTIFICATION_FIXTURES } = require('../../src/services/ask/askTrustCertificationCorpus.ts');
const { resolveAskEntityState } = require('../../src/services/ask/askEntityResolution.ts');
const { ASK_ROUTING_CALIBRATION_EVIDENCE_METADATA, ASK_ROUTING_CALIBRATION_OBSERVATIONS } = require('../../src/services/ask/askRoutingCalibrationEvidence.ts');
const { ASK_ENTITY_CALIBRATION_OBSERVATIONS, ASK_ENTITY_CALIBRATION_VERSION } = require('../../src/services/ask/askEntityCalibrationEvidence.ts');

test('hybrid retrieval is independently switchable and records calibrated provenance', () => {
  const hybrid = retrieveAskOperationCandidates('Should I repair or replce my aging appliance?', { topK: 3 });
  const lexical = retrieveAskOperationCandidates('Should I repair or replce my aging appliance?', { topK: 3, embeddingEnabled: false });
  assert.equal(hybrid[0].operationId, 'REPLACEMENT_GUIDANCE');
  assert.equal(hybrid[0].retrievalPath, 'HYBRID_LOCAL_EMBEDDING');
  assert.ok(hybrid[0].embeddingScore > 0);
  assert.match(hybrid[0].calibrationVersion, /^routing-calibration-3\.0:[a-f0-9]{12}:en:/);
  assert.equal(lexical[0].retrievalPath, 'LEXICAL_LOCAL');
  assert.equal(lexical[0].embeddingScore, null);
});

test('routing calibration is derived from traceable labeled fixture rows', () => {
  const fixtureIds = new Set(ASK_ROUTING_CERTIFICATION_FIXTURES.map((fixture) => fixture.fixtureId));
  assert.equal(ASK_ROUTING_CALIBRATION_EVIDENCE_METADATA.datasetVersion, 'ask-routing-independent-v2');
  assert.ok(ASK_ROUTING_CALIBRATION_OBSERVATIONS.length >= ASK_ROUTING_CERTIFICATION_FIXTURES.length);
  assert.ok(ASK_ROUTING_CALIBRATION_OBSERVATIONS.some((row) => row.correct));
  assert.ok(ASK_ROUTING_CALIBRATION_OBSERVATIONS.some((row) => !row.correct));
  for (const row of ASK_ROUTING_CALIBRATION_OBSERVATIONS) {
    assert.ok(fixtureIds.has(row.sourceFixtureId), row.sourceFixtureId);
    assert.ok(ASK_OPERATION_DEFINITIONS[row.candidateOperationId]);
    assert.ok(row.rawScore >= 0 && row.rawScore <= 1);
  }
  for (const fixture of ASK_ROUTING_CERTIFICATION_FIXTURES) {
    const candidates = retrieveAskOperationCandidates(fixture.message, { topK: Object.keys(ASK_OPERATION_DEFINITIONS).length })
      .sort((left, right) => right.rawScore - left.rawScore);
    const expected = candidates.find((candidate) => candidate.operationId === fixture.operationId);
    const competitor = candidates.find((candidate) => candidate.operationId !== fixture.operationId);
    const rows = ASK_ROUTING_CALIBRATION_OBSERVATIONS.filter((row) => row.sourceFixtureId === fixture.fixtureId);
    assert.ok(expected, `${fixture.fixtureId}: expected candidate absent`);
    assert.ok(competitor, `${fixture.fixtureId}: competitor absent`);
    assert.deepEqual(rows.find((row) => row.correct), {
      observationId: `ask-routing-calibration-v2-${fixture.fixtureId.slice(-3)}-expected`,
      sourceFixtureId: fixture.fixtureId,
      candidateOperationId: expected.operationId,
      rawScore: expected.rawScore,
      correct: true,
    });
    assert.deepEqual(rows.find((row) => !row.correct), {
      observationId: `ask-routing-calibration-v2-${fixture.fixtureId.slice(-3)}-competitor`,
      sourceFixtureId: fixture.fixtureId,
      candidateOperationId: competitor.operationId,
      rawScore: competitor.rawScore,
      correct: false,
    });
  }
});

test('entity confidence bands are derived from separately versioned labeled outcomes', () => {
  assert.match(ASK_ENTITY_CALIBRATION_VERSION, /^entity-calibration-1\.0-[a-f0-9]{12}$/);
  assert.ok(ASK_ENTITY_CALIBRATION_OBSERVATIONS.some((row) => row.canonicalResolutionCorrect));
  assert.ok(ASK_ENTITY_CALIBRATION_OBSERVATIONS.some((row) => !row.canonicalResolutionCorrect));
  assert.deepEqual(new Set(ASK_ENTITY_CALIBRATION_OBSERVATIONS.map((row) => row.signal)), new Set([
    'AUTHORIZED_PROPERTY', 'TRUSTED_LAUNCH_ENTITY', 'UNRESOLVED_MENTION', 'AMBIGUOUS_REFERENCE', 'MISSING_ENTITY',
  ]));
});

test('calibrated routing clarifies broad language and resolves a typo-tolerant material intent', () => {
  const broad = resolveAskRoutingCascade('What is pending for my home?');
  assert.equal(broad.stage, 'CLARIFICATION');
  assert.ok(broad.candidates.some((candidate) => candidate.operationId === 'PROPERTY_SUMMARY'));
  assert.ok(broad.candidates.some((candidate) => candidate.operationId === 'MAINTENANCE_STATUS'));

  const repair = resolveAskRoutingCascade('Should I repair or replce my aging appliance?');
  assert.equal(repair.operation.operationId, 'REPLACEMENT_GUIDANCE');
  assert.equal(repair.stage, 'LOCAL_CLASSIFIER');
  assert.ok(repair.operation.confidence >= 0.7);
});

test('product-authored reserve and general home-deadline prompts resolve to their registered operations', () => {
  const reserve = resolveAskRoutingCascade('Create a capital reserve plan for future replacements.');
  assert.equal(reserve.operation.operationId, 'CAPITAL_RESERVE_PLAN');
  assert.equal(reserve.requiresClarification, false);

  const deadlines = resolveAskRoutingCascade('Monitor my important home deadlines.');
  assert.equal(deadlines.operation.operationId, 'HOME_DEADLINE_MONITOR');
  assert.equal(deadlines.requiresClarification, false);
});

test('every operation owns at least one answer hard negative', () => {
  for (const definition of Object.values(ASK_OPERATION_DEFINITIONS)) {
    assert.ok(definition.semantic.answerHardNegativeExamples.length > 0, definition.operationId);
  }
});

test('routing quality reports are broken out by operation with reliability bins', () => {
  const fixtures = ASK_ROUTING_CERTIFICATION_FIXTURES;
  const report = evaluateAskRoutingQuality(fixtures, { generatedAt: '2026-08-15T00:00:00.000Z' });
  assert.equal(report.aggregate.samples, fixtures.length);
  assert.equal(report.byOperation.length, new Set(fixtures.map((fixture) => fixture.operationId)).size);
  assert.equal(report.calibration.length, 5);
  assert.equal(report.aggregate.incorrectHighConfidence, 0);
  assert.ok(report.aggregate.top1Correct / report.aggregate.samples >= 0.95);
  assert.ok(report.aggregate.top3Recall / report.aggregate.samples >= 0.95);
  assert.deepEqual(new Set(report.byOperation.map((row) => row.operationId)), new Set(Object.keys(ASK_OPERATION_DEFINITIONS)));
  for (const row of report.byOperation) {
    assert.ok(row.samples > 0);
    assert.ok(ASK_OPERATION_DEFINITIONS[row.operationId]);
  }
});

test('entity resolution keeps mention confidence separate from authorized canonical identity', () => {
  const mention = resolveAskEntityState({
    message: 'Mark the gutter cleaning task complete', operationId: 'MAINTENANCE_TASK_COMPLETE', propertyId: 'home-1',
  });
  assert.equal(mention.outcome, 'MENTION_ONLY');
  assert.equal(mention.confidenceBand, 'MEDIUM');
  assert.equal(mention.entities.some((entity) => entity.type === 'PROPERTY' && entity.canonicalCandidateId === 'home-1'), true);
  assert.equal(mention.entities.some((entity) => entity.type === 'MAINTENANCE_TASK' && !entity.canonicalCandidateId), true);
  assert.deepEqual(mention.missingSlots, ['maintenance_taskId']);

  const trusted = resolveAskEntityState({
    message: 'Complete it', operationId: 'MAINTENANCE_TASK_COMPLETE', propertyId: 'home-1', launchEntityId: 'task-1',
  });
  assert.equal(trusted.outcome, 'RESOLVED');
  assert.equal(trusted.confidenceBand, 'HIGH');
  assert.equal(trusted.entities.at(-1).canonicalCandidateId, 'task-1');

  const ambiguous = resolveAskEntityState({ message: 'Complete it', operationId: 'MAINTENANCE_TASK_COMPLETE', propertyId: 'home-1' });
  assert.equal(ambiguous.outcome, 'AMBIGUOUS');
  assert.equal(ambiguous.confidenceBand, 'LOW');

  const propertyFree = resolveAskEntityState({ message: 'What tools can help?', operationId: 'CAPABILITY_DISCOVERY', requiresProperty: false });
  assert.equal(propertyFree.outcome, 'NOT_REQUIRED');
  assert.equal(propertyFree.confidenceBand, null);
  assert.deepEqual(propertyFree.missingSlots, []);
});
