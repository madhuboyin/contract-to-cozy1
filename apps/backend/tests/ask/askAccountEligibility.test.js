const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const {
  ASK_ACCOUNT_ROLE_NOT_ELIGIBLE,
  assertAskAccountRoleEligible,
  isAskAccountRoleEligible,
} = require('../../src/services/ask/askAccountEligibility.ts');
const { requireAskEligibleAccount } = require('../../src/middleware/askAccountEligibility.middleware.ts');

test('Ask Cozy account policy allows homeowners and rejects provider/admin accounts', () => {
  assert.equal(isAskAccountRoleEligible('HOMEOWNER'), true);
  assert.equal(isAskAccountRoleEligible('PROVIDER'), false);
  assert.equal(isAskAccountRoleEligible('ADMIN'), false);
  assert.doesNotThrow(() => assertAskAccountRoleEligible('HOMEOWNER'));
  assert.throws(
    () => assertAskAccountRoleEligible('PROVIDER'),
    (error) => error.code === ASK_ACCOUNT_ROLE_NOT_ELIGIBLE,
  );
  assert.throws(
    () => assertAskAccountRoleEligible('ADMIN'),
    (error) => error.code === ASK_ACCOUNT_ROLE_NOT_ELIGIBLE,
  );
});

test('the account-role guard protects the complete Ask router after authentication', () => {
  const routes = readFileSync(resolve(__dirname, '../../src/routes/ask.routes.ts'), 'utf8');
  const middleware = readFileSync(resolve(__dirname, '../../src/middleware/askAccountEligibility.middleware.ts'), 'utf8');
  const orchestrator = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');

  assert.match(routes, /router\.use\(authenticate, requireAskEligibleAccount\)/);
  assert.match(middleware, /ASK_ACCOUNT_ROLE_NOT_ELIGIBLE/);
  assert.match(middleware, /status\(403\)/);
  assert.match(orchestrator, /ensureAskServiceAccountEligibility\(userId, accountRole\)/);
  assert.match(orchestrator, /assertAskAccountRoleEligible\(role\)/);
});

test('the account-role middleware returns the stable 403 contract and permits homeowners', () => {
  const responseFor = () => {
    const state = { status: null, body: null };
    return {
      state,
      response: {
        status(code) { state.status = code; return this; },
        json(body) { state.body = body; return this; },
      },
    };
  };

  for (const role of ['PROVIDER', 'ADMIN']) {
    const { state, response } = responseFor();
    let continued = false;
    requireAskEligibleAccount({ user: { userId: `${role.toLowerCase()}-1`, role }, ip: '127.0.0.1', path: '/ask/executions', method: 'POST' }, response, () => { continued = true; });
    assert.equal(continued, false);
    assert.equal(state.status, 403);
    assert.equal(state.body.error.code, ASK_ACCOUNT_ROLE_NOT_ELIGIBLE);
    assert.equal(state.body.error.message, 'Ask Cozy is available from a homeowner account.');
  }

  const { state, response } = responseFor();
  let continued = false;
  requireAskEligibleAccount({ user: { userId: 'homeowner-1', role: 'HOMEOWNER' } }, response, () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(state.status, null);
});
