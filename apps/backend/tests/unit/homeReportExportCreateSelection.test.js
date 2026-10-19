const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const aggregationContext = require('../../src/services/aggregationContext/context.ts');
const { analyticsEmitter } = require('../../src/services/analytics');
const { createHomeReportExport } = require('../../src/controllers/homeReportExport.controller.ts');

function run(body, role = 'CONTRIBUTOR') {
  const created = [];
  const saved = { track: analyticsEmitter.track, access: propertyAccess.resolvePropertyAccess, agg: aggregationContext.getAggregationContextEnvelope, hre: prisma.homeReportExport, ev: prisma.homeReportExportEvent };
  analyticsEmitter.track = () => undefined;
  propertyAccess.resolvePropertyAccess = async () => ({ propertyId: 'p1', role });
  aggregationContext.getAggregationContextEnvelope = async () => ({ decision: { status: 'APPLICABLE' } });
  prisma.homeReportExport = { findFirst: async () => null, create: async ({ data }) => { created.push(data); return { id: 'exp-1', status: 'PENDING', ...data }; } };
  prisma.homeReportExportEvent = { create: async () => ({}) };
  const response = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  const request = { params: { propertyId: 'p1' }, body, user: { userId: 'u1' }, headers: {} };
  return createHomeReportExport(request, response).then(() => ({ response, created }), (error) => ({ error, response, created })).finally(() => {
    analyticsEmitter.track = saved.track; propertyAccess.resolvePropertyAccess = saved.access; aggregationContext.getAggregationContextEnvelope = saved.agg; prisma.homeReportExport = saved.hre; prisma.homeReportExportEvent = saved.ev;
  });
}

test('a valid choice is stored normalized with the requested, included, and unavailable sections, and returned for the receipt', async () => {
  const { response, created } = await run({ type: 'HOME_REPORT_PACK', sections: ['coverage', 'timeline', 'inventory'] });
  assert.equal(response.statusCode, 202);
  assert.deepEqual(created[0].sections, { version: 1, requested: ['coverage', 'timeline', 'inventory'], included: ['inventory', 'coverage'], unavailable: [{ id: 'timeline', reason: 'NOT_IN_PACK' }] });
  assert.deepEqual(response.body.data.selection, created[0].sections);
  assert.equal(response.body.data.exportId, 'exp-1');
});

test('the existing Reports page request (a type and no sections) still creates the whole pack', async () => {
  const { response, created } = await run({ type: 'HOME_REPORT_PACK' });
  assert.equal(response.statusCode, 202);
  assert.equal(created[0].sections.included.length, 6);
  assert.deepEqual(created[0].sections.unavailable, []);
  const noBody = await run(undefined);
  assert.equal(noBody.response.statusCode, 202);
});

test('an unknown or malformed choice, or one that leaves nothing, is a 400 and creates no export', async () => {
  for (const sections of [['nope'], 'inventory', [], ['timeline']]) {
    const { response, created } = await run({ sections });
    assert.equal(response.statusCode, 400, JSON.stringify(sections));
    assert.equal(response.body.code, 'EXPORT_SELECTION_INVALID');
    assert.deepEqual(created, []);
  }
  const nothing = await run({ sections: ['timeline', 'permits'] });
  assert.deepEqual(nothing.response.body.data.unavailable, [{ id: 'timeline', reason: 'NOT_IN_PACK' }, { id: 'permits', reason: 'NOT_IN_PACK' }]);
});
