const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// "Select a home" (FRD v1.250): a question that names no home. The answer no longer carries a link to the desktop properties page; the workspace shows
// its own inline home picker for a person who has homes, and a person with none is told to add one from the home menu in the Ask header.
const prismaModule = require('../../src/lib/prisma.ts');
const { needsPropertyResult, capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { validateAskAnswerTrust } = require('../../src/services/ask/askAnswerTrustValidator.ts');

const realPrisma = prismaModule.prisma;
let counts;
test.beforeEach(() => {
  counts = { members: 1, owned: 0, fail: false };
  prismaModule.prisma = {
    householdMember: { count: async () => { if (counts.fail) throw new Error('db down'); return counts.members; } },
    property: { count: async () => { if (counts.fail) throw new Error('db down'); return counts.owned; } },
  };
});
test.afterEach(() => { prismaModule.prisma = realPrisma; });

test('a person with homes is asked to choose one below, with no link out', async () => {
  const result = await needsPropertyResult('u1');
  assert.equal(result.status, 'NEEDS_PROPERTY');
  assert.equal(result.reasonCode, 'ASK_PROPERTY_REQUIRED');
  assert.equal(result.blocks[0].title, 'Choose a home to continue');
  assert.match(result.blocks[0].body, /Choose which one below/);
  assert.deepEqual(result.blocks[0].actions, []);
  assert.doesNotMatch(JSON.stringify(result), /\/dashboard\/|"href"/);
});

test('a home that predates household membership still counts, so that person is not told to add one', async () => {
  counts.members = 0; counts.owned = 1;
  assert.equal((await needsPropertyResult('u1')).blocks[0].title, 'Choose a home to continue');
});

test('a person with no home is told to add one from the home menu in the Ask header', async () => {
  counts.members = 0; counts.owned = 0;
  const result = await needsPropertyResult('u1');
  assert.equal(result.blocks[0].title, 'Add a home to continue');
  assert.match(result.blocks[0].body, /home menu at the top of Ask/);
  assert.deepEqual(result.blocks[0].actions, []);
});

test('a failed lookup, or no user, keeps the ordinary choose-a-home wording rather than telling someone with homes to add one', async () => {
  counts.fail = true;
  assert.equal((await needsPropertyResult('u1')).blocks[0].title, 'Choose a home to continue');
  assert.equal((await needsPropertyResult()).blocks[0].title, 'Choose a home to continue');
});

test('an operation that needs a home, asked with none selected, answers this way and the answer checker leaves it whole', async () => {
  const raw = await capabilityInvoke('MAINTENANCE_STATUS', { userId: 'u1', propertyId: null, message: 'What maintenance is pending?' });
  assert.equal(raw.status, 'NEEDS_PROPERTY');
  const checked = validateAskAnswerTrust({ question: 'What maintenance is pending?', operationId: 'MAINTENANCE_STATUS', propertyId: null, result: raw });
  assert.equal(checked.result.status, 'NEEDS_PROPERTY');
  assert.equal(checked.result.blocks[0].id, 'property-required');
});
