const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Explore with Cozy, Phase 1 (docs/product/ASK_COZY_LIGHTWEIGHT_CAPABILITY_DISCOVERY_IMPLEMENTATION_PLAN.md). The real operation registry,
// audience policy, skill runtime check and router run; nothing is stubbed except the operational controls a test deliberately flips.
const {
  ASK_DISCOVERY_TOPICS, buildAskDiscoveryTopics, validateAskDiscoveryTopics,
} = require('../../src/services/ask/askDiscoveryTopics.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { readAskOperationalControls } = require('../../src/config/askOperationalControls.ts');
const {
  ASK_DISCOVERY_TOPIC_IDS, AskDiscoveryTopicSchema, ConciergeHomeViewSchema,
} = require('../../src/productFramework/conciergeHome.contract.ts');

const project = (overrides = {}) => buildAskDiscoveryTopics({
  controls: readAskOperationalControls(), householdRole: 'OWNER', operatingMode: 'UNKNOWN', propertyId: 'p1', ...overrides,
});
const startersOf = (topics) => topics.flatMap((topic) => topic.starters);

test('the startup validator reports no issues for the registered topics', () => {
  assert.deepEqual(validateAskDiscoveryTopics(), []);
});

test('the three topics have stable ids, labels and order, and every topic is always present', () => {
  const topics = project();
  assert.deepEqual(topics.map((t) => [t.id, t.label, t.order]), [
    ['HOME_CARE', 'Home care', 1], ['DIY_PROJECTS', 'DIY & Projects', 2], ['HOME_RECORD', 'My Home Record', 3],
  ]);
  assert.deepEqual(topics.map((t) => t.id), [...ASK_DISCOVERY_TOPIC_IDS]);
  for (const topic of topics) AskDiscoveryTopicSchema.parse(topic);
});

test('every starter is registry-backed, property-scoped and AVAILABLE for an owner, with no indicator yet', () => {
  const topics = project();
  for (const topic of topics) {
    assert.equal(topic.indicator, null, topic.id);
    assert.ok(topic.starters.length > 0, topic.id);
  }
  for (const starter of startersOf(topics)) {
    assert.ok(starter.operationId in ASK_OPERATION_DEFINITIONS, starter.id);
    assert.equal(starter.availability, 'AVAILABLE', starter.id);
    assert.deepEqual(starter.reasonCodes, [], starter.id);
    assert.deepEqual(starter.entityContext, { propertyId: 'p1' }, starter.id);
  }
});

test('a viewer sees the same read-only starters (all viewer-floor operations)', () => {
  assert.deepEqual(startersOf(project({ householdRole: 'VIEWER' })).map((s) => [s.id, s.availability]), startersOf(project()).map((s) => [s.id, 'AVAILABLE']));
});

test('a disabled operation is not advertised, and its topic stays', () => {
  const controls = readAskOperationalControls();
  const topics = project({ controls: { ...controls, operationEnabled: (id) => id !== 'DIY_TEMPLATE_BROWSE' && controls.operationEnabled(id) } });
  const diy = topics.find((t) => t.id === 'DIY_PROJECTS');
  assert.deepEqual(diy.starters.map((s) => s.id), ['diy-active']);
  assert.equal(topics.length, 3);
});

test('every operation disabled leaves all three topics with no starters', () => {
  const topics = project({ controls: { ...readAskOperationalControls(), operationEnabled: () => false } });
  assert.deepEqual(topics.map((t) => [t.id, t.starters.length]), [['HOME_CARE', 0], ['DIY_PROJECTS', 0], ['HOME_RECORD', 0]]);
});

test('a caller below an operation\'s role floor gets an honest UNAVAILABLE starter, never an AVAILABLE one', () => {
  const definition = ASK_OPERATION_DEFINITIONS.DIY_PROJECTS;
  const original = definition.propertyRoleFloor;
  definition.propertyRoleFloor = 'CONTRIBUTOR';
  try {
    const viewer = startersOf(project({ householdRole: 'VIEWER' })).find((s) => s.id === 'diy-active');
    assert.equal(viewer.availability, 'UNAVAILABLE');
    assert.deepEqual(viewer.reasonCodes, ['ASK_PERMISSION_REQUIRED']);
    assert.equal(startersOf(project({ householdRole: 'CONTRIBUTOR' })).find((s) => s.id === 'diy-active').availability, 'AVAILABLE');
  } finally {
    definition.propertyRoleFloor = original;
  }
});

test('the validator rejects an unknown entry reference, a duplicate id, a duplicate launch and a governed workflow', () => {
  const topic = ASK_DISCOVERY_TOPICS[0];
  const saved = [...topic.starters];
  const bad = [
    { id: 'x-unknown', entryId: 'not-an-entry' },
    { id: saved[0].id, entryId: saved[0].entryId },
    { id: 'x-duplicate-launch', entryId: saved[0].entryId },
    { id: 'x-governed', entryId: 'maintain-create-task' },
  ];
  topic.starters.splice(0, topic.starters.length, ...saved, ...bad);
  try {
    const issues = validateAskDiscoveryTopics().join('\n');
    assert.match(issues, /x-unknown: unknown explorer entry not-an-entry/);
    assert.match(issues, new RegExp(`${saved[0].id}: duplicate discovery starter id`));
    assert.match(issues, /x-duplicate-launch: duplicate discovery starter launch/);
    assert.match(issues, /x-governed: topic starters are reads/);
  } finally {
    topic.starters.splice(0, topic.starters.length, ...saved);
  }
  assert.deepEqual(validateAskDiscoveryTopics(), []);
});

test('no starter carries a route or link', () => {
  for (const starter of startersOf(project())) {
    for (const text of [starter.label, starter.message]) assert.doesNotMatch(text, /^(?:https?:|\/|#)|href/i, starter.id);
    assert.equal('href' in starter, false, starter.id);
  }
});

test('the Concierge Home contract carries discoveryTopics', () => {
  assert.ok('discoveryTopics' in ConciergeHomeViewSchema.shape);
  assert.equal(ConciergeHomeViewSchema.shape.discoveryTopics.parse(project()).length, 3);
});
