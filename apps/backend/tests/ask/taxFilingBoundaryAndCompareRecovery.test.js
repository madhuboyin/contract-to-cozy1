const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { resolveAskOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { parseCompareSubjects, unresolvedCompareCopy } = require('../../src/services/ask/support/unresolvedCompare.ts');
const { recoveryCodeForReason } = require('../../src/services/ask/recovery/recoveryOutcomes.ts');

const realPrisma = prismaModule.prisma;
const originalAccess = propertyAccess.resolvePropertyAccess;
test.afterEach(() => { prismaModule.prisma = realPrisma; propertyAccess.resolvePropertyAccess = originalAccess; });

// ---- #19: preparing or filing a tax return
test('#19 a request to prepare or file a tax return is out of scope, and says so in tax terms', async () => {
  for (const message of ['prepare and file my itemized IRS tax return deductions for depreciation', 'help me file my taxes', 'fill out my 1040', 'complete my federal tax return', 'file my schedule A']) {
    assert.equal(resolveAskOperation(message).operationId, 'OUT_OF_SCOPE_BOUNDARY', message);
  }
  const result = await capabilityInvoke('OUT_OF_SCOPE_BOUNDARY', { userId: 'u1', propertyId: 'p1', message: 'prepare and file my itemized IRS tax return deductions for depreciation' });
  assert.equal(result.reasonCode, 'TAX_PREPARATION_NOT_SUPPORTED');
  const block = result.blocks[0];
  assert.equal(block.id, 'out-of-scope-boundary');
  assert.match(block.title, /can’t prepare or file tax returns/);
  assert.match(block.body, /needs a tax professional/);
  assert.deepEqual(block.suggestions, ['Export my home records', 'Show my home improvement costs', 'Should I appeal my property tax assessment?']);
  assert.equal(recoveryCodeForReason('TAX_PREPARATION_NOT_SUPPORTED'), 'OUT_OF_DOMAIN');
});

test('#19 every suggestion it offers routes to something Ask really does', () => {
  assert.equal(resolveAskOperation('Export my home records').operationId, 'HOME_RECORD_EXPORT');
  assert.equal(resolveAskOperation('Show my home improvement costs').operationId, 'OWNERSHIP_COSTS');
  assert.equal(resolveAskOperation('Should I appeal my property tax assessment?').operationId, 'PROPERTY_TAX_APPEAL_READINESS');
});

test('#19 property-tax questions and ordinary tax mentions are NOT turned into the boundary', () => {
  for (const message of ['should I appeal my property tax assessment', 'file a property tax appeal', 'show my property tax bill', 'prepare my property tax appeal', 'does the IRS allow a deduction for solar', 'what is the capital gains tax if I sell', 'how much tax did I pay on my home']) {
    assert.notEqual(resolveAskOperation(message).operationId, 'OUT_OF_SCOPE_BOUNDARY', message);
  }
});

test('#19 the existing out-of-scope copy is unchanged for non-tax requests', async () => {
  const result = await capabilityInvoke('OUT_OF_SCOPE_BOUNDARY', { userId: 'u1', propertyId: 'p1', message: 'write me a program in python' });
  assert.equal(result.reasonCode, 'NOT_HOMEOWNER_DOMAIN');
});

// ---- #20: compare two names nothing recognised
test('#20 "compare X and Y" parses two names; references to the homeowner\'s own records and other shapes do not', () => {
  assert.deepEqual(parseCompareSubjects('compare Harbor and UnknownFakeBuilder'), { left: 'Harbor', right: 'UnknownFakeBuilder' });
  assert.deepEqual(parseCompareSubjects('Can you compare Harbor Builders with Acme Homes?'), { left: 'Harbor Builders', right: 'Acme Homes' });
  for (const message of ['compare my furnace and my water heater', 'compare these two quotes', 'compare the kitchen quotes and the roof quotes', 'what is the serial number of my refrigerator', 'compare', 'compare Harbor']) {
    assert.equal(parseCompareSubjects(message), null, message);
  }
});

test('#20 the answer names what was not recognised and what can be compared, and does not mention a serial number', () => {
  const copy = unresolvedCompareCopy({ left: 'Harbor', right: 'UnknownFakeBuilder' });
  assert.equal(copy.title, 'I couldn’t tell what to compare');
  assert.match(copy.body, /didn’t recognize “Harbor” or “UnknownFakeBuilder” in your home records, so I haven’t compared anything/);
  assert.match(copy.body, /two contractor quotes or two inspection reports/);
  assert.ok(!/serial number/.test(copy.body));
});

test('#20 through the real data-point handler with an empty home, the compare request gets that answer, not the refrigerator example', async () => {
  const empty = { findMany: async () => [], findFirst: async () => null, findUnique: async () => null, count: async () => 0 };
  prismaModule.prisma = new Proxy({}, { get: (_t, model) => (model === 'then' ? undefined : empty) });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'OWNER', userId: 'u1', propertyId: 'p1' });
  const result = await capabilityInvoke('DATA_POINT_READ', { userId: 'u1', propertyId: 'p1', message: 'compare Harbor and UnknownFakeBuilder' });
  assert.equal(result.reasonCode, 'COMPARE_SUBJECTS_NOT_RECOGNIZED');
  assert.ok(!/refrigerator/.test(JSON.stringify(result.blocks)));
});
