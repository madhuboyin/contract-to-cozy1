// BICC-BUY-008 / BUY-009 / BUY-010 / BUY-003: STATIC guardrails only. They check registry metadata and source text, so they catch a new buyer command that skips the role floor or a
// candidate route registered ahead of the guard; they do NOT prove that no write happens before confirmation or that nothing is sent. That behaviour is checked by the handler-level
// suites (buyerLifecycleConfirmationBoundary, buyerFindingDispositionConfirmationBoundary, buyerViewerRefusalBoundary, buyerWalkthroughCommands and the other per-command suites).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('ts-node/register');
require('../../src/services/ask/askRuntimeBootstrap.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { isAskAccountRoleEligible } = require('../../src/services/ask/askAccountEligibility.ts');

const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
const buyerCommands = Object.values(ASK_OPERATION_DEFINITIONS).filter((d) => d.family === 'COMMAND' && /^(BUYER_|NEGOTIATION_SHIELD_)/.test(d.operationId));

test('there are buyer write operations to check (the guard is not vacuous)', () => {
  assert.ok(buyerCommands.length >= 15, `found ${buyerCommands.length}`);
});

test('every buyer write operation needs a selected property, is a deterministic WRITE, and requires at least contributor access (never viewer)', () => {
  for (const d of buyerCommands) {
    assert.equal(d.requiresProperty, true, `${d.operationId} requires a property`);
    assert.equal(d.semantic.effect, 'WRITE', `${d.operationId} is a write`);
    assert.equal(d.executionMode, 'DETERMINISTIC', `${d.operationId} is deterministic`);
    assert.ok(['CONTRIBUTOR', 'OWNER'].includes(d.propertyRoleFloor), `${d.operationId} floor is ${d.propertyRoleFloor}`);
  }
});

test('STATIC: the contract, disclosure, loan, insurance, walkthrough and lifecycle commands are material decisions and their handlers mention a confirmation preview', () => {
  const material = ['BUYER_CONTRACT_COMMAND', 'BUYER_CLOSING_DISCLOSURE_COMMAND', 'BUYER_LOAN_ESTIMATE_COMMAND', 'BUYER_INSURANCE_COMMAND', 'BUYER_WALKTHROUGH_COMMAND', 'BUYER_LIFECYCLE_UPDATE', 'BUYER_FINDING_DISPOSITION'];
  for (const id of material) assert.equal(ASK_OPERATION_DEFINITIONS[id].safetyClass, 'MATERIAL_DECISION', id);
  for (const file of ['buyerContractCommands', 'buyerClosingDisclosureCommands', 'buyerLoanEstimateCommands', 'buyerInsuranceCommands', 'buyerWalkthroughCommands']) {
    assert.match(read(`src/services/ask/handlers/${file}.handler.ts`), /NEEDS_CONFIRMATION/, `${file} returns a confirmation preview before any write`);
  }
});

test('STATIC: the contract flow tells the buyer it does not review contracts and changes nothing until the draft is confirmed (wording only; this does not inspect outbound calls)', () => {
  const contract = read('src/services/ask/handlers/buyerContractCommands.handler.ts');
  assert.match(contract, /does not review contracts, and this waives nothing/);
  assert.match(contract, /Your plan does not change until you confirm the draft/);
});

test('STATIC: the account rule is homeowner-only on server and client, there is no buyer role, and the candidate routes are registered after the authentication and eligibility guard', () => {
  assert.equal(isAskAccountRoleEligible('HOMEOWNER'), true);
  for (const role of ['PROVIDER', 'ADMIN', 'PROSPECTIVE_BUYER', 'GUEST', '', null, undefined]) assert.equal(isAskAccountRoleEligible(role), false, String(role));
  const routes = read('src/routes/ask.routes.ts');
  const guard = routes.indexOf("router.use('/ask', authenticate, requireAskEligibleAccount)");
  assert.ok(guard > 0, 'the guard is registered');
  for (const route of ["router.get('/ask/candidates'", "router.post('/ask/candidates'", "'/ask/candidates/:candidateId/promotion'", "'/ask/candidates/:candidateId/promoted-record'", "'/ask/candidates/compare'"]) {
    const at = routes.indexOf(route);
    assert.ok(at > guard, `${route} is registered after the authentication and eligibility guard`);
  }
  assert.match(read('../frontend/src/features/ask/accountEligibility.ts'), /HOMEOWNER/, 'the client uses the same rule');
});

test('every buyer write operation is exercised by at least one handler-level test (a new buyer command with no such test fails here)', () => {
  const files = fs.readdirSync(path.join(__dirname)).filter((f) => f.endsWith('.test.js') && f !== 'buyerAuthorizationBoundary.test.js').map((f) => [f, fs.readFileSync(path.join(__dirname, f), 'utf8')]);
  const untested = buyerCommands.map((d) => d.operationId).filter((id) => !files.some(([, text]) => text.includes(id) && /confirmCapabilityInvoke|capabilityInvoke|confirmAskExecution/.test(text)));
  assert.deepEqual(untested, []);
});

test('a candidate is not a property: the candidate API and promotion take no property id from the request, and promotion is not reachable by typing', () => {
  const controller = read('src/controllers/askCandidates.controller.ts');
  assert.doesNotMatch(controller, /req\.params\.propertyId|req\.body\.propertyId|body\(req\)\.propertyId/);
  const promotable = Object.values(ASK_OPERATION_DEFINITIONS).filter((d) => /CANDIDATE.*(PROMOT|CREATE|UPDATE|DELETE)|PROMOT.*CANDIDATE/.test(d.operationId));
  assert.deepEqual(promotable.map((d) => d.operationId), [], 'no Ask operation can create, change, delete or promote a candidate by message (BICC-D38)');
});
