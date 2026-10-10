const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

// Capability discovery Phase 5 (Inline Workspace FRD IW-SHELL-020): the explorer registry is a DERIVATION. The real capability registry, Ask
// operation registry, guidance bridge, domain command registry, audience policy and router run; the validators are exercised with broken bindings.
const registry = require('../../src/services/ask/askExplorerRegistry.ts');
const bindings = require('../../src/services/ask/askCapabilityBindings.ts');
const { ASK_EXPLORER_ENTRIES, ASK_EXPLORER_GROUPS, validateAskExplorerRegistry, validateAskCapabilityBindings, buildAskExplorerGroups, explorerEntryById, deriveAskExplorerEntries } = registry;
const { ASK_DISCOVERY_BINDINGS, CARD_ENTRY_BINDINGS, KNOWN_CARD_BRIDGE_DISAGREEMENTS } = bindings;
const { ASK_DISCOVERY_TOPICS, validateAskDiscoveryTopics, buildAskDiscoveryTopics } = require('../../src/services/ask/askDiscoveryTopics.ts');
const { ConciergeHomeCapabilityGroupSchema } = require('../../src/productFramework/conciergeHome.contract.ts');
const { canonicalCapabilityRegistry } = require('../../src/productFramework/capabilities/index.ts');
const { ASK_OPERATION_CAPABILITY } = require('../../src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts');
const { ASK_DISCOVERY_INTENT_ALIASES } = require('../../src/productFramework/capabilities/definitions/discoveryIntentAliases.ts');
const { getAskOperationDefinition } = require('../../src/services/ask/askOperationRegistry.ts');
const { readAskOperationalControls } = require('../../src/config/askOperationalControls.ts');

const base = ASK_DISCOVERY_BINDINGS.find((binding) => binding.id === 'save-costs');
const issuesFor = (...extra) => validateAskExplorerRegistry([...ASK_DISCOVERY_BINDINGS, ...extra]).join('\n');

test('the bindings, the derived entries, the topics and the card bindings all validate', () => {
  assert.deepEqual(validateAskExplorerRegistry(), []);
  assert.deepEqual(validateAskDiscoveryTopics(), []);
  assert.deepEqual(validateAskCapabilityBindings(), []);
  assert.equal(ASK_EXPLORER_ENTRIES.length, ASK_DISCOVERY_BINDINGS.length);
});

test('a binding holds only Ask-specific facts: no group, alias, description or outcome of its own', () => {
  const allowed = new Set(['id', 'capabilityId', 'operationId', 'question', 'interactionType', 'launch', 'selectorId', 'kind', 'consequence', 'label']);
  for (const binding of ASK_DISCOVERY_BINDINGS) for (const key of Object.keys(binding)) assert.ok(allowed.has(key), `${binding.id}: ${key}`);
});

test('group, label, and aliases are derived from the capability registry', () => {
  for (const entry of ASK_EXPLORER_ENTRIES) {
    const capability = canonicalCapabilityRegistry.getById(entry.capabilityId);
    assert.ok(capability, entry.id);
    assert.equal(ASK_EXPLORER_GROUPS.find((group) => group.id === entry.groupId).outcomeCategory, capability.presentation.outcomeCategory, `${entry.id} group`);
    assert.deepEqual([...entry.aliases], [...new Set(capability.presentation.intentAliases)], `${entry.id} aliases`);
    const binding = ASK_DISCOVERY_BINDINGS.find((candidate) => candidate.id === entry.id);
    assert.equal(entry.label, binding.label ?? capability.presentation.label, `${entry.id} label`);
  }
  // The consequence of deriving: these two now sit with their capability's outcome, not the group their old ids suggest.
  assert.equal(explorerEntryById('maintain-diy').groupId, 'PLAN_MONITOR');
  assert.equal(explorerEntryById('protect-coverage').groupId, 'DECIDE');
  assert.equal(explorerEntryById('protect-changes').groupId, 'PROTECT');
});

test('every binding agrees with the validated guidance bridge about which capability owns its operation', () => {
  for (const binding of ASK_DISCOVERY_BINDINGS) assert.equal(ASK_OPERATION_CAPABILITY[binding.operationId], binding.capabilityId, binding.id);
});

test('the approved aliases are plain noun phrases that the goal matcher cannot mistake for a generic request', () => {
  for (const [capabilityId, aliases] of Object.entries(ASK_DISCOVERY_INTENT_ALIASES)) {
    assert.ok(canonicalCapabilityRegistry.getById(capabilityId), capabilityId);
    for (const alias of aliases) {
      assert.match(alias, /^[a-z][a-z ]{2,39}$/, `${capabilityId}: ${alias}`);
      assert.doesNotMatch(alias, /^(?:what|how|which|where|when|why|who|can|is|are|should|does|do you|do i)\b/, `${capabilityId}: "${alias}" is a question`);
      assert.ok(canonicalCapabilityRegistry.getById(capabilityId).presentation.intentAliases.includes(alias), `${capabilityId}: ${alias} reaches the registry`);
    }
  }
});

test('the registry gained Seasonal Maintenance, and the bridge owns the seasonal and change-summary operations', () => {
  const seasonal = canonicalCapabilityRegistry.getById('seasonal-maintenance');
  assert.equal(seasonal.destination.routeTemplate, '/dashboard/seasonal');
  assert.equal(seasonal.presentation.outcomeCategory, 'MAINTAIN_PREVENT');
  assert.equal(ASK_OPERATION_CAPABILITY.SEASONAL_HOME_CARE, 'seasonal-maintenance');
  assert.equal(ASK_OPERATION_CAPABILITY.SEASONAL_CHECKLIST_SETUP, 'seasonal-maintenance');
  assert.equal(ASK_OPERATION_CAPABILITY.HOME_CHANGE_SUMMARY, 'home-briefing');
  assert.equal(ASK_OPERATION_CAPABILITY.MAINTENANCE_FORECAST, 'maintenance');
});

test('the explorer and the topics share the same bindings; topics only reference them', () => {
  const referenced = new Set(ASK_DISCOVERY_TOPICS.flatMap((topic) => topic.starters.map((starter) => starter.entryId)));
  for (const id of referenced) assert.ok(explorerEntryById(id), id);
  assert.ok(ASK_EXPLORER_ENTRIES.length > referenced.size, 'entries that no topic references stay in the explorer');
  const topics = buildAskDiscoveryTopics({ controls: readAskOperationalControls(), householdRole: 'OWNER', operatingMode: 'UNKNOWN', propertyId: 'p1' });
  for (const topic of topics) for (const starter of topic.starters) {
    const entry = explorerEntryById(ASK_DISCOVERY_TOPICS.find((t) => t.id === topic.id).starters.find((s) => s.id === starter.id).entryId);
    assert.deepEqual([starter.label, starter.message, starter.operationId], [entry.label, entry.question, entry.operationId]);
  }
});

test('no binding is a phrase that falls to the grounded-guidance fallback, a monitor, a workflow-only capability, or a raw command', () => {
  for (const binding of ASK_DISCOVERY_BINDINGS) {
    const family = getAskOperationDefinition(binding.operationId).family;
    assert.notEqual(family, 'GENERAL_HOME_GUIDANCE', binding.id);
    assert.notEqual(family, 'MONITOR', binding.id);
    if (binding.kind === 'READ') assert.notEqual(family, 'COMMAND', binding.id);
    assert.equal(canonicalCapabilityRegistry.getById(binding.capabilityId).destination.workflowOnly, false, binding.id);
  }
});

test('the write-oriented bindings begin confirmation-gated workflows and state their consequence; the area one is reached only through a selector', () => {
  const governed = ASK_DISCOVERY_BINDINGS.filter((binding) => binding.kind === 'GOVERNED_WORKFLOW');
  assert.deepEqual(governed.map((binding) => binding.id), ['understand-add-detail', 'maintain-create-task']);
  for (const binding of governed) { assert.match(binding.consequence, /confirm/i, binding.id); assert.equal(binding.interactionType, 'START_WORKFLOW', binding.id); }
  assert.deepEqual(ASK_DISCOVERY_BINDINGS.filter((binding) => binding.launch === 'SELECTOR').map((binding) => [binding.id, binding.selectorId]), [['understand-add-detail', 'PROPERTY_AREA'], ['maintain-diy-continue', 'DIY_PROJECT']]);
});

test('an idea that needs a chosen target must name a registered selector for exactly its operation, and the explorer dialog does not host it', () => {
  const selectorBinding = ASK_DISCOVERY_BINDINGS.find((binding) => binding.id === 'maintain-diy-continue');
  const cases = [
    [{ ...selectorBinding, id: 'x-no-selector', selectorId: undefined }, /x-no-selector: a SELECTOR launch must name a registered target selector/],
    [{ ...selectorBinding, id: 'x-wrong-selector', selectorId: 'PROPERTY_AREA' }, /x-wrong-selector: selector PROPERTY_AREA launches PROPERTY_CONTEXT_AREA_CAPTURE, not DIY_PROJECT_GUIDE/],
    [{ ...selectorBinding, id: 'x-stray-selector', launch: 'MESSAGE', operationId: 'DIY_PROJECTS', question: 'Show my DIY projects' }, /x-stray-selector: selectorId is only valid with a SELECTOR launch/],
    [{ ...selectorBinding, id: 'x-not-workflow', interactionType: 'CONVERSATION_CONTINUE' }, /x-not-workflow: a SELECTOR launch starts a workflow/],
  ];
  for (const [binding, expected] of cases) assert.match(issuesFor(binding), expected, binding.id);
  const capabilities = ASK_EXPLORER_GROUPS.map((group) => ({ id: `cap-${group.id}`, outcomeCategory: group.outcomeCategory }));
  const ids = buildAskExplorerGroups(capabilities).flatMap((group) => group.prompts.map((prompt) => prompt.id));
  assert.ok(!ids.includes('maintain-diy-continue') && !ids.includes('understand-add-detail'), 'selector entries are not explorer prompts');
});

test('reviewed out: the fallback repair/replace prompt, the mis-routed reserve plan, the task-picking deadline monitor, and the workflow-only quote review', () => {
  const questions = ASK_DISCOVERY_BINDINGS.map((binding) => binding.question);
  assert.ok(!questions.includes('Help me compare repair and replacement options for a home system or appliance.'));
  assert.ok(!questions.includes('Create a capital reserve plan for future replacements.'));
  assert.ok(!questions.includes('Monitor my important home deadlines.'));
  assert.ok(!ASK_DISCOVERY_BINDINGS.some((binding) => ['HOME_DEADLINE_MONITOR', 'INVENTORY_ITEM_CREATE', 'QUOTE_COMPARISON_REVIEW'].includes(binding.operationId)));
  assert.ok(!ASK_DISCOVERY_BINDINGS.some((binding) => binding.capabilityId === 'quote-comparison'));
});

test('the validator rejects every kind of bad binding', () => {
  const cases = [
    [{ ...base, id: 'x-unknown-cap', capabilityId: 'not-a-capability' }, /x-unknown-cap: unknown capability not-a-capability/],
    [{ ...base, id: 'x-unknown-op', question: 'Something odd', operationId: 'NOT_AN_OPERATION' }, /x-unknown-op: unknown operation/],
    [{ ...base, id: 'x-disagrees', capabilityId: 'maintenance' }, /x-disagrees: the guidance bridge assigns OWNERSHIP_COSTS to ownership-costs, not maintenance/],
    [{ ...base, id: 'x-restated', aliases: ['spending'] }, /x-restated: binding restates canonical metadata \(aliases\)/],
    [{ ...base, id: 'x-restated-group', groupId: 'SAVE' }, /x-restated-group: binding restates canonical metadata \(groupId\)/],
    [{ ...base, id: 'x-label', label: 'Ownership Costs' }, /x-label: label override duplicates the capability's own label/],
    [{ ...base, id: 'x-workflow-only', capabilityId: 'quote-comparison', operationId: 'QUOTE_COMPARISON_REVIEW', question: 'Help me compare contractor quotes.' }, /x-workflow-only: quote-comparison is workflow-only/],
    [{ ...base, id: 'x-drift', question: 'Show my DIY projects' }, /x-drift: question does not resolve to OWNERSHIP_COSTS/],
    [{ ...base, id: 'x-read-command', capabilityId: 'maintenance', operationId: 'MAINTENANCE_TASK_CREATE', question: 'Create a maintenance task', kind: 'READ' }, /x-read-command: a READ entry cannot be the command/],
    [{ ...base, id: 'x-no-consequence', capabilityId: 'maintenance', operationId: 'MAINTENANCE_TASK_CREATE', question: 'Create a maintenance task', kind: 'GOVERNED_WORKFLOW', interactionType: 'START_WORKFLOW' }, /x-no-consequence: a GOVERNED_WORKFLOW must state/],
    [{ ...base, id: 'x-not-command', kind: 'GOVERNED_WORKFLOW', interactionType: 'START_WORKFLOW', consequence: 'Nothing happens until you confirm.' }, /x-not-command: a GOVERNED_WORKFLOW must be a registered/],
    [{ ...base, id: 'x-fallback', question: 'Tell me anything', operationId: 'GROUNDED_GUIDANCE' }, /x-fallback: GROUNDED_GUIDANCE is the grounded-guidance fallback/],
    [{ ...base, id: 'x-internal', capabilityId: 'seasonal-maintenance', operationId: 'SEASONAL_HOME_CARE', question: 'Seasonal please' }, /x-internal: SEASONAL_HOME_CARE is internal-only/],
    [{ ...base, id: 'x-link', label: '/dashboard/costs' }, /x-link: text reads as a non-Ask destination/],
    [{ ...base, id: 'save-costs' }, /duplicate explorer entry id/],
  ];
  for (const [binding, expected] of cases) assert.match(issuesFor(binding), expected, binding.id);
});

test('an operation the guidance bridge does not own cannot be bound', () => {
  assert.equal(ASK_OPERATION_CAPABILITY.HOME_DIGITAL_WILL, 'home-digital-will');
  const unowned = Object.keys(require('../../src/services/ask/askOperationRegistry.ts').ASK_OPERATION_DEFINITIONS).find((id) => !ASK_OPERATION_CAPABILITY[id] && getAskOperationDefinition(id).messageRoutable && getAskOperationDefinition(id).requiresProperty);
  assert.ok(unowned, 'at least one message-routable operation is unowned');
  assert.match(issuesFor({ ...base, id: 'x-unowned-op', operationId: unowned, question: 'anything' }), /x-unowned-op: .* has no capability in the skill guidance bridge/);
});

test('the Concierge Home groups come from the derivation: only groups with catalog capabilities, each prompt carrying label, operation, aliases and any consequence', () => {
  const capabilities = ASK_EXPLORER_GROUPS.map((group) => ({ id: `cap-${group.id}`, outcomeCategory: group.outcomeCategory }));
  const groups = buildAskExplorerGroups(capabilities);
  assert.deepEqual(groups.map((group) => group.id), ['UNDERSTAND', 'MAINTAIN', 'PROTECT', 'SAVE', 'DECIDE', 'PLAN_MONITOR']);
  for (const group of groups) ConciergeHomeCapabilityGroupSchema.parse(group);
  const prompts = groups.flatMap((group) => group.prompts);
  assert.equal(prompts.length, ASK_EXPLORER_ENTRIES.filter((entry) => entry.launch !== 'SELECTOR').length);
  const create = prompts.find((prompt) => prompt.id === 'maintain-create-task');
  assert.equal(create.operationId, 'MAINTENANCE_TASK_CREATE');
  assert.match(create.note, /Nothing is saved until you confirm/);
  assert.ok(create.aliases.includes('upkeep'), 'aliases come from the maintenance capability');
  assert.equal(prompts.find((prompt) => prompt.id === 'protect-coverage').note, undefined);
  assert.deepEqual(buildAskExplorerGroups([{ id: 'only-save', outcomeCategory: 'SAVE_OPTIMIZE' }]).map((group) => group.id), ['SAVE']);
  assert.deepEqual(buildAskExplorerGroups([]), []);
});

test('derivation skips a binding whose capability does not exist, and the validator reports it', () => {
  const ghost = { ...base, id: 'x-ghost', capabilityId: 'not-a-capability' };
  assert.equal(deriveAskExplorerEntries([ghost]).length, 0);
  assert.match(validateAskExplorerRegistry([ghost]).join('\n'), /unknown capability/);
});

test('the capability-card bindings are the same source, unchanged, and validated against the bridge', () => {
  assert.equal(Object.keys(CARD_ENTRY_BINDINGS).length, 33);
  assert.deepEqual(KNOWN_CARD_BRIDGE_DISAGREEMENTS, { documents: 'DOCUMENT_LOOKUP', 'home-records': 'PROPERTY_SUMMARY', 'reserve-fund': 'CAPITAL_RESERVE_PLAN' });
  assert.deepEqual(validateAskCapabilityBindings(), []);
  // An unlisted disagreement, a stale pin, an unknown capability and an unknown operation are each rejected.
  assert.match(validateAskCapabilityBindings({ ...CARD_ENTRY_BINDINGS, maintenance: { operationId: 'OWNERSHIP_COSTS', message: 'x' } }).join('\n'), /card-binding\/maintenance: the guidance bridge assigns OWNERSHIP_COSTS to ownership-costs/);
  assert.match(validateAskCapabilityBindings(CARD_ENTRY_BINDINGS, { ...KNOWN_CARD_BRIDGE_DISAGREEMENTS, maintenance: 'MAINTENANCE_STATUS' }).join('\n'), /card-binding\/maintenance: pinned as a bridge disagreement but now agrees/);
  assert.match(validateAskCapabilityBindings(CARD_ENTRY_BINDINGS, { ...KNOWN_CARD_BRIDGE_DISAGREEMENTS, ghost: 'HOME_ACTIONS' }).join('\n'), /card-binding\/ghost: pinned disagreement/);
  assert.match(validateAskCapabilityBindings({ nope: { operationId: 'HOME_ACTIONS', message: 'x' } }).join('\n'), /card-binding\/nope: unknown capability/);
  assert.match(validateAskCapabilityBindings({ maintenance: { operationId: 'NOT_AN_OPERATION', message: 'x' } }).join('\n'), /unknown operation NOT_AN_OPERATION/);
});
