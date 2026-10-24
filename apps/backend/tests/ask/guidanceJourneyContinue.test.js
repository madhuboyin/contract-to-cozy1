const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Guided journey continuation, Phase 1 (docs/product/ASK_COZY_GUIDED_JOURNEY_CONTINUATION_FRD.md): GUIDANCE_JOURNEY_CONTINUE
// reads ONE journey, deterministically, reached only by a launch context. The journey service, the execution guard and the
// protection-context reconciliation are stubbed; the handler must combine them as the design says.

const prismaModule = require('../../src/lib/prisma.ts');
const { guidanceJourneyContinuation, guidanceGuardTargetForStep } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { buildFocusedHomeActionGuidance, focusedOperationForLaunchContext } = require('../../src/services/ask/askFocusedGuidance.ts');
const { guidanceJourneysFromView } = require('../../src/services/ask/askOrchestrator.service.ts');
const { ASK_GUIDANCE_STEP_TOOL_MODES, askGuidanceStepMode } = require('../../src/services/ask/askGuidanceStepHandlers.ts');
const { listGuidanceTemplates, DEFAULT_TEMPLATE } = require('../../src/services/guidanceEngine/guidanceTemplateRegistry.ts');
const { guidanceJourneyService } = require('../../src/services/guidanceEngine/guidanceJourney.service.ts');
const { guidanceBookingGuardService } = require('../../src/services/guidanceEngine/guidanceBookingGuard.service.ts');
const protectionContext = require('../../src/services/protection/context.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');

const originals = {
  prisma: prismaModule.prisma,
  getJourneyById: guidanceJourneyService.getJourneyById,
  guard: guidanceBookingGuardService.evaluateExecutionGuard,
  protection: protectionContext.getProtectionContextDecisions,
  access: propertyAccess.resolvePropertyAccess,
};
let accessRole = 'CONTRIBUTOR';
let calls;
let stored;
let suppressed;
let guardResult;

const step = (key, status, order, overrides = {}) => ({
  id: `id-${key}`, journeyId: 'j1', stepKey: key, stepOrder: order, label: `Step ${key}`, status, skippedReasonCode: null, toolKey: 'coverage-intelligence',
  governanceJson: { safetyTier: 'LOW_CONSEQUENCE', professionalBoundary: null, conservativeFallback: null, emergencyEscalation: null }, ...overrides,
});
const journey = (overrides = {}) => ({
  id: 'j1', propertyId: 'p1', status: 'ACTIVE', issueDomain: 'ASSET_LIFECYCLE', executionReadiness: 'READY', isLowContext: false,
  primarySignalId: 'sig-1', primarySignal: { id: 'sig-1', signalIntentFamily: 'lifecycle_end_or_past_life' },
  inventoryItem: { name: 'Water heater', category: 'PLUMBING', assetType: null }, currentStepKey: 'b', missingContextKeys: [],
  steps: [step('a', 'COMPLETED', 1), step('b', 'IN_PROGRESS', 2, { description: 'Compare what the policy covers.' }), step('c', 'PENDING', 3), step('gone', 'SKIPPED', 4, { skippedReasonCode: 'TEMPLATE_REMOVED' })],
  evidences: [], ...overrides,
});

function install() {
  calls = [];
  suppressed = [];
  guardResult = { blocked: false, blockedReason: null };
  stored = journey();
  prismaModule.prisma = new Proxy({}, { get(_t, model) { if (model === 'then') return undefined; throw new Error(`Unexpected prisma.${String(model)} access`); } });
  guidanceJourneyService.getJourneyById = async (...args) => {
    calls.push(['journey', ...args]);
    if (stored instanceof Error) throw stored;
    return stored;
  };
  guidanceBookingGuardService.evaluateExecutionGuard = async (request) => { calls.push(['guard', request]); return { ...guardResult, targetAction: request.targetAction }; };
  accessRole = 'CONTRIBUTOR';
  propertyAccess.resolvePropertyAccess = async () => ({ role: accessRole, userId: 'u1', propertyId: 'p1' });
  protectionContext.getProtectionContextDecisions = async () => ({ reconciliation: { suppressedGuidanceSignalIds: suppressed, suppressionReasons: {} } });
}
test.beforeEach(install);
test.afterEach(() => {
  prismaModule.prisma = originals.prisma;
  guidanceJourneyService.getJourneyById = originals.getJourneyById;
  guidanceBookingGuardService.evaluateExecutionGuard = originals.guard;
  protectionContext.getProtectionContextDecisions = originals.protection;
  propertyAccess.resolvePropertyAccess = originals.access;
});

const launch = (entityId = 'j1') => ({ surface: 'ASK_WORKSPACE', entityType: 'GUIDANCE_JOURNEY', entityId, operationId: 'GUIDANCE_JOURNEY_CONTINUE' });
const invoke = (launchContext) => capabilityInvoke('GUIDANCE_JOURNEY_CONTINUE', { userId: 'u1', propertyId: 'p1', message: 'Continue this guided journey.', launchContext }, { propertyAccess: { role: 'VIEWER', userId: 'u1', propertyId: 'p1' } });
// The summary's actions without the Phase 3 dismiss action (offered to contributors on open journeys).
const primaryIds = (result) => workspace(result).actions.map((a) => a.id).filter((id) => !['dismiss-guided-journey', 'skip-guided-journey-step'].includes(id));
const block = (result, id) => result.blocks.find((candidate) => candidate.id === id);
const workspace = (result) => block(result, 'guidance-journey-workspace');
const fact = (result, label) => workspace(result).main.facts.find((entry) => entry.label === label)?.value;

test('reads the named journey without AI advice, behind the viewer floor, and shows progress, current step and the steps by status', async () => {
  const result = await invoke(launch());
  assert.deepEqual(calls[0], ['journey', 'p1', 'j1', null, { includeAIAdvice: false }]);
  assert.equal(result.status, 'ANSWERED');
  assert.equal(result.reasonCode, 'GUIDANCE_JOURNEY_READY');
  const guide = workspace(result);
  assert.equal(guide.type, 'TASK_GUIDE');
  assert.equal(guide.title, 'Water heater: Aging System');
  assert.match(guide.summary, /Next: Step b\./);
  assert.deepEqual(guide.progress && { current: guide.progress.current, total: guide.progress.total, completed: guide.progress.completed, label: guide.progress.label }, { current: 2, total: 3, completed: 1, label: 'Step 2 of 3 \u00b7 33% done' });
  // One ordered rail (no still-to-do / done buckets), with exactly one current step.
  assert.deepEqual(guide.outline.map((entry) => [entry.title, entry.state]), [['Step a', 'DONE'], ['Step b', 'CURRENT'], ['Step c', 'UPCOMING']]);
  assert.equal(guide.main.body, 'Compare what the policy covers.');
  assert.match(fact(result, 'In Ask'), /Not yet/, 'a NAVIGATE step says it is not completed in Ask');
  assert.equal(result.blocks.some((b) => b.type === 'GROUPED_LIST'), false, 'no generic list');
  // Ask links to no Guidance Overview page (owner decision, 2026-10-10): the workspace offers no page action.
  assert.equal(guide.actions.some((a) => a.id === 'open-guidance-overview' || a.href), false);
  assert.equal(JSON.stringify(result).includes('/dashboard/'), false);
});

test('a BRANCHED journey is followed to its live child and says so', async () => {
  stored = journey({ id: 'child' });
  const result = await invoke(launch('parent'));
  assert.equal(result.reasonCode, 'GUIDANCE_JOURNEY_BRANCH_FOLLOWED');
  assert.match(workspace(result).summary, /branched from an earlier one/);
  assert.equal(JSON.stringify(result).includes('/dashboard/'), false);
});

test('completed, dismissed and missing journeys are answered plainly and never substituted', async () => {
  for (const [status, code] of [['COMPLETED', 'GUIDANCE_JOURNEY_COMPLETED'], ['DISMISSED', 'GUIDANCE_JOURNEY_DISMISSED'], ['ARCHIVED', 'GUIDANCE_JOURNEY_ENDED']]) {
    stored = journey({ status });
    const result = await invoke(launch());
    assert.equal(result.reasonCode, code);
    assert.equal(result.blocks.some((b) => b.type === 'GROUPED_LIST'), false, `${status} shows no steps`);
  }
  stored = Object.assign(new Error('nope'), { code: 'GUIDANCE_JOURNEY_NOT_FOUND' });
  const missing = await invoke(launch());
  assert.equal(missing.status, 'NOT_APPLICABLE');
  assert.equal(missing.reasonCode, 'GUIDANCE_JOURNEY_NOT_FOUND');
  stored = journey();
  suppressed = ['sig-1'];
  assert.equal((await invoke(launch())).reasonCode, 'GUIDANCE_JOURNEY_SUPPRESSED');
  suppressed = [];
  calls.length = 0;
  const noEntity = await invoke(undefined);
  assert.equal(noEntity.reasonCode, 'GUIDANCE_JOURNEY_REQUIRED');
  assert.equal(calls.filter((c) => c[0] === 'journey').length, 0, 'no journey is read without an entity');
});

test('an unexpected service error is not swallowed into an empty answer', async () => {
  stored = new Error('database down');
  await assert.rejects(() => invoke(launch()), /database down/);
});

test('step governance, the execution guard and missing details are all shown in the boundary, and unavailable execution is never hidden', async () => {
  stored = journey({
    currentStepKey: 'book_service', missingContextKeys: ['install_year'],
    steps: [step('book_service', 'PENDING', 1, { toolKey: 'booking', decisionStage: 'EXECUTION', governanceJson: { safetyTier: 'SAFETY_EMERGENCY', professionalBoundary: 'A licensed plumber should do this.', conservativeFallback: 'Shut off the water.', emergencyEscalation: 'Call emergency services for a gas smell.' } })],
  });
  guardResult = { blocked: true, blockedReason: 'Finish the inspection first.' };
  const result = await invoke(launch());
  assert.deepEqual(calls.find((c) => c[0] === 'guard')[1], { propertyId: 'p1', journeyId: 'j1', targetAction: 'BOOKING' });
  const boundary = block(result, 'guidance-journey-boundary');
  for (const text of ['A licensed plumber should do this.', 'Shut off the water.', 'Call emergency services for a gas smell.', 'not available yet: Finish the inspection first.']) {
    assert.ok(boundary.body.includes(text), text);
  }
  assert.equal(workspace(result).main.facts.find((entry) => entry.label === 'Not available yet').value, 'Finish the inspection first.');
  // An unclassified key is shown with generic copy, never as the raw key, and it is not offered as something Ask can collect.
  assert.equal(workspace(result).chips[0].label, 'Needs information Ask can\u2019t collect yet');
  assert.equal(fact(result, 'Missing: More information'), 'This journey needs additional information that Ask can\u2019t collect yet.');
  assert.equal(JSON.stringify(result).includes('install_year'), false);
  assert.equal(JSON.stringify(result).includes('Install Year'), false);
  // A non-execution current step never calls the guard.
  calls.length = 0;
  stored = journey();
  await invoke(launch());
  assert.equal(calls.some((c) => c[0] === 'guard'), false);
});

test('evidence is labelled verified, reported by you, or recorded by the tool, and rejected or superseded rows are left out', () => {
  const evidence = (id, overrides) => ({ id, propertyId: 'p1', journeyId: 'j1', stepId: 'id-a', evidenceType: 'TOOL_RESULT', sourceType: 'INTERNAL_TOOL', status: 'CAPTURED', sourceToolKey: 'recalls', proofType: 'recall_confirmation', observedAt: new Date('2026-09-01T00:00:00Z'), invalidatedAt: null, ...overrides });
  const result = guidanceJourneyContinuation(journey({ evidences: [
    evidence('e1', { status: 'VERIFIED' }),
    evidence('e2', { sourceType: 'USER_INPUT', proofType: 'self_report' }),
    evidence('e3'),
    evidence('e4', { status: 'REJECTED' }),
    evidence('e5', { status: 'SUPERSEDED' }),
  ] }), 'p1', { requestedJourneyId: 'j1' });
  const rows = workspace(result).history;
  assert.deepEqual(rows.map((row) => row.value), ['Verified', 'Reported by you', 'Recorded by the tool']);
  assert.equal(rows[0].label, 'Step a: Recall Confirmation');
  assert.deepEqual(workspace(guidanceJourneyContinuation(journey(), 'p1', { requestedJourneyId: 'j1' })).history, [], 'no recorded activity when none is recorded');
});

test('a blocked current step shows its reason and a cautionary tone', () => {
  const result = guidanceJourneyContinuation(journey({ steps: [step('a', 'COMPLETED', 1), step('b', 'BLOCKED', 2, { blockedReason: 'Add your renewal date first' })] }), 'p1', { requestedJourneyId: 'j1' });
  assert.match(workspace(result).summary, /Blocked: Add your renewal date first/);
  assert.equal(fact(result, 'Blocked'), 'Add your renewal date first');
  assert.equal(workspace(result).actions.some((a) => a.id === 'continue-step-in-ask'), false, 'a blocked step offers no way to do it');
});

test('guard targets follow the execution guard service\'s own step matching', () => {
  assert.equal(guidanceGuardTargetForStep({ toolKey: 'booking' }), 'BOOKING');
  assert.equal(guidanceGuardTargetForStep({ stepKey: 'route_specialist' }), 'BOOKING');
  assert.equal(guidanceGuardTargetForStep({ stepKey: 'schedule_inspection' }), 'INSPECTION_SCHEDULING');
  assert.equal(guidanceGuardTargetForStep({ stepKey: 'file_claim' }), 'CLAIM_ESCALATION');
  assert.equal(guidanceGuardTargetForStep({ stepKey: 'x', decisionStage: 'EXECUTION' }), 'EXECUTION');
  assert.equal(guidanceGuardTargetForStep({ stepKey: 'x', decisionStage: 'EVALUATION' }), null);
});

test('every block survives the answer-trust validator and the page link the action whitelist', async () => {
  const raw = await invoke(launch());
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'guidance-overview.continue', operationId: 'GUIDANCE_JOURNEY_CONTINUE', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-30T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Continue this guided journey.', operationId: 'GUIDANCE_JOURNEY_CONTINUE', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((b) => b.id), result.blocks.map((b) => b.id));
  assert.deepEqual(workspace(validated).actions.map((a) => a.id), ['skip-guided-journey-step', 'dismiss-guided-journey']);
});

test('every tool key the template registry launches is classified, and tool keys stay NAVIGATE (only named steps are IN_ASK)', () => {
  const templates = [...listGuidanceTemplates(), DEFAULT_TEMPLATE];
  const keys = new Set(templates.flatMap((template) => (template.steps ?? []).map((s) => s.toolKey).filter(Boolean)));
  assert.ok(keys.size >= 25);
  for (const key of keys) assert.ok(ASK_GUIDANCE_STEP_TOOL_MODES[key], `${key} is not classified in askGuidanceStepHandlers.ts`);
  for (const key of Object.keys(ASK_GUIDANCE_STEP_TOOL_MODES)) assert.ok(keys.has(key), `${key} is classified but no template step uses it`);
  assert.deepEqual([...new Set(Object.values(ASK_GUIDANCE_STEP_TOOL_MODES).map((m) => m.mode))], ['NAVIGATE'], 'tool-level defaults are all NAVIGATE');
  assert.equal(askGuidanceStepMode('not-a-tool').mode, 'NAVIGATE');
  assert.equal(askGuidanceStepMode(null).mode, 'NAVIGATE');
});

test('the operation is launch-only, owned by guidance-overview, and entered from the launch context', () => {
  assert.equal(ASK_OPERATION_DEFINITIONS.GUIDANCE_JOURNEY_CONTINUE.messageRoutable, false);
  assert.equal(getSkillForOperation('GUIDANCE_JOURNEY_CONTINUE').id, 'guidance-overview');
  assert.equal(focusedOperationForLaunchContext({ entityType: 'GUIDANCE_JOURNEY', entityId: 'j1' }), 'GUIDANCE_JOURNEY_CONTINUE');
  assert.equal(focusedOperationForLaunchContext({ entityType: 'GUIDANCE_JOURNEY' }), null);
});

test('each journey in the list offers the in-Ask read and links to no desktop page', () => {
  const view = { journeys: [{ id: 'j1', status: 'ACTIVE', issueDomain: 'ASSET_LIFECYCLE', executionReadiness: 'READY', primarySignalId: 's', primarySignal: { signalIntentFamily: 'coverage_gap' }, inventoryItem: { name: 'Roof' }, steps: [step('a', 'PENDING', 1)] }], next: [] };
  const item = guidanceJourneysFromView(view, new Set(), 'p1').blocks.find((b) => b.type === 'GROUPED_LIST').sections[0].items[0];
  assert.equal(item.entityType, 'GUIDANCE_JOURNEY');
  assert.deepEqual(item.actions, [{ id: 'continue-guided-journey', label: 'Open journey', message: 'Continue this guided journey.', style: 'SECONDARY', interactionType: 'CONVERSATION_CONTINUE', operationId: 'GUIDANCE_JOURNEY_CONTINUE' }]);
  assert.equal(item.href, null);
});

function journeyAction(overrides = {}) {
  return {
    id: 'journey:1', lineageId: 'journey:1', source: { kind: 'GUIDANCE' }, priority: 'SOON', state: 'OPEN', signal: 'A guided plan is under way.',
    whyItMatters: 'It keeps the work in order.', recommendedAction: 'Continue the plan', expectedOutcome: 'The plan moves forward.', relatedJourneyId: 'j1',
    presentation: null, feedbackControls: [], evidence: [], confidence: { label: 'HIGH' }, governance: { safetyTier: 'LOW_CONSEQUENCE', emergencyEscalation: null, conservativeFallback: null, professionalBoundary: null },
    recommendationResponse: { status: 'AVAILABLE', reasonCode: 'RECOMMENDATION_AVAILABLE', safeNextAction: 'Continue' }, timing: { dueAt: null, rationale: 'Soon' },
    primaryCta: { label: 'Continue plan', href: '/dashboard/properties/p1/tools/guidance-overview?journeyId=j1' }, ranking: { explanation: 'x' }, ...overrides,
  };
}

test('a Home Action tied to a journey continues it in Ask; a more specific answer keeps priority and a missing journey keeps the link', () => {
  const routed = buildFocusedHomeActionGuidance(journeyAction(), 'v1');
  const primary = routed.blocks.find((b) => b.id === 'focused-home-action-guidance').actions[0];
  assert.deepEqual({ t: primary.interactionType, o: primary.operationId, et: primary.entityType, ei: primary.entityId, m: primary.message, href: primary.href }, { t: 'START_WORKFLOW', o: 'GUIDANCE_JOURNEY_CONTINUE', et: 'GUIDANCE_JOURNEY', ei: 'j1', m: 'Continue this guided journey.', href: undefined });

  const replace = buildFocusedHomeActionGuidance(journeyAction({ lineageId: 'repair-replace:item-1', presentation: { subject: { kind: 'INVENTORY_ITEM', id: 'item-1', label: 'Furnace' }, keyFacts: [], factGroups: [] } }), 'v1');
  assert.equal(replace.blocks.find((b) => b.id === 'focused-home-action-guidance').actions[0].operationId, 'REPLACEMENT_GUIDANCE');

  const none = buildFocusedHomeActionGuidance(journeyAction({ relatedJourneyId: null }), 'v1');
  const fallback = none.blocks.find((b) => b.id === 'focused-home-action-guidance').actions[0];
  assert.equal(fallback.operationId, undefined);
  assert.ok(fallback.href);
});

// Phase 2, first slice: the recalls steps a recall write actually reports.
const { ASK_GUIDANCE_IN_ASK_STEPS } = require('../../src/services/ask/askGuidanceStepHandlers.ts');
const { buildRecallMatchCompletion, buildDoNothingRunCompletion, buildServicePriceCheckCompletion } = require('../../src/services/guidanceEngine/guidanceToolReporting.ts');

test('IN_ASK steps are exactly the steps a recall write, a do-nothing run, a price check, a negotiation analysis, a coverage decision, a price finalization, a project or an acknowledgement reports, and each operation exists', () => {
  const reported = new Set([
    ...['CONFIRM', 'DISMISS', 'RESOLVE'].map((a) => `recalls:${buildRecallMatchCompletion('p1', a, { id: 'm1' }).stepKey}`),
    ...['validate_price', 'get_cleaning_quotes'].map((stepKey) => { const done = buildServicePriceCheckCompletion('p1', { id: 'c1' }, { stepKey }); return `${done.sourceToolKey}:${done.stepKey}`; }),
    `negotiation-shield:${require('../../src/services/negotiationShieldJourneyCompletion.ts').NEGOTIATION_SHIELD_DEFAULT_STEP_KEY}`,
    `project-tracker:${require('../../src/services/guidanceEngine/projectJourneyReporting.ts').PROJECT_CREATE_STEP_KEY}`,
    ...['track_work'].map((key) => `project-tracker:${key}`), ...['capture_proof', 'set_future_care', 'update_home_record', 'verify_outcome'].map((key) => `project-completion:${key}`), // the closing steps reportProjectClosure sends
    `guidance-overview:${require('../../src/services/guidanceEngine/guidanceAcknowledgement.ts').ACKNOWLEDGEABLE_STEP_KEYS[0]}`, // the only step an acknowledgement may complete
    'price-finalization:finalize_price', // finalizing a record bound to the step reports it (a start does not)
    'coverage-intelligence:compare_coverage_options', // the coverage decision's proof; Ask binds it to this one step (a review step is not proved by a decision)
    ...['compare_action_options', 'model_cost_of_delay'].map((stepKey) => { const done = buildDoNothingRunCompletion('p1', { id: 'r1' }, { stepKey }); return `${done.sourceToolKey}:${done.stepKey}`; }),
  ]);
  assert.deepEqual(new Set(Object.keys(ASK_GUIDANCE_IN_ASK_STEPS)), reported);
  for (const [key, entry] of Object.entries(ASK_GUIDANCE_IN_ASK_STEPS)) {
    assert.ok(ASK_OPERATION_DEFINITIONS[entry.operationId], `${key}: unknown operation`);
    const [toolKey, stepKey] = key.split(':');
    const templates = [...listGuidanceTemplates(), DEFAULT_TEMPLATE];
    assert.ok(templates.some((t) => t.steps.some((s) => s.toolKey === toolKey && s.stepKey === stepKey)), `${key} is not a template step`);
  }
  assert.equal(askGuidanceStepMode('recalls', 'safety_alert').mode, 'IN_ASK');
  assert.equal(askGuidanceStepMode('recalls', 'review_remedy_instructions').mode, 'NAVIGATE', 'nothing in Ask reports the remedy step');
  assert.equal(askGuidanceStepMode('recalls').mode, 'NAVIGATE');
  assert.equal(askGuidanceStepMode('booking', 'safety_alert').mode, 'NAVIGATE');
});

test('a current recall step offers the in-Ask review as the primary action; blocked or guarded steps and other tools do not', async () => {
  const recallStep = (status, overrides = {}) => step('safety_alert', status, 1, { toolKey: 'recalls', ...overrides });
  stored = journey({ currentStepKey: 'safety_alert', steps: [recallStep('IN_PROGRESS')] });
  const result = await invoke(launch());
  const summaryActions = workspace(result).actions;
  const [primary] = summaryActions;
  assert.deepEqual({ id: primary.id, t: primary.interactionType, o: primary.operationId, m: primary.message, s: primary.style }, { id: 'continue-step-in-ask', t: 'START_WORKFLOW', o: 'RECALL_REVIEW', m: 'Show my open recall matches', s: 'PRIMARY' });
  assert.equal(summaryActions.some((action) => action.id === 'open-guidance-overview'), false, 'no Guidance Overview page action');
  assert.match(fact(result, 'In Ask'), /^Yes/);
  assert.match(fact(result, 'Records'), /recall match is recorded/);

  stored = journey({ currentStepKey: 'safety_alert', steps: [recallStep('BLOCKED', { blockedReason: 'Wait' })] });
  assert.deepEqual(primaryIds(await invoke(launch())), []);

  stored = journey({ currentStepKey: 'recall_resolution', steps: [step('recall_resolution', 'PENDING', 1, { toolKey: 'recalls', decisionStage: 'EXECUTION' })] });
  guardResult = { blocked: true, blockedReason: 'Confirm the match first.' };
  assert.deepEqual(primaryIds(await invoke(launch())), []);
  guardResult = { blocked: false, blockedReason: null };
  assert.equal(workspace(await invoke(launch())).actions[0].id, 'continue-step-in-ask');

  stored = journey();
  assert.deepEqual(primaryIds(await invoke(launch())), []);
});

test('the in-Ask action survives the answer-trust validator', async () => {
  stored = journey({ currentStepKey: 'safety_alert', steps: [step('safety_alert', 'PENDING', 1, { toolKey: 'recalls', label: 'Confirm the recall' })] });
  const raw = await invoke(launch());
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'guidance-overview.continue', operationId: 'GUIDANCE_JOURNEY_CONTINUE', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-30T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Continue this guided journey.', operationId: 'GUIDANCE_JOURNEY_CONTINUE', result, propertyId: 'p1' });
  assert.deepEqual(workspace(validated).actions.map((a) => a.id), ['continue-step-in-ask', 'skip-guided-journey-step', 'dismiss-guided-journey']);
});

// ───────────────────────────── Phase 3: skip a step, dismiss a journey ─────────────────────────────
const { confirmCapabilityInvoke } = require('../../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../../src/services/ask/askDomainCommandRegistry.ts');
const { guidanceStepResolverService } = require('../../src/services/guidanceEngine/guidanceStepResolver.service.ts');
const { guidanceStepContextVersion, guidanceJourneyDismissContextVersion, GUIDANCE_STEP_SKIP_MESSAGE, GUIDANCE_JOURNEY_DISMISS_MESSAGE } = require('../../src/services/ask/askOrchestrator.service.ts');

const UPDATED = new Date('2026-09-30T00:00:00.000Z');
let writes;
let dbStep;
let dbJourney;
const writeOriginals = { mark: guidanceStepResolverService.markStepStatus, dismiss: guidanceJourneyService.dismissJourney };

function installWrites() {
  writes = [];
  dbJourney = { id: 'j1', status: 'ACTIVE', version: 3, journeyTypeKey: 'asset_lifecycle_resolution', issueDomain: 'ASSET_LIFECYCLE', primarySignal: { signalIntentFamily: 'lifecycle_end_or_past_life' }, inventoryItem: { name: 'Water heater' } };
  dbStep = { id: 's1', stepKey: 'repair_replace_decision', label: 'Decide repair or replace', status: 'IN_PROGRESS', isRequired: true, updatedAt: UPDATED, journey: dbJourney };
  prismaModule.prisma = new Proxy({}, { get(_t, model) {
    if (model === 'then') return undefined;
    if (model === 'guidanceJourneyStep') return { findFirst: async ({ where }) => (where.id === dbStep.id ? { ...dbStep, journey: dbJourney } : null) };
    if (model === 'guidanceJourney') return { findFirst: async ({ where }) => (where.id === dbJourney.id ? dbJourney : null) };
    if (model === 'askExecution') return { findMany: async () => [] };
    if (String(model).startsWith('guidance')) return {};
    throw new Error(`Unexpected prisma.${String(model)} access`);
  } });
  guidanceStepResolverService.markStepStatus = async (input) => { writes.push(['skip', input]); dbStep = { ...dbStep, status: 'SKIPPED' }; return {}; };
  guidanceJourneyService.dismissJourney = async (...args) => { writes.push(['dismiss', ...args]); dbJourney = { ...dbJourney, status: 'DISMISSED' }; return {}; };
}
test.beforeEach(installWrites);
test.afterEach(() => { guidanceStepResolverService.markStepStatus = writeOriginals.mark; guidanceJourneyService.dismissJourney = writeOriginals.dismiss; });

const skipLaunch = (overrides = {}) => ({ surface: 'ASK_WORKSPACE', entityType: 'GUIDANCE_STEP', entityId: 's1', operationId: 'GUIDANCE_STEP_SKIP', sourceExecutionId: 'exec-view', ...overrides });
const dismissLaunch = (overrides = {}) => ({ surface: 'ASK_WORKSPACE', entityType: 'GUIDANCE_JOURNEY', entityId: 'j1', operationId: 'GUIDANCE_JOURNEY_DISMISS', sourceExecutionId: 'exec-view', ...overrides });
const proposeWrite = (op, message, launchContext, role = 'CONTRIBUTOR') => capabilityInvoke(op, { userId: 'u1', propertyId: 'p1', message, launchContext }, { propertyAccess: { role, userId: 'u1', propertyId: 'p1' } });
const confirmWrite = (op, parameters, role = 'CONTRIBUTOR') => confirmCapabilityInvoke(op, { userId: 'u1', execution: { id: 'exec-w', propertyId: 'p1', sessionId: 's', userId: 'u1', operationId: op, createdAt: new Date() }, parameters, access: { role }, command: getAskDomainCommandByOperation(op) });
const codeOfP = async (promise) => { try { await promise; return null; } catch (error) { return error.code ?? `NO_CODE:${error.message}`; } };

test('skip: proposing writes nothing, then confirming calls the same service the page does with the same reason code', async () => {
  const proposal = await proposeWrite('GUIDANCE_STEP_SKIP', GUIDANCE_STEP_SKIP_MESSAGE, skipLaunch());
  assert.equal(proposal.status, 'NEEDS_CONFIRMATION');
  assert.equal(proposal.confirmation.confirmLabel, 'Skip step');
  assert.deepEqual(writes, [], 'proposing never writes');
  assert.equal(proposal.parameters.sourceExecutionId, 'exec-view');
  const { result, artifactType, artifactId } = await confirmWrite('GUIDANCE_STEP_SKIP', proposal.parameters);
  assert.deepEqual(writes, [['skip', { propertyId: 'p1', stepId: 's1', nextStatus: 'SKIPPED', reasonCode: 'USER_SKIPPED', actorUserId: 'u1' }]]);
  assert.equal(result.reasonCode, 'GUIDANCE_STEP_SKIPPED');
  assert.deepEqual([artifactType, artifactId], ['GUIDANCE_JOURNEY_STEP', 's1']);
  // A replay of the same confirmation does not write again.
  const again = await confirmWrite('GUIDANCE_STEP_SKIP', proposal.parameters);
  assert.equal(again.result.reasonCode, 'GUIDANCE_STEP_ALREADY_SKIPPED');
  assert.equal(writes.length, 1);
});

test('skip: only the declared action starts it, and policy, state and role refuse before any confirmation', async () => {
  const refuse = async (launchContext, message = GUIDANCE_STEP_SKIP_MESSAGE, role) => proposeWrite('GUIDANCE_STEP_SKIP', message, launchContext, role);
  assert.equal((await refuse(skipLaunch({ surface: 'ASK_REFRESH' }))).reasonCode, 'GUIDANCE_STEP_REQUIRED');
  assert.equal((await refuse(skipLaunch({ operationId: 'GUIDANCE_JOURNEY_CONTINUE' }))).reasonCode, 'GUIDANCE_STEP_REQUIRED');
  assert.equal((await refuse(skipLaunch(), 'skip it please')).reasonCode, 'GUIDANCE_STEP_REQUIRED');
  assert.equal((await refuse(undefined)).reasonCode, 'GUIDANCE_STEP_REQUIRED');
  accessRole = 'VIEWER';
  assert.equal((await refuse(skipLaunch(), GUIDANCE_STEP_SKIP_MESSAGE, 'VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED', 'the capability layer blocks a viewer before the handler runs');
  accessRole = 'CONTRIBUTOR';
  dbStep = { ...dbStep, stepKey: 'check_coverage' };
  assert.equal((await refuse(skipLaunch())).reasonCode, 'GUIDANCE_STEP_SKIP_DISALLOWED');
  dbStep = { ...dbStep, stepKey: 'verify_history', status: 'COMPLETED' };
  assert.equal((await refuse(skipLaunch())).reasonCode, 'GUIDANCE_STEP_ALREADY_COMPLETED');
  dbStep = { ...dbStep, status: 'PENDING' };
  dbJourney = { ...dbJourney, status: 'COMPLETED' };
  assert.equal((await refuse(skipLaunch())).reasonCode, 'GUIDANCE_STEP_JOURNEY_NOT_ACTIVE');
  dbJourney = { ...dbJourney, status: 'ACTIVE' };
  assert.equal((await refuse(skipLaunch({ entityId: 'other' }))).reasonCode, 'GUIDANCE_STEP_NOT_FOUND');
  assert.deepEqual(writes, []);
});

test('skip: confirm re-reads live state (stale, viewer) and returns a service refusal as a readable error', async () => {
  const proposal = await proposeWrite('GUIDANCE_STEP_SKIP', GUIDANCE_STEP_SKIP_MESSAGE, skipLaunch());
  assert.equal(await codeOfP(confirmWrite('GUIDANCE_STEP_SKIP', proposal.parameters, 'VIEWER')), 'ASK_PERMISSION_REQUIRED');
  dbStep = { ...dbStep, status: 'BLOCKED' };
  assert.equal(await codeOfP(confirmWrite('GUIDANCE_STEP_SKIP', proposal.parameters)), 'ASK_CONTEXT_VERSION_CONFLICT');
  dbStep = { ...dbStep, status: 'IN_PROGRESS' };
  guidanceStepResolverService.markStepStatus = async () => { throw Object.assign(new Error('Complete earlier required steps before changing this step.'), { statusCode: 400, code: 'GUIDANCE_PREREQUISITE_INCOMPLETE' }); };
  const error = await confirmWrite('GUIDANCE_STEP_SKIP', proposal.parameters).catch((e) => e);
  assert.equal(error.code, 'ASK_CONFIRMATION_NOT_ACTIVE');
  assert.match(error.message, /earlier required steps/);
  guidanceStepResolverService.markStepStatus = async () => { throw Object.assign(new Error('db'), { statusCode: 500, code: 'X' }); };
  assert.match((await confirmWrite('GUIDANCE_STEP_SKIP', proposal.parameters).catch((e) => e)).message, /^db$/, 'a server error is not dressed up');
});

test('dismiss: confirm-gated, says it cannot be reopened, idempotent, and stale or viewer attempts are refused', async () => {
  const proposal = await proposeWrite('GUIDANCE_JOURNEY_DISMISS', GUIDANCE_JOURNEY_DISMISS_MESSAGE, dismissLaunch());
  assert.equal(proposal.status, 'NEEDS_CONFIRMATION');
  assert.match(proposal.confirmation.description, /cannot be reopened/);
  assert.deepEqual(writes, []);
  assert.equal(await codeOfP(confirmWrite('GUIDANCE_JOURNEY_DISMISS', proposal.parameters, 'VIEWER')), 'ASK_PERMISSION_REQUIRED');
  const { result } = await confirmWrite('GUIDANCE_JOURNEY_DISMISS', proposal.parameters);
  assert.deepEqual(writes, [['dismiss', 'p1', 'j1', 'u1', null]]);
  assert.equal(result.reasonCode, 'GUIDANCE_JOURNEY_DISMISSED');
  assert.equal((await confirmWrite('GUIDANCE_JOURNEY_DISMISS', proposal.parameters)).result.reasonCode, 'GUIDANCE_JOURNEY_ALREADY_DISMISSED');
  assert.equal(writes.length, 1);
  // A journey that moved on since the proposal is refused.
  dbJourney = { ...dbJourney, status: 'ACTIVE', version: 4 };
  assert.equal(await codeOfP(confirmWrite('GUIDANCE_JOURNEY_DISMISS', proposal.parameters)), 'ASK_CONTEXT_VERSION_CONFLICT');
  // Only open journeys, only the declared action.
  dbJourney = { ...dbJourney, status: 'COMPLETED' };
  assert.equal((await proposeWrite('GUIDANCE_JOURNEY_DISMISS', GUIDANCE_JOURNEY_DISMISS_MESSAGE, dismissLaunch())).reasonCode, 'GUIDANCE_JOURNEY_NOT_OPEN');
  dbJourney = { ...dbJourney, status: 'ACTIVE' };
  assert.equal((await proposeWrite('GUIDANCE_JOURNEY_DISMISS', GUIDANCE_JOURNEY_DISMISS_MESSAGE, dismissLaunch({ surface: 'ASK_REFRESH' }))).reasonCode, 'GUIDANCE_JOURNEY_REQUIRED');
  accessRole = 'VIEWER';
  assert.equal((await proposeWrite('GUIDANCE_JOURNEY_DISMISS', GUIDANCE_JOURNEY_DISMISS_MESSAGE, dismissLaunch(), 'VIEWER')).reasonCode, 'ASK_PERMISSION_REQUIRED');
});

test('the continuation view offers skip on the current step only when policy allows, and dismiss only to contributors on open journeys', async () => {
  const withStep = (stepKey, status = 'IN_PROGRESS') => journey({ journeyTypeKey: 'asset_lifecycle_resolution', currentStepKey: stepKey, steps: [step(stepKey, status, 1, { toolKey: 'coverage-intelligence' })] });
  const skipOf = (result) => workspace(result).actions.find((a) => a.id === 'skip-guided-journey-step');
  stored = withStep('repair_replace_decision');
  let result = await invoke(launch());
  const skip = skipOf(result);
  assert.deepEqual({ t: skip.interactionType, o: skip.operationId, et: skip.entityType, ei: skip.entityId, m: skip.message, s: skip.style }, { t: 'START_WORKFLOW', o: 'GUIDANCE_STEP_SKIP', et: 'GUIDANCE_STEP', ei: 'id-repair_replace_decision', m: GUIDANCE_STEP_SKIP_MESSAGE, s: 'QUIET' });
  const dismiss = workspace(result).actions.find((a) => a.id === 'dismiss-guided-journey');
  assert.deepEqual({ t: dismiss.interactionType, o: dismiss.operationId, et: dismiss.entityType, ei: dismiss.entityId, m: dismiss.message, s: dismiss.style }, { t: 'START_WORKFLOW', o: 'GUIDANCE_JOURNEY_DISMISS', et: 'GUIDANCE_JOURNEY', ei: 'j1', m: GUIDANCE_JOURNEY_DISMISS_MESSAGE, s: 'QUIET' });

  stored = withStep('check_coverage');
  assert.equal(skipOf(await invoke(launch())), undefined, 'a DISALLOWED step is not offered for skipping');
  stored = journey({ status: 'COMPLETED' });
  assert.equal(block(await invoke(launch()), 'guidance-journey-summary').actions.some((a) => a.id === 'dismiss-guided-journey'), false);
  stored = withStep('repair_replace_decision');
  accessRole = 'VIEWER';
  result = await invoke(launch());
  assert.equal(skipOf(result), undefined, 'viewers are not offered the write');
  assert.equal(workspace(result).actions.some((a) => a.id === 'dismiss-guided-journey'), false);
});

test('the registry facts: both writes are non-routable, contributor-floor, confirmation-gated and owned by guidance-overview', () => {
  for (const op of ['GUIDANCE_STEP_SKIP', 'GUIDANCE_JOURNEY_DISMISS']) {
    assert.equal(ASK_OPERATION_DEFINITIONS[op].messageRoutable, false);
    assert.equal(ASK_OPERATION_DEFINITIONS[op].propertyRoleFloor, 'CONTRIBUTOR');
    assert.equal(getAskDomainCommandByOperation(op).roleFloor, 'CONTRIBUTOR');
    assert.equal(getSkillForOperation(op).id, 'guidance-overview');
  }
  assert.equal(guidanceStepContextVersion(dbStep, dbJourney).length, 64);
  assert.notEqual(guidanceJourneyDismissContextVersion(dbJourney), guidanceJourneyDismissContextVersion({ ...dbJourney, version: 4 }));
});
