const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Inventory section 4c: PROPERTY_SUMMARY on an EMPTY home, EXECUTED. The four data dependencies (property row, access, record overview, feature
// context) are stubbed with an empty-property shape; the completeness numbers come from the REAL getContextCompleteness over a snapshot with no
// facts. This proves the handler's own logic yields content for both starter messages and does not throw. It does NOT prove the real data layer
// returns this shape for a real empty property (a run against an empty property still does that).

const registry = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const captured = {};
const originalRegister = registry.registerCapabilityHandler;
registry.registerCapabilityHandler = (key, handler) => { captured[key] = handler; return originalRegister(key, handler); };

const { prisma } = require('../../src/lib/prisma.ts');
const accessModule = require('../../src/services/ask/support/propertyContext.ts');
const featureContextModule = require('../../src/modules/propertyContext/application/evaluateFeatureContext.ts');
const overviewModule = require('../../src/services/propertyRecordOverview.service.ts');
const { getContextCompleteness } = require('../../src/modules/propertyContext/application/getContextCompleteness.ts');
const { PROPERTY_AREA_CAPTURE_SCOPES } = require('../../src/modules/propertyContext/catalog/featureRequirementRegistry.ts');
const { isPropertyCompletenessRequest } = require('../../src/services/ask/askOperationRegistry.ts');

require('../../src/services/ask/handlers/propertySummary.handler.ts');
registry.registerCapabilityHandler = originalRegister;
const handler = captured['property.summary'];

const EMPTY_PROPERTY = {
  id: 'prop-empty', name: null, address: '1 Main St', city: 'Austin', state: 'TX', zipCode: '78701', dwellingType: 'UNKNOWN', propertyUse: 'UNKNOWN',
  occupancyStatus: 'UNKNOWN', propertySize: null, yearBuilt: null, bedrooms: null, bathrooms: null, heatingType: 'UNKNOWN', coolingType: 'UNKNOWN',
  roofType: 'UNKNOWN', updatedAt: new Date('2026-10-01T00:00:00Z'),
};
const emptySnapshot = { propertyId: 'prop-empty', contextVersion: 'ctx-1', scopes: [...PROPERTY_AREA_CAPTURE_SCOPES], facts: {} };
const overview = {
  context: { status: 'AVAILABLE', completeness: getContextCompleteness(emptySnapshot) },
  sections: {
    rooms: { status: 'AVAILABLE', data: { count: 0, items: [] } },
    inventory: { status: 'AVAILABLE', data: { count: 0 } },
    documents: { status: 'AVAILABLE', data: { count: 0, latest: null } },
    household: { status: 'AVAILABLE', data: { count: 1 } },
  },
  tools: { statusBoard: { status: 'AVAILABLE', data: { updatedAt: null } } },
};

async function run(message, role) {
  const restore = [];
  const stub = (target, name, value) => { const original = target[name]; target[name] = value; restore.push(() => { target[name] = original; }); };
  try {
    stub(accessModule, 'ensurePropertyAccess', async () => ({ role }));
    stub(featureContextModule, 'evaluateFeatureContext', async () => ({ requirements: [], contextVersion: 'ctx-1' }));
    stub(overviewModule, 'getPropertyRecordOverview', async () => overview);
    stub(prisma.property, 'findUnique', async () => EMPTY_PROPERTY);
    return await handler({ userId: 'u1', propertyId: 'prop-empty', message, launchContext: null, executionId: 'e1', sessionId: 's1' }, {});
  } finally { for (const undo of restore.reverse()) undo(); }
}

test('the handler was captured and the real completeness of an empty snapshot is 0%', () => {
  assert.equal(typeof handler, 'function');
  assert.equal(overview.context.completeness.completenessPercent < 50, true, `completeness ${overview.context.completeness.completenessPercent}%`);
});

for (const role of ['VIEWER', 'CONTRIBUTOR']) {
  test(`EXECUTED (${role}): the completeness-focus starter message returns content on an empty home, not an empty state`, async () => {
    const message = 'How complete is my home record?';
    assert.equal(isPropertyCompletenessRequest(message), true);
    const result = await run(message, role);
    assert.ok(['ANSWERED', 'READY_WITH_LIMITATIONS'].includes(result.status), result.status);
    const summary = result.blocks[0];
    assert.equal(summary.type, 'SUMMARY');
    assert.match(summary.title, /Property Context is \d+% complete/, summary.title);
    assert.ok(result.blocks.some((block) => block.id === 'property-completeness'), 'the list of areas that can improve is present');
    assert.ok(result.blocks.length >= 3, `${result.blocks.length} blocks`);
    assert.equal(result.blocks[0].type === 'EMPTY_STATE', false);
  });

  test(`EXECUTED (${role}): the plain-summary starter message returns content on an empty home, not an empty state`, async () => {
    const message = 'Give me a summary of my home record';
    assert.equal(isPropertyCompletenessRequest(message), false, 'a different focus from the completeness message');
    const result = await run(message, role);
    assert.ok(['ANSWERED', 'READY_WITH_LIMITATIONS'].includes(result.status), result.status);
    assert.match(result.blocks[0].title, /^Here's the short version of 1 Main St, Austin$/);
    assert.ok(result.blocks.some((block) => block.id === 'property-summary-evidence'), 'record freshness evidence is present');
  });
}

test('the two PROPERTY_SUMMARY starters are genuinely different answers (different focus, title and blocks), not one answer under two labels', async () => {
  const completeness = await run('How complete is my home record?', 'VIEWER');
  const plain = await run('Give me a summary of my home record', 'VIEWER');
  assert.notEqual(completeness.blocks[0].title, plain.blocks[0].title);
  assert.notDeepEqual(completeness.blocks.map((block) => block.id), plain.blocks.map((block) => block.id));
});
