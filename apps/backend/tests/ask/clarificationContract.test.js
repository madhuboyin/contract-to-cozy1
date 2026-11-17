const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { findClarificationViolations, enforceClarificationContract, effectiveActionKey, buildPayloadClarification, resolveClarificationChoice } = require('../../src/services/ask/support/clarificationContract.ts');
const { routingClarificationResult } = require('../../src/services/ask/execution/createAskExecution.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { buildDidYouMeanResult } = require('../../src/services/ask/support/didYouMean.ts');
const { durableFreeTextClarification } = require('../../src/services/ask/support/domainHelpers.ts');
const { ASK_ROUTING_CERTIFICATION_FIXTURES, ASK_ROUTING_GENERALIZATION_REGRESSIONS } = require('../../src/services/ask/askTrustCertificationCorpus.ts');
const { executeSemanticSlice } = require('../../src/services/ask/semantic/slice/sliceExecutor.ts');
const { SLICE_SEEDED_PROPERTY_SNAPSHOT, SLICE_OWNER_AUTH } = require('../../src/services/ask/semantic/slice/index.ts');
const X = require('../../src/services/ask/semantic/crossDomain/crossDomainExecutor.ts');
const { buildSeededCrossDomainSnapshot } = require('../../src/services/ask/semantic/crossDomain/index.ts');

// A clarification card is buttons: pressing one forces its operation and re-runs the message. So two options with the same effective action are one choice shown
// twice (the label the user read is discarded), a card with no stored clarification is buttons that fail ("no longer active"), and a card never has exactly one
// option. This file pins the contract and exercises EVERY card producer against it; the known violators are listed and the list may only shrink.
const FUTURE = new Date(Date.now() + 30 * 60 * 1000).toISOString();
const card = (options, extra = {}) => ({ version: 1, question: 'Which?', options, allowFreeText: true, expiresAt: FUTURE, ...extra });
const result = (clarification, parameters) => ({ status: 'NEEDS_CLARIFICATION', blocks: [], suggestions: [], clarification, parameters });
const stored = (clarification, ids) => ({ clarification: { version: clarification.version, expiresAt: clarification.expiresAt, candidateOperationIds: ids } });
const codes = (r) => findClarificationViolations(r).map((v) => v.code);

test('the contract: distinct actions and labels, never one option, and a stored clarification that covers them', () => {
  const ok = card([{ operationId: 'A', label: 'First' }, { operationId: 'B', label: 'Second' }]);
  assert.deepEqual(codes(result(ok, stored(ok, ['A', 'B']))), []);
  const same = card([{ operationId: 'A', label: 'Neither' }, { operationId: 'A', label: 'Either' }]);
  assert.deepEqual(codes(result(same, stored(same, ['A']))), ['DUPLICATE_EFFECTIVE_ACTION']);
  const sameLabel = card([{ operationId: 'A', label: 'Review coverage' }, { operationId: 'B', label: ' review  COVERAGE ' }]);
  assert.deepEqual(codes(result(sameLabel, stored(sameLabel, ['A', 'B']))), ['DUPLICATE_LABEL']);
  const one = card([{ operationId: 'A', label: 'Only' }]);
  assert.deepEqual(codes(result(one, stored(one, ['A']))), ['SINGLE_OPTION']);
  assert.deepEqual(codes(result(ok, undefined)), ['STORED_CLARIFICATION_MISSING']);
  assert.deepEqual(codes(result(ok, stored(ok, ['A']))), ['STORED_OPTIONS_NOT_COVERED']);
  assert.deepEqual(codes(result(ok, { clarification: { version: 2, expiresAt: FUTURE, candidateOperationIds: ['A', 'B'] } })), ['STORED_CLARIFICATION_MISMATCH']);
  assert.deepEqual(codes({ status: 'NEEDS_CLARIFICATION', blocks: [], suggestions: [] }), ['NEEDS_CLARIFICATION_WITHOUT_CARD']);
  assert.deepEqual(codes({ status: 'ANSWERED', blocks: [], suggestions: [] }), []);
  assert.notEqual(effectiveActionKey({ operationId: 'A', label: 'x', payload: { reading: 'EITHER' } }), effectiveActionKey({ operationId: 'A', label: 'y', payload: { reading: 'NEITHER' } }), 'a typed payload makes two options distinct');
});

test('the repair: duplicates collapse, a lone option becomes a free-text question, and the stored clarification is written to match', () => {
  const same = card([{ operationId: 'A', label: 'Neither' }, { operationId: 'A', label: 'Either' }], { allowFreeText: false });
  const repaired = enforceClarificationContract(result(same, { operationId: 'A' }));
  assert.ok(repaired.violations.length > 0);
  assert.deepEqual(repaired.result.clarification.options, [], 'one distinct action is not a choice');
  assert.equal(repaired.result.clarification.allowFreeText, true);
  assert.deepEqual(repaired.result.parameters.clarification.candidateOperationIds, ['A']);
  assert.deepEqual(codes(repaired.result), [], 'the repaired card satisfies the contract');
  assert.deepEqual(enforceClarificationContract(repaired.result).violations, [], 'idempotent');
  const ok = card([{ operationId: 'A', label: 'First' }, { operationId: 'B', label: 'Second' }]);
  const untouched = result(ok, stored(ok, ['A', 'B']));
  assert.equal(enforceClarificationContract(untouched).result, untouched, 'a valid card is returned as is');
  const noStore = enforceClarificationContract(result(ok, undefined)).result;
  assert.deepEqual(noStore.parameters.clarification.candidateOperationIds, ['A', 'B']);
});

// ---- every producer
const LIVE_PROMPTS = ['show appliances lacking protection coverage', 'schedule gutter cleaning next month', 'city approvals still needed for projects', 'active safety notices for my appliances', 'list appliances that have missing documents and are high risk', 'show seller readiness items that involve appliances', 'show seller prep items that cost less than $500 and are high priority'];
const MESSAGES = [...new Set([...ASK_ROUTING_CERTIFICATION_FIXTURES, ...ASK_ROUTING_GENERALIZATION_REGRESSIONS].map((f) => f.message ?? f.prompt ?? f.text).concat(LIVE_PROMPTS))].filter(Boolean);

test('PRODUCER routing clarification (createAskExecution): every card the routing fixtures produce satisfies the contract', () => {
  let cards = 0;
  for (const message of MESSAGES) {
    const decision = resolveAskRoutingCascade(message, { localMinimumConfidence: 0.42, ambiguityMargin: 0.1 });
    if (decision.stage !== 'CLARIFICATION') continue;
    cards += 1;
    assert.deepEqual(codes(routingClarificationResult(decision)), [], message);
  }
  assert.ok(cards >= 10, `the fixtures must actually produce cards (got ${cards})`);
});

test('PRODUCER did-you-mean and free-text clarifications satisfy the contract', () => {
  for (const options of [['MAINTENANCE_STATUS', 'INVENTORY_LOOKUP'], ['WARRANTY_LOOKUP', 'COVERAGE_GAPS', 'RECALL_REVIEW'], ['HOME_ACTIONS', 'PROPERTY_SUMMARY']]) {
    assert.deepEqual(codes(buildDidYouMeanResult(options)), [], options.join(','));
  }
  const free = durableFreeTextClarification('MAINTENANCE_STATUS', 'Which task?');
  assert.deepEqual(codes({ status: 'NEEDS_CLARIFICATION', blocks: [], suggestions: [], ...free }), []);
});

// Known violators. This list may only SHRINK: fixing one makes its assertion fail until the entry is removed, and a new violation fails outright.
const KNOWN_DEFECTS = {};

test('PRODUCER slice "no A or B" card (F1, rebuilt): satisfies the contract, with two typed readings in plain words', () => {
  const r = executeSemanticSlice({ rawText: 'which appliances have no warranty or due maintenance', snapshot: SLICE_SEEDED_PROPERTY_SNAPSHOT, auth: SLICE_OWNER_AUTH }).operationResult;
  assert.deepEqual(codes(r), [], 'no violation: distinct effective actions, a stored clarification that covers them');
  const options = r.clarification.options;
  assert.equal(options.length, 2);
  assert.deepEqual(options.map((o) => o.label), ['Items with no warranty, and items with maintenance due', 'Items with no warranty and no maintenance due']);
  assert.ok(options.every((o) => /^option-\d$/.test(o.optionId)), 'each button has its own id');
  assert.ok(options.every((o) => o.operationId === 'DATA_POINT_READ'), 'an operation that exists (the old card forced INVENTORY_ITEMS_READ, which is not in the registry)');
  assert.ok(!/neither|nor\b|either/i.test(JSON.stringify(r.clarification)), 'no jargon: the labels and the question are plain words');
  assert.ok(!('payload' in options[0]) && !JSON.stringify(r.clarification).includes('BOOLEAN_READING'), 'the typed payload stays on the server');
  const stored = r.parameters.clarification.candidateOptions;
  assert.deepEqual(stored.map((o) => o.payload.reading).sort(), ['EITHER_OR', 'NEITHER_NOR']);
  // The conditions in the order the homeowner named them: negation on the first, the second standing on its own.
  const reversed = executeSemanticSlice({ rawText: 'which appliances have no due maintenance or warranty', snapshot: SLICE_SEEDED_PROPERTY_SNAPSHOT, auth: SLICE_OWNER_AUTH }).operationResult;
  assert.deepEqual(reversed.clarification.options.map((o) => o.label), ['Items with no maintenance due, and items with a warranty', 'Items with no maintenance due and no warranty']);
  // The repair at storage time leaves a valid card alone.
  assert.equal(enforceClarificationContract(r).result, r);
});

test('PRODUCER slice card with a shape it cannot label safely asks a plain free-text question, with no buttons', () => {
  const r = executeSemanticSlice({ rawText: 'which appliances have no warranty or are in the kitchen', snapshot: SLICE_SEEDED_PROPERTY_SNAPSHOT, auth: SLICE_OWNER_AUTH }).operationResult;
  if (r.status === 'NEEDS_CLARIFICATION') {
    assert.deepEqual(r.clarification.options, []);
    assert.equal(r.clarification.allowFreeText, true);
    assert.deepEqual(codes(r), []);
  }
});

test('PRODUCER cross-domain clarifications (F2, rebuilt): "no manual or receipt" is a real card that satisfies the contract', async () => {
  const execution = await X.executeCrossDomainSnapshot({ rawText: 'which appliances have no manual or receipt', snapshot: buildSeededCrossDomainSnapshot(), role: 'OWNER', propertyAuthorized: true });
  const r = X.buildOperationResultFromCrossDomainExecution(execution);
  assert.equal(r.status, 'NEEDS_CLARIFICATION');
  assert.deepEqual(codes(r), [], 'a question always carries a card, and the card satisfies the contract');
  assert.equal(r.clarification.options.length, 2);
});

test('there are no known card defects left: the list is empty and may not grow', () => {
  assert.deepEqual(KNOWN_DEFECTS, {});
});

// A new file that builds cards must be audited here before it can land.
const AUDITED_CARD_PRODUCER_FILES = [
  'askAnswerTrustValidator.ts', 'execution/askFeedback.ts', 'execution/createAskExecution.ts', 'semantic/slice/sliceExecutor.ts', 'support/clarificationContract.ts',
  'support/didYouMean.ts', 'support/domainHelpers.ts',
];
test('STRUCTURAL GUARD: only audited files build clarification cards', () => {
  const root = path.join(__dirname, '../../src/services/ask');
  const found = [];
  const walk = (dir) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (entry.name.endsWith('.ts') && /\ballowFreeText\s*:/.test(fs.readFileSync(full, 'utf8'))) found.push(path.relative(root, full)); } };
  walk(root);
  assert.deepEqual(found.sort(), [...AUDITED_CARD_PRODUCER_FILES].sort(), 'a file that builds a clarification card is not in the audited list (add it, with a producer test above)');
});


test('the press is resolved on the server: a typed option by its id, never a payload from the client, and a bare operation press that cannot say which option is refused', () => {
  const built = buildPayloadClarification({ question: 'Which?', options: [
    { operationId: 'DATA_POINT_READ', label: 'Either', payload: { kind: 'BOOLEAN_READING', reading: 'EITHER_OR' } },
    { operationId: 'DATA_POINT_READ', label: 'Neither', payload: { kind: 'BOOLEAN_READING', reading: 'NEITHER_NOR' } },
  ] });
  const stored = built.parameters.clarification;
  const first = resolveClarificationChoice(stored, { optionId: 'option-1' });
  assert.deepEqual([first.ok, first.operationId, first.payload.reading], [true, 'DATA_POINT_READ', 'EITHER_OR']);
  assert.equal(resolveClarificationChoice(stored, { optionId: 'option-2' }).payload.reading, 'NEITHER_NOR');
  assert.deepEqual(resolveClarificationChoice(stored, { optionId: 'option-9' }), { ok: false, code: 'INVALID_OPTION' });
  assert.deepEqual(resolveClarificationChoice(stored, { operationId: 'DATA_POINT_READ' }), { ok: false, code: 'AMBIGUOUS_OPERATION_PRESS' });
  const plain = resolveClarificationChoice({ version: 1, expiresAt: FUTURE, candidateOperationIds: ['A', 'B'] }, { operationId: 'A' });
  assert.deepEqual([plain.ok, plain.operationId, plain.payload], [true, 'A', null], 'a plain card is unchanged');
  assert.equal(resolveClarificationChoice({ ...stored, candidateOptions: [{ optionId: 'option-1', operationId: 'X', payload: { kind: 'DROP_TABLE' } }] }, { optionId: 'option-1' }).ok, false, 'an unknown payload kind is never accepted');
});

test('the builder cannot build a card that violates the contract', () => {
  const p = { kind: 'BOOLEAN_READING', reading: 'EITHER_OR' };
  assert.throws(() => buildPayloadClarification({ question: 'Which?', options: [{ operationId: 'A', label: 'One', payload: p }, { operationId: 'A', label: 'Two', payload: p }] }), /DUPLICATE_EFFECTIVE_ACTION/);
  assert.throws(() => buildPayloadClarification({ question: 'Which?', options: [{ operationId: 'A', label: 'One', payload: { kind: 'NOPE' } }, { operationId: 'A', label: 'Two', payload: p }] }));
});

// ---- end to end through the registered data-point handler: the chosen reading is applied to the same message
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const realPrisma = prismaModule.prisma;
const originalAccess = propertyAccess.resolvePropertyAccess;
test.afterEach(() => { prismaModule.prisma = realPrisma; propertyAccess.resolvePropertyAccess = originalAccess; });

function installHome() {
  const empty = { findMany: async () => [], findFirst: async () => null, findUnique: async () => null, count: async () => 0 };
  const item = (id, name, coverageEvidenceStatus) => ({ id, propertyId: 'p1', name, category: 'APPLIANCE', brand: null, modelNumber: null, serialNumber: null, purchaseCostCents: null, replacementCostCents: null, installedOn: null, condition: 'GOOD_CONDITION', roomId: null, coverageEvidenceStatus, warrantyApplicabilities: [] });
  const items = [item('dish', 'Dishwasher', 'NONE'), item('heater', 'Water Heater', 'VERIFIED'), item('furnace', 'Furnace', 'NONE'), item('washer', 'Washer', 'NONE')];
  const tasks = [{ id: 't1', propertyId: 'p1', title: 'Service', status: 'PENDING', priority: 'MEDIUM', nextDueDate: new Date('2026-12-01'), inventoryItemId: 'furnace' }];
  prismaModule.prisma = new Proxy({}, { get: (_t, m) => (m === 'then' ? undefined : m === '$disconnect' ? (async () => {})
    : m === 'inventoryItem' ? { ...empty, findMany: async () => items }
    : m === 'warranty' ? { ...empty, findMany: async () => [{ id: 'w1', inventoryItemId: 'heater' }] }
    : m === 'propertyMaintenanceTask' ? { ...empty, findMany: async () => tasks }
    : m === 'property' ? { ...empty, findUnique: async () => ({ id: 'p1', timezone: 'UTC' }) } : empty) });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'OWNER', userId: 'u1', propertyId: 'p1' });
}
const ask = (suppliedInput) => capabilityInvoke('DATA_POINT_READ', { userId: 'u1', propertyId: 'p1', message: 'which appliances have no warranty or due maintenance', ...(suppliedInput ? { suppliedInput } : {}) });
const names = (r) => (r.blocks.find((b) => b.type === 'GROUPED_LIST')?.sections ?? []).flatMap((section) => section.items.map((i) => i.title)).sort();

test('END TO END: with no choice the question is asked; each reading then gives its own hand-computed answer', async () => {
  installHome();
  const asked = await ask();
  assert.equal(asked.status, 'NEEDS_CLARIFICATION');
  assert.equal(asked.clarification.options.length, 2);
  const either = await ask({ clarifiedReading: 'EITHER_OR' });
  assert.equal(either.status, 'ANSWERED');
  assert.deepEqual(names(either), ['Dishwasher', 'Furnace', 'Washer'], 'no warranty, plus maintenance due');
  const neither = await ask({ clarifiedReading: 'NEITHER_NOR' });
  assert.deepEqual(names(neither), ['Dishwasher', 'Washer'], 'no warranty and no maintenance due');
  const bogus = await ask({ clarifiedReading: 'SOMETHING_ELSE' });
  assert.equal(bogus.status, 'NEEDS_CLARIFICATION', 'an unknown reading is ignored, never applied');
});
