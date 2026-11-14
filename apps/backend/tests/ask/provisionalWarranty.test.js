// FR-FAST-10 / FR-GATE-8, slice 3: WARRANTY_LOOKUP may be tried provisionally because it has a grounded delivery check. The answer is built by the real handler's builder (warrantiesFromRecords, the pure step the registered handler
// calls after its reads) and goes through the delivery gate with `provisionalRead`. The handler's own prisma reads are NOT exercised here.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register');
const { warrantiesFromRecords } = require('../../src/services/ask/handlers/warranties.handler.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { groundedWarrantyVerdict, GROUNDED_READ_CHECKS } = require('../../src/services/ask/support/provisionalRead.ts');
const { isProvisionalReadOperation } = require('../../src/services/ask/fastPath/fastPathCertificates.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');

const NOW = new Date('2026-11-13T12:00:00Z'); const day = (n) => new Date(NOW.getTime() + n * 86_400_000);
const rec = (id, o = {}) => ({ id, propertyId: 'p1', providerName: `Provider ${id}`, category: 'APPLIANCE', coverageDetails: 'Parts and labor', startDate: day(-300), expiryDate: day(300), updatedAt: day(-5), inventoryItem: null, documents: [], ...o });
const RECORDS = () => [rec('a'), rec('b', { expiryDate: day(20), category: 'HVAC' }), rec('c', { expiryDate: day(-40) })];
const build = (message, records = RECORDS()) => warrantiesFromRecords({ message, propertyId: 'p1', records, canWrite: true, ownedIds: new Set(), now: NOW });
const gate = (question, result) => validateAskAnswerTrustPipeline({ question, operationId: 'WARRANTY_LOOKUP', propertyId: 'p1', semanticEnabled: true, provisionalRead: true, result: attachAskAuthoritativeSourceEvidence(result, [completedAskAuthoritativeSourceEvidence('WARRANTY_LOOKUP')].flat()) });

test('WARRANTY_LOOKUP is on the allowlist and the cascade starts it for plain warranty questions only', () => {
  assert.ok('WARRANTY_LOOKUP' in GROUNDED_READ_CHECKS); assert.equal(isProvisionalReadOperation('WARRANTY_LOOKUP'), true);
  for (const m of ['Show my warranties', 'Which warranties expire within 60 days?']) { const d = resolveAskRoutingCascade(m, { localRoutingEnabled: true }); assert.equal(d.stage, 'PROVISIONAL', m); assert.equal(d.operation.operationId, 'WARRANTY_LOOKUP', m); }
  for (const m of ['File a claim for my broken furnace', 'Add a warranty to my home record', 'Correct the expiry date on my warranty', 'Which items are missing warranty coverage?']) { const d = resolveAskRoutingCascade(m, { localRoutingEnabled: true }); assert.notEqual(d.operation?.operationId === 'WARRANTY_LOOKUP' && d.stage === 'PROVISIONAL', true, m); }
});
test('real warranty answers are delivered in the view that was asked for', () => {
  for (const q of ['Show my warranties', 'Which warranties expire within 60 days?', 'Which warranties have expired?', 'What warranties do I have on my HVAC?']) {
    const checked = gate(q, build(q)); assert.equal(checked.semantic.outcome, 'PASS', `${q}: ${JSON.stringify(checked.semantic)}`); assert.deepEqual(checked.semantic.reasonCodes, ['PROVISIONAL_READ_GROUNDED']);
  }
  assert.equal(gate('Show my warranties', build('Show my warranties', [])).semantic.outcome, 'PASS', 'none recorded is an honest, grounded answer');
  assert.equal(gate('Which warranties expire within 60 days?', build('Which warranties expire within 60 days?', [rec('z')])).semantic.outcome, 'PASS', 'a filter that matches nothing is honest');
});
test('an answer that does not match the question is withheld', () => {
  const all = build('Show my warranties'); const expiring = build('Which warranties expire within 60 days?'); const expired = build('Which warranties have expired?');
  const code = (q, a) => groundedWarrantyVerdict(q, a).reasonCodes[1];
  assert.equal(code('Which warranties expire within 60 days?', all), 'VIEW_DOES_NOT_MATCH_EXPIRING_QUESTION'); assert.equal(code('Which warranties have expired?', expiring), 'VIEW_DOES_NOT_MATCH_EXPIRED_QUESTION');
  assert.equal(code('Show my warranties', expiring), 'FILTERED_VIEW_FOR_AN_UNFILTERED_QUESTION');
  assert.equal(code('What maintenance is due?', all), 'QUESTION_NOT_ABOUT_WARRANTIES'); assert.equal(code('File a claim on my warranty', all), 'ANOTHER_OPERATION_OWNS_THE_QUESTION');
  assert.equal(code('Show my warranties', { status: 'ANSWERED', blocks: [{ type: 'SUMMARY', id: 'x', title: 't', body: 'b', tone: 'DEFAULT', actions: [] }], suggestions: [] }), 'ANSWER_IS_NOT_A_VERIFIED_VARIANT');
  assert.equal(gate('Which warranties have expired?', expiring).trust.outcome, 'CLARIFY');
});
