const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const X = require('../../src/services/ask/semantic/crossDomain/crossDomainExecutor.ts');
const { buildSeededCrossDomainSnapshot } = require('../../src/services/ask/semantic/crossDomain/index.ts');
const { findClarificationViolations, resolveClarificationChoice, suppliedInputFromPayload, clarifiedDocumentModeFrom, clarifiedQuoteIdsFrom, enforceClarificationContract } = require('../../src/services/ask/support/clarificationContract.ts');

// The cross-domain clarifications used to be no card at all: a differently shaped object in `parameters`, two plain strings as "options" and nothing to press. Each is now a
// real card whose buttons carry a typed choice that is re-applied to the original message. (UNRESOLVED_FOLLOW_UP_INPUT was a reason code nothing produced; it is removed.)
const base = buildSeededCrossDomainSnapshot();
// Seeded home: Furnace (no manual, no receipt), Water Heater (manual only), Dishwasher (both).
const run = (rawText, snapshot = base, extra = {}) => X.executeCrossDomainSnapshot({ rawText, snapshot, role: 'OWNER', propertyAuthorized: true, ...extra });
const card = async (rawText, snapshot) => X.buildOperationResultFromCrossDomainExecution(await run(rawText, snapshot));
const names = (execution, snapshot = base) => execution.facetResults.flatMap((f) => f.recordIds).map((id) => snapshot.extendedItems.find((i) => i.id === id)?.name).sort();
const codes = (r) => findClarificationViolations(r).map((v) => v.code);

test('"no manual or receipt": two typed readings in plain words, nothing raw, and a card that satisfies the contract', async () => {
  const r = await card('which appliances have no manual or receipt');
  assert.equal(r.status, 'NEEDS_CLARIFICATION');
  assert.deepEqual(codes(r), []);
  assert.deepEqual(r.clarification.options.map((o) => o.label), ['Items missing a manual or a receipt (at least one)', 'Items missing both a manual and a receipt']);
  assert.deepEqual(r.parameters.clarification.candidateOptions.map((o) => o.payload.mode).sort(), ['BOTH_MISSING', 'EITHER_MISSING']);
  const text = JSON.stringify(r.clarification);
  assert.ok(!/MISSING_EITHER_DOCUMENT|MISSING_BOTH_DOCUMENTS|BOOLEAN|DOCUMENT_MISSING/.test(text), 'no internal token reaches the homeowner or the client');
  assert.equal(r.parameters.clarification.reasonCode, undefined, 'the stored clarification is the card\'s, not the raw cross-domain object');
});

test('each reading is applied to the same message, hand-computed: at least one missing vs both missing', async () => {
  const either = await run('which appliances have no manual or receipt', base, { documentMode: 'EITHER_MISSING' });
  assert.equal(either.status, 'ANSWERED');
  assert.deepEqual(names(either), ['Furnace', 'Water Heater'], 'the Water Heater has a manual but no receipt');
  assert.match(either.answer, /are missing a manual, a receipt, or both: /);
  const both = await run('which appliances have no manual or receipt', base, { documentMode: 'BOTH_MISSING' });
  assert.deepEqual(names(both), ['Furnace']);
  assert.match(both.answer, /have neither a manual nor a receipt/);
  assert.equal((await run('which appliances have neither a manual nor a receipt')).answer.includes('Furnace'), true, 'the existing "neither … nor" answer is unchanged');
});

const quote = (id, vendorName, amountCents, timelineDays = 20) => ({ id, propertyId: base.propertyId, roomTag: 'Kitchen', vendorName, amountCents, timelineDays, warrantyMonths: 12 });
const withQuotes = (...quotes) => ({ ...base, contractorQuotes: quotes });
const THREE = withQuotes(quote('q1', 'Harbor Kitchen Craft', 2850000), quote('q2', 'Summit Remodelers', 3120000), quote('q3', 'Granite and Oak', 2990000));

test('three quotes match: the card offers the three pairs, each a typed pair of ids', async () => {
  const r = await card('compare the kitchen quotes', THREE);
  assert.equal(r.status, 'NEEDS_CLARIFICATION');
  assert.deepEqual(codes(r), []);
  assert.equal(r.clarification.options.length, 3);
  const pairs = r.parameters.clarification.candidateOptions.map((o) => o.payload.quoteIds.join('+')).sort();
  assert.deepEqual(pairs, ['q1+q2', 'q1+q3', 'q2+q3']);
  assert.ok(r.clarification.options.every((o) => / vs /.test(o.label) && /\$/.test(o.label)), 'each button names both contractors and their amounts');
  assert.ok(!JSON.stringify(r.clarification).includes('QUOTE_PAIR'), 'the typed payload stays on the server');
});

test('a chosen pair compares exactly those two quotes; ids that are not this home\'s compare nothing', async () => {
  const picked = await run('compare the kitchen quotes', THREE, { boundQuoteIds: ['q1', 'q3'] });
  assert.equal(picked.status, 'ANSWERED');
  assert.match(picked.answer, /^Compared Harbor Kitchen Craft \(\$28500\.00\) vs Granite and Oak \(\$29900\.00\)/);
  const foreign = await run('compare the kitchen quotes', THREE, { boundQuoteIds: ['other-home-1', 'other-home-2'] });
  assert.notEqual(foreign.status, 'ANSWERED', 'a pair that does not resolve against this home\'s quotes is not compared');
  assert.ok(!/Compared /.test(foreign.answer));
});

test('more candidates than a card can hold as pairs, or pairs that read the same, ask a plain question instead (never a broken card)', async () => {
  const four = await card('compare the kitchen quotes', withQuotes(quote('q1', 'A Builders', 100), quote('q2', 'B Builders', 200), quote('q3', 'C Builders', 300), quote('q4', 'D Builders', 400)));
  assert.equal(four.status, 'NEEDS_CLARIFICATION');
  assert.deepEqual(four.clarification.options, []);
  assert.equal(four.clarification.allowFreeText, true);
  assert.deepEqual(codes(four), []);
  assert.match(four.clarification.question, /Tell me the two contractors/);
  const same = await card('compare the kitchen quotes', withQuotes(quote('q1', 'Acme', 500), quote('q2', 'Acme', 500), quote('q3', 'Acme', 500)));
  assert.deepEqual(same.clarification.options, [], 'three identical-looking pairs are not a choice');
  assert.deepEqual(codes(same), []);
});

test('the press is resolved on the server for the new kinds, and only a well-formed choice reaches the operation', async () => {
  const r = await card('compare the kitchen quotes', THREE);
  const stored = r.parameters.clarification;
  const chosen = resolveClarificationChoice(stored, { optionId: r.clarification.options[1].optionId });
  assert.equal(chosen.ok, true);
  assert.deepEqual(suppliedInputFromPayload(chosen.payload), { clarifiedQuoteIds: chosen.payload.quoteIds });
  assert.deepEqual(suppliedInputFromPayload({ kind: 'DOCUMENT_MISSING', mode: 'BOTH_MISSING' }), { clarifiedDocumentMode: 'BOTH_MISSING' });
  assert.equal(suppliedInputFromPayload(null), undefined);
  assert.equal(clarifiedDocumentModeFrom({ clarifiedDocumentMode: 'EITHER_MISSING' }), 'EITHER_MISSING');
  assert.equal(clarifiedDocumentModeFrom({ clarifiedDocumentMode: 'DROP' }), undefined);
  assert.deepEqual(clarifiedQuoteIdsFrom({ clarifiedQuoteIds: ['a', 'b'] }), ['a', 'b']);
  assert.equal(clarifiedQuoteIdsFrom({ clarifiedQuoteIds: ['a', 'a'] }), undefined, 'the same quote twice is not a pair');
  assert.equal(clarifiedQuoteIdsFrom({ clarifiedQuoteIds: ['a'] }), undefined);
  assert.equal(enforceClarificationContract(r).result, r, 'a valid card is left alone');
});

test('through the on-property entry the chosen reading is re-applied to the message (parse, data load and execution)', async () => {
  const onProperty = await X.executeCrossDomainOnProperty({ propertyId: base.propertyId, userId: 'u1', role: 'OWNER', propertyAuthorized: true, rawText: 'which appliances have no manual or receipt', snapshotOverride: base, documentMode: 'BOTH_MISSING' });
  assert.equal(onProperty.execution.status, 'ANSWERED');
  assert.deepEqual(names(onProperty.execution), ['Furnace']);
  const asked = await X.executeCrossDomainOnProperty({ propertyId: base.propertyId, userId: 'u1', role: 'OWNER', propertyAuthorized: true, rawText: 'which appliances have no manual or receipt', snapshotOverride: base });
  assert.equal(asked.operationResult.status, 'NEEDS_CLARIFICATION');
});

// ---- end to end through the registered data-point handler against a fake database: the typed choice travels envelope -> handler -> cross-domain parse, load and execution
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const realPrisma = prismaModule.prisma;
const originalAccess = propertyAccess.resolvePropertyAccess;
test.afterEach(() => { prismaModule.prisma = realPrisma; propertyAccess.resolvePropertyAccess = originalAccess; });

function installHome() {
  const empty = { findMany: async () => [], findFirst: async () => null, findUnique: async () => null, count: async () => 0 };
  const item = (id, name) => ({ id, propertyId: 'p1', name, category: 'APPLIANCE', brand: null, modelNumber: null, serialNumber: null, purchaseCostCents: null, replacementCostCents: null, installedOn: null, condition: 'GOOD_CONDITION', roomId: null, coverageEvidenceStatus: 'NONE', warrantyApplicabilities: [] });
  const doc = (id, inventoryItemId, name) => ({ id, propertyId: 'p1', inventoryItemId, name, description: null, type: 'OTHER', metadata: null, deletedAt: null });
  const items = [item('dish', 'Dishwasher'), item('heater', 'Water Heater'), item('furnace', 'Furnace')];
  const docs = [doc('d1', 'dish', 'Owner manual'), doc('d2', 'dish', 'Purchase receipt'), doc('d3', 'heater', 'Owner manual')];
  prismaModule.prisma = new Proxy({}, { get: (_t, m) => (m === 'then' ? undefined : m === '$disconnect' ? (async () => {})
    : m === 'inventoryItem' ? { ...empty, findMany: async () => items }
    : m === 'document' ? { ...empty, findMany: async () => docs }
    : m === 'property' ? { ...empty, findUnique: async () => ({ id: 'p1', timezone: 'UTC' }) } : empty) });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'OWNER', userId: 'u1', propertyId: 'p1' });
}
const ask = (suppliedInput) => capabilityInvoke('DATA_POINT_READ', { userId: 'u1', propertyId: 'p1', message: 'which appliances have no manual or receipt', ...(suppliedInput ? { suppliedInput } : {}) });
const titles = (r) => JSON.stringify(r.blocks);

test('END TO END: no choice asks the typed question; each document mode then answers from the home record', async () => {
  installHome();
  const asked = await ask();
  assert.equal(asked.status, 'NEEDS_CLARIFICATION');
  assert.equal(asked.clarification.options.length, 2);
  const either = await ask({ clarifiedDocumentMode: 'EITHER_MISSING' });
  assert.equal(either.status, 'ANSWERED');
  assert.ok(titles(either).includes('Furnace') && titles(either).includes('Water Heater') && !titles(either).includes('Dishwasher'), 'missing a manual or a receipt: Furnace and Water Heater, not the Dishwasher');
  const both = await ask({ clarifiedDocumentMode: 'BOTH_MISSING' });
  assert.ok(titles(both).includes('Furnace') && !titles(both).includes('Water Heater') && !titles(both).includes('Dishwasher'), 'missing both: the Furnace only');
  assert.equal((await ask({ clarifiedDocumentMode: 'NOT_A_MODE' })).status, 'NEEDS_CLARIFICATION', 'an unknown mode is ignored, never applied');
});
