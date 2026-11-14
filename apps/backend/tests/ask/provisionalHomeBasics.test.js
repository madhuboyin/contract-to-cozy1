// FR-FAST-10 / FR-GATE-8, slice 5: HOME_BASICS_GUIDE (authored monthly / safety guidance, no recorded data) may be tried provisionally. The real handler runs through capabilityInvoke and its answer goes through the delivery gate.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
require('../../src/services/ask/handlers/homeBasics.handler.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { groundedHomeBasicsVerdict, GROUNDED_READ_CHECKS } = require('../../src/services/ask/support/provisionalRead.ts');
const { isProvisionalReadOperation } = require('../../src/services/ask/fastPath/fastPathCertificates.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');

const invoke = (message, role = 'OWNER') => capabilityInvoke('HOME_BASICS_GUIDE', { userId: 'u1', propertyId: 'p1', message }, { propertyAccess: { role, userId: 'u1', propertyId: 'p1' } });
const gate = (question, result) => validateAskAnswerTrustPipeline({ question, operationId: 'HOME_BASICS_GUIDE', propertyId: 'p1', semanticEnabled: true, provisionalRead: true, result: attachAskAuthoritativeSourceEvidence(result, [completedAskAuthoritativeSourceEvidence('HOME_BASICS_GUIDE')].flat()) });

test('HOME_BASICS_GUIDE is on the allowlist and started for the monthly and safety questions only', () => {
  assert.ok('HOME_BASICS_GUIDE' in GROUNDED_READ_CHECKS); assert.equal(isProvisionalReadOperation('HOME_BASICS_GUIDE'), true);
  for (const m of ['What should I check around my home each month?', 'what should I check each month', 'What home safety basics should I know?', 'a simple monthly routine for my home']) { const d = resolveAskRoutingCascade(m, { localRoutingEnabled: true }); assert.equal(d.stage, 'PROVISIONAL', m); assert.equal(d.operation.operationId, 'HOME_BASICS_GUIDE', m); }
  for (const m of ['Remind me monthly to check my alarms', 'Add a monthly task to check my filters']) { const d = resolveAskRoutingCascade(m, { localRoutingEnabled: true }); assert.notEqual(d.operation?.operationId === 'HOME_BASICS_GUIDE' && d.stage === 'PROVISIONAL', true, m); }
});
test('the real guide answers are delivered, each the guide that was asked for', async () => {
  for (const [q, section] of [['What should I check around my home each month?', 'home-basics-monthly_routine'], ['what should I check each month', 'home-basics-monthly_routine'], ['What home safety basics should I know?', 'home-basics-safety_basics']]) {
    for (const role of ['OWNER', 'VIEWER']) {
      const a = await invoke(q, role); assert.equal(a.blocks.find((b) => b.id === 'home-basics-items').sections[0].id, section, q);
      const c = gate(q, a); assert.equal(c.semantic.outcome, 'PASS', `${q}/${role}: ${JSON.stringify(c.semantic)}`); assert.deepEqual(c.semantic.reasonCodes, ['PROVISIONAL_READ_GROUNDED']);
    }
  }
});
test('the wrong guide, the wrong topic or an unverified shape is withheld', async () => {
  const monthly = await invoke('What should I check around my home each month?'); const safety = await invoke('What home safety basics should I know?');
  const code = (q, a) => groundedHomeBasicsVerdict(q, a).reasonCodes[1];
  assert.equal(code('What home safety basics should I know?', monthly), 'GUIDE_SHOWN_IS_NOT_THE_ONE_ASKED_FOR'); assert.equal(code('what should I check each month', safety), 'GUIDE_SHOWN_IS_NOT_THE_ONE_ASKED_FOR');
  assert.equal(code('When does my warranty expire?', monthly), 'QUESTION_NOT_ABOUT_HOME_BASICS'); assert.equal(code('Remind me monthly to check my alarms', monthly), 'ANOTHER_OPERATION_OWNS_THE_QUESTION');
  assert.equal(code('what should I check each month', { status: 'ANSWERED', blocks: [{ type: 'SUMMARY', id: 'x', title: 't', body: 'b', tone: 'DEFAULT', actions: [] }], suggestions: [] }), 'ANSWER_IS_NOT_A_VERIFIED_VARIANT');
  assert.equal(gate('What home safety basics should I know?', monthly).trust.outcome, 'CLARIFY');
});
