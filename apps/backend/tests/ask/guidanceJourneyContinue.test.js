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
const primaryIds = (result) => block(result, 'guidance-journey-summary').actions.map((a) => a.id).filter((id) => id !== 'dismiss-guided-journey');
const block = (result, id) => result.blocks.find((candidate) => candidate.id === id);

test('reads the named journey without AI advice, behind the viewer floor, and shows progress, current step and the steps by status', async () => {
  const result = await invoke(launch());
  assert.deepEqual(calls[0], ['journey', 'p1', 'j1', null, { includeAIAdvice: false }]);
  assert.equal(result.status, 'ANSWERED');
  assert.equal(result.reasonCode, 'GUIDANCE_JOURNEY_READY');
  const summary = block(result, 'guidance-journey-summary');
  assert.equal(summary.title, 'Water heater: Aging System');
  assert.match(summary.body, /1 of 3 steps done\. Current step: Step b\./);
  const sections = block(result, 'guidance-journey-steps').sections;
  assert.deepEqual(sections.map((s) => [s.title, s.items.map((i) => i.title)]), [['Still to do', ['Step b', 'Step c']], ['Done', ['Step a']]]);
  const current = sections[0].items[0];
  assert.equal(current.description, 'Compare what the policy covers.');
  assert.ok(current.meta.includes('Current step'));
  assert.ok(current.meta.some((line) => /finished in its own tool/.test(line)), 'a NAVIGATE step says why it is not finished in Ask');
  assert.equal(current.href, '/dashboard/properties/p1/tools/guidance-overview?journeyId=j1');
  assert.equal(sections[0].items[1].href, null, 'only the current step links');
});

test('a BRANCHED journey is followed to its live child and says so', async () => {
  stored = journey({ id: 'child' });
  const result = await invoke(launch('parent'));
  assert.equal(result.reasonCode, 'GUIDANCE_JOURNEY_BRANCH_FOLLOWED');
  assert.match(block(result, 'guidance-journey-summary').body, /branched from an earlier one/);
  assert.match(block(result, 'guidance-journey-summary').actions[0].href, /journeyId=child$/);
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
  for (const text of ['A licensed plumber should do this.', 'Shut off the water.', 'Call emergency services for a gas smell.', 'not available yet: Finish the inspection first.', 'Install Year']) {
    assert.ok(boundary.body.includes(text), text);
  }
  assert.ok(block(result, 'guidance-journey-steps').sections[0].items[0].meta.some((line) => /external flow/.test(line)));
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
  const items = block(result, 'guidance-journey-evidence').items;
  assert.deepEqual(items.map((i) => i.source), ['Verified · Recalls', 'Reported by you, not verified · Recalls', 'Recorded by the tool · Recalls']);
  assert.equal(items[0].label, 'Step a: Recall Confirmation');
  assert.equal(block(guidanceJourneyContinuation(journey(), 'p1', { requestedJourneyId: 'j1' }), 'guidance-journey-evidence'), undefined, 'no evidence block when none is recorded');
});

test('a blocked current step shows its reason and a cautionary tone', () => {
  const result = guidanceJourneyContinuation(journey({ steps: [step('a', 'COMPLETED', 1), step('b', 'BLOCKED', 2, { blockedReason: 'Add your renewal date first' })] }), 'p1', { requestedJourneyId: 'j1' });
  const summary = block(result, 'guidance-journey-summary');
  assert.equal(summary.tone, 'CAUTION');
  assert.match(summary.body, /Blocked: Add your renewal date first/);
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
  assert.deepEqual(block(validated, 'guidance-journey-summary').actions.map((a) => a.id), ['open-guidance-overview', 'dismiss-guided-journey']);
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

test('each journey in the list offers the in-Ask read, keeping its page link', () => {
  const view = { journeys: [{ id: 'j1', status: 'ACTIVE', issueDomain: 'ASSET_LIFECYCLE', executionReadiness: 'READY', primarySignalId: 's', primarySignal: { signalIntentFamily: 'coverage_gap' }, inventoryItem: { name: 'Roof' }, steps: [step('a', 'PENDING', 1)] }], next: [] };
  const item = guidanceJourneysFromView(view, new Set(), 'p1').blocks.find((b) => b.type === 'GROUPED_LIST').sections[0].items[0];
  assert.equal(item.entityType, 'GUIDANCE_JOURNEY');
  assert.deepEqual(item.actions, [{ id: 'continue-guided-journey', label: 'See this journey here', message: 'Continue this guided journey.', style: 'SECONDARY', interactionType: 'CONVERSATION_CONTINUE', operationId: 'GUIDANCE_JOURNEY_CONTINUE' }]);
  assert.match(item.href, /journeyId=j1$/);
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
const { buildRecallMatchCompletion } = require('../../src/services/guidanceEngine/guidanceToolReporting.ts');

test('IN_ASK steps are exactly the steps the recall write reports, and each operation exists', () => {
  const reported = new Set(['CONFIRM', 'DISMISS', 'RESOLVE'].map((a) => `recalls:${buildRecallMatchCompletion('p1', a, { id: 'm1' }).stepKey}`));
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
  const [primary, secondary] = block(result, 'guidance-journey-summary').actions;
  assert.deepEqual({ id: primary.id, t: primary.interactionType, o: primary.operationId, m: primary.message, s: primary.style }, { id: 'continue-step-in-ask', t: 'START_WORKFLOW', o: 'RECALL_REVIEW', m: 'Show my open recall matches', s: 'PRIMARY' });
  assert.equal(secondary.id, 'open-guidance-overview');
  assert.equal(secondary.style, 'SECONDARY');
  assert.ok(block(result, 'guidance-journey-steps').sections[0].items[0].meta.some((line) => /recorded on this journey the same way as on the page/.test(line)));

  stored = journey({ currentStepKey: 'safety_alert', steps: [recallStep('BLOCKED', { blockedReason: 'Wait' })] });
  assert.deepEqual(primaryIds(await invoke(launch())), ['open-guidance-overview']);

  stored = journey({ currentStepKey: 'recall_resolution', steps: [step('recall_resolution', 'PENDING', 1, { toolKey: 'recalls', decisionStage: 'EXECUTION' })] });
  guardResult = { blocked: true, blockedReason: 'Confirm the match first.' };
  assert.deepEqual(primaryIds(await invoke(launch())), ['open-guidance-overview']);
  guardResult = { blocked: false, blockedReason: null };
  assert.equal(block(await invoke(launch()), 'guidance-journey-summary').actions[0].id, 'continue-step-in-ask');

  stored = journey();
  assert.deepEqual(primaryIds(await invoke(launch())), ['open-guidance-overview']);
});

test('the in-Ask action survives the answer-trust validator', async () => {
  stored = journey({ currentStepKey: 'safety_alert', steps: [step('safety_alert', 'PENDING', 1, { toolKey: 'recalls', label: 'Confirm the recall' })] });
  const raw = await invoke(launch());
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'guidance-overview.continue', operationId: 'GUIDANCE_JOURNEY_CONTINUE', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-30T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Continue this guided journey.', operationId: 'GUIDANCE_JOURNEY_CONTINUE', result, propertyId: 'p1' });
  assert.deepEqual(block(validated, 'guidance-journey-summary').actions.map((a) => a.id), ['continue-step-in-ask', 'open-guidance-overview', 'dismiss-guided-journey']);
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
  const items = (result) => block(result, 'guidance-journey-steps').sections.flatMap((s) => s.items);
  stored = withStep('repair_replace_decision');
  let result = await invoke(launch());
  const current = items(result)[0];
  assert.equal(current.entityType, 'GUIDANCE_STEP');
  assert.deepEqual(current.actions.map((a) => [a.id, a.interactionType, a.operationId, a.message]), [['skip-guided-journey-step', 'MUTATE_RECORD', 'GUIDANCE_STEP_SKIP', GUIDANCE_STEP_SKIP_MESSAGE]]);
  const dismiss = block(result, 'guidance-journey-summary').actions.find((a) => a.id === 'dismiss-guided-journey');
  assert.deepEqual({ t: dismiss.interactionType, o: dismiss.operationId, et: dismiss.entityType, ei: dismiss.entityId, m: dismiss.message }, { t: 'START_WORKFLOW', o: 'GUIDANCE_JOURNEY_DISMISS', et: 'GUIDANCE_JOURNEY', ei: 'j1', m: GUIDANCE_JOURNEY_DISMISS_MESSAGE });

  stored = withStep('check_coverage');
  assert.equal(items(await invoke(launch()))[0].actions, undefined, 'a DISALLOWED step is not offered for skipping');
  stored = journey({ status: 'COMPLETED' });
  assert.equal(block(await invoke(launch()), 'guidance-journey-summary').actions.some((a) => a.id === 'dismiss-guided-journey'), false);
  stored = withStep('repair_replace_decision');
  accessRole = 'VIEWER';
  result = await invoke(launch());
  assert.equal(items(result)[0].actions, undefined, 'viewers are not offered the write');
  assert.equal(block(result, 'guidance-journey-summary').actions.some((a) => a.id === 'dismiss-guided-journey'), false);
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
