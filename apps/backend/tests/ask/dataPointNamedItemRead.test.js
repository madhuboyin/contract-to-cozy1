// Live-app false declines: "what is the serial number of my refrigerator?" -> "I'm not sure that answers your question" and
// "when was my furnace installed?" -> "I need a clearer question". The typed stack matched a job family no rollout registers, returned a
// "not yet enabled" non-answer, and the audited single-value reader never ran. A typed plan that executes nothing must fall through.
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const B = '../../src/services/ask/';
const { prisma } = require('../../src/lib/prisma.ts');
const access = require('../../src/services/propertyAccess.service.ts');
const { dataPointReadResult } = require(B + 'handlers/dataPointRead.handler.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require(B + 'askAnswerTrustPolicy.ts');
const { validateAskAnswerTrustPipeline } = require(B + 'askAnswerTrustValidator.ts');

const item = (over) => ({ id: 'i', name: 'Item', category: 'APPLIANCE', serialNumber: null, modelNumber: null, installedOn: null, purchasedOn: null, purchaseCostCents: null, replacementCostCents: null, brand: null, roomId: null, condition: 'GOOD_CONDITION', updatedAt: new Date(), isVerified: true, warrantyApplicabilities: [], ...over });
const ITEMS = [
  item({ id: 'i-fridge', name: 'Refrigerator', serialNumber: 'SN-FRIDGE-1', modelNumber: 'M-100', installedOn: new Date('2019-05-05') }),
  item({ id: 'i-furnace', name: 'Furnace', category: 'HVAC', installedOn: new Date('2014-10-01') }),
  item({ id: 'i-dishwasher', name: 'Dishwasher', modelNumber: 'DW-9' }),
];

async function withStubbedHome(fn) {
  const saved = new Map();
  const savedAccess = access.resolvePropertyAccess;
  for (const key of Object.keys(prisma)) {
    const delegate = prisma[key];
    if (delegate && typeof delegate === 'object' && typeof delegate.findMany === 'function') {
      saved.set(key, { findMany: delegate.findMany, findFirst: delegate.findFirst, findUnique: delegate.findUnique, count: delegate.count });
      delegate.findMany = async () => []; delegate.findFirst = async () => null; delegate.findUnique = async () => null; delegate.count = async () => 0;
    }
  }
  const owner = { findUnique: async () => ({ timezone: 'UTC', role: 'OWNER', isPrimaryOwner: true }), findFirst: async () => null, findMany: async () => ITEMS, count: async () => ITEMS.length };
  for (const key of ['property', 'inventoryItem', 'householdMember']) Object.assign(prisma[key], owner);
  access.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role: 'OWNER', isOwner: true });
  try { return await fn(); } finally {
    for (const [key, original] of saved) Object.assign(prisma[key], original);
    access.resolvePropertyAccess = savedAccess;
  }
}

const deliver = async (question) => {
  const raw = await dataPointReadResult('u1', 'p1', question, null, {});
  const result = attachAskAuthoritativeSourceEvidence(raw, [completedAskAuthoritativeSourceEvidence('DATA_POINT_READ')]);
  // live path for a turn promoted from a fallback: neither provisional nor deterministic
  const out = validateAskAnswerTrustPipeline({ question, operationId: 'DATA_POINT_READ', result, propertyId: 'p1', semanticEnabled: true, routedDeterministically: false, provisionalRead: false });
  return { raw, out };
};

test('named-item single-value reads answer and are delivered (serial, install date, age, model)', async () => {
  await withStubbedHome(async () => {
    const cases = [
      ['what is the serial number of my refrigerator?', /SN-FRIDGE-1/],
      ['when was my furnace installed?', /Oct 1, 2014/],
      ['how old is my refrigerator', /May 5, 2019/],
      ['what is the model number of my dishwasher', /DW-9/],
    ];
    for (const [question, expected] of cases) {
      const { raw, out } = await deliver(question);
      const body = raw.blocks.map((b) => `${b.title ?? ''} ${b.body ?? ''}`).join(' ');
      assert.equal(raw.status, 'ANSWERED', `${question}: ${raw.reasonCode}`);
      assert.match(body, expected, question);
      assert.notEqual(raw.reasonCode, 'CROSS_DOMAIN_PARTIAL', `${question}: the typed stack's "not yet enabled" non-answer must never be the answer`);
      assert.ok(!/not yet enabled/i.test(body), question);
      assert.equal(out.result.status === 'ANSWERED', true, `${question}: withheld (${out.trust.reasonCodes.join(',')} / ${out.result.reasonCode})`);
    }
  });
});

test('a typed plan that DOES execute is still the answer (no accidental fall-through for the executed families)', async () => {
  await withStubbedHome(async () => {
    const { raw } = await deliver('which appliances have no serial number recorded');
    // handled by the typed field-absence job, not the single-value reader
    assert.ok(raw.parameters.semanticExecutionReceipt, 'executed typed answers carry their receipt');
    assert.equal(raw.parameters.semanticExecutionReceipt.predicateIds[0], 'predicate.inventory_item.field_not_recorded');
  });
});
