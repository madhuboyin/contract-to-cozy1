const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Capability discovery Phase 4: the reviewed explorer inventory. The real operation registry, domain command registry, audience policy and
// router run; the validator is exercised by temporarily breaking a copy of one entry.
const registry = require('../../src/services/ask/askExplorerRegistry.ts');
const { ASK_EXPLORER_ENTRIES, ASK_EXPLORER_GROUPS, validateAskExplorerRegistry, buildAskExplorerGroups, explorerEntryById } = registry;
const { ASK_DISCOVERY_TOPICS, validateAskDiscoveryTopics, buildAskDiscoveryTopics } = require('../../src/services/ask/askDiscoveryTopics.ts');
const { ConciergeHomeCapabilityGroupSchema } = require('../../src/productFramework/conciergeHome.contract.ts');
const { readAskOperationalControls } = require('../../src/config/askOperationalControls.ts');

const base = ASK_EXPLORER_ENTRIES.find((entry) => entry.id === 'protect-coverage');

test('the reviewed registry is valid, and the topics validate against it', () => {
  assert.deepEqual(validateAskExplorerRegistry(), []);
  assert.deepEqual(validateAskDiscoveryTopics(), []);
});

test('every entry has reviewed copy, a group, and 1-8 plain-wording aliases that are not operation ids', () => {
  const groups = new Set(ASK_EXPLORER_GROUPS.map((group) => group.id));
  for (const entry of ASK_EXPLORER_ENTRIES) {
    assert.ok(groups.has(entry.groupId), entry.id);
    assert.ok(entry.label && entry.question, entry.id);
    assert.ok(entry.aliases.length >= 1 && entry.aliases.length <= 8, entry.id);
    for (const alias of entry.aliases) assert.match(alias, /^[a-z0-9][a-z0-9 '’-]{1,39}$/, `${entry.id}: ${alias}`);
  }
});

test('the explorer is the inventory and the topics only reference it', () => {
  const referenced = new Set(ASK_DISCOVERY_TOPICS.flatMap((topic) => topic.starters.map((starter) => starter.entryId)));
  for (const id of referenced) assert.ok(explorerEntryById(id), id);
  assert.ok(ASK_EXPLORER_ENTRIES.length > referenced.size, 'entries that no topic references stay in the explorer');
  const topics = buildAskDiscoveryTopics({ controls: readAskOperationalControls(), householdRole: 'OWNER', operatingMode: 'UNKNOWN', propertyId: 'p1' });
  for (const topic of topics) for (const starter of topic.starters) {
    const entry = explorerEntryById(ASK_DISCOVERY_TOPICS.find((t) => t.id === topic.id).starters.find((s) => s.id === starter.id).entryId);
    assert.deepEqual([starter.label, starter.message, starter.operationId], [entry.label, entry.question, entry.operationId]);
  }
});

test('no entry is a phrase that falls to the grounded-guidance fallback, a monitor, or a raw command', () => {
  const { getAskOperationDefinition } = require('../../src/services/ask/askOperationRegistry.ts');
  for (const entry of ASK_EXPLORER_ENTRIES) {
    const family = getAskOperationDefinition(entry.operationId).family;
    assert.notEqual(family, 'GENERAL_HOME_GUIDANCE', entry.id);
    assert.notEqual(family, 'MONITOR', entry.id);
    if (entry.kind === 'READ') assert.notEqual(family, 'COMMAND', entry.id);
  }
});

test('the only write-oriented entry begins a confirmation-gated workflow and states its consequence', () => {
  const governed = ASK_EXPLORER_ENTRIES.filter((entry) => entry.kind === 'GOVERNED_WORKFLOW');
  assert.deepEqual(governed.map((entry) => entry.id), ['maintain-create-task']);
  assert.match(governed[0].consequence, /confirm/i);
  assert.equal(governed[0].interactionType, 'START_WORKFLOW');
});

test('previously unreviewed prompts are gone: the grounded-guidance repair/replace prompt, the mis-routed reserve plan, and the task-picking deadline monitor', () => {
  const questions = ASK_EXPLORER_ENTRIES.map((entry) => entry.question);
  assert.ok(!questions.includes('Help me compare repair and replacement options for a home system or appliance.'));
  assert.ok(!questions.includes('Create a capital reserve plan for future replacements.'));
  assert.ok(!questions.includes('Monitor my important home deadlines.'));
  assert.ok(!ASK_EXPLORER_ENTRIES.some((entry) => entry.operationId === 'HOME_DEADLINE_MONITOR' || entry.operationId === 'INVENTORY_ITEM_CREATE'));
});

test('the validator rejects an unknown operation, a drifting message, a READ that is a command, an unconfirmed workflow, a bad alias and a fallback operation', () => {
  const cases = [
    [{ ...base, id: 'x-unknown', question: 'Something odd', operationId: 'NOT_AN_OPERATION' }, /x-unknown: unknown operation/],
    [{ ...base, id: 'x-drift', question: 'Show my DIY projects' }, /x-drift: question does not resolve to COVERAGE_GAPS/],
    [{ ...base, id: 'x-read-command', question: 'Create a maintenance task', operationId: 'MAINTENANCE_TASK_CREATE', kind: 'READ' }, /x-read-command: a READ entry cannot be the command/],
    [{ ...base, id: 'x-no-consequence', question: 'Create a maintenance task', operationId: 'MAINTENANCE_TASK_CREATE', kind: 'GOVERNED_WORKFLOW', interactionType: 'START_WORKFLOW' }, /x-no-consequence: a GOVERNED_WORKFLOW must state/],
    [{ ...base, id: 'x-not-command', kind: 'GOVERNED_WORKFLOW', interactionType: 'START_WORKFLOW', consequence: 'Nothing happens until you confirm.' }, /x-not-command: a GOVERNED_WORKFLOW must be a registered/],
    [{ ...base, id: 'x-alias', aliases: ['COVERAGE_GAPS'] }, /x-alias: alias "COVERAGE_GAPS" is not plain/],
    [{ ...base, id: 'x-no-alias', aliases: [] }, /x-no-alias: needs 1-8 approved aliases/],
    [{ ...base, id: 'x-fallback', question: 'Tell me anything', operationId: 'GROUNDED_GUIDANCE' }, /x-fallback: GROUNDED_GUIDANCE is the grounded-guidance fallback/],
    [{ ...base, id: 'x-internal-message', question: 'Seasonal please', operationId: 'SEASONAL_HOME_CARE' }, /x-internal-message: SEASONAL_HOME_CARE is internal-only/],
    [{ ...base, id: 'x-link', label: '/dashboard/coverage' }, /x-link: text reads as a non-Ask destination/],
    [{ ...base, id: 'protect-coverage' }, /duplicate explorer entry id/],
  ];
  for (const [entry, expected] of cases) assert.match(validateAskExplorerRegistry([...ASK_EXPLORER_ENTRIES, entry]).join('\n'), expected);
});

test('the Concierge Home groups come from the registry: only groups with catalog capabilities, each prompt carrying label, operation, aliases and any consequence', () => {
  const capabilities = ASK_EXPLORER_GROUPS.map((group) => ({ id: `cap-${group.id}`, outcomeCategory: group.outcomeCategory }));
  const groups = buildAskExplorerGroups(capabilities);
  assert.deepEqual(groups.map((group) => group.id), ASK_EXPLORER_GROUPS.map((group) => group.id));
  for (const group of groups) ConciergeHomeCapabilityGroupSchema.parse(group);
  const prompts = groups.flatMap((group) => group.prompts);
  assert.equal(prompts.length, ASK_EXPLORER_ENTRIES.length);
  const create = prompts.find((prompt) => prompt.id === 'maintain-create-task');
  assert.equal(create.operationId, 'MAINTENANCE_TASK_CREATE');
  assert.match(create.note, /Nothing is saved until you confirm/);
  assert.equal(prompts.find((prompt) => prompt.id === 'protect-coverage').note, undefined);
  assert.deepEqual(buildAskExplorerGroups([{ id: 'only-save', outcomeCategory: 'SAVE_OPTIMIZE' }]).map((group) => group.id), ['SAVE']);
  assert.deepEqual(buildAskExplorerGroups([]), []);
});
