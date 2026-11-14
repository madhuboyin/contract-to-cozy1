// FR-FAST-10 / FR-GATE-8 slice 6: PROPERTY_SUMMARY provisional read. Harness as realPath.propertySummary.test.js: the real handler, run through capabilityInvoke for each variant it can answer with, against a fake prisma that answers only the property read and a stubbed property-context
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

const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { groundedPropertySummaryVerdict, GROUNDED_READ_CHECKS } = require('../../src/services/ask/support/provisionalRead.ts');
const { isProvisionalReadOperation } = require('../../src/services/ask/fastPath/fastPathCertificates.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const gate = (question, result) => validateAskAnswerTrustPipeline({ question, operationId: 'PROPERTY_SUMMARY', propertyId: 'p1', semanticEnabled: true, provisionalRead: true, result: attachAskAuthoritativeSourceEvidence(result, [completedAskAuthoritativeSourceEvidence('PROPERTY_SUMMARY')].flat()) });

test('PROPERTY_SUMMARY is on the allowlist and started for plain home questions only', () => {
  assert.ok('PROPERTY_SUMMARY' in GROUNDED_READ_CHECKS); assert.equal(isProvisionalReadOperation('PROPERTY_SUMMARY'), true);
  for (const m of ['Tell me about my home', 'How complete is my home record?', 'Browse my home record']) { const d = resolveAskRoutingCascade(m, { localRoutingEnabled: true }); assert.equal(d.stage, 'PROVISIONAL', m); assert.equal(d.operation.operationId, 'PROPERTY_SUMMARY', m); }
  for (const m of ['Update the year built of my home', 'Export my home record', 'What is my home worth?', 'show me intelligence signals for my property']) { const d = resolveAskRoutingCascade(m, { localRoutingEnabled: true }); assert.notEqual(d.operation?.operationId === 'PROPERTY_SUMMARY' && d.stage === 'PROVISIONAL', true, m); }
});
test('real summary answers are delivered in the view asked for', async () => {
  for (const [q, role] of [['Tell me about my home', 'OWNER'], ['Tell me about my home', 'VIEWER'], ['How complete is my home record?', 'OWNER'], ['Browse my home record', 'OWNER']]) {
    const a = await run(q, { role, facts: { 'core.dwellingType': { state: 'CONFLICTED' } } }); const c = gate(q, a);
    assert.equal(c.semantic.outcome, 'PASS', `${q}/${role}: ${JSON.stringify(c.semantic)}`); assert.deepEqual(c.semantic.reasonCodes, ['PROVISIONAL_READ_GROUNDED']);
  }
});
test('a mismatched answer is withheld', async () => {
  const overview = await run('Tell me about my home'); const complete = await run('How complete is my home record?'); const browse = await run('Browse my home record');
  const code = (q, a) => groundedPropertySummaryVerdict(q, a).reasonCodes[1];
  assert.equal(code('Tell me about my home', complete), 'COMPLETENESS_VIEW_FOR_A_QUESTION_THAT_DID_NOT_ASK_FOR_IT'); assert.equal(code('Tell me about my home', browse), 'RECORD_INDEX_FOR_A_QUESTION_THAT_DID_NOT_ASK_FOR_IT');
  assert.equal(code('How complete is my home record?', overview), 'VIEW_DOES_NOT_MATCH_COMPLETENESS_QUESTION'); assert.equal(code('Browse my home record', overview), 'VIEW_DOES_NOT_MATCH_BROWSE_QUESTION');
  assert.equal(code('When does my warranty expire?', overview), 'QUESTION_NOT_ABOUT_THE_HOME'); assert.equal(code('Export my home record', overview), 'ANOTHER_OPERATION_OWNS_THE_QUESTION');
  assert.equal(code('Tell me about my home', { status: 'ANSWERED', blocks: [{ type: 'SUMMARY', id: 'x', title: 't', body: 'b', tone: 'DEFAULT', actions: [] }], suggestions: [] }), 'ANSWER_IS_NOT_A_VERIFIED_VARIANT');
  assert.equal(gate('How complete is my home record?', overview).trust.outcome, 'CLARIFY');
});
