const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.65: GUIDANCE_JOURNEYS_LIST (Guidance Overview, product decision option A), the
// sixteenth new Ask operation for a capability the Appendix D audit found with none. getPropertyGuidance and the
// protection-context reconciliation are stubbed; the handler must combine them exactly as the page's GET controller does.

const prismaModule = require('../../src/lib/prisma.ts');
const { guidanceJourneysFromView } = require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { getSkillForOperation } = require('../../src/services/skills/skillRegistry.ts');
const { ASK_OPERATION_CAPABILITY } = require('../../src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts');
const { guidanceJourneyService } = require('../../src/services/guidanceEngine/guidanceJourney.service.ts');
const protectionContext = require('../../src/services/protection/context.ts');

const PAGE = '/dashboard/properties/p1/tools/guidance-overview';
const originals = { prisma: prismaModule.prisma, guidance: guidanceJourneyService.getPropertyGuidance, protection: protectionContext.getProtectionContextDecisions };
let calls;

const step = (key, status, overrides = {}) => ({ id: key, stepKey: key, label: key, status, stepOrder: 1, skippedReasonCode: null, ...overrides });
const journey = (id, overrides = {}) => ({
  id, propertyId: 'p1', status: 'ACTIVE', issueDomain: 'ASSET_LIFECYCLE', executionReadiness: 'READY', isLowContext: false,
  primarySignalId: `sig-${id}`, primarySignal: { id: `sig-${id}`, signalIntentFamily: 'lifecycle_end_or_past_life' },
  inventoryItem: null, priorityGroup: 'UPCOMING', nextStepLabel: null,
  steps: [step('a', 'COMPLETED'), step('b', 'PENDING'), step('c', 'PENDING'), step('gone', 'SKIPPED', { skippedReasonCode: 'TEMPLATE_REMOVED' })],
  ...overrides,
});
const payload = () => ({
  journeys: [
    journey('heater', { inventoryItem: { name: 'Water heater', category: 'PLUMBING' } }),
    journey('coverage', { issueDomain: 'INSURANCE', primarySignal: { id: 'sig-coverage', signalIntentFamily: 'coverage_gap' }, executionReadiness: 'NEEDS_CONTEXT', isLowContext: true }),
    journey('storm', { issueDomain: 'WEATHER', primarySignal: { id: 'sig-storm', signalIntentFamily: 'new_family_kind' }, status: 'NOT_STARTED' }),
    journey('suppressed', { primarySignalId: 'sig-suppressed' }),
    journey('dismissed', { status: 'DISMISSED' }),
  ],
  next: [
    { journeyId: 'heater', nextStep: { label: 'Compare replacement quotes' }, blockedReason: null, priorityGroup: 'IMMEDIATE' },
    { journeyId: 'coverage', nextStep: null, blockedReason: 'Add your policy renewal date first', priorityGroup: 'UPCOMING' },
    { journeyId: 'storm', nextStep: { label: 'Clear gutters' }, blockedReason: null, priorityGroup: 'OPTIMIZATION' },
  ],
});

function install() {
  calls = [];
  prismaModule.prisma = new Proxy({}, { get(_target, model) { if (model === 'then') return undefined; throw new Error(`Unexpected prisma.${String(model)} access`); } });
  guidanceJourneyService.getPropertyGuidance = async (...args) => { calls.push(['guidance', ...args]); return payload(); };
  protectionContext.getProtectionContextDecisions = async (...args) => { calls.push(['protection', ...args]); return { reconciliation: { suppressedGuidanceSignalIds: ['sig-suppressed'], suppressionReasons: {} } }; };
}

test.beforeEach(install);
test.afterEach(() => {
  prismaModule.prisma = originals.prisma;
  guidanceJourneyService.getPropertyGuidance = originals.guidance;
  protectionContext.getProtectionContextDecisions = originals.protection;
});

test('the operation reads the page\'s guidance with its protection-context suppression, behind the viewer floor', async () => {
  const result = await capabilityInvoke('GUIDANCE_JOURNEYS_LIST', { userId: 'u1', propertyId: 'p1', message: 'Show my guided journeys' }, { propertyAccess: { role: 'VIEWER', userId: 'u1', propertyId: 'p1' } });
  assert.deepEqual(calls, [['guidance', 'p1', {}], ['protection', 'p1', 'u1']]);
  assert.equal(result.reasonCode, 'GUIDANCE_JOURNEYS_READY');
  const ids = result.blocks.find((block) => block.id === 'guidance-journeys-items').sections.flatMap((section) => section.items.map((item) => item.id));
  assert.deepEqual(ids, ['heater', 'coverage', 'storm']);
});

test('journeys are grouped by the page\'s urgency labels with asset, title, steps done, next step and blockers', () => {
  const result = guidanceJourneysFromView(payload(), new Set(['sig-suppressed']), 'p1');
  const [summary, list] = result.blocks;
  assert.equal(summary.title, '3 guided journeys in progress');
  assert.equal(summary.body, '1 needs attention now. 1 is blocked until something else is done first.');
  assert.equal(summary.tone, 'CAUTION');
  assert.deepEqual(list.sections.map((section) => [section.title, section.items.map((item) => item.title)]), [
    ['Act now', ['Water heater']],
    ['Upcoming', ['Coverage decision']],
    ['When ready', ['Weather readiness issue']],
  ]);
  const [heater, coverage, storm] = list.sections.map((section) => section.items[0]);
  assert.equal(heater.description, 'Aging System · 1 of 3 steps done');
  assert.deepEqual(heater.meta, ['Next: Compare replacement quotes']);
  assert.equal(heater.status, 'Ready');
  assert.equal(heater.href, `${PAGE}?journeyId=heater`);
  assert.equal(coverage.description, 'Coverage Gap · 1 of 3 steps done');
  assert.deepEqual(coverage.meta, ['Blocked: Add your policy renewal date first', 'More home details would sharpen this']);
  assert.equal(coverage.status, 'Needs info');
  assert.equal(storm.description, 'New Family Kind · 1 of 3 steps done');
  assert.deepEqual(storm.meta, ['Next: Clear gutters', 'Not started']);
});

test('nothing surfaced is not an all-clear, and dismissed or suppressed journeys never count', () => {
  const only = { journeys: payload().journeys.filter((row) => ['suppressed', 'dismissed'].includes(row.id)), next: [] };
  const none = guidanceJourneysFromView(only, new Set(['sig-suppressed']), 'p1');
  assert.equal(none.reasonCode, 'GUIDANCE_JOURNEYS_EMPTY');
  assert.equal(none.blocks[0].title, 'No guided journeys in progress');
  assert.equal(none.blocks.at(-1).title, 'Guidance, not a professional assessment');
});

test('every block and the boundary survive the answer-trust validator, and the page link the whitelist', () => {
  const raw = guidanceJourneysFromView(payload(), new Set(['sig-suppressed']), 'p1');
  const result = { ...raw, parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: 'guidance-overview.journeys', operationId: 'GUIDANCE_JOURNEYS_LIST', status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2026-09-24T00:00:00.000Z' }] } } };
  const { result: validated } = validateAskAnswerTrust({ question: 'Show my guided journeys', operationId: 'GUIDANCE_JOURNEYS_LIST', result, propertyId: 'p1' });
  assert.deepEqual(validated.blocks.map((block) => block.id), result.blocks.map((block) => block.id));
  assert.equal(isAskActionApplicable({ action: result.blocks[0].actions[0], operationId: 'GUIDANCE_JOURNEYS_LIST', propertyId: 'p1', householdRole: 'VIEWER', authoritativeSourceAvailable: true }), true);
});

test('questions about journeys under way route here; starting, dismissing or completing one is not claimed', () => {
  const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true });
  for (const message of ['Show my guided journeys', 'Show the guided journeys I have going', 'How many steps are left in our guided journeys?', 'Open guidance overview']) {
    assert.equal(route(message).operation?.operationId, 'GUIDANCE_JOURNEYS_LIST', message);
  }
  assert.equal(route('Start a step-by-step plan for my water heater').operation?.operationId, 'GUIDANCE_JOURNEY_CREATE');
  // Each of these matches the journeys pattern, so only the exclusion keeps the deterministic pattern from claiming them.
  for (const message of ['Dismiss the guided journey for the water heater', 'Skip this step in my guided plan', 'Mark my guided journey step complete']) {
    const resolution = route(message);
    assert.equal(resolution.stage === 'DETERMINISTIC' && resolution.operation?.operationId === 'GUIDANCE_JOURNEYS_LIST', false, message);
  }
});

test('the operation is fully registered: its own skill, the bridge, and the card launch', () => {
  assert.equal(getSkillForOperation('GUIDANCE_JOURNEYS_LIST').id, 'guidance-overview');
  assert.equal(ASK_OPERATION_CAPABILITY.GUIDANCE_JOURNEYS_LIST, 'guidance-overview');
  const launch = capabilityCardLaunch('guidance-overview').inlineLaunch;
  assert.equal(resolveAskRoutingCascade(launch.message, { localRoutingEnabled: true }).operation.operationId, 'GUIDANCE_JOURNEYS_LIST');
});
