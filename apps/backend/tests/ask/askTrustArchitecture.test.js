const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { ASK_OPERATION_DEFINITIONS, validateAskOperationDefinitions } = require('../../src/services/ask/askOperationRegistry.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { normalizeAskMessage, retrieveAskOperationCandidates } = require('../../src/services/ask/askSemanticRouter.ts');
const { validateAskAnswerTrust, validateAskAnswerTrustPipeline, validateAskConfirmedCompletion } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const {
  attachAskAuthoritativeSourceEvidence: attachEvidence,
  completedAskAuthoritativeSourceEvidence,
  includeAskContextSourceEvidence,
} = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const attachAskAuthoritativeSourceEvidence = (result, operationId) => attachEvidence(
  result,
  [completedAskAuthoritativeSourceEvidence(operationId)],
);
const { validateAskSemanticAnswerRelevance } = require('../../src/services/ask/askSemanticAnswerValidator.ts');
const { projectAskSemanticResponse } = require('../../src/services/ask/askSemanticResponseProjection.ts');
const { buildSeasonalMaintenanceResult } = require('../../src/services/ask/askSeasonalMaintenance.ts');
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
    assert.ok(definition.semantic.answerPositiveExamples.length >= 1);
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

test('unavailable optional context does not invalidate a complete canonical read', () => {
  assert.equal(includeAskContextSourceEvidence({ required: false, status: 'UNAVAILABLE' }), false);
  assert.equal(includeAskContextSourceEvidence({ required: false, status: 'STALE' }), false);
  assert.equal(includeAskContextSourceEvidence({ required: false, status: 'AVAILABLE' }), true);
  assert.equal(includeAskContextSourceEvidence({ required: true, status: 'UNAVAILABLE' }), true);
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
  assert.equal(mismatched.result.status, 'NEEDS_CLARIFICATION');
  assert.equal(mismatched.result.reasonCode, 'ASK_ANSWER_RELEVANCE_MISMATCH_CLARIFICATION_REQUIRED');
  assert.ok(mismatched.result.clarification.options.some((option) => option.operationId === 'PROPERTY_SUMMARY'));
  assert.ok(mismatched.result.clarification.options.some((option) => option.operationId === 'MAINTENANCE_STATUS'));
});

test('buyer "focus on this week for my closing" answer passes the semantic trust pipeline instead of clarifying against MAINTENANCE_TASK_COMPLETE', () => {
  const question = 'What should I focus on this week for my closing?';
  const result = validateAskAnswerTrustPipeline({
    question,
    operationId: 'BUYER_PLAN_STATUS',
    semanticEnabled: true,
    result: attachAskAuthoritativeSourceEvidence({
      status: 'ANSWERED',
      blocks: [{
        type: 'SUMMARY', id: 'buyer-plan-status',
        title: 'Next before closing: Schedule final walkthrough',
        body: 'The Closing Plan is 80% complete with 2 of 10 applicable pre-close tasks remaining.',
        tone: 'CAUTION', actions: [],
      }],
      suggestions: [],
    }, 'BUYER_PLAN_STATUS'),
  });
  assert.equal(result.semantic.outcome, 'PASS');
  assert.equal(result.result.status, 'ANSWERED');
});

test('buyer "is anything putting my closing at risk" answer passes the semantic trust pipeline, with and without recorded blockers', () => {
  const question = 'Is anything putting my closing date at risk?';
  const withBlockers = validateAskAnswerTrustPipeline({
    question,
    operationId: 'BUYER_DEADLINES',
    semanticEnabled: true,
    result: attachAskAuthoritativeSourceEvidence({
      status: 'READY_WITH_LIMITATIONS',
      blocks: [{
        type: 'SUMMARY', id: 'buyer-deadlines-summary',
        title: 'Recorded deadlines before closing',
        body: '2 milestones and 1 blocking task are open. Dates reflect what you or your professionals recorded, not a certified closing date.',
        tone: 'CAUTION', actions: [],
      }],
      suggestions: [],
    }, 'BUYER_DEADLINES'),
  });
  assert.equal(withBlockers.semantic.outcome, 'PASS');
  assert.equal(withBlockers.result.status, 'READY_WITH_LIMITATIONS');

  const noBlockers = validateAskAnswerTrustPipeline({
    question,
    operationId: 'BUYER_DEADLINES',
    semanticEnabled: true,
    result: attachAskAuthoritativeSourceEvidence({
      status: 'ANSWERED',
      blocks: [{
        type: 'SUMMARY', id: 'buyer-deadlines-summary',
        title: 'Nothing recorded is putting closing at risk right now',
        body: 'No milestone or blocking task threatens this closing right now. This does not guarantee no deadline exists — only recorded ones are shown.',
        tone: 'DEFAULT', actions: [],
      }],
      suggestions: [],
    }, 'BUYER_DEADLINES'),
  });
  assert.equal(noBlockers.semantic.outcome, 'PASS');
  assert.equal(noBlockers.result.status, 'ANSWERED');
});

test('every BUYER_* operation keeps its navigation action and professional boundary through the trust filter', () => {
  const cases = [
    { operationId: 'BUYER_PLAN_STATUS', actionId: 'open-next-buyer-task', boundaryId: 'buyer-professional-boundary', href: '/dashboard/properties/property-1/buyer-plan?taskId=t1' },
    { operationId: 'BUYER_DEADLINES', actionId: 'open-buyer-plan', boundaryId: 'buyer-professional-boundary', href: '/dashboard/properties/property-1/buyer-plan' },
    { operationId: 'BUYER_DOCUMENT_READINESS', actionId: 'open-documents', boundaryId: null, href: '/dashboard/properties/property-1/documents' },
    { operationId: 'BUYER_INSPECTION_REVIEW', actionId: 'open-inspection-hub', boundaryId: 'buyer-professional-boundary', href: '/dashboard/properties/property-1/inspection-hub' },
    { operationId: 'BUYER_MOVE_STATUS', actionId: 'open-buyer-plan', boundaryId: null, href: '/dashboard/properties/property-1/buyer-plan' },
    { operationId: 'BUYER_FINANCING_READINESS', actionId: 'open-buyer-plan', boundaryId: 'buyer-professional-boundary', href: '/dashboard/properties/property-1/buyer-plan' },
    { operationId: 'BUYER_TITLE_ESCROW_READINESS', actionId: 'open-buyer-plan', boundaryId: 'buyer-professional-boundary', href: '/dashboard/properties/property-1/buyer-plan' },
    { operationId: 'BUYER_WALKTHROUGH_READINESS', actionId: 'open-buyer-plan', boundaryId: 'buyer-walkthrough-boundary', href: '/dashboard/properties/property-1/buyer-plan' },
    { operationId: 'BUYER_DISCLOSURE_FUNDS_READINESS', actionId: 'open-buyer-plan', boundaryId: 'buyer-disclosure-wire-boundary', href: '/dashboard/properties/property-1/buyer-plan' },
    { operationId: 'BUYER_CLOSING_DAY_READINESS', actionId: 'open-buyer-plan', boundaryId: 'buyer-closing-day-wire-boundary', href: '/dashboard/properties/property-1/buyer-plan' },
    { operationId: 'BUYER_CONTRACT_TIMELINE', actionId: 'open-buyer-plan', boundaryId: 'buyer-professional-boundary', href: '/dashboard/properties/property-1/buyer-plan' },
    { operationId: 'BUYER_NEGOTIATION_READINESS', actionId: 'open-negotiation', boundaryId: 'buyer-professional-boundary', href: '/dashboard/properties/property-1/inspection-hub' },
    { operationId: 'BUYER_COST_READINESS', actionId: 'open-buyer-plan', boundaryId: 'buyer-cost-boundary', href: '/dashboard/properties/property-1/buyer-plan' },
  ];
  for (const { operationId, actionId, boundaryId, href } of cases) {
    const blocks = [{
      type: 'SUMMARY', id: 'summary', title: 'Title', body: 'Body', tone: 'DEFAULT',
      actions: [{ id: actionId, label: 'Open', href, style: 'PRIMARY' }],
    }];
    if (boundaryId) blocks.push({ type: 'BOUNDARY', id: boundaryId, title: 'Boundary', body: 'Boundary body', severity: 'INFO', suggestions: [] });
    const result = validateAskAnswerTrustPipeline({
      question: 'test question', operationId, semanticEnabled: false, propertyId: 'property-1',
      result: attachAskAuthoritativeSourceEvidence({ status: 'ANSWERED', blocks, suggestions: [] }, operationId),
    });
    assert.equal(result.trust.reasonCodes.includes('INAPPLICABLE_ACTION_REMOVED'), false, `${operationId}: action ${actionId} was stripped`);
    assert.equal(result.result.blocks[0].actions.length, 1, `${operationId}: expected the navigation action to survive`);
    if (boundaryId) {
      assert.equal(result.trust.reasonCodes.includes('INAPPLICABLE_BOUNDARY_REMOVED'), false, `${operationId}: boundary ${boundaryId} was stripped`);
      assert.equal(result.result.blocks.some((block) => block.type === 'BOUNDARY'), true, `${operationId}: expected the boundary block to survive`);
    }
  }
});

test('every read-oriented BUYER_* operation\'s realistic answer states pass the semantic trust pipeline with a working navigation action', () => {
  const planHref = '/dashboard/properties/prop-1/buyer-plan';
  const cases = [
    { operationId: 'BUYER_DOCUMENT_READINESS', question: 'Which transaction documents are missing before closing?', status: 'READY_WITH_LIMITATIONS', title: '2 transaction documents still need review', body: '5 documents recorded, 3 verified, 2 needing review. This reflects only what has been uploaded — it is not a guarantee that every closing document has been requested.', actionId: 'open-documents', href: '/dashboard/properties/prop-1/documents' },
    { operationId: 'BUYER_DOCUMENT_READINESS', question: 'Which transaction documents are missing before closing?', status: 'ANSWERED', title: 'Recorded transaction documents are verified', body: '5 documents recorded, 5 verified, 0 needing review. This reflects only what has been uploaded — it is not a guarantee that every closing document has been requested.', actionId: 'open-documents', href: '/dashboard/properties/prop-1/documents' },
    { operationId: 'BUYER_INSPECTION_REVIEW', question: 'Which inspection findings still need a decision?', status: 'READY_WITH_LIMITATIONS', title: '2 safety or major findings still need a decision', body: 'Each finding needs a decision: seller negotiation, accepted post-close work, verified fact, or dismissed with reason. Ask can draft a decision, but confirming it happens in Inspection Hub or with your explicit confirmation.', actionId: 'open-inspection-hub', href: '/dashboard/properties/prop-1/inspection-hub' },
    { operationId: 'BUYER_INSPECTION_REVIEW', question: 'Which inspection findings still need a decision?', status: 'ANSWERED', title: 'The inspection report has been confirmed', body: '1 inspection report recorded for this purchase.', actionId: 'open-inspection-hub', href: '/dashboard/properties/prop-1/inspection-hub' },
    { operationId: 'BUYER_MOVE_STATUS', question: 'What should I do before I move in?', status: 'ANSWERED', title: '3 of 5 move tasks complete', body: '2 move tasks still open for this purchase.', actionId: 'open-buyer-plan', href: `${planHref}?filter=MOVE` },
    { operationId: 'BUYER_MOVE_STATUS', question: 'What should I do before I move in?', status: 'ANSWERED', title: 'No move tasks are generated yet', body: 'Moving Concierge has not generated move tasks for this purchase yet. Generated tasks appear directly in the canonical Buyer Plan.', actionId: 'open-buyer-plan', href: `${planHref}?filter=MOVE` },
    { operationId: 'BUYER_FINANCING_READINESS', question: 'Is underwriting on track for this closing?', status: 'NOT_APPLICABLE', title: 'This purchase is recorded as a cash purchase', body: 'No lender, appraisal, or underwriting steps apply. Financing readiness tracking is for financed purchases only.', actionId: 'open-buyer-plan', href: planHref },
    { operationId: 'BUYER_FINANCING_READINESS', question: 'Is underwriting on track for this closing?', status: 'READY_WITH_LIMITATIONS', title: 'Purchase financing has not been recorded yet', body: 'Record whether this purchase is financed or cash, then select a confirmed Loan Estimate to track appraisal and underwriting readiness.', actionId: 'open-buyer-plan', href: planHref },
    { operationId: 'BUYER_FINANCING_READINESS', question: 'What is my lender appraisal status?', status: 'ANSWERED', title: 'No blocking lender condition is currently open', body: 'Appraisal: completed. Underwriting: clear to close. Clear-to-close is recorded.', actionId: 'open-buyer-plan', href: planHref },
    { operationId: 'BUYER_TITLE_ESCROW_READINESS', question: 'What title issues could block my closing?', status: 'READY_WITH_LIMITATIONS', title: '2 title/escrow issues still block closing', body: 'Title review: in review. Closing appointment recorded for August 20, 2026.', actionId: 'open-buyer-plan', href: planHref },
    { operationId: 'BUYER_WALKTHROUGH_READINESS', question: 'Help me prepare for the final walkthrough', status: 'READY_WITH_LIMITATIONS', title: 'The final walkthrough has not been scheduled yet', body: 'Schedule the walkthrough close to closing and record attendees before it happens.', actionId: 'open-buyer-plan', href: planHref },
    { operationId: 'BUYER_DISCLOSURE_FUNDS_READINESS', question: 'Are my closing funds ready?', status: 'READY_WITH_LIMITATIONS', title: 'No Closing Disclosure has been recorded yet', body: 'Upload or manually enter the latest Closing Disclosure once your lender or closing professional sends it.', actionId: 'open-buyer-plan', href: planHref },
    { operationId: 'BUYER_DISCLOSURE_FUNDS_READINESS', question: 'Are my closing funds ready?', status: 'READY_WITH_LIMITATIONS', title: '2 items still open before funds are ready', body: 'Still open: funds readiness, wire-instruction verification.', actionId: 'open-buyer-plan', href: planHref },
    { operationId: 'BUYER_CLOSING_DAY_READINESS', question: 'Is my closing day checklist ready?', status: 'ANSWERED', title: 'The professional close is confirmed complete', body: 'This purchase has moved to the first-90-day homeowner experience.', actionId: 'open-buyer-plan', href: planHref },
    { operationId: 'BUYER_CONTRACT_TIMELINE', question: 'Show my confirmed contract timeline', status: 'READY_WITH_LIMITATIONS', title: 'No confirmed contract revision is recorded yet', body: 'Upload or record the accepted contract and confirm its extracted dates and terms.', actionId: 'open-buyer-plan', href: planHref },
    { operationId: 'BUYER_CONTRACT_TIMELINE', question: 'What contingency deadlines are recorded in my contract?', status: 'READY_WITH_LIMITATIONS', title: '2 contract contingencies are still open', body: 'Accepted August 1, 2026, target closing August 25, 2026.', actionId: 'open-buyer-plan', href: planHref },
    { operationId: 'BUYER_NEGOTIATION_READINESS', question: 'What should I discuss with my agent about the inspection?', status: 'ANSWERED', title: 'No finding is currently in negotiation', body: 'Classify a material inspection finding as seller negotiation to start tracking it here.', actionId: 'open-negotiation', href: '/dashboard/properties/prop-1/inspection-hub' },
    { operationId: 'BUYER_COST_READINESS', question: 'What will this purchase cost me before closing?', status: 'ANSWERED', title: 'No near-term cost estimates are recorded yet', body: 'Add an estimated cost to a Buyer Plan task to track near-term purchase costs here.', actionId: 'open-buyer-plan', href: planHref },
  ];
  for (const c of cases) {
    const result = validateAskAnswerTrustPipeline({
      question: c.question, operationId: c.operationId, semanticEnabled: true, propertyId: 'prop-1',
      result: attachAskAuthoritativeSourceEvidence({
        status: c.status,
        blocks: [{ type: 'SUMMARY', id: 'x', title: c.title, body: c.body, tone: 'DEFAULT', actions: [{ id: c.actionId, label: 'Open', href: c.href, style: 'PRIMARY' }] }],
        suggestions: [],
      }, c.operationId),
    });
    const label = `${c.operationId} / "${c.title}"`;
    assert.ok(['PASS', 'REPAIRABLE'].includes(result.trust.outcome), `${label}: expected trust PASS/REPAIRABLE, got ${result.trust.outcome} (${JSON.stringify(result.trust.reasonCodes)})`);
    assert.equal(result.result.blocks[0].actions.length, 1, `${label}: expected the navigation action to survive`);
  }
});

test('NOT_APPLICABLE, BLOCKED, NEEDS_ENTITY, and NEEDS_CONFIRMATION results keep their navigation action once evidence is attached', () => {
  for (const status of ['NOT_APPLICABLE', 'BLOCKED', 'NEEDS_ENTITY', 'NEEDS_CONFIRMATION']) {
    const result = validateAskAnswerTrustPipeline({
      question: 'Complete this closing checklist item', operationId: 'BUYER_TASK_COMPLETE', semanticEnabled: false, propertyId: 'prop-1',
      result: attachAskAuthoritativeSourceEvidence({
        status,
        blocks: [{ type: 'SUMMARY', id: 'x', title: 'Title', body: 'Body', tone: 'DEFAULT', actions: [{ id: 'open-buyer-plan', label: 'Review Buyer Plan', href: '/dashboard/properties/prop-1/buyer-plan', style: 'SECONDARY' }] }],
        suggestions: [],
      }, 'BUYER_TASK_COMPLETE'),
    });
    assert.equal(result.result.status, status, `status should pass through unchanged for ${status}`);
    assert.equal(result.result.blocks[0].actions.length, 1, `${status}: navigation action should survive once evidence is attached`);
  }
});

test('UNAVAILABLE results still lose their action, since evidence is genuinely absent', () => {
  const result = validateAskAnswerTrustPipeline({
    question: 'Complete this closing checklist item', operationId: 'BUYER_TASK_COMPLETE', semanticEnabled: false, propertyId: 'prop-1',
    result: attachAskAuthoritativeSourceEvidence({
      status: 'UNAVAILABLE',
      blocks: [{ type: 'SUMMARY', id: 'x', title: 'Title', body: 'Body', tone: 'DEFAULT', actions: [{ id: 'open-buyer-plan', label: 'Review Buyer Plan', href: '/dashboard/properties/prop-1/buyer-plan', style: 'SECONDARY' }] }],
      suggestions: [],
    }, 'BUYER_TASK_COMPLETE'),
  });
  assert.equal(result.result.blocks[0].actions.length, 0);
});

test('seasonal maintenance rich responses pass the complete semantic trust pipeline', () => {
  const question = 'list pending seasonal tasks';
  const result = buildSeasonalMaintenanceResult({
    message: question,
    propertyId: 'property-1',
    propertyTimezone: 'America/New_York',
    now: new Date('2026-08-14T12:00:00.000Z'),
    contextAvailable: true,
    context: { checklists: [{
      id: 'summer-2026', season: 'SUMMER', year: 2026, status: 'IN_PROGRESS',
      seasonStartDate: new Date('2026-06-21T00:00:00.000Z'),
      seasonEndDate: new Date('2026-09-21T00:00:00.000Z'), updatedAt: new Date('2026-08-14T00:00:00.000Z'),
      items: [{
        id: 'cooling', taskKey: 'cooling', title: 'Service air conditioner',
        description: 'Prepare the cooling system for sustained heat.', priority: 'CRITICAL', status: 'RECOMMENDED',
        recommendedDate: new Date('2026-08-20T00:00:00.000Z'), snoozedUntil: null,
        updatedAt: new Date('2026-08-14T00:00:00.000Z'), maintenanceTask: null,
      }],
    }] },
  });
  const validation = validateAskAnswerTrustPipeline({
    question,
    operationId: 'MAINTENANCE_STATUS',
    semanticEnabled: true,
    propertyId: 'property-1',
    result: attachAskAuthoritativeSourceEvidence(result, 'MAINTENANCE_STATUS'),
  });
  assert.equal(validation.semantic.outcome, 'PASS');
  assert.equal(validation.result.status, 'ANSWERED');
  const projection = projectAskSemanticResponse(result.blocks);
  assert.match(projection, /Summer checklist/i);
  assert.match(projection, /Service air conditioner/i);
  assert.doesNotMatch(projection, /property-1|dashboard\/seasonal/);
});

test('semantic uncertainty requests focused clarification without claiming a mismatch', () => {
  const uncertain = validateAskAnswerTrustPipeline({
    question: 'What maintenance is pending?', operationId: 'MAINTENANCE_STATUS', semanticEnabled: true,
    result: attachAskAuthoritativeSourceEvidence({
      status: 'ANSWERED',
      blocks: [{ type: 'SUMMARY', id: 'vague', title: 'Response', body: 'I found a result.', tone: 'DEFAULT', actions: [] }],
      suggestions: [],
    }, 'MAINTENANCE_STATUS'),
  });
  assert.equal(uncertain.semantic.outcome, 'UNKNOWN');
  assert.equal(uncertain.trust.checks.questionCoverage, 'UNKNOWN');
  assert.equal(uncertain.result.status, 'NEEDS_CLARIFICATION');
  assert.equal(uncertain.result.reasonCode, 'ASK_ANSWER_RELEVANCE_UNCERTAIN_CLARIFICATION_REQUIRED');
  assert.match(uncertain.result.blocks[0].body, /could not confidently connect/i);

  const afterClarification = validateAskAnswerTrustPipeline({
    question: 'What maintenance is pending? Clarification: pending upkeep',
    operationId: 'MAINTENANCE_STATUS', semanticEnabled: true, recoveryAttempted: true,
    result: attachAskAuthoritativeSourceEvidence({
      status: 'ANSWERED',
      blocks: [{ type: 'SUMMARY', id: 'still-vague', title: 'Response', body: 'I found a result.', tone: 'DEFAULT', actions: [] }],
      suggestions: [],
    }, 'MAINTENANCE_STATUS'),
  });
  assert.equal(afterClarification.result.status, 'UNAVAILABLE');
  assert.equal(afterClarification.result.reasonCode, 'ASK_ANSWER_RELEVANCE_UNRESOLVED_AFTER_CLARIFICATION');
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
  assert.equal(report.failed + report.unknown, ASK_ANSWER_RELEVANCE_CROSS_OPERATION_NEGATIVE_MATRIX.length);
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
