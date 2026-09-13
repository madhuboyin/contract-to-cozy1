const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const { selectAskNextActionCapabilities, MAX_ASK_NEXT_ACTIONS } = require('../../src/services/ask/askNextActions.ts');

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
    readiness: 'READY',
    readinessLabel: 'Ready for this home',
    readinessReasons: [],
    releaseStage: 'ACTIVE',
  });
});

test('selectAskNextActionCapabilities labels a NEEDS_CONTEXT suggestion distinctly and carries through its explanations', () => {
  const result = selectAskNextActionCapabilities(
    [suggestion({ readiness: { state: 'NEEDS_CONTEXT', explanations: ['Roof type is not yet recorded.'] } })],
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
  const after = orchestratorSource.slice(callIdx, callIdx + 400);
  assert.match(after, /catch \{/);
});
