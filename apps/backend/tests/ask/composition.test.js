const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { decomposeForComposition } = require('../../src/services/ask/composition/decompose.ts');
const Q = require('../../src/services/ask/composition/quantities.ts');
const C = require('../../src/services/ask/composition/compositeResult.ts');
const A = require('../../src/services/ask/composition/attempts.ts');

// ---------------------------------------------------------------- decomposition (§4.2)
test('FR-DEC: the roof prompt composes two clauses, in order, each a composable read', () => {
  const out = decomposeForComposition('how old is my roof and what would a new one cost');
  assert.equal(out.kind, 'COMPOSE');
  assert.deepEqual(out.clauses.map((c) => c.operationId), ['INVENTORY_LOOKUP', 'ITEM_REPLACEMENT_COST']);
});

test('FR-DEC-0: a safety phrase anywhere governs the whole turn and nothing is routed', () => {
  for (const message of [
    'there is a gas leak in my kitchen and how old is my roof',
    'how old is my roof and what would a new one cost, also there is a fire in the basement right now',
  ]) assert.equal(decomposeForComposition(message).kind === 'COMPOSE', false, message);
});

test('FR-DEC-1/4: more than two parts, a material decision, or a write is not composed and never silently truncated', () => {
  const three = decomposeForComposition('how old is my roof and what would a new one cost and what warranties do I have');
  assert.equal(three.kind, 'NOT_COMPOSED');
  assert.equal(three.reason, 'TOO_MANY_CLAUSES');
  assert.match(three.detail, /3 parts/);
  const material = decomposeForComposition('how old is my roof and should I repair or replace it');
  assert.notEqual(material.kind, 'COMPOSE');
  const write = decomposeForComposition('how old is my roof and add a water heater to my inventory');
  assert.notEqual(write.kind, 'COMPOSE');
});

test('FR-DEC-6: two clauses that resolve to the same operation are one component (the ordinary single path)', () => {
  const out = decomposeForComposition('how old is my roof and how old is my furnace');
  assert.equal(out.kind, 'SINGLE');
  assert.equal(out.reason, 'SAME_OPERATION');
});

test('FR-DEC-6: a funding answer that includes replacement cost stays one component', () => {
  const out = decomposeForComposition('cost to replace roof in 5 yrs and how much i need to save each month');
  assert.equal(out.kind, 'SINGLE');
  assert.equal(out.reason, 'SAME_OPERATION');
});

test('FR-DEC-3: an operation not eligible for this home is not composed', () => {
  const out = decomposeForComposition('how old is my roof and what would a new one cost', { eligibleOperationIds: new Set(['INVENTORY_LOOKUP']) });
  assert.equal(out.kind, 'NOT_COMPOSED');
  assert.equal(out.reason, 'CLAUSE_NOT_ELIGIBLE');
});

test('FR-DEC-7 / FR-ELG-7: coverage is contractual, inactive in v1, and validated against the authority table', () => {
  assert.equal(Q.coverageSkips('INVENTORY_LOOKUP', 'what would a new roof cost?'), false);
  assert.deepEqual(Q.validateCoverageDeclarations(), []);
  const bad = { INVENTORY_LOOKUP: [{ quantityKey: 'item.replacementCost', mode: 'UNDATED', clauseMatches: () => true }] };
  assert.match(Q.validateCoverageDeclarations(bad)[0], /authority is ITEM_REPLACEMENT_COST/);
  const unknown = { ITEM_REPLACEMENT_COST: [{ quantityKey: 'nope', mode: 'UNDATED', clauseMatches: () => true }] };
  assert.match(Q.validateCoverageDeclarations(unknown)[0], /unknown quantity/);
});

// ---------------------------------------------------------------- one basis per quantity (§6.3, §6.6)
const cost = (basis, min, max, extra = {}) => ({ key: 'item.replacementCost', itemKey: 'ROOF', basis, minCents: min, maxCents: max, ...extra });

test('FR-BAS: the authority supplies the line; the same figure on the same basis agrees; the C3 case never shows two unlabeled figures', () => {
  const p = Q.projectBasis([
    { operationId: 'INVENTORY_LOOKUP', quantities: [cost('TODAY', 800_000, 1_500_000)] },
    { operationId: 'ITEM_REPLACEMENT_COST', quantities: [cost('TODAY', 800_000, 1_500_000), cost('WINDOW', 1_660_000, 3_120_000)] },
  ], false);
  assert.equal(p.lines.length, 1);
  assert.equal(p.lines[0].authority, 'ITEM_REPLACEMENT_COST');
  assert.equal(p.lines[0].basisLabel, 'in today’s dollars');
  assert.deepEqual(p.contradictions, []);
});

test('§6.6: a same-basis disagreement beyond rounding is a contradiction; within a dollar it is not', () => {
  const far = Q.projectBasis([
    { operationId: 'INVENTORY_LOOKUP', quantities: [cost('TODAY', 700_000, 1_500_000)] },
    { operationId: 'ITEM_REPLACEMENT_COST', quantities: [cost('TODAY', 800_000, 1_500_000)] },
  ], false);
  assert.equal(far.contradictions.length, 1);
  const near = Q.projectBasis([
    { operationId: 'INVENTORY_LOOKUP', quantities: [cost('TODAY', 800_050, 1_500_000)] },
    { operationId: 'ITEM_REPLACEMENT_COST', quantities: [cost('TODAY', 800_000, 1_500_000)] },
  ], false);
  assert.deepEqual(near.contradictions, []);
});

test('FR-BAS-4/5: a dated question uses the date basis; with no authority each figure is labeled with a note', () => {
  const dated = Q.projectBasis([{ operationId: 'ITEM_REPLACEMENT_COST', quantities: [cost('TODAY', 1, 2), cost('TARGET', 3, 4, { targetLabel: 'in 5 years' })] }], true);
  assert.equal(dated.lines[0].basis, 'TARGET');
  assert.equal(dated.lines[0].basisLabel, 'grown to in 5 years');
  const none = Q.projectBasis([
    { operationId: 'INVENTORY_LOOKUP', quantities: [cost('TODAY', 1, 2)] },
    { operationId: 'WARRANTY_LOOKUP', quantities: [cost('WINDOW', 3, 4)] },
  ], false);
  assert.equal(none.lines.length, 2);
  assert.equal(none.notes.length, 1);
});

test('quantities are read only from a typed declaration', () => {
  assert.deepEqual(Q.quantitiesOf(undefined), []);
  assert.deepEqual(Q.quantitiesOf({ quantities: [{ key: 'nope' }, { key: 'item.replacementCost', itemKey: 'ROOF', basis: 'TODAY', minCents: 1, maxCents: 2 }] }).length, 1);
});

// ---------------------------------------------------------------- status, coverage and clarification (§6.2, §5.2.1)
test('§5.2.1: every execution status maps to one component state; FAILED_RETRYABLE is pending until retries are exhausted', () => {
  const expect = { ANSWERED: 'ANSWERED', COMPLETED: 'ANSWERED', READY_WITH_LIMITATIONS: 'LIMITED', FAILED_TERMINAL: 'FAILED', CANCELLED: 'FAILED', UNAVAILABLE: 'FAILED', BLOCKED: 'FAILED',
    RUNNING: 'PENDING', RECEIVED: 'PENDING', ROUTING: 'PENDING', NEEDS_CLARIFICATION: 'CLARIFICATION', NEEDS_CONTEXT: 'CLARIFICATION', NEEDS_CONFIRMATION: 'VIOLATION', OUTCOME_UNKNOWN: 'VIOLATION' };
  for (const [status, state] of Object.entries(expect)) assert.equal(C.componentStateOf(status), state, status);
  assert.equal(C.componentStateOf('FAILED_RETRYABLE'), 'PENDING');
  assert.equal(C.componentStateOf('FAILED_RETRYABLE', true), 'FAILED');
});

test('§6.2: the status table, including that a retryable child keeps the parent non-terminal', () => {
  assert.deepEqual(C.decideStatus(['ANSWERED', 'ANSWERED']), { kind: 'COMPOSITE', status: 'ANSWERED', coverage: 'COMPLETE' });
  assert.deepEqual(C.decideStatus(['ANSWERED', 'LIMITED']), { kind: 'COMPOSITE', status: 'READY_WITH_LIMITATIONS', coverage: 'COMPLETE' });
  assert.deepEqual(C.decideStatus(['ANSWERED', 'FAILED']), { kind: 'COMPOSITE', status: 'READY_WITH_LIMITATIONS', coverage: 'PARTIAL' });
  assert.deepEqual(C.decideStatus(['FAILED', 'FAILED']), { kind: 'NONE_ANSWERED' });
  assert.deepEqual(C.decideStatus(['ANSWERED', 'PENDING']), { kind: 'PENDING' });
});

test('§6.2: clarification depends on dependency, not position: the same intents give the same result in either order', () => {
  // an independent unresolved clause: partial answer, no questionnaire
  assert.deepEqual(C.decideStatus(['ANSWERED', 'CLARIFICATION']), { kind: 'COMPOSITE', status: 'READY_WITH_LIMITATIONS', coverage: 'PARTIAL' });
  assert.deepEqual(C.decideStatus(['CLARIFICATION', 'ANSWERED']), { kind: 'COMPOSITE', status: 'READY_WITH_LIMITATIONS', coverage: 'PARTIAL' });
  // a clause another depends on is asked alone, whichever position it is in
  assert.deepEqual(C.decideStatus(['CLARIFICATION', 'ANSWERED'], [true, false]), { kind: 'CLARIFY_ALONE', clauseIndex: 0 });
  assert.deepEqual(C.decideStatus(['ANSWERED', 'CLARIFICATION'], [false, true]), { kind: 'CLARIFY_ALONE', clauseIndex: 1 });
  // both unresolved: one clarification, never two
  assert.equal(C.decideStatus(['CLARIFICATION', 'CLARIFICATION']).kind, 'CLARIFY_ALONE');
});

// ---------------------------------------------------------------- assembly, immutability, actions, validator
const block = (type, id, extra = {}) => ({ type, id, ...extra });
const summary = (id, title, actions = []) => block('SUMMARY', id, { title, body: title, tone: 'DEFAULT', actions });
const evidence = (id, items) => block('EVIDENCE', id, { title: 'Sources', items });
const outcome = (operationId, blocks, extra = {}) => ({ clause: `${operationId}?`, operationId, executionId: `e-${operationId}`, attempt: 1, status: 'ANSWERED', blocks, quantities: [], sources: [], ...extra });

const roofOutcomes = () => [
  outcome('INVENTORY_LOOKUP', [
    summary('inventory-roof-profile', 'Your roof is about 7 years old', [
      { id: 'add-inventory-item', label: 'Add an inventory item', interactionType: 'START_WORKFLOW', message: 'Add an item', operationId: 'INVENTORY_ITEM_CREATE' },
      { id: 'show-inventory', label: 'Show inventory', interactionType: 'START_WORKFLOW', message: 'Show inventory', operationId: 'INVENTORY_LOOKUP', style: 'PRIMARY' },
    ]),
  ], { quantities: [cost('TODAY', 800_000, 1_500_000)] }),
  outcome('ITEM_REPLACEMENT_COST', [
    summary('item-cost-summary', 'A new Roof is about $11,500 in today’s dollars', [{ id: 'show-inventory', label: 'Show inventory', interactionType: 'START_WORKFLOW', message: 'Show inventory', operationId: 'INVENTORY_LOOKUP', style: 'PRIMARY' }]),
    block('TABLE', 'item-cost-items', { title: 'The item', columns: [], rows: [{ id: 'r', values: { today: '$8,000–$15,000', atwindow: '$16,600–$31,200' } }], actions: [] }),
    evidence('item-cost-evidence', [{ label: 'Home Capital Timeline', source: '3 items', observedAt: '2026-11-01T00:00:00.000Z' }, { label: 'Home profile', source: 'roof year', observedAt: null }]),
  ], { quantities: [cost('TODAY', 800_000, 1_500_000), cost('WINDOW', 1_660_000, 3_120_000)] }),
];

test('assembly: one composite, validated blocks untouched, one basis, complete coverage', () => {
  const outcomes = roofOutcomes();
  const original = JSON.stringify(outcomes.map((o) => o.blocks));
  const composite = C.assembleComposite({ outcomes, dated: false });
  assert.equal(composite.status, 'ANSWERED');
  assert.equal(composite.coverage, 'COMPLETE');
  assert.equal(composite.sections.length, 2);
  assert.equal(composite.basis.lines.length, 1);
  assert.equal(JSON.stringify(composite.sections.map((s) => s.blocks)), original);
  assert.deepEqual(C.validateComposite(composite), []);
});

test('§6.8/§6.7: the composition validator catches a section altered after validation', () => {
  const composite = C.assembleComposite({ outcomes: roofOutcomes(), dated: false });
  composite.sections[1].blocks[0].title = 'A new Roof is about $1 in today’s dollars';
  assert.ok(C.validateComposite(composite).some((issue) => /altered after validation/.test(issue)));
});

test('§6.5: delivery withholds write offers, de-duplicates actions, keeps one primary, and never edits the validated blocks', () => {
  const composite = C.assembleComposite({ outcomes: roofOutcomes(), dated: false });
  const before = JSON.stringify(composite.sections.map((s) => s.blocks));
  const delivered = C.projectForDelivery(composite);
  assert.equal(JSON.stringify(composite.sections.map((s) => s.blocks)), before, 'originals untouched');
  const ids = delivered.actions.map((a) => a.id);
  assert.ok(!ids.includes('add-inventory-item'), 'the write offer is withheld');
  assert.equal(ids.filter((id) => id === 'show-inventory').length, 1, 'a duplicate action appears once');
  const styles = JSON.stringify(delivered.sections).match(/"style":"PRIMARY"/g) ?? [];
  assert.ok(styles.length <= 1, 'at most one primary action');
  const blockIds = delivered.sections.flatMap((s) => s.blocks.map((b) => b.id));
  assert.equal(new Set(blockIds).size, blockIds.length);
  assert.ok(blockIds.every((id) => /^s[12]-/.test(id)), 'ids are prefixed per section at presentation');
});

test('§6.6/§6.2: a contradiction degrades the composite to limited', () => {
  const outcomes = roofOutcomes();
  outcomes[0].quantities = [cost('TODAY', 100_000, 200_000)];
  const composite = C.assembleComposite({ outcomes, dated: false });
  assert.equal(composite.status, 'READY_WITH_LIMITATIONS');
  assert.ok(composite.basis.contradictions.length === 1);
});

test('FR-NAR-3: the answer-first line is built only from section payloads and never carries a figure they lack', () => {
  const composite = C.assembleComposite({ outcomes: roofOutcomes(), dated: false });
  assert.match(composite.answerFirst, /7 years old/);
  assert.match(composite.answerFirst, /\$11,500/);
  const fabricated = { ...composite, answerFirst: 'A new roof is about $99,999.' };
  assert.ok(C.validateComposite(fabricated).some((issue) => /answer-first figure/.test(issue)));
});

test('§6.9: unknown timestamps stay unknown; freshness is over known timestamps only; request time is never substituted', () => {
  const composite = C.assembleComposite({ outcomes: roofOutcomes(), dated: false });
  assert.equal(composite.freshestAt, '2026-11-01T00:00:00.000Z');
  assert.equal(composite.stalestAt, '2026-11-01T00:00:00.000Z');
  const prov = composite.sections[1].provenance;
  assert.equal(prov.find((p) => p.label === 'Home profile').observedAt, null);
  const none = C.assembleComposite({ outcomes: [outcome('INVENTORY_LOOKUP', [summary('a', 'Your roof is about 7 years old')]), outcome('ITEM_REPLACEMENT_COST', [summary('b', 'A new Roof is about $11,500')])], dated: false });
  assert.equal(none.freshestAt, null);
  assert.equal(none.stalestAt, null);
});

// ---------------------------------------------------------------- the final authorization gate (§6.10)
test('FR-AUT-2: loss of property access withholds the whole composite', async () => {
  const composite = C.assembleComposite({ outcomes: roofOutcomes(), dated: false });
  assert.deepEqual(await C.applyAuthorizationGate(composite, { propertyAccess: false, authorizeSources: async () => 'AUTHORIZED', isOperationAuthorized: () => true }), { kind: 'WITHHELD', reason: 'PROPERTY_ACCESS_LOST' });
});

test('FR-AUT-3/4/5: a role or eligibility change redacts only the affected section and recomputes the answer-first line and basis', async () => {
  const composite = C.assembleComposite({ outcomes: roofOutcomes(), dated: false });
  const out = await C.applyAuthorizationGate(composite, { propertyAccess: true, authorizeSources: async () => 'AUTHORIZED', isOperationAuthorized: (op) => op !== 'ITEM_REPLACEMENT_COST' });
  assert.equal(out.kind, 'DELIVER');
  assert.deepEqual(out.redacted, ['ITEM_REPLACEMENT_COST']);
  assert.equal(out.composite.sections.length, 1);
  assert.equal(out.composite.coverage, 'PARTIAL');
  assert.doesNotMatch(out.composite.answerFirst, /\$11,500/, 'the redacted section\'s figure is gone');
  assert.equal(out.composite.notAnswered[0].reasonCode, 'NOT_AUTHORIZED');
  assert.equal(composite.sections.length, 2, 'the stored composite is unchanged');
  const none = await C.applyAuthorizationGate(composite, { propertyAccess: true, authorizeSources: async () => 'AUTHORIZED', isOperationAuthorized: () => false });
  assert.deepEqual(none, { kind: 'WITHHELD', reason: 'NO_SECTION_AUTHORIZED' });
  const all = await C.applyAuthorizationGate(composite, { propertyAccess: true, authorizeSources: async () => 'AUTHORIZED', isOperationAuthorized: () => true });
  assert.equal(all.composite, composite);
});

// ---------------------------------------------------------------- attempts (§5.2, FR-PER-2/10/13/15/16)
const at = (executionId, number, kind, status, componentKey = 'ITEM_REPLACEMENT_COST|item=roof') => ({ executionId, componentKey, number, kind, status });

test('FR-PER-2: child keys are stable across array order and retries and differ by attempt and component', () => {
  const k1 = A.componentKeyOf('ITEM_REPLACEMENT_COST', { item: 'Roof', date: '' });
  assert.equal(k1, A.componentKeyOf('ITEM_REPLACEMENT_COST', { date: '', item: 'roof' }));
  const id = A.childClientRequestId('req-1', k1, 1);
  assert.equal(id, A.childClientRequestId('req-1', k1, 1));
  assert.notEqual(id, A.childClientRequestId('req-1', k1, 2));
  assert.notEqual(id, A.childClientRequestId('req-2', k1, 1));
  assert.notEqual(id, A.childClientRequestId('req-1', A.componentKeyOf('INVENTORY_LOOKUP', { item: 'roof' }), 1));
  assert.match(id, /^ask-component:[0-9a-f]{24}:attempt:1$/);
});

test('FR-PER-15: two successful attempts select the same result in either completion order', () => {
  const a = at('a', 1, 'INITIAL', 'ANSWERED');
  const b = at('b', 2, 'RETRY', 'ANSWERED');
  const one = A.selectAttempt([a, b]);
  const two = A.selectAttempt([b, a]);
  assert.equal(one.attempt.executionId, 'a');
  assert.equal(one.reason, 'LOWEST_SUCCESSFUL');
  assert.deepEqual(one, two);
});

test('FR-PER-15: an explicit refresh supersedes an earlier success and cannot be replaced by an older completion', () => {
  const sel = A.selectAttempt([at('a', 1, 'INITIAL', 'ANSWERED'), at('r1', 2, 'REFRESH', 'ANSWERED'), at('r2', 3, 'REFRESH', 'ANSWERED'), at('late', 4, 'RETRY', 'ANSWERED')]);
  assert.equal(sel.attempt.executionId, 'r2');
  assert.equal(sel.reason, 'EXPLICIT_REFRESH');
});

test('FR-PER-15: with no success the highest-numbered terminal attempt is selected; with none terminal the component is pending', () => {
  assert.equal(A.selectAttempt([at('a', 1, 'INITIAL', 'FAILED_TERMINAL'), at('b', 2, 'RETRY', 'FAILED_TERMINAL')]).attempt.executionId, 'b');
  assert.equal(A.selectAttempt([at('a', 1, 'INITIAL', 'FAILED_TERMINAL')]).reason, 'ONLY_TERMINAL_LIMITED');
  assert.deepEqual(A.selectAttempt([at('a', 1, 'INITIAL', 'RUNNING')]), { attempt: null, reason: null, pending: true });
  assert.equal(A.selectAttempt([at('a', 1, 'INITIAL', 'FAILED_TERMINAL'), at('b', 2, 'RETRY', 'ANSWERED')]).attempt.executionId, 'b');
});

test('FR-PER-13: the version is null for non-composites, 0 at creation, +1 exactly once per accepted mutation; a null on a composite is an invariant failure', () => {
  assert.throws(() => A.requireVersion({ version: null, attempts: [] }), A.AssemblyInvariantError);
  const s0 = { version: 0, attempts: [] };
  const m1 = A.applyAttemptMutation(s0, 0, at('a', 1, 'INITIAL', 'RUNNING'));
  assert.equal(m1.applied, true);
  assert.equal(m1.state.version, 1);
  // a duplicate completion event is a no-op and leaves the version unchanged
  const dup = A.applyAttemptMutation(m1.state, 1, at('a', 1, 'INITIAL', 'RUNNING'));
  assert.equal(dup.applied, false);
  assert.equal(dup.reason, 'DUPLICATE');
  assert.equal(dup.state.version, 1);
  // a stale expected version applies nothing; the caller re-reads and retries
  const stale = A.applyAttemptMutation(m1.state, 0, at('b', 2, 'RETRY', 'ANSWERED'));
  assert.equal(stale.applied, false);
  assert.equal(stale.reason, 'STALE_VERSION');
  const m2 = A.applyAttemptMutation(m1.state, 1, at('a', 1, 'INITIAL', 'ANSWERED'));
  assert.equal(m2.applied, true);
  assert.equal(m2.state.version, 2);
  assert.equal(m2.state.attempts.length, 1, 'an update replaces, it does not duplicate');
  assert.throws(() => A.applyAttemptMutation({ version: A.MAX_ASSEMBLY_VERSION, attempts: [] }, A.MAX_ASSEMBLY_VERSION, at('x', 1, 'INITIAL', 'RUNNING')), /overflow/);
  assert.equal(A.claimStillValid(2, m2.state), true);
  assert.equal(A.claimStillValid(1, m2.state), false);
  assert.equal(A.nextAttemptNumber(m2.state.attempts, 'ITEM_REPLACEMENT_COST|item=roof'), 2);
});

test('FR-PER-13: two concurrent completions both end up in the attempt set whichever applies first, as one compare-and-set retry apart', () => {
  const base = { version: 0, attempts: [at('a', 1, 'INITIAL', 'RUNNING', 'K1'), at('b', 1, 'INITIAL', 'RUNNING', 'K2')] };
  // both read version 0; the first wins, the second sees STALE_VERSION, re-reads and applies on the new version
  const first = A.applyAttemptMutation(base, 0, at('a', 1, 'INITIAL', 'ANSWERED', 'K1'));
  const second = A.applyAttemptMutation(first.state, 0, at('b', 1, 'INITIAL', 'ANSWERED', 'K2'));
  assert.equal(second.reason, 'STALE_VERSION');
  const retried = A.applyAttemptMutation(first.state, first.state.version, at('b', 1, 'INITIAL', 'ANSWERED', 'K2'));
  assert.equal(retried.state.version, 2);
  assert.deepEqual(retried.state.attempts.map((x) => x.status), ['ANSWERED', 'ANSWERED']);
});

test('FR-PER-16: a retry is rejected when the family is expired or has less than one execution timeout left, and no child outlives its parent', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  const timeout = 30_000;
  assert.deepEqual(A.retryAllowed({ parentExpiresAt: new Date(now.getTime() - 1), now, executionTimeoutMs: timeout }), { allowed: false, reason: 'FAMILY_EXPIRED' });
  assert.deepEqual(A.retryAllowed({ parentExpiresAt: new Date(now.getTime() + 10_000), now, executionTimeoutMs: timeout }), { allowed: false, reason: 'INSUFFICIENT_TIME' });
  assert.deepEqual(A.retryAllowed({ parentExpiresAt: new Date(now.getTime() + 60_000), now, executionTimeoutMs: timeout }), { allowed: true });
  const parent = new Date('2026-12-01T00:00:00Z');
  assert.equal(A.childExpiresAt(parent).getTime(), parent.getTime());
});

// ---------------------------------------------------------------- narration (§9)
test('FR-NAR-2/3: a candidate sentence is accepted only if every figure and name is already in the section payloads; otherwise the template is used', () => {
  const composite = C.assembleComposite({ outcomes: roofOutcomes(), dated: false });
  const template = composite.answerFirst;
  assert.ok(template);
  // a faithful rewording passes
  assert.equal(C.guardedNarration('Your roof is about 7 years old, and a new Roof is about $11,500 in today’s dollars.', composite.sections), 'Your roof is about 7 years old, and a new Roof is about $11,500 in today’s dollars.');
  // an invented figure falls back to the template
  assert.equal(C.guardedNarration('Your roof is about 7 years old and a new one is about $99,999.', composite.sections), template);
  // an invented year, an invented name, an empty or oversized candidate all fall back
  assert.equal(C.guardedNarration('Your roof was installed in 2012.', composite.sections), template);
  assert.equal(C.guardedNarration('Your roof is about 7 years old, as Acme Roofing noted.', composite.sections), template);
  assert.equal(C.guardedNarration('', composite.sections), template);
  assert.equal(C.guardedNarration(null, composite.sections), template);
  assert.equal(C.guardedNarration('Your roof is about 7 years old. ' + 'x'.repeat(500), composite.sections), template);
});

test('FR-NAR-4: narration supplements the blocks and never replaces them', () => {
  const composite = C.assembleComposite({ outcomes: roofOutcomes(), dated: false });
  const delivered = C.projectForDelivery(composite);
  assert.ok(delivered.sections.every((s) => s.blocks.length > 0), 'every section keeps its typed blocks beside the answer-first line');
  assert.ok(delivered.sections.flatMap((s) => s.blocks).some((b) => b.type === 'EVIDENCE'));
});

// ---- review round 3: monotonic selection across generations, dated basis after redaction ----
test('FR-PER-15: a later limited refresh never replaces an earlier answered refresh (three generations)', () => {
  const key = 'ITEM_REPLACEMENT_COST|item=roof';
  const gens = [at('a', 1, 'INITIAL', 'READY_WITH_LIMITATIONS', key), at('b', 2, 'REFRESH', 'ANSWERED', key), at('c', 3, 'REFRESH', 'READY_WITH_LIMITATIONS', key)];
  for (const order of [gens, [...gens].reverse(), [gens[1], gens[2], gens[0]]]) {
    const picked = A.selectAttempt(order);
    assert.equal(picked.attempt.executionId, 'b', 'the answered refresh stays selected');
    assert.equal(picked.reason, 'EXPLICIT_REFRESH');
  }
  assert.equal(A.selectAttempt([at('a', 1, 'INITIAL', 'ANSWERED', key), at('b', 2, 'REFRESH', 'READY_WITH_LIMITATIONS', key)]).attempt.executionId, 'a', 'a limited refresh keeps the answered original');
  assert.equal(A.selectAttempt([at('a', 1, 'INITIAL', 'READY_WITH_LIMITATIONS', key), at('b', 2, 'REFRESH', 'READY_WITH_LIMITATIONS', key)]).attempt.executionId, 'b', 'equal quality: the refresh supersedes');
});

test('§6.3 / FR-AUT-3: a dated composite keeps its dated basis after a section is redacted', async () => {
  const dated = C.assembleComposite({ outcomes: roofOutcomes(), dated: true });
  assert.equal(dated.dated, true);
  const out = await C.applyAuthorizationGate(dated, { propertyAccess: true, isOperationAuthorized: (op) => op !== 'INVENTORY_LOOKUP', authorizeSources: async () => 'AUTHORIZED' });
  const surviving = dated.sections.filter((sec) => sec.operationId !== 'INVENTORY_LOOKUP').map((sec) => ({ operationId: sec.operationId, quantities: sec.quantities }));
  const expected = Q.projectBasis(surviving, true);
  assert.deepEqual(out.composite.basis, expected.lines.length || expected.notes.length ? expected : null, 'projected with the original dated mode, not today’s-dollar authority');
});

test('FR-DEC: "is water heater under warranty, what would be the replacement cost if not" composes warranty + replacement cost, with or without "my"', () => {
  for (const message of [
    'is water heater under warranty, what would be the replacement cost if not',
    'is my water heater under warranty, what would be the replacement cost if not',
  ]) {
    const out = decomposeForComposition(message);
    assert.equal(out.kind, 'COMPOSE', message);
    assert.deepEqual(out.clauses.map((c) => c.operationId), ['WARRANTY_LOOKUP', 'ITEM_REPLACEMENT_COST']);
    assert.match(out.clauses[1].clause, /replacement water heater/i);
  }
});
