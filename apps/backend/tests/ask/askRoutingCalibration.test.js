const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { retrieveAskOperationCandidates } = require('../../src/services/ask/askSemanticRouter.ts');
const { evaluateAskRoutingQuality } = require('../../src/services/ask/askRoutingQualityEvaluator.ts');
const { SKILL_EVALUATION_PACKAGES } = require('../../src/services/skills/skillEvaluationRegistry.ts');

test('hybrid retrieval is independently switchable and records calibrated provenance', () => {
  const hybrid = retrieveAskOperationCandidates('Should I repair or replce my aging appliance?', { topK: 3 });
  const lexical = retrieveAskOperationCandidates('Should I repair or replce my aging appliance?', { topK: 3, embeddingEnabled: false });
  assert.equal(hybrid[0].operationId, 'REPLACEMENT_GUIDANCE');
  assert.equal(hybrid[0].retrievalPath, 'HYBRID_LOCAL_EMBEDDING');
  assert.ok(hybrid[0].embeddingScore > 0);
  assert.match(hybrid[0].calibrationVersion, /^routing-calibration-1\.0:en:/);
  assert.equal(lexical[0].retrievalPath, 'LEXICAL_LOCAL');
  assert.equal(lexical[0].embeddingScore, null);
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

test('routing quality reports are broken out by operation with reliability bins', () => {
  const fixtures = Object.values(SKILL_EVALUATION_PACKAGES).flatMap((suite) => suite.routingCases.map((fixture) => ({
    operationId: fixture.expectedOperationId,
    message: fixture.message,
  })));
  const report = evaluateAskRoutingQuality(fixtures, { generatedAt: '2026-08-15T00:00:00.000Z' });
  assert.equal(report.aggregate.samples, fixtures.length);
  assert.equal(report.byOperation.length, new Set(fixtures.map((fixture) => fixture.operationId)).size);
  assert.equal(report.calibration.length, 5);
  assert.equal(report.aggregate.incorrectHighConfidence, 0);
  assert.ok(report.aggregate.top1Correct / report.aggregate.samples >= 0.95);
  assert.ok(report.aggregate.top3Recall / report.aggregate.samples >= 0.95);
  for (const row of report.byOperation) {
    assert.ok(row.samples > 0);
    assert.ok(ASK_OPERATION_DEFINITIONS[row.operationId]);
  }
});
