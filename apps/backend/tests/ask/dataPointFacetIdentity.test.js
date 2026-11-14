// Two facets over one clause span stay two components (their own attempts and sections), and a data-point facet's entity reference and allowlisted parameters reach the point reader as words it already understands.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { runComposedTurn, componentKeyOfClause } = require('../../src/services/ask/composition/runComposedTurn.ts');
const { applyLaunchHints, cleanEntityName } = require('../../src/services/ask/dataPoint/dataPointLaunchHints.ts');
const { componentKeyOf } = require('../../src/services/ask/composition/attempts.ts');
const { handleDataPointRead } = require('../../src/services/ask/handlers/dataPointRead.handler.ts');
const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccessService = require('../../src/services/propertyAccess.service.ts');

function fakeDb(rows) { const table = new Map(rows.map((r) => [r.id, { ...r }])); const events = [];
  const matches = (row, where) => Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && 'in' in v ? v.in.includes(row[k]) : row[k] === v));
  return { table, events, askExecution: { async findUnique({ where }) { const r = table.get(where.id); return r ? { ...r } : null; }, async findMany({ where }) { return [...table.values()].filter((r) => matches(r, where)).map((r) => ({ ...r })); }, async update({ where, data }) { const r = table.get(where.id); Object.assign(r, data); return { ...r }; }, async updateMany({ where, data }) { const hit = [...table.values()].filter((r) => matches(r, where)); hit.forEach((r) => Object.assign(r, data)); return { count: hit.length }; } }, askExecutionEvent: { async create({ data }) { events.push(data); return data; } } }; }
const NOW = new Date('2026-11-10T12:00:00Z');
const SPAN = 'When was my furnace installed and last serviced?';

test('a component key includes the data point and entity; a clause with none keeps the key it always had', () => {
  const a = { clause: SPAN, operationId: 'DATA_POINT_READ', confidence: 0.9, dataPointId: 'item.installedOn' };
  const b = { ...a, dataPointId: 'item.lastServicedOn' };
  assert.notEqual(componentKeyOfClause(a), componentKeyOfClause(b));
  assert.notEqual(componentKeyOfClause({ ...a, entityRef: 'furnace' }), componentKeyOfClause({ ...a, entityRef: 'water heater' }));
  assert.equal(componentKeyOfClause({ clause: ' How old is my roof? ', operationId: 'INVENTORY_LOOKUP', confidence: 0.9 }), componentKeyOf('INVENTORY_LOOKUP', { clause: 'how old is my roof?' }), 'unchanged for every existing composite');
});
test('both facets over one clause span are delivered, each with its own section', async () => {
  const db = fakeDb([{ id: 'parent-1', userId: 'u1', clientRequestId: 'req-1', sessionId: 's1', propertyId: 'p1', status: 'RECEIVED', parentRole: null, assemblyVersion: null, parametersJson: null, resultJson: null, reasonCode: null, expiresAt: new Date('2026-12-10T12:00:00Z'), createdAt: NOW }]);
  const calls = []; let n = 0;
  const createChild = async (userId, request, role, internal) => { calls.push(request.launchContext.dataPointId); const id = `child-${++n}`;
    db.table.set(id, { id, userId, clientRequestId: request.clientRequestId, status: 'ANSWERED', parentExecutionId: internal.composition.parentExecutionId, parentRole: 'COMPONENT', reasonCode: null, resultJson: { blocks: [{ type: 'SUMMARY', id: `a${n}`, title: `Answer ${request.launchContext.dataPointId}`, body: 'x', tone: 'DEFAULT', actions: [] }] }, parametersJson: { quantities: [], sources: [{ sourceType: 'InventoryItem', sourceId: 'i1' }] }, expiresAt: internal.composition.expiresAt }); return { executionId: id, status: 'ANSWERED' }; };
  const parent = await runComposedTurn({ db, userId: 'u1', parent: db.table.get('parent-1'), message: SPAN, sessionId: 's1', propertyId: 'p1', createChild, loadAuthorizationView: async () => ({ propertyAccess: true, authorizeSources: async () => 'AUTHORIZED', isOperationAuthorized: () => true }), executionTimeoutMs: 30000, now: () => NOW,
    clauses: [{ clause: SPAN, operationId: 'DATA_POINT_READ', confidence: 0.9, dataPointId: 'item.installedOn', facetId: 'f1' }, { clause: SPAN, operationId: 'DATA_POINT_READ', confidence: 0.9, dataPointId: 'item.lastServicedOn', facetId: 'f2' }] });
  assert.deepEqual(calls.sort(), ['item.installedOn', 'item.lastServicedOn']);
  const titles = parent.resultJson.blocks.map((b) => b.title);
  assert.ok(titles.includes('Answer item.installedOn')); assert.ok(titles.includes('Answer item.lastServicedOn'), 'the second facet is delivered, not lost as a second attempt of the first');
  assert.equal(parent.resultJson.composite.attempts.length, 2); assert.equal(new Set(parent.resultJson.composite.attempts.map((a) => a.componentKey)).size, 2);
});

test('launch hints: the entity a plan carried and an allowlisted tax year become words the reader understands; anything else is refused', () => {
  assert.deepEqual(applyLaunchHints('When was it last serviced?', { entityRef: 'furnace' }), { kind: 'OK', message: 'When was it last serviced for my furnace?' });
  assert.deepEqual(applyLaunchHints('When was my furnace last serviced?', { entityRef: 'furnace' }), { kind: 'OK', message: 'When was my furnace last serviced?' }, 'not added when the clause already names it');
  assert.deepEqual(applyLaunchHints('What is my property tax bill?', { parameters: { taxYear: 2024 } }), { kind: 'OK', message: 'What is my property tax bill for 2024?' });
  assert.deepEqual(applyLaunchHints('What is my property tax bill for 2024?', { parameters: { taxYear: 2024 } }).message, 'What is my property tax bill for 2024?');
  assert.deepEqual(applyLaunchHints('How old is it?', { parameters: { item: 'water heater', note: null, empty: '' } }), { kind: 'OK', message: 'How old is it for my water heater?' });
  assert.deepEqual(applyLaunchHints('Show it', { parameters: { where: 'cost > 5' } }), { kind: 'UNSUPPORTED', keys: ['where'] });
  assert.deepEqual(applyLaunchHints('Show it', { parameters: { taxYear: 1850 } }), { kind: 'UNSUPPORTED', keys: ['taxYear'] }, 'a year outside 2000-2099 is not an allowlisted value');
  assert.equal(applyLaunchHints('Show it', { entityRef: '   ' }).message, 'Show it'); assert.equal(applyLaunchHints('Show it', {}).message, 'Show it');
  assert.equal(cleanEntityName('furnace; DROP TABLE items'), 'furnace DROP TABLE items'); assert.equal(cleanEntityName('x'), null); assert.equal(cleanEntityName(42), null);
});
test('the handler reads the item a plan carried: an elliptical clause with an entity reference is answered, parameters outside the allowlist are still refused', async () => {
  propertyAccessService.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role: 'OWNER', isOwner: true });
  prisma.inventoryItem = { findMany: async () => [{ id: 'i1', name: 'Furnace', lastServicedOn: new Date('2025-02-03'), room: null }, { id: 'i2', name: 'Water Heater', lastServicedOn: null, room: null }] };
  const run = (message, launchContext) => handleDataPointRead({ userId: 'u1', propertyId: 'p1', message, launchContext: { dataPointId: 'item.lastServicedOn', ...launchContext } });
  const bare = await run('When was it last serviced?', {}); assert.notEqual(bare.reasonCode, undefined, 'without the carried entity there is nothing to name');
  const carried = await run('When was it last serviced?', { dataPointEntityRef: 'furnace' });
  assert.equal(carried.status, 'ANSWERED'); assert.match(carried.blocks[0].body, /Furnace/);
  assert.equal((await run('When was it last serviced?', { dataPointEntityRef: 'furnace', dataPointParameters: { item: 'furnace' } })).status, 'ANSWERED');
  assert.equal((await run('When was it last serviced?', { dataPointEntityRef: 'furnace', dataPointParameters: { where: 'x' } })).reasonCode, 'DATA_POINT_PARAMETERS_UNSUPPORTED');
});
