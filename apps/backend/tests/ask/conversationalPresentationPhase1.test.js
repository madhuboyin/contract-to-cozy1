const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_CONVERSATIONAL_PRESENTATION_IMPLEMENTATION_PLAN Phase 1 (audit: docs/architecture/ASK_COZY_CONVERSATIONAL_PRESENTATION_PHASE_1_AUDIT.md):
// winter judgment, the furnace-filter guide's honest actions, and home-safety prioritization with an emergency boundary. Everything here is a pure
// builder or a pure policy; nothing reads a database or starts a service.

const { buildSeasonalHomeCareResult, buildSeasonalTaskWalkthrough } = require('../../src/services/ask/support/seasonalHomeCare.ts');
const { buildHomeBasicsResult, HOME_BASICS_SAFETY_MESSAGE } = require('../../src/services/ask/support/homeBasicsGuide.ts');
const { AskPresentationBlockSchema } = require('../../src/productFramework/ask/ask.contract.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { finalizeSuggestedNextActionsWithReport, resolveSuggestedNextActionMode } = require('../../src/services/ask/suggestedActions/finalizeSuggestedNextActions.ts');
const { SUGGESTED_NEXT_ACTION_PRODUCERS } = require('../../src/services/ask/suggestedActions/suggestedNextActionProducers.ts');
const { fixedSuggestedNextActionClock } = require('../../src/services/ask/suggestedActions/suggestedNextActionClock.ts');

const WINTER_NOW = new Date(2027, 0, 15);
const owner = { canSetUp: true, checklist: null };
const trusted = (operationId, result) => ({
  ...result,
  parameters: { answerTrustEvidence: { schemaVersion: '1.0', sources: [{ sourceId: operationId === 'HOME_BASICS_GUIDE' ? 'home-basics.guide' : 'seasonal.home-care', operationId, status: 'COMPLETE', scope: 'FULL', freshness: 'CURRENT', observedAt: '2027-01-15T00:00:00.000Z' }] } },
});

// ---- winter preparation ----------------------------------------------------------------------------------------------------------------

test('winter plan: the first sentence is the judgment, names the tasks that matter most, and the basis follows', () => {
  const plan = buildSeasonalHomeCareResult({ zipCode: '60601', now: WINTER_NOW, focus: 'THIS_SEASON', setup: owner });
  const summary = plan.blocks[0].body;
  const soon = plan.blocks[1].sections.find((section) => section.id === 'seasonal-soon').items.map((item) => item.title);
  assert.match(summary, /^The 3 things that matter most this winter are /);
  for (const title of soon) assert.ok(summary.includes(title), title);
  assert.match(summary, /Do those soon; the other 2 can wait until you have time\./);
  assert.ok(summary.indexOf('Do those soon') < summary.indexOf('is the current season for your area'), 'judgment precedes the basis');
  assert.doesNotMatch(summary, /the first \d+ soon/, 'tasks are named, not referred to by position');
});

test('winter plan: personalization says what it is based on, what it does not use, and what would change that; nothing is persisted by the plan', () => {
  const plan = buildSeasonalHomeCareResult({ zipCode: '60601', now: WINTER_NOW, focus: 'THIS_SEASON', setup: owner });
  const about = plan.blocks.find((block) => block.id === 'seasonal-home-care-boundary');
  assert.equal(about.severity, 'INFO');
  assert.match(about.body, /general guidance for your climate, not an assessment of this home/);
  assert.match(about.body, /does not use anything recorded about your systems/);
  assert.match(about.body, /your own seasonal checklist can add tasks specific to those systems/);
  const setup = plan.blocks.at(-1).actions.find((action) => action.id === 'seasonal-add-tasks');
  assert.equal(setup.operationId, 'SEASONAL_CHECKLIST_SETUP', 'adding tasks opens the confirmed setup operation, it is not a write here');
  assert.equal(JSON.stringify(plan).includes('"interactionType":"MUTATE'), false);
});

test('winter plan: the soon/can-wait grouping still comes from the template priority, and a one-task case reads naturally', () => {
  const plan = buildSeasonalHomeCareResult({ zipCode: '33101', now: WINTER_NOW, focus: 'THIS_SEASON', setup: owner });
  assert.deepEqual(plan.blocks[1].sections.map((section) => section.title), ['Do these soon', 'Can wait']);
  assert.match(plan.blocks[0].body, /^The 2 things that matter most this winter are /);
  const next = buildSeasonalHomeCareResult({ zipCode: '60601', now: new Date(2026, 9, 15), focus: 'NEXT_SEASON', setup: owner });
  assert.match(next.blocks[0].body, /matter most before winter are /);
});

// ---- furnace-filter guide ----------------------------------------------------------------------------------------------------------------

test('furnace-filter guide: one TASK_GUIDE, no progress claim in the eyebrow, and every continuation declared SECONDARY (no primary action)', () => {
  const guide = buildSeasonalTaskWalkthrough({ zipCode: '60601', now: WINTER_NOW, focus: 'THIS_SEASON', taskKey: 'WINTER_FURNACE_FILTER_CHANGE', setup: owner }).blocks[0];
  assert.equal(guide.type, 'TASK_GUIDE');
  assert.deepEqual(guide.eyebrow, ['Winter prep']);
  assert.doesNotMatch(JSON.stringify(guide), /Task \d+ of \d+/);
  assert.deepEqual(guide.actions.map((action) => action.id), ['seasonal-next-task', 'seasonal-add-tasks', 'seasonal-back-to-plan', 'seasonal-update-home-details']);
  assert.deepEqual([...new Set(guide.actions.map((action) => action.style))], ['SECONDARY']);
  assert.equal(guide.actions[0].label, 'Another winter task');
  assert.equal(guide.main.body, 'Check and replace HVAC filters every month during peak heating season', 'still only the template\'s one description, no invented steps');
  assert.doesNotThrow(() => AskPresentationBlockSchema.parse(guide));
});

test('timing: a window that has not opened keeps the template label; one that has passed says now is a good time', () => {
  const input = { zipCode: '08536', focus: 'NEXT_SEASON', taskKey: 'WINTER_FURNACE_FILTER_CHANGE', setup: owner };
  const early = buildSeasonalTaskWalkthrough({ ...input, now: new Date(2026, 9, 5) }).blocks[0];
  assert.deepEqual(early.main.facts, [{ label: 'When', value: 'Best done about 2 weeks before winter starts' }]);
  const inWinter = buildSeasonalTaskWalkthrough({ ...input, focus: 'THIS_SEASON', now: WINTER_NOW }).blocks[0];
  assert.equal(inWinter.main.facts[0].value, 'Best done about 2 weeks before winter starts; if you have not yet, now is a good time');
  const plan = buildSeasonalHomeCareResult({ zipCode: '60601', now: WINTER_NOW, focus: 'THIS_SEASON', setup: owner });
  const furnace = plan.blocks[1].sections.flatMap((section) => section.items).find((item) => item.id === 'WINTER_FURNACE_FILTER_CHANGE');
  assert.match(furnace.detail, /When: Best done about 2 weeks before winter starts; if you have not yet, now is a good time/);
});

// ---- home-safety basics ------------------------------------------------------------------------------------------------------------------

test('home safety: leads with the few that matter most, declares the disclosure boundary, and the lesser items follow in the same section', () => {
  const result = buildHomeBasicsResult('SAFETY_BASICS');
  const [section] = result.blocks.find((block) => block.id === 'home-basics-items').sections;
  assert.equal(section.initialVisibleCount, 3);
  assert.equal(section.count, 6);
  assert.deepEqual(section.items.slice(0, 3).map((item) => item.id), ['alarms', 'water-shutoff', 'electrical-panel']);
  assert.match(result.blocks[0].body, /^Three things matter most/);
  for (const item of section.items.slice(0, 3)) assert.ok(item.description.length > 60, `${item.id} carries its reason`);
  assert.equal(buildHomeBasicsResult('MONTHLY_ROUTINE').blocks.find((block) => block.id === 'home-basics-items').sections[0].initialVisibleCount, undefined, 'the monthly routine shows every item');
});

test('home safety: gas wording is conditional and informational, claims neither presence nor absence, and records nothing', () => {
  const result = buildHomeBasicsResult('SAFETY_BASICS');
  const gas = result.blocks.find((block) => block.id === 'home-basics-items').sections[0].items.find((item) => item.id === 'gas-shutoff');
  assert.match(gas.description, /^If your home has gas service/);
  assert.match(gas.description, /Not sure whether you have gas\?/);
  assert.doesNotMatch(gas.description, /\byou (?:do not|don't) have gas\b|(?<!If )\byour home (?:has|uses) gas\b/i, 'no unconditional present/absent claim');
  assert.equal(gas.actions, undefined, 'no capture or assessment action');
  assert.equal(result.captureRequests ?? undefined, undefined);
  assert.equal(JSON.stringify(result).includes('CAPTURE'), false);
});

test('home safety: the gas emergency is its own EMERGENCY boundary, stated in words (not only color), and the INFO boundary stays', () => {
  const result = buildHomeBasicsResult('SAFETY_BASICS');
  const emergency = result.blocks.find((block) => block.id === 'home-basics-gas-emergency');
  assert.equal(emergency.type, 'BOUNDARY');
  assert.equal(emergency.severity, 'EMERGENCY');
  assert.equal(emergency.title, 'If you smell gas');
  assert.match(emergency.body, /Leave the home right away/);
  assert.match(emergency.body, /from outside/);
  assert.equal(result.blocks.find((block) => block.id === 'home-basics-boundary').severity, 'INFO');
  assert.equal(buildHomeBasicsResult('MONTHLY_ROUTINE').blocks.some((block) => block.id === 'home-basics-gas-emergency'), false);
});

test('home safety: the emergency boundary and the three continuation ids survive validateAskAnswerTrust; an unlisted id is stripped (negative control)', () => {
  for (const focus of ['SAFETY_BASICS', 'MONTHLY_ROUTINE']) {
    const raw = trusted('HOME_BASICS_GUIDE', buildHomeBasicsResult(focus));
    const { result } = validateAskAnswerTrust({ question: HOME_BASICS_SAFETY_MESSAGE, operationId: 'HOME_BASICS_GUIDE', result: raw, propertyId: 'p1' });
    assert.deepEqual(result.blocks.map((block) => block.id), raw.blocks.map((block) => block.id), `${focus}: no block removed`);
    const next = result.blocks.find((block) => block.id === 'home-basics-next');
    assert.equal(next.actions.length, 2, `${focus}: both continuations kept`);
    assert.equal(next.actions.every((action) => action.interactionType === 'START_WORKFLOW' && !action.href), true);
  }
  const raw = trusted('HOME_BASICS_GUIDE', buildHomeBasicsResult('SAFETY_BASICS'));
  const withStray = { ...raw, blocks: raw.blocks.map((block) => (block.id === 'home-basics-next' ? { ...block, actions: [...block.actions, { ...block.actions[0], id: 'home-basics-not-listed' }] } : block)) };
  const stripped = validateAskAnswerTrust({ question: HOME_BASICS_SAFETY_MESSAGE, operationId: 'HOME_BASICS_GUIDE', result: withStray, propertyId: 'p1' }).result;
  assert.deepEqual(stripped.blocks.find((block) => block.id === 'home-basics-next').actions.map((action) => action.id), ['home-basics-monthly-routine', 'home-basics-seasonal-plan']);
  assert.equal(isAskActionApplicable({ action: { id: 'home-basics-not-listed' }, operationId: 'HOME_BASICS_GUIDE', householdRole: null, authoritativeSourceAvailable: true }), false);
});

test('suggestion mode: the safety guide (with its EMERGENCY boundary) is SAFE_RECOVERY_ONLY; the monthly guide and the winter plan stay NORMAL', () => {
  assert.equal(resolveSuggestedNextActionMode(buildHomeBasicsResult('SAFETY_BASICS'), 'HOME_BASICS_GUIDE'), 'SAFE_RECOVERY_ONLY');
  assert.equal(resolveSuggestedNextActionMode(buildHomeBasicsResult('MONTHLY_ROUTINE'), 'HOME_BASICS_GUIDE'), 'NORMAL');
  assert.equal(resolveSuggestedNextActionMode(buildSeasonalHomeCareResult({ zipCode: '60601', now: WINTER_NOW, focus: 'THIS_SEASON', setup: owner }), 'SEASONAL_HOME_CARE'), 'NORMAL');
});

test('finalizer: contextual Home Basics controls own the next step in both safety and normal modes, without starter padding', async () => {
  const NOW = new Date('2027-01-15T12:00:00.000Z');
  const run = (result, operationId) => finalizeSuggestedNextActionsWithReport(
    { result, executionId: 'exec-1', userId: 'u1', sessionId: 's1', propertyId: 'prop-1', operationId, message: HOME_BASICS_SAFETY_MESSAGE },
    {
      producers: SUGGESTED_NEXT_ACTION_PRODUCERS, clock: fixedSuggestedNextActionClock ? fixedSuggestedNextActionClock(NOW) : { now: () => NOW },
      loadOperationAvailability: async () => new Map([['HOME_BASICS_GUIDE', null], ['SEASONAL_HOME_CARE', null], ['PROPERTY_SUMMARY', null], ['HIRING_GUIDE', null]]),
      loadExecutionExpiresAt: async () => new Date(NOW.getTime() + 24 * 3600_000),
      loadCurrentOutcomeKeyHashes: async () => new Set(),
      loadLifecycleState: async () => ({ cooldownKeys: new Set(), completedKeys: new Set(), lastOfferedAtMs: new Map(), ok: true }),
      recordOffers: async () => undefined,
      loadActionableCompleteness: async () => ({ fraction: 1, audienceUncertain: false }),
    },
  );
  const emergency = await run(buildHomeBasicsResult('SAFETY_BASICS'), 'HOME_BASICS_GUIDE');
  assert.equal(emergency.report.mode, 'SAFE_RECOVERY_ONLY');
  assert.deepEqual(emergency.result.suggestedNextActions, [], 'no starter, promotional or unrelated candidate survives');
  assert.equal(emergency.result.blocks.find((block) => block.id === 'home-basics-next').actions.length, 2, 'block-level continuations remain');
  const routine = await run(buildHomeBasicsResult('MONTHLY_ROUTINE'), 'HOME_BASICS_GUIDE');
  assert.equal(routine.report.mode, 'NORMAL');
  assert.deepEqual(routine.result.suggestedNextActions, [], 'normal contextual controls also suppress unrelated starter padding');
  assert.equal(routine.report.exactFour.exemptReason, 'CONTEXTUAL_ACTIONS_IN_RESULT');
});
