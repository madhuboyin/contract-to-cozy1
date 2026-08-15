const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { ASK_OPERATION_DEFINITIONS, validateAskOperationDefinitions } = require('../../src/services/ask/askOperationRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { normalizeAskMessage, retrieveAskOperationCandidates } = require('../../src/services/ask/askSemanticRouter.ts');
const { validateAskAnswerTrust, validateAskAnswerTrustPipeline, validateAskConfirmedCompletion } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskSemanticAnswerRelevance } = require('../../src/services/ask/askSemanticAnswerValidator.ts');
const { evaluateAskAnswerRelevanceQuality } = require('../../src/services/ask/askAnswerRelevanceQualityEvaluator.ts');
const {
  ASK_ANSWER_RELEVANCE_CERTIFICATION_FIXTURES,
  ASK_ANSWER_RELEVANCE_CROSS_OPERATION_NEGATIVE_MATRIX,
  ASK_ROUTING_GENERALIZATION_REGRESSIONS,
  ASK_TRUST_CERTIFICATION_LAYERS,
  validateAskTrustCertificationCorpus,
} = require('../../src/services/ask/askTrustCertificationCorpus.ts');
const { readAskOperationalControls } = require('../../src/config/askOperationalControls.ts');

test('every operation exposes a valid English semantic contract', () => {
  assert.deepEqual(validateAskOperationDefinitions(), []);
  for (const definition of Object.values(ASK_OPERATION_DEFINITIONS)) {
    assert.equal(definition.semantic.operationId, definition.operationId);
    assert.deepEqual(definition.semantic.supportedLanguages, ['en']);
    assert.ok(definition.semantic.positiveExamples.length >= 2);
    assert.ok(definition.semantic.hardNegativeExamples.length >= 1);
  }
});

test('normalization preserves the original and semantic retrieval handles property completeness paraphrases', () => {
  const message = "What information does this house still need?";
  const normalized = normalizeAskMessage(message);
  assert.equal(normalized.original, message);
  assert.equal(normalized.language, 'en');
  assert.match(normalized.normalized, /home/);
  assert.equal(retrieveAskOperationCandidates(message)[0].operationId, 'PROPERTY_SUMMARY');
});

test('independent certification is layered, non-duplicative, and keeps audited paraphrases as regressions', () => {
  assert.deepEqual(validateAskTrustCertificationCorpus(), []);
  assert.equal(new Set(ASK_TRUST_CERTIFICATION_LAYERS.map((entry) => entry.layer)).size, 9);
  for (const fixture of ASK_ROUTING_GENERALIZATION_REGRESSIONS) {
    const decision = resolveAskRoutingCascade(fixture.message);
    assert.equal(decision.stage, 'LOCAL_CLASSIFIER', fixture.fixtureId);
    assert.equal(decision.operation.operationId, fixture.operationId, fixture.fixtureId);
  }
});

test('reported completeness question resolves while broad pending language clarifies', () => {
  const completeness = resolveAskRoutingCascade('Are there any pending home details to be filled in?');
  assert.equal(completeness.operation.operationId, 'PROPERTY_SUMMARY');
  assert.equal(completeness.requiresClarification, false);

  const ambiguous = resolveAskRoutingCascade('What is pending for my home?');
  assert.equal(ambiguous.stage, 'CLARIFICATION');
  assert.equal(ambiguous.requiresClarification, true);
  assert.ok(ambiguous.candidates.some((candidate) => candidate.operationId === 'PROPERTY_SUMMARY'));
  assert.ok(ambiguous.candidates.some((candidate) => candidate.operationId === 'MAINTENANCE_STATUS'));
});

test('classifier-off path keeps deterministic commands and clarifies semantic candidates', () => {
  const deterministic = resolveAskRoutingCascade('What maintenance is overdue?', { classifierEnabled: false });
  assert.equal(deterministic.stage, 'DETERMINISTIC');
  const semantic = resolveAskRoutingCascade('What information does this house still need?', { classifierEnabled: false });
  assert.equal(semantic.stage, 'CLARIFICATION');
});

test('answer trust validator blocks unsupported all-clear claims and repairs direct-answer order', () => {
  const unsupported = validateAskAnswerTrust({
    question: 'Is anything pending?', operationId: 'PROPERTY_SUMMARY', propertyId: 'home-1',
    result: {
      status: 'UNAVAILABLE',
      blocks: [{ type: 'SUMMARY', id: 'bad', title: 'Everything is complete', body: 'No details are missing.', tone: 'POSITIVE', actions: [] }],
      suggestions: [],
    },
  });
  assert.equal(unsupported.trust.checks.absenceClaimSupport, 'FAIL');
  assert.equal(unsupported.trust.outcome, 'UNAVAILABLE');

  const repaired = validateAskAnswerTrust({
    question: 'Is anything pending?', operationId: 'PROPERTY_SUMMARY', propertyId: 'home-1',
    result: attachAskAuthoritativeSourceEvidence({
      status: 'ANSWERED',
      blocks: [
        { type: 'EVIDENCE', id: 'evidence', title: 'Sources', items: [] },
        { type: 'SUMMARY', id: 'answer', title: 'Two details are pending', body: 'The completed property check found two missing details.', tone: 'CAUTION', actions: [] },
      ],
      suggestions: [],
    }, 'PROPERTY_SUMMARY'),
  });
  assert.equal(repaired.result.blocks[0].type, 'SUMMARY');
  assert.equal(repaired.trust.outcome, 'REPAIRABLE');
});

test('absence claims require explicit complete, current, full-scope authoritative evidence', () => {
  const unproven = validateAskAnswerTrust({
    question: 'Do I need a permit?', operationId: 'RENOVATION_PERMIT_READINESS', propertyId: 'home-1',
    result: {
      status: 'ANSWERED',
      blocks: [{ type: 'SUMMARY', id: 'unsafe-all-clear', title: 'No permit is required', body: 'Everything is clear.', tone: 'POSITIVE', actions: [] }],
      suggestions: [],
    },
  });
  assert.equal(unproven.trust.checks.sourceIntegrity, 'FAIL');
  assert.equal(unproven.trust.checks.absenceClaimSupport, 'FAIL');
  assert.equal(unproven.result.status, 'UNAVAILABLE');

  const proven = validateAskAnswerTrust({
    question: 'Is my home profile complete?', operationId: 'PROPERTY_SUMMARY', propertyId: 'home-1',
    result: attachAskAuthoritativeSourceEvidence({
      status: 'ANSWERED',
      blocks: [{ type: 'SUMMARY', id: 'verified', title: 'Everything is complete', body: 'No details are missing.', tone: 'POSITIVE', actions: [] }],
      suggestions: [],
    }, 'PROPERTY_SUMMARY'),
  });
  assert.equal(proven.trust.checks.sourceIntegrity, 'PASS');
  assert.equal(proven.trust.checks.absenceClaimSupport, 'PASS');
  assert.equal(proven.trust.outcome, 'PASS');
});

test('CTA validation enforces audience permissions and checks priority-list CTAs', () => {
  const checked = validateAskAnswerTrust({
    question: 'Summarize my home', operationId: 'PROPERTY_SUMMARY', propertyId: 'home-1',
    result: attachAskAuthoritativeSourceEvidence({
      status: 'ANSWERED',
      blocks: [{
        type: 'SUMMARY', id: 'summary', title: 'Home summary', body: 'Here is the recorded home profile.', tone: 'DEFAULT',
        actions: [{ id: 'edit-property', label: 'Edit property', href: '/dashboard/properties/home-1/edit', style: 'PRIMARY' }],
      }],
      suggestions: [],
      parameters: { audiencePresentation: { householdRole: 'VIEWER' } },
    }, 'PROPERTY_SUMMARY'),
  });
  assert.equal(checked.trust.checks.actionApplicability, 'FAIL');
  assert.equal(checked.trust.checks.audienceSafety, 'FAIL');
  assert.deepEqual(checked.result.blocks[0].actions, []);

  const wrongOperation = validateAskAnswerTrust({
    question: 'Should I repair or replace this?', operationId: 'REPLACEMENT_GUIDANCE', propertyId: 'home-1',
    result: attachAskAuthoritativeSourceEvidence({
      status: 'ANSWERED',
      blocks: [{
        type: 'SUMMARY', id: 'summary', title: 'Repair is currently favored', body: 'The recorded inputs favor repair.', tone: 'DEFAULT',
        actions: [{ id: 'open-property-tax', label: 'Open property tax', href: '/dashboard/properties/home-1/tools/property-tax', style: 'PRIMARY' }],
      }],
      suggestions: [], parameters: { audiencePresentation: { householdRole: 'OWNER' } },
    }, 'REPLACEMENT_GUIDANCE'),
  });
  assert.equal(wrongOperation.trust.checks.actionApplicability, 'FAIL');
  assert.deepEqual(wrongOperation.result.blocks[0].actions, []);
});

test('boundary validation is operation-specific and removes a plausible but irrelevant disclaimer', () => {
  const checked = validateAskAnswerTrust({
    question: 'Should I repair or replace this?', operationId: 'REPLACEMENT_GUIDANCE', propertyId: 'home-1',
    result: attachAskAuthoritativeSourceEvidence({
      status: 'ANSWERED',
      blocks: [
        { type: 'SUMMARY', id: 'summary', title: 'Repair is currently favored', body: 'The recorded inputs favor repair.', tone: 'DEFAULT', actions: [] },
        { type: 'BOUNDARY', id: 'tax-readiness-boundary', title: 'Legal disclaimer', body: 'Consult a tax professional.', severity: 'INFO', suggestions: [] },
      ],
      suggestions: [],
    }, 'REPLACEMENT_GUIDANCE'),
  });
  assert.equal(checked.trust.checks.boundaryApplicability, 'FAIL');
  assert.equal(checked.result.blocks.some((block) => block.id === 'tax-readiness-boundary'), false);
  assert.equal(checked.trust.outcome, 'REPAIRABLE');
});

test('confirmed command completions receive audience presentation, source evidence, and trust validation', () => {
  const checked = validateAskConfirmedCompletion({
    question: 'Create a maintenance task to clean the gutters',
    operationId: 'MAINTENANCE_TASK_CREATE', propertyId: 'home-1', householdRole: 'CONTRIBUTOR',
    result: {
      status: 'COMPLETED', reasonCode: 'MAINTENANCE_TASK_CREATED',
      blocks: [{
        type: 'WORKFLOW_PROGRESS', id: 'created', title: 'Maintenance task created', status: 'COMPLETED',
        description: 'The task is now in the maintenance record.', details: [],
        actions: [{ id: 'open-task', label: 'Open task', href: '/dashboard/maintenance?propertyId=home-1', style: 'PRIMARY' }],
      }],
      suggestions: [],
    },
  });
  assert.equal(checked.result.status, 'COMPLETED');
  assert.equal(checked.trust.outcome, 'PASS');
  assert.equal(checked.trust.checks.sourceIntegrity, 'PASS');
  assert.equal(checked.result.parameters.audiencePresentation.householdRole, 'CONTRIBUTOR');
  assert.equal(checked.result.parameters.answerTrustEvidence.sources[0].sourceId, 'maintenance.create');
});

test('TA5 semantic relevance passes direct answers and detects a different-operation answer', () => {
  const direct = validateAskSemanticAnswerRelevance({
    question: 'Are there any pending home details to be filled in?', operationId: 'PROPERTY_SUMMARY',
    result: {
      status: 'ANSWERED',
      blocks: [{ type: 'SUMMARY', id: 'direct', title: 'Your home record is 65% complete', body: 'Three property details are missing.', tone: 'CAUTION', actions: [] }],
      suggestions: [],
    },
  });
  assert.equal(direct.outcome, 'PASS');
  assert.equal(direct.selectedOperationId, 'PROPERTY_SUMMARY');
  assert.ok(direct.latencyMs >= 0);

  const mismatched = validateAskAnswerTrustPipeline({
    question: 'Are there any pending home details to be filled in?', operationId: 'PROPERTY_SUMMARY', semanticEnabled: true,
    result: attachAskAuthoritativeSourceEvidence({
      status: 'ANSWERED',
      blocks: [{ type: 'SUMMARY', id: 'wrong', title: 'Maintenance status', body: 'Two maintenance tasks are overdue and need service.', tone: 'CAUTION', actions: [] }],
      suggestions: [],
    }, 'PROPERTY_SUMMARY'),
  });
  assert.equal(mismatched.semantic.outcome, 'FAIL');
  assert.equal(mismatched.trust.checks.questionCoverage, 'FAIL');
  assert.equal(mismatched.result.status, 'FAILED_RETRYABLE');
  assert.equal(mismatched.result.reasonCode, 'ASK_ANSWER_RELEVANCE_FAILED');
});

test('semantic response validation has an independent default-on control and kill switch', () => {
  assert.equal(readAskOperationalControls({}).semanticResponseValidatorEnabled, true);
  assert.equal(readAskOperationalControls({ ASK_SEMANTIC_RESPONSE_VALIDATOR_KILL_SWITCH: 'true' }).semanticResponseValidatorEnabled, false);
});

test('registered operation direct-answer fixtures do not produce semantic mismatch failures', () => {
  for (const definition of Object.values(ASK_OPERATION_DEFINITIONS)) {
    const relevance = validateAskSemanticAnswerRelevance({
      question: definition.semantic.positiveExamples[0],
      operationId: definition.operationId,
      result: {
        status: 'ANSWERED',
        blocks: [{
          type: 'SUMMARY', id: `fixture-${definition.operationId}`,
          title: definition.semantic.supportedJobs[0], body: definition.semantic.intentDescription,
          tone: 'DEFAULT', actions: [],
        }],
        suggestions: [],
      },
    });
    assert.notEqual(relevance.outcome, 'FAIL', definition.operationId);
  }
});

test('independent direct-answer certification reports every operation and meets the relevance objective', () => {
  const report = evaluateAskAnswerRelevanceQuality(ASK_ANSWER_RELEVANCE_CERTIFICATION_FIXTURES, '2026-08-15T00:00:00.000Z');
  assert.equal(report.samples, Object.keys(ASK_OPERATION_DEFINITIONS).length);
  assert.equal(report.byOperation.length, Object.keys(ASK_OPERATION_DEFINITIONS).length);
  assert.equal(report.unknown, 0);
  assert.ok(report.passRate >= 0.95, JSON.stringify(report));
});

test('cross-operation negative matrix rejects every answer with mismatched operation lineage', () => {
  assert.equal(ASK_ANSWER_RELEVANCE_CROSS_OPERATION_NEGATIVE_MATRIX.length, Object.keys(ASK_OPERATION_DEFINITIONS).length * (Object.keys(ASK_OPERATION_DEFINITIONS).length - 1));
  const report = evaluateAskAnswerRelevanceQuality(ASK_ANSWER_RELEVANCE_CROSS_OPERATION_NEGATIVE_MATRIX, '2026-08-15T00:00:00.000Z');
  assert.equal(report.passed, 0);
  assert.equal(report.failed, ASK_ANSWER_RELEVANCE_CROSS_OPERATION_NEGATIVE_MATRIX.length);
  assert.equal(report.unknown, 0);
});

test('semantic relevance rejects audited wrong-answer false positives without relying on source metadata', () => {
  for (const fixture of [
    { question: 'Which equipment is unprotected?', operationId: 'COVERAGE_GAPS', answer: 'Your equipment inventory contains three appliances.' },
    { question: 'Should I repair or replace my heating system?', operationId: 'HVAC_DECISION_START', answer: 'Two maintenance tasks are overdue and need service.' },
  ]) {
    const relevance = validateAskSemanticAnswerRelevance({
      question: fixture.question, operationId: fixture.operationId,
      result: { status: 'ANSWERED', blocks: [{ type: 'SUMMARY', id: 'wrong-answer', title: 'Direct answer', body: fixture.answer, tone: 'DEFAULT', actions: [] }], suggestions: [] },
    });
    assert.equal(relevance.outcome, 'FAIL', JSON.stringify(relevance));
  }
});
