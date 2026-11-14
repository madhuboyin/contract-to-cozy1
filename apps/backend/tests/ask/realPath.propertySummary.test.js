// FR-GATE-2 real-path evidence for PROPERTY_SUMMARY: the real handler, run through capabilityInvoke for each variant it can answer with, against a fake prisma that answers only the property read and a stubbed property-context
// snapshot (the same boundary the existing property-summary tests use). Nothing here reads handler source text.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register');
const prismaModule = require('../../src/lib/prisma.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const getPropertyContextModule = require('../../src/modules/propertyContext/application/getPropertyContext.ts');
const evaluateModule = require('../../src/modules/propertyContext/application/evaluateFeatureContext.ts');
const { PROPERTY_RECORD_CONTEXT_SCOPES } = require('../../src/services/propertyRecordOverview.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
require('../../src/services/ask/handlers/propertySummary.handler.ts');
const { matchesOperationAnswerContract } = require('../../src/services/ask/answerContract/operationAnswerContract.ts');
const { matchesPropertySummaryAnswerContract } = require('../../src/services/ask/askPropertySummaryIntent.ts');
const { conformRealPath } = require('./support/realPathContract');

const originals = { prisma: prismaModule.prisma, access: propertyAccess.resolvePropertyAccess, context: getPropertyContextModule.getPropertyContext, evaluate: evaluateModule.evaluateFeatureContext };
const PROPERTY = { id: 'p1', name: null, address: '94 Ashford Dr', city: 'Town', state: 'NJ', zipCode: '08000', dwellingType: 'TOWNHOUSE', propertyUse: null, occupancyStatus: null, propertySize: 1933, yearBuilt: 1994, bedrooms: 3, bathrooms: 2.5, heatingType: null, coolingType: null, roofType: null, updatedAt: new Date('2026-09-01T12:00:00Z') };
function install(facts, property, role) {
  const models = { property: { findUnique: async () => property } };
  prismaModule.prisma = new Proxy({}, { get(_target, model) { if (model === 'then') return undefined; if (!models[model]) return new Proxy({}, { get: (_t, method) => async () => { throw new Error(`Unexpected prisma.${String(model)}.${String(method)} call`); } }); return models[model]; } });
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'p1' });
  getPropertyContextModule.getPropertyContext = async () => ({ propertyId: 'p1', contextVersion: 'ctx-1', scopes: PROPERTY_RECORD_CONTEXT_SCOPES, facts });
  evaluateModule.evaluateFeatureContext = async () => ({ contextVersion: 'ctx-1', requirements: [] });
}
test.afterEach(() => { prismaModule.prisma = originals.prisma; propertyAccess.resolvePropertyAccess = originals.access; getPropertyContextModule.getPropertyContext = originals.context; evaluateModule.evaluateFeatureContext = originals.evaluate; });
const run = (message, { facts = { 'core.dwellingType': { state: 'KNOWN' } }, property = PROPERTY, role = 'OWNER' } = {}) => { install(facts, property, role); return capabilityInvoke('PROPERTY_SUMMARY', { userId: 'u1', propertyId: 'p1', message }, { propertyAccess: { role, userId: 'u1', propertyId: 'p1' } }); };

test('PROPERTY_SUMMARY: every variant the real handler answers with conforms, and the typed contract accepts each one', async () => {
  const variants = {
    overview: await run('Tell me about my home'),
    overviewViewer: await run('Tell me about my home', { role: 'VIEWER' }),
    overviewNoRecordedFacts: await run('Tell me about my home', { facts: {}, property: { ...PROPERTY, dwellingType: null, yearBuilt: null, propertySize: null, bedrooms: null, bathrooms: null } }),
    completeness: await run('How complete is my home record?', { facts: { 'core.dwellingType': { state: 'CONFLICTED' } } }),
    browseRecord: await run('Browse my home record'),
  };
  for (const [name, result] of Object.entries(variants)) {
    assert.ok(['ANSWERED', 'READY_WITH_LIMITATIONS'].includes(result.status), `${name}: ${result.status}`);
    assert.equal(matchesPropertySummaryAnswerContract(result), true, `${name}: the typed contract rejects the handler's own answer`);
    // the runtime contract is built from this very evidence, so it can only be checked once the manifest has been regenerated from it
    if (process.env.ASK_REAL_PATH_UPDATE !== '1') assert.equal(matchesOperationAnswerContract('PROPERTY_SUMMARY', result), true, `${name}: the runtime variant contract rejects the handler's own answer`);
  }
  conformRealPath('PROPERTY_SUMMARY', variants, __filename);
});
