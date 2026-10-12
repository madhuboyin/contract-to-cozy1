const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Negotiation Shield slice 2b (docs/architecture/ASK_COZY_NEGOTIATION_SHIELD_SLICE2_DESIGN.md): run the analysis inside Ask. No database, browser or
// native module: `sharp` is stubbed, the case model is an in-memory fake, and the collaborators with their own side effects are replaced.

const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed in tests'); }, children: [], paths: [] };

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const executeOperation = require('../../src/services/ask/execution/executeOperation.ts');
const projectCompliance = require('../../src/services/projectCompliance/context.ts');
const completion = require('../../src/services/negotiationShieldJourneyCompletion.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { NegotiationShieldService } = require('../../src/services/negotiationShield.service.ts');
const { negotiationShieldReviewFromView } = require('../../src/services/ask/handlers/negotiationShield.handler.ts');
const { NEGOTIATION_SHIELD_ANALYZE_MESSAGE } = require('../../src/services/ask/support/negotiationShieldAnalyze.ts');

const OP = 'NEGOTIATION_SHIELD_CASE_ANALYZE';
const LAUNCH = { operationId: OP, surface: 'ASK_PAGE', entityType: 'NEGOTIATION_SHIELD_CASE', entityId: 'case-1' };

const CASE = {
  id: 'case-1', propertyId: 'prop-1', createdByUserId: 'user-1', scenarioType: 'CONTRACTOR_QUOTE_REVIEW', status: 'DRAFT', title: 'Roof quote',
  description: null, sourceType: 'MANUAL', perspective: 'HOMEOWNER', analysisVersion: null, latestAnalysisAt: null, quoteDecisionWorkspaceId: null,
  createdAt: new Date('2026-10-01T12:00:00Z'), updatedAt: new Date('2026-10-01T12:00:00Z'),
};
const analysisAt = (iso) => ({
  id: `an-${iso}`, caseId: 'case-1', scenarioType: 'CONTRACTOR_QUOTE_REVIEW', summary: 'The quote is complete but the labor line is not itemized.',
  findings: [{ key: 'labor', title: 'Labor is not itemized', detail: 'One labor total.', status: 'MISSING' }],
  negotiationLeverage: [{ key: 'competing', title: 'You can compare quotes', detail: 'A second quote helps.', strength: 'MEDIUM' }],
  recommendedActions: [{ key: 'ask', title: 'Ask for an itemized estimate', detail: 'Request labor and materials separately.', priority: 'HIGH' }],
  pricingAssessment: { status: 'NEEDS_COMPARISON', summary: 'Compare before deciding.', rationale: ['Only one quote.'], confidenceLabel: 'MEDIUM', quoteAmount: 18500 },
  confidence: 0.6, generatedAt: new Date(iso), modelVersion: 'contractor-quote-v1', createdAt: new Date(iso),
});
const DRAFT = { id: 'dr-1', caseId: 'case-1', draftType: 'EMAIL', subject: 'Question about your estimate', body: 'Hello,\n\nCould you itemize the labor?', tone: 'polite', isLatest: true, createdAt: new Date('2026-10-03T12:00:00Z') };

function store(record) {
  const state = { record, queries: 0 };
  const saved = { model: prisma.negotiationShieldCase, resolve: propertyAccess.resolvePropertyAccess };
  prisma.negotiationShieldCase = {
    findFirst: async (args) => { state.queries += 1; return state.record && args.where.propertyId === state.record.propertyId && args.where.id === state.record.id ? state.record : null; },
  };
  propertyAccess.resolvePropertyAccess = async () => ({ role: state.role ?? 'CONTRIBUTOR', userId: 'user-1', propertyId: 'prop-1' });
  state.restore = () => { prisma.negotiationShieldCase = saved.model; propertyAccess.resolvePropertyAccess = saved.resolve; };
  return state;
}
const fresh = (over = {}) => ({ ...CASE, analyses: [], drafts: [], inputs: [{ updatedAt: new Date('2026-10-02T09:00:00Z') }], ...over });
const analyzed = (over = {}) => fresh({ status: 'ANALYZED', latestAnalysisAt: new Date('2026-10-03T12:00:00Z'), analyses: [analysisAt('2026-10-03T12:00:00Z')], drafts: [DRAFT], ...over });

const invoke = (message, launchContext, role = 'CONTRIBUTOR', propertyId = 'prop-1') => capabilityInvoke(OP, { userId: 'user-1', propertyId, message, launchContext }, { propertyAccess: { role } });

// ───────────────────────────── the review offers the run, only when it is useful ─────────────────────────────

const reviewDto = (record) => ({
  case: { id: record.id, propertyId: record.propertyId, scenarioType: record.scenarioType, status: record.status, title: record.title, perspective: 'HOMEOWNER',
    createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() },
  latestAnalysis: record.analyses[0] ? { ...record.analyses[0], generatedAt: record.analyses[0].generatedAt.toISOString(), confidenceExplanation: null } : null,
  latestDraft: record.drafts[0] ? { ...record.drafts[0], createdAt: record.drafts[0].createdAt.toISOString() } : null,
  hasInput: record.inputs.length > 0,
  inputsUpdatedAt: record.inputs[0] ? record.inputs[0].updatedAt.toISOString() : null,
});
const summaryActions = (result) => result.blocks.find((b) => b.id === 'negotiation-shield-review-summary').actions;

test('a contributor sees Run the analysis on a review that has details and no analysis', () => {
  const actions = summaryActions(negotiationShieldReviewFromView(reviewDto(fresh()), true));
  assert.deepEqual(actions.map((a) => [a.id, a.label, a.operationId, a.entityType, a.entityId]), [
    ['negotiation-shield-analyze', 'Run the analysis', OP, 'NEGOTIATION_SHIELD_CASE', 'case-1'],
    ['negotiation-shield-back', 'Back to my reviews', 'NEGOTIATION_SHIELD_CASES', undefined, undefined],
  ]);
  assert.equal(actions[0].message, NEGOTIATION_SHIELD_ANALYZE_MESSAGE);
});

test('an analysed review offers Run it again only when its details changed after the analysis', () => {
  const current = negotiationShieldReviewFromView(reviewDto(analyzed()), true);
  assert.deepEqual(summaryActions(current).map((a) => a.id), ['negotiation-shield-back']);
  assert.equal(current.blocks.some((b) => b.id === 'negotiation-shield-stale'), false);

  const changed = analyzed({ inputs: [{ updatedAt: new Date('2026-10-05T09:00:00Z') }] });
  const stale = negotiationShieldReviewFromView(reviewDto(changed), true);
  assert.deepEqual(summaryActions(stale).map((a) => [a.id, a.label]), [['negotiation-shield-analyze', 'Run it again'], ['negotiation-shield-back', 'Back to my reviews']]);
  const note = stale.blocks.find((b) => b.id === 'negotiation-shield-stale');
  assert.match(note.body, /Run it again/);
});

test('a viewer is told, never offered a button; a review with no details offers nothing to run', () => {
  const viewerFresh = negotiationShieldReviewFromView(reviewDto(fresh()), false);
  assert.deepEqual(summaryActions(viewerFresh).map((a) => a.id), ['negotiation-shield-back']);
  assert.match(viewerFresh.blocks[0].body, /contributor or owner can run the analysis/);

  const viewerStale = negotiationShieldReviewFromView(reviewDto(analyzed({ inputs: [{ updatedAt: new Date('2026-10-05T09:00:00Z') }] })), false);
  assert.deepEqual(summaryActions(viewerStale).map((a) => a.id), ['negotiation-shield-back']);
  assert.match(viewerStale.blocks.find((b) => b.id === 'negotiation-shield-stale').body, /contributor or owner can run it again/);

  const noInput = negotiationShieldReviewFromView(reviewDto(fresh({ inputs: [] })), true);
  assert.deepEqual(summaryActions(noInput).map((a) => a.id), ['negotiation-shield-back']);
  assert.match(noInput.blocks[0].body, /no saved details/);
});

// ───────────────────────────── propose ─────────────────────────────

test('Run the analysis proposes a confirmation and writes nothing', async () => {
  const st = store(fresh());
  const original = NegotiationShieldService.prototype.analyzeCase;
  let ran = 0;
  NegotiationShieldService.prototype.analyzeCase = async () => { ran += 1; return {}; };
  try {
    const result = await invoke(NEGOTIATION_SHIELD_ANALYZE_MESSAGE, LAUNCH);
    assert.equal(result.status, 'NEEDS_CONFIRMATION');
    assert.equal(result.confirmation.title, 'Run the analysis for "Roof quote"?');
    assert.equal(result.confirmation.confirmLabel, 'Run the analysis');
    assert.match(result.confirmation.description, /Nothing is sent to anyone/);
    assert.equal(result.parameters.negotiationShieldAnalyze.caseId, 'case-1');
    assert.equal(ran, 0);

    st.record = analyzed();
    const again = await invoke(NEGOTIATION_SHIELD_ANALYZE_MESSAGE, LAUNCH);
    assert.equal(again.confirmation.title, 'Run "Roof quote" again?');
    assert.deepEqual(again.confirmation.fields.map((f) => f.label), ['Review', 'Type', 'Last analyzed']);
    assert.match(again.confirmation.description, /Earlier analyses are kept/);
  } finally { NegotiationShieldService.prototype.analyzeCase = original; st.restore(); }
});

test('a journey launch is carried to the confirmation', async () => {
  const st = store(fresh());
  try {
    const result = await invoke(NEGOTIATION_SHIELD_ANALYZE_MESSAGE, { ...LAUNCH, journeyId: 'journey-9' });
    assert.equal(result.parameters.journeyId, 'journey-9');
  } finally { st.restore(); }
});

test('a viewer, an undeclared message, a refresh and another property\'s case never reach a confirmation', async () => {
  const st = store(fresh());
  try {
    const viewer = await invoke(NEGOTIATION_SHIELD_ANALYZE_MESSAGE, LAUNCH, 'VIEWER');
    assert.notEqual(viewer.status, 'NEEDS_CONFIRMATION');
    const typed = await invoke('run the analysis', null);
    assert.equal(typed.reasonCode, 'ASK_NEGOTIATION_SHIELD_ANALYZE_NOT_DIRECTLY_ROUTABLE');
    const refresh = await invoke(NEGOTIATION_SHIELD_ANALYZE_MESSAGE, { ...LAUNCH, surface: 'ASK_REFRESH' });
    assert.equal(refresh.reasonCode, 'ASK_NEGOTIATION_SHIELD_ANALYZE_NOT_DIRECTLY_ROUTABLE');
    const other = await invoke(NEGOTIATION_SHIELD_ANALYZE_MESSAGE, LAUNCH, 'CONTRIBUTOR', 'prop-2');
    assert.equal(other.reasonCode, 'NEGOTIATION_SHIELD_CASE_NOT_FOUND');
    assert.equal(other.confirmation ?? null, null);
  } finally { st.restore(); }
});

test('a review with no saved details cannot be analysed', async () => {
  const st = store(fresh({ inputs: [] }));
  try {
    const result = await invoke(NEGOTIATION_SHIELD_ANALYZE_MESSAGE, LAUNCH);
    assert.equal(result.reasonCode, 'NEGOTIATION_SHIELD_NO_DETAILS');
    assert.equal(result.confirmation ?? null, null);
  } finally { st.restore(); }
});

test('typed phrasing never routes to the analysis: it is reached only from a review', () => {
  for (const message of ['run the analysis for my negotiation review', 'analyze my negotiation case', 'run it again']) {
    assert.notEqual(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation?.operationId, OP, message);
  }
  const command = getAskDomainCommandByOperation(OP);
  assert.equal(command.roleFloor, 'CONTRIBUTOR');
  assert.equal(command.adapterKey, 'negotiation-shield.analyze');
});

// ───────────────────────────── confirm ─────────────────────────────

function installWrite(st, { engineFails = false, gateRefuses = false } = {}) {
  const saved = {
    analyze: NegotiationShieldService.prototype.analyzeCase, gate: projectCompliance.assertProjectComplianceApplicable,
    record: completion.recordNegotiationShieldAnalysisCompletion, reconcile: executeOperation.reconcileAskExecutionSideEffects,
  };
  const seen = { analyze: [], gate: [], completion: [] };
  NegotiationShieldService.prototype.analyzeCase = async function (...args) {
    seen.analyze.push(args);
    if (engineFails) throw Object.assign(new Error('Analysis engine encountered an unexpected error.'), { code: 'NEGOTIATION_SHIELD_ANALYSIS_ENGINE_ERROR' });
    st.record = { ...st.record, status: 'ANALYZED', latestAnalysisAt: new Date(), analyses: [analysisAt(new Date().toISOString())], drafts: [DRAFT] };
    return { case: { id: 'case-1', scenarioType: 'CONTRACTOR_QUOTE_REVIEW', status: 'ANALYZED' }, latestAnalysis: { summary: 's' }, latestDraft: { draftType: 'EMAIL' } };
  };
  projectCompliance.assertProjectComplianceApplicable = async (...args) => {
    seen.gate.push(args);
    if (gateRefuses) throw Object.assign(new Error('Required property context is incomplete.'), { code: 'PROPERTY_CONTEXT_REQUIRED' });
    return { contextVersion: 'ctx-9' };
  };
  completion.recordNegotiationShieldAnalysisCompletion = async (input) => { seen.completion.push(input); };
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  return { seen, restore() {
    NegotiationShieldService.prototype.analyzeCase = saved.analyze;
    projectCompliance.assertProjectComplianceApplicable = saved.gate;
    completion.recordNegotiationShieldAnalysisCompletion = saved.record;
    executeOperation.reconcileAskExecutionSideEffects = saved.reconcile;
  } };
}
const ctx = (parameters, createdAt = new Date()) => ({ userId: 'user-1', execution: { id: 'exec-5', propertyId: 'prop-1', createdAt }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });
const CONFIRMED = { negotiationShieldAnalyze: { caseId: 'case-1', title: 'Roof quote', scenarioType: 'CONTRACTOR_QUOTE_REVIEW' }, journeyId: 'journey-9', stepKey: null };

test('confirming runs the gate, the canonical analysis, the shared journey completion once, and answers with the review', async () => {
  const st = store(fresh());
  const w = installWrite(st);
  try {
    const outcome = await confirmCapabilityInvoke(OP, ctx(CONFIRMED));
    assert.deepEqual(w.seen.gate, [['prop-1', 'user-1', 'NEGOTIATION_SHIELD', {}, 'negotiationShield']]);
    assert.deepEqual(w.seen.analyze, [['prop-1', 'case-1', 'ctx-9']]);
    assert.equal(w.seen.completion.length, 1);
    assert.equal(w.seen.completion[0].propertyId, 'prop-1');
    assert.equal(w.seen.completion[0].actorUserId, 'user-1');
    assert.equal(w.seen.completion[0].journeyId, 'journey-9');
    assert.equal(w.seen.completion[0].detail.case.id, 'case-1');

    assert.equal(outcome.result.status, 'COMPLETED');
    assert.equal(outcome.artifactType, 'NEGOTIATION_SHIELD_ANALYSIS');
    assert.match(outcome.artifactId, /^an-/);
    const ids = outcome.result.blocks.map((b) => b.id);
    assert.match(ids[0], /^negotiation-shield-analyzed-/);
    assert.equal(outcome.result.blocks[0].title, 'Analysis saved');
    assert.deepEqual(outcome.result.blocks[0].actions, []);
    for (const id of ['negotiation-shield-review-summary', 'negotiation-shield-findings', 'negotiation-shield-draft', 'negotiation-shield-boundary']) assert.ok(ids.includes(id), id);
    const draft = outcome.result.blocks.find((b) => b.id === 'negotiation-shield-draft');
    assert.match(draft.title, /nothing has been sent/);
    assert.match(draft.sections[0].items[0].detail, /itemize the labor/);
  } finally { w.restore(); st.restore(); }
});

test('a retry of the same confirmation shows the analysis it already saved and runs nothing again', async () => {
  const existing = analysisAt('2026-10-12T10:05:00Z');
  const st = store(analyzed({ analyses: [existing] }));
  const w = installWrite(st);
  try {
    const outcome = await confirmCapabilityInvoke(OP, ctx(CONFIRMED, new Date('2026-10-12T10:00:00Z')));
    assert.equal(w.seen.analyze.length, 0);
    assert.equal(w.seen.gate.length, 0);
    assert.equal(w.seen.completion.length, 0, 'the journey is not completed a second time');
    assert.equal(outcome.result.blocks[0].title, 'Analysis already saved');
    assert.equal(outcome.artifactId, existing.id);
  } finally { w.restore(); st.restore(); }
});

test('a separate execution is a deliberate re-run and appends a new analysis', async () => {
  const st = store(analyzed());
  const w = installWrite(st);
  try {
    const outcome = await confirmCapabilityInvoke(OP, ctx(CONFIRMED, new Date()));
    assert.equal(w.seen.analyze.length, 1);
    assert.equal(outcome.result.blocks[0].title, 'Analysis saved');
  } finally { w.restore(); st.restore(); }
});

test('nothing is written when the review is gone, has no details, the gate refuses, or the engine fails', async () => {
  for (const [label, record, options, code] of [
    ['gone', null, {}, 'ASK_CONFIRMATION_NOT_ACTIVE'],
    ['no details', fresh({ inputs: [] }), {}, 'ASK_CONFIRMATION_NOT_ACTIVE'],
    ['gate refuses', fresh(), { gateRefuses: true }, 'PROPERTY_CONTEXT_REQUIRED'],
    ['engine fails', fresh(), { engineFails: true }, 'NEGOTIATION_SHIELD_ANALYSIS_ENGINE_ERROR'],
  ]) {
    const st = store(record);
    const w = installWrite(st, options);
    try {
      await assert.rejects(() => confirmCapabilityInvoke(OP, ctx(CONFIRMED)), (error) => error.code === code, label);
      assert.equal(w.seen.completion.length, 0, `${label}: no journey completion`);
      if (label !== 'engine fails') assert.equal(w.seen.analyze.length, 0, `${label}: no analysis`);
    } finally { w.restore(); st.restore(); }
  }
});

test('a malformed stored confirmation is refused before any read or write', async () => {
  const st = store(fresh());
  const w = installWrite(st);
  try {
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({})), (error) => error.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    await assert.rejects(() => confirmCapabilityInvoke(OP, ctx({ negotiationShieldAnalyze: { caseId: '' } })), (error) => error.code === 'ASK_CONFIRMATION_NOT_ACTIVE');
    assert.equal(w.seen.analyze.length, 0);
  } finally { w.restore(); st.restore(); }
});

// ───────────────────────────── the answer-trust validator ─────────────────────────────

const evidence = (sourceId, operationId) => ({ answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId, operationId, status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-10-12T00:00:00.000Z' }] } });
const actionIds = (blocks) => blocks.flatMap((b) => [...(b.actions ?? []), ...((b.sections ?? []).flatMap((sec) => sec.items.flatMap((i) => i.actions ?? [])))]).map((a) => a.id);

test('the receipt and the review\'s run action survive the validator (a missing id is stripped silently)', async () => {
  const st = store(fresh());
  const w = installWrite(st);
  try {
    const confirmed = await confirmCapabilityInvoke(OP, ctx(CONFIRMED));
    const receipt = { ...confirmed.result, parameters: evidence('negotiation-shield.analyze', OP) };
    const { result: validatedReceipt } = validateAskAnswerTrust({ question: NEGOTIATION_SHIELD_ANALYZE_MESSAGE, operationId: OP, result: receipt, propertyId: 'prop-1' });
    assert.deepEqual(validatedReceipt.blocks.map((b) => b.id), receipt.blocks.map((b) => b.id));
    assert.deepEqual(actionIds(validatedReceipt.blocks), actionIds(receipt.blocks));

    const review = { ...negotiationShieldReviewFromView(reviewDto(fresh()), true), parameters: evidence('negotiation-shield.cases', 'NEGOTIATION_SHIELD_CASES') };
    const { result: validatedReview } = validateAskAnswerTrust({ question: 'Review this negotiation case.', operationId: 'NEGOTIATION_SHIELD_CASES', result: review, propertyId: 'prop-1' });
    assert.deepEqual(actionIds(validatedReview.blocks), actionIds(review.blocks));
    assert.ok(actionIds(review.blocks).includes('negotiation-shield-analyze'));

  } finally { w.restore(); st.restore(); }
});
