const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const {
  selectAskNextActionCapabilities,
  deriveAskNextActionsSourceContext,
  explicitlyRelatedCapabilityIds,
  MAX_ASK_NEXT_ACTIONS,
} = require('../../src/services/ask/askNextActions.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { canonicalCapabilityRegistry } = require('../../src/productFramework/capabilities/canonicalCapabilityRegistry.ts');

test('every registered capability has an explicit card boundary; only reviewed entry reads launch inline', () => {
  for (const capability of canonicalCapabilityRegistry.capabilities) {
    const card = capabilityCardLaunch(capability.id);
    assert.ok(card.inlineBoundary);
    if (card.inlineLaunch) assert.equal(card.inlineLaunch.interactionType, 'CONVERSATION_CONTINUE');
  }
  // home-event-radar launches inline since the capability-card audit's second reference journey (c6c062f2, which
  // left this assertion stale); capital-timeline still does not.
  assert.equal(capabilityCardLaunch('home-event-radar').inlineLaunch.operationId, 'HOME_EVENT_RADAR_FEED');
  assert.equal(capabilityCardLaunch('capital-timeline').inlineLaunch, null);
  assert.equal(capabilityCardLaunch('maintenance').inlineLaunch.operationId, 'MAINTENANCE_STATUS');
});

// Ask Cozy Stage 3, Phase 4 (implementation plan §10; FRD §27 "Next
// Actions"). `selectAskNextActionCapabilities` is the pure half of this
// module -- `canonicalCapabilityRegistry.getById` is an in-memory manifest
// lookup, not a DB call, so these tests run with no mocking. The one I/O
// call this module makes (`getCapabilitySuggestions`) has no runtime-mocked
// test harness in this codebase for this class of function (same
// established gap as capturePropertyFact.ts / persistCandidates), so
// `buildAskNextActionsBlock` itself is covered by source-governance tests
// below instead, matching this repo's own convention.

function suggestion(overrides = {}) {
  return {
    capabilityId: 'maintenance',
    label: 'Plan seasonal maintenance',
    shortDescription: 'Stay ahead of upcoming upkeep.',
    expectedOutcome: 'A prioritized list of seasonal maintenance tasks.',
    readiness: { state: 'READY', explanations: [] },
    launch: { label: 'Open maintenance', href: '/dashboard/properties/p1/maintenance' },
    ...overrides,
  };
}

test('selectAskNextActionCapabilities maps a READY suggestion onto the CAPABILITY_LIST capability shape, pulling releaseStage from the live registry', () => {
  const result = selectAskNextActionCapabilities([suggestion()], undefined);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], {
    id: 'maintenance',
    label: 'Plan seasonal maintenance',
    description: 'Stay ahead of upcoming upkeep.',
    expectedOutput: 'A prioritized list of seasonal maintenance tasks.',
    href: '/dashboard/properties/p1/maintenance',
    inlineLaunch: { interactionType: 'CONVERSATION_CONTINUE', operationId: 'MAINTENANCE_STATUS', message: 'Show maintenance tasks for this home' },
    inlineBoundary: 'You can inspect current records here. Further tool actions may still require opening the full page.',
    readiness: 'READY',
    readinessLabel: 'Ready for this home',
    readinessReasons: [],
    releaseStage: 'ACTIVE',
  });
});

test('selectAskNextActionCapabilities labels a NEEDS_CONTEXT suggestion distinctly and carries through its explanations', () => {
  const result = selectAskNextActionCapabilities(
    [suggestion({ readiness: { state: 'NEEDS_CONTEXT', missingFactKeys: ['structure.roofType'], explanations: ['Roof type is not yet recorded.'] } })],
    undefined,
  );
  assert.equal(result[0].readiness, 'NEEDS_CONTEXT');
  assert.equal(result[0].readinessLabel, 'More home details will improve the result');
  assert.deepEqual(result[0].readinessReasons, ['Roof type is not yet recorded.']);
});

test('selectAskNextActionCapabilities excludes the just-answered operation\'s own capability -- never suggest what was just done', () => {
  const result = selectAskNextActionCapabilities(
    [suggestion({ capabilityId: 'maintenance' }), suggestion({ capabilityId: 'home-operations', label: 'Manage home operations' })],
    'maintenance',
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'home-operations');
});

test('selectAskNextActionCapabilities passes every suggestion through when currentCapabilityId is undefined (e.g. GROUNDED_GUIDANCE, which has no ASK_OPERATION_CAPABILITY entry)', () => {
  const result = selectAskNextActionCapabilities(
    [suggestion({ capabilityId: 'maintenance' }), suggestion({ capabilityId: 'home-operations' })],
    undefined,
  );
  assert.equal(result.length, 2);
});

// FRD §27: "Suppression: existing capabilitySuppressionPolicy.ts... plus
// existing askSuggestionPolicy.ts repeat-filter -- both apply, they
// suppress different things." capabilitySuppressionPolicy.ts's own
// dismissal-cooldown is already applied inside getCapabilitySuggestions
// (verified by reading capabilityRecommendation.service.ts's own
// evaluateCapabilitySuggestions, which calls applyCapabilitySuppressionPolicy
// before ranking) -- these two tests cover the second, separate mechanism:
// excluding a capability owned by one of this session's own last-5
// completed turns (the session-recency counterpart askOrchestrator.service.ts
// now computes and passes through).
test('selectAskNextActionCapabilities excludes a capability recently completed this session, even when it is not the current operation\'s own capability', () => {
  const result = selectAskNextActionCapabilities(
    [suggestion({ capabilityId: 'maintenance' }), suggestion({ capabilityId: 'home-operations', label: 'Manage home operations' })],
    undefined,
    new Set(['maintenance']),
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'home-operations');
});

test('selectAskNextActionCapabilities defaults recentCompletedCapabilityIds to empty when omitted -- callers that never pass it are unaffected', () => {
  const result = selectAskNextActionCapabilities([suggestion({ capabilityId: 'maintenance' })], undefined);
  assert.equal(result.length, 1);
});

test('selectAskNextActionCapabilities drops a suggestion whose capabilityId is not in the live registry, rather than throwing or emitting a broken entry', () => {
  const result = selectAskNextActionCapabilities([suggestion({ capabilityId: 'not-a-real-capability' })], undefined);
  assert.deepEqual(result, []);
});

test('selectAskNextActionCapabilities caps at MAX_ASK_NEXT_ACTIONS (5), the FRD §27-cited max-suggestions convention', () => {
  const ids = ['maintenance', 'home-operations', 'maintenance', 'home-operations', 'maintenance', 'home-operations'];
  assert.ok(ids.length > MAX_ASK_NEXT_ACTIONS);
  const result = selectAskNextActionCapabilities(ids.map((capabilityId) => suggestion({ capabilityId })), undefined);
  assert.equal(result.length, MAX_ASK_NEXT_ACTIONS);
});

// External review, second round: the sourceContext fix (below) only reaches
// launch-context turns; a plain typed question still got fully property-wide
// ranking, so different topics produced near-identical next-action lists.
// explicitlyRelatedCapabilityIds/prioritizeExplicitlyRelated close this using
// the real, registry-validated RELATED_CAPABILITIES table
// (capabilityDefinitionFactory.ts) -- these ids are real, live capabilities,
// not test fixtures, so a change to that table could change these
// assertions; that's expected, not fragile (same as any other test reading
// live registry data, matching this file's existing pattern).
test('explicitlyRelatedCapabilityIds resolves the live registry\'s declared related-capability set for a real capability', () => {
  const result = explicitlyRelatedCapabilityIds('sell-hold-rent');
  assert.deepEqual([...result].sort(), ['break-even', 'capital-timeline', 'ownership-costs']);
});

test('explicitlyRelatedCapabilityIds returns an empty set for undefined (operations with no ASK_OPERATION_CAPABILITY entry)', () => {
  assert.equal(explicitlyRelatedCapabilityIds(undefined).size, 0);
});

test('explicitlyRelatedCapabilityIds returns an empty set for a real capability that declares no related capabilities', () => {
  assert.equal(explicitlyRelatedCapabilityIds('maintenance').size, 0);
});

test('explicitlyRelatedCapabilityIds returns an empty set for an unknown capability id, rather than throwing', () => {
  assert.equal(explicitlyRelatedCapabilityIds('not-a-real-capability').size, 0);
});

test('selectAskNextActionCapabilities promotes explicitly-related suggestions ahead of unrelated ones, preserving each partition\'s incoming order', () => {
  const suggestions = [
    suggestion({ capabilityId: 'home-timeline', label: 'Home timeline' }),
    suggestion({ capabilityId: 'ownership-costs', label: 'Ownership costs' }),
    suggestion({ capabilityId: 'break-even', label: 'Break-even' }),
    suggestion({ capabilityId: 'status-board', label: 'Status board' }),
  ];
  const result = selectAskNextActionCapabilities(
    suggestions,
    undefined,
    new Set(),
    explicitlyRelatedCapabilityIds('sell-hold-rent'),
  );
  assert.deepEqual(result.map((item) => item.id), ['ownership-costs', 'break-even', 'home-timeline', 'status-board']);
});

test('selectAskNextActionCapabilities is a no-op when relatedCapabilityIds is empty, matching prior behavior exactly', () => {
  const suggestions = [
    suggestion({ capabilityId: 'home-timeline', label: 'Home timeline' }),
    suggestion({ capabilityId: 'ownership-costs', label: 'Ownership costs' }),
  ];
  const result = selectAskNextActionCapabilities(suggestions, undefined, new Set(), new Set());
  assert.deepEqual(result.map((item) => item.id), ['home-timeline', 'ownership-costs']);
});

// This is the reviewer's own stated verification: two different just-answered
// operations must produce appropriately different recommendations, even with
// no launch context and the exact same candidate suggestion list.
test('two different just-answered capabilities promote genuinely different top suggestions from the same candidate list', () => {
  const suggestions = [
    suggestion({ capabilityId: 'home-timeline', label: 'Home timeline' }),
    suggestion({ capabilityId: 'ownership-costs', label: 'Ownership costs' }),
    suggestion({ capabilityId: 'property-tax', label: 'Property tax' }),
    suggestion({ capabilityId: 'coverage-intelligence', label: 'Coverage intelligence' }),
  ];
  const afterSellHoldRent = selectAskNextActionCapabilities(
    suggestions, undefined, new Set(), explicitlyRelatedCapabilityIds('sell-hold-rent'),
  );
  const afterOwnershipCosts = selectAskNextActionCapabilities(
    suggestions, undefined, new Set(), explicitlyRelatedCapabilityIds('ownership-costs'),
  );
  assert.equal(afterSellHoldRent[0].id, 'ownership-costs');
  assert.equal(afterOwnershipCosts[0].id, 'property-tax');
  assert.notEqual(afterSellHoldRent[0].id, afterOwnershipCosts[0].id);
});

// External review [P1]: getCapabilitySuggestions previously received no
// sourceContext at all, so ranking never reflected what the just-answered
// turn was actually about. deriveAskNextActionsSourceContext is the pure
// half of that fix -- covers the mapping directly, no I/O.
test('deriveAskNextActionsSourceContext maps a Home-Action-launched turn to a HOME_ACTION sourceContext', () => {
  const result = deriveAskNextActionsSourceContext({ actionId: 'action-1', entityType: 'INVENTORY_ITEM', entityId: 'item-1' });
  assert.deepEqual(result, { kind: 'HOME_ACTION', id: 'action-1', entityType: 'INVENTORY_ITEM', entityId: 'item-1' });
});

test('deriveAskNextActionsSourceContext maps a Journey-launched turn to a JOURNEY sourceContext when there is no actionId', () => {
  const result = deriveAskNextActionsSourceContext({ journeyId: 'journey-1' });
  assert.deepEqual(result, { kind: 'JOURNEY', id: 'journey-1' });
});

test('deriveAskNextActionsSourceContext prefers actionId over journeyId when a launch context somehow carries both', () => {
  const result = deriveAskNextActionsSourceContext({ actionId: 'action-1', journeyId: 'journey-1' });
  assert.equal(result.kind, 'HOME_ACTION');
});

test('deriveAskNextActionsSourceContext returns null for a plain typed question with no launch context -- falls back to prior broad ranking, not an error', () => {
  assert.equal(deriveAskNextActionsSourceContext(undefined), null);
  assert.equal(deriveAskNextActionsSourceContext(null), null);
  assert.equal(deriveAskNextActionsSourceContext({}), null);
});

// Source-governance tests for the orchestrator wiring: buildAskNextActionsBlock
// itself calls getCapabilitySuggestions (a DB-touching function), so the gate
// widening and call-site wiring are verified against the source directly,
// matching this file's established convention for DB-touching code.
const orchestratorSource = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');

test('executeOperation\'s next-actions gate no longer requires an ASK_OPERATION_CAPABILITY entry (this excluded GROUNDED_GUIDANCE, Stage 1\'s first named gap)', () => {
  const idx = orchestratorSource.indexOf('async function executeOperation(');
  assert.ok(idx > 0);
  const gateStart = orchestratorSource.indexOf('if (\n    !input.propertyId', idx);
  assert.ok(gateStart > idx, 'expected the next-actions gate to start with the propertyId check');
  const gateEnd = orchestratorSource.indexOf(') return finalize();', gateStart);
  const gate = orchestratorSource.slice(gateStart, gateEnd);
  assert.doesNotMatch(gate, /currentCapabilityId/);
  assert.doesNotMatch(gate, /ASK_OPERATION_CAPABILITY/);
});

test('executeOperation\'s next-actions gate includes READY_WITH_LIMITATIONS (this is what excluded sell/hold/rent\'s common low-confidence case, Stage 1\'s second named gap)', () => {
  const idx = orchestratorSource.indexOf('async function executeOperation(');
  const gateStart = orchestratorSource.indexOf('if (\n    !input.propertyId', idx);
  const gateEnd = orchestratorSource.indexOf(') return finalize();', gateStart);
  const gate = orchestratorSource.slice(gateStart, gateEnd);
  assert.match(gate, /\['ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS'\]\.includes\(result\.status\)/);
});

const askNextActionsSource = readFileSync(resolve(__dirname, '../../src/services/ask/askNextActions.ts'), 'utf8');

test('External review [P2]: buildAskNextActionsBlock fetches CAPABILITY_SUGGESTIONS_FETCH_LIMIT (10), not MAX_ASK_NEXT_ACTIONS (5) -- exclusions must have candidates left to fall back on', () => {
  const fnStart = askNextActionsSource.indexOf('export async function buildAskNextActionsBlock(');
  assert.ok(fnStart > 0);
  const fnBody = askNextActionsSource.slice(fnStart); // last declaration in the file
  assert.match(fnBody, /limit: CAPABILITY_SUGGESTIONS_FETCH_LIMIT,/);
  assert.doesNotMatch(fnBody, /limit: MAX_ASK_NEXT_ACTIONS,/);
});

test('External review [P1]: buildAskNextActionsBlock derives and passes a sourceContext into getCapabilitySuggestions', () => {
  const fnStart = askNextActionsSource.indexOf('export async function buildAskNextActionsBlock(');
  const fnBody = askNextActionsSource.slice(fnStart); // last declaration in the file
  assert.match(fnBody, /const sourceContext = deriveAskNextActionsSourceContext\(input\.launchContext\);/);
  assert.match(fnBody, /sourceContext,/);
});

test('External review, second round: buildAskNextActionsBlock derives and passes relatedCapabilityIds into selectAskNextActionCapabilities', () => {
  const fnStart = askNextActionsSource.indexOf('export async function buildAskNextActionsBlock(');
  const fnBody = askNextActionsSource.slice(fnStart); // last declaration in the file
  // Phase 6 review: relatedCapabilityIds is now the union of the
  // just-answered capability's own related ids AND any active long-lived
  // goal thread's -- see the dedicated Phase 6 tests below for the merge
  // itself; this test just checks the value still reaches
  // selectAskNextActionCapabilities.
  assert.match(fnBody, /explicitlyRelatedCapabilityIds\(currentCapabilityId\)/);
  assert.match(fnBody, /relatedCapabilityIds,/);
});

test('External review, second round: the next-actions description also reflects the relatedCapabilityIds promotion, not only sourceContext', () => {
  const fnStart = askNextActionsSource.indexOf('export async function buildAskNextActionsBlock(');
  const fnBody = askNextActionsSource.slice(fnStart);
  assert.match(fnBody, /description: \(sourceContext \|\| relatedCapabilityIds\.size > 0\)/);
});

test('executeOperation threads its own launchContext into buildAskNextActionsBlock so next-action ranking can see the current turn\'s launch signal', () => {
  const idx = orchestratorSource.indexOf('async function executeOperation(');
  const callIdx = orchestratorSource.indexOf('await buildAskNextActionsBlock(', idx);
  const after = orchestratorSource.slice(callIdx, callIdx + 400);
  assert.match(after, /launchContext: input\.launchContext,/);
});

test('executeOperation still gates the next-actions block on no outstanding captures, no pending confirmation, and no pre-existing CAPABILITY_LIST block', () => {
  const idx = orchestratorSource.indexOf('async function executeOperation(');
  const gateStart = orchestratorSource.indexOf('if (\n    !input.propertyId', idx);
  const gateEnd = orchestratorSource.indexOf(') return finalize();', gateStart);
  const gate = orchestratorSource.slice(gateStart, gateEnd);
  assert.match(gate, /\(result\.captureRequests\?\.length \?\? 0\) > 0/);
  assert.match(gate, /result\.confirmation/);
  assert.match(gate, /block\.type === 'CAPABILITY_LIST'/);
});

test('executeOperation calls buildAskNextActionsBlock inside a try/catch so a next-actions failure never turns a successful answer into a failure', () => {
  const idx = orchestratorSource.indexOf('async function executeOperation(');
  const callIdx = orchestratorSource.indexOf('await buildAskNextActionsBlock(', idx);
  assert.ok(callIdx > idx);
  const before = orchestratorSource.slice(orchestratorSource.lastIndexOf('try {', callIdx), callIdx);
  assert.ok(before.length < 200, 'expected the buildAskNextActionsBlock call to sit directly inside a nearby try block');
  // External review, 2026-09-13 (FRD §27's "tell me about X" requirement):
  // widened from 400 -- the call gained a 6th parameter (contextVersion)
  // and the block now also carries next-actions' own captureRequests, both
  // still inside this same try block.
  const after = orchestratorSource.slice(callIdx, callIdx + 500);
  assert.match(after, /catch \{/);
  assert.match(after, /recentCompletedCapabilityIds,/);
});

test('executeOperation computes recentCompletedCapabilityIds from the same session-recency query as recentCompletedMessages, once, before finalize -- not a second DB round trip', () => {
  const idx = orchestratorSource.indexOf('async function executeOperation(');
  const queryIdx = orchestratorSource.indexOf('await prisma.askExecution.findMany(', idx);
  assert.ok(queryIdx > idx);
  const finalizeIdx = orchestratorSource.indexOf('const finalize = async ()', idx);
  assert.ok(queryIdx < finalizeIdx, 'expected the recency query to be hoisted above finalize, not run inside it');
  const queryBlock = orchestratorSource.slice(queryIdx, orchestratorSource.indexOf('} catch {', queryIdx));
  assert.match(queryBlock, /select: \{ message: true, operationId: true \}/);
  assert.match(queryBlock, /recentCompletedCapabilityIds = new Set\(/);
  // Only ever one findMany for this purpose in the function -- not a
  // second, duplicated query inside finalize for the message-only case.
  const secondQueryIdx = orchestratorSource.indexOf('await prisma.askExecution.findMany(', queryIdx + 1);
  const nextFunctionIdx = orchestratorSource.indexOf('\nfunction captureFallbackHref(', idx);
  assert.ok(secondQueryIdx === -1 || secondQueryIdx > nextFunctionIdx, 'expected no second askExecution.findMany call inside executeOperation for this purpose');
});

// External review, Phase 6 [P1] (FRD §8.5/§21): an active long-lived goal
// thread never influenced next-action ranking -- AskSession.activeDecisionThreadId
// had zero readers anywhere in the backend (confirmed by grep before this
// fix). These are source-governance tests (activeSellHoldRentGoalRelatedCapabilityIds
// is DB-touching -- sellHoldRentDecisionFamilyAdapter.selectThread -- with no
// mock harness in this codebase for this class of function, same
// established gap as buildAskNextActionsBlock's own getCapabilitySuggestions
// call, per this file's own header comment).
test('activeSellHoldRentGoalRelatedCapabilityIds uses selectThread (read-only), never createOrResumeThread, so next-action ranking can never create a thread as a side effect', () => {
  const fnStart = askNextActionsSource.indexOf('async function activeSellHoldRentGoalRelatedCapabilityIds(');
  assert.ok(fnStart > 0);
  const fnBody = askNextActionsSource.slice(fnStart, askNextActionsSource.indexOf('\n}\n', fnStart) + 2);
  assert.match(fnBody, /sellHoldRentDecisionFamilyAdapter\.selectThread\(propertyId, propertyId\)/);
  assert.doesNotMatch(fnBody, /createOrResumeThread/);
  assert.match(fnBody, /selection\.kind === 'UNIQUE'/);
  // Never throws -- a lookup failure must not turn a successful answer into
  // a failure, same fail-open convention as every other optional signal
  // this module reads.
  assert.match(fnBody, /catch \(error\)/);
  assert.match(fnBody, /return new Set\(\);/);
});

test('activeSellHoldRentGoalRelatedCapabilityIds promotes sell-hold-rent AND seller-prep directly -- FRD §8.5 names both, and sell-hold-rent\'s own registry entry does not list seller-prep', () => {
  const constIdx = askNextActionsSource.indexOf('const SELL_HOLD_RENT_GOAL_RELATED_CAPABILITY_IDS');
  assert.ok(constIdx > 0);
  const line = askNextActionsSource.slice(constIdx, askNextActionsSource.indexOf('\n', constIdx));
  assert.match(line, /\['sell-hold-rent', 'seller-prep'\]/);
});

test('buildAskNextActionsBlock fetches suggestions, currentCapabilityId relations, and active-goal relations concurrently, then merges the latter two into one relatedCapabilityIds set', () => {
  const fnStart = askNextActionsSource.indexOf('export async function buildAskNextActionsBlock(');
  assert.ok(fnStart > 0);
  const fnBody = askNextActionsSource.slice(fnStart);
  assert.match(fnBody, /const \[response, currentCapabilityRelatedIds, activeGoalRelatedIds\] = await Promise\.all\(\[/);
  assert.match(fnBody, /activeSellHoldRentGoalRelatedCapabilityIds\(input\.propertyId\)/);
  assert.match(fnBody, /conversationRelatedCapabilityIds\(input.message \?\? '', response.suggestions\)/);
  assert.match(fnBody, /relatedCapabilityIds,\s*\n\s*\);/);
});

// This does NOT read AskSession.activeDecisionThreadId -- deliberately, per
// activeSellHoldRentGoalRelatedCapabilityIds's own header comment (a
// session-scoped cache would fail the "resumes correctly across a new
// session" acceptance criterion this fix specifically serves).
test('the active-goal promotion does not depend on AskSession.activeDecisionThreadId', () => {
  const fnStart = askNextActionsSource.indexOf('async function activeSellHoldRentGoalRelatedCapabilityIds(');
  const fnBody = askNextActionsSource.slice(fnStart, askNextActionsSource.indexOf('\n}\n', fnStart) + 2);
  assert.doesNotMatch(fnBody, /activeDecisionThreadId/);
});

const { conversationRelatedCapabilityIds } = require('../../src/services/ask/askNextActions.ts');
test('plain questions promote their own topic without launch context', () => {
  const choices = [suggestion(), suggestion({ capabilityId: 'refinance', label: 'Compare mortgage loans', shortDescription: 'Review interest rates', expectedOutcome: 'Financing options' })];
  assert.deepEqual([...conversationRelatedCapabilityIds('What is my mortgage interest rate?', choices)], ['refinance']);
});
test('missing facts without a usable capture contract do not produce dead-end cards', () => {
  assert.deepEqual(selectAskNextActionCapabilities([suggestion({ readiness: { state: 'NEEDS_CONTEXT', missingFactKeys: ['unsupported.fact'], explanations: [] } })]), []);
});
