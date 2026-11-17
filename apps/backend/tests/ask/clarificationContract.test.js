const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { findClarificationViolations, enforceClarificationContract, effectiveActionKey } = require('../../src/services/ask/support/clarificationContract.ts');
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
const KNOWN_DEFECTS = {
  sliceNegativeOrCard: ['DUPLICATE_EFFECTIVE_ACTION', 'STORED_CLARIFICATION_MISSING'],
  crossDomainNegativeOrCard: ['NEEDS_CLARIFICATION_WITHOUT_CARD'],
};

test('PRODUCER slice "no A or B" card (F1): the known defects, exactly', () => {
  const r = executeSemanticSlice({ rawText: 'which appliances have no warranty or due maintenance', snapshot: SLICE_SEEDED_PROPERTY_SNAPSHOT, auth: SLICE_OWNER_AUTH }).operationResult;
  assert.deepEqual([...new Set(codes(r))].sort(), [...KNOWN_DEFECTS.sliceNegativeOrCard].sort());
  // At the point a result is stored the card is repaired, so the user never sees buttons that repeat an action or fail.
  const repaired = enforceClarificationContract(r).result;
  assert.deepEqual(codes(repaired), []);
  assert.deepEqual(repaired.clarification.options, []);
});

test('PRODUCER cross-domain "no manual or receipt" clarification (F2): the known defect, exactly', async () => {
  const execution = await X.executeCrossDomainSnapshot({ rawText: 'which appliances have no manual or receipt', snapshot: buildSeededCrossDomainSnapshot(), role: 'OWNER', propertyAuthorized: true });
  const r = X.buildOperationResultFromCrossDomainExecution(execution);
  assert.equal(r.status, 'NEEDS_CLARIFICATION');
  assert.deepEqual([...new Set(codes(r))].sort(), [...KNOWN_DEFECTS.crossDomainNegativeOrCard].sort());
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
