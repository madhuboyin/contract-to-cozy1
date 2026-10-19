const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  ASK_HOMEOWNER_INTERFACE_CONTRACT_VERSION,
  resolveServiceBuildIdentity,
} = require('../../src/config/buildIdentity.ts');

test('build identity resolves deployment metadata without exposing the environment', () => {
  assert.deepEqual(resolveServiceBuildIdentity({
    APP_VERSION: '2.4.1',
    DEPLOYMENT_REVISION: 'abc123',
    BUILD_TIMESTAMP: '2026-10-18T12:30:00-04:00',
    DATABASE_URL: 'must-not-leak',
  }), {
    version: '2.4.1',
    revision: 'abc123',
    builtAt: '2026-10-18T16:30:00.000Z',
    askHomeownerInterfaceContractVersion: ASK_HOMEOWNER_INTERFACE_CONTRACT_VERSION,
  });
});

test('build identity tolerates deployment providers without optional metadata', () => {
  assert.deepEqual(resolveServiceBuildIdentity({ RENDER_GIT_COMMIT: 'render-sha' }), {
    version: '1.0.0',
    revision: 'render-sha',
    builtAt: null,
    askHomeownerInterfaceContractVersion: '1',
  });
});
