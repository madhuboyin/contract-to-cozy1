// apps/workers/tests/unit/apnsClient.test.js
//
// B4: dependency-free APNs client. Covers config reading, the ES256 provider
// JWT, and terminal-vs-retryable failure classification. Live HTTP/2 delivery
// to Apple is not exercised here.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

require('ts-node/register');
require('tsconfig-paths/register');

const {
  readApnsConfig,
  isApnsDeliveryEnabled,
  buildApnsAuthToken,
  resetApnsAuthTokenCache,
} = require('../../src/lib/apnsClient.ts');

function ecKeyPem() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
}

test('readApnsConfig returns null unless every field is present', () => {
  assert.equal(readApnsConfig({}), null);
  assert.equal(
    readApnsConfig({ APNS_KEY_ID: 'k', APNS_TEAM_ID: 't', APNS_BUNDLE_ID: 'com.x' }),
    null,
  );
  const cfg = readApnsConfig({
    APNS_KEY_ID: 'ABC123',
    APNS_TEAM_ID: 'TEAM99',
    APNS_BUNDLE_ID: 'com.contracttocozy.app',
    APNS_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nMIG...\\n-----END PRIVATE KEY-----',
    APNS_PRODUCTION: 'true',
  });
  assert.equal(cfg.keyId, 'ABC123');
  assert.equal(cfg.bundleId, 'com.contracttocozy.app');
  assert.equal(cfg.production, true);
  // escaped newlines are unescaped for PEM parsing
  assert.ok(cfg.privateKeyPem.includes('\n'));
  assert.ok(!cfg.privateKeyPem.includes('\\n'));
});

test('isApnsDeliveryEnabled requires the explicit flag and complete config', () => {
  const base = {
    APNS_KEY_ID: 'k',
    APNS_TEAM_ID: 't',
    APNS_BUNDLE_ID: 'com.x',
    APNS_PRIVATE_KEY: ecKeyPem(),
    WORKER_OUTBOUND_NOTIFICATIONS_ENABLED: 'true',
  };
  assert.equal(isApnsDeliveryEnabled(base), false); // flag missing
  assert.equal(isApnsDeliveryEnabled({ ...base, APNS_DELIVERY_ENABLED: 'true' }), true);
  assert.equal(
    isApnsDeliveryEnabled({ APNS_DELIVERY_ENABLED: 'true', WORKER_OUTBOUND_NOTIFICATIONS_ENABLED: 'true' }),
    false,
  ); // config incomplete
});

test('buildApnsAuthToken produces a verifiable ES256 JWT', () => {
  resetApnsAuthTokenCache();
  const pem = ecKeyPem();
  const config = {
    keyId: 'KEY123',
    teamId: 'TEAM123',
    bundleId: 'com.contracttocozy.app',
    privateKeyPem: pem,
    production: false,
  };
  const iat = 1_760_000_000;
  const token = buildApnsAuthToken(config, iat);
  const [h, p, sig] = token.split('.');
  assert.equal(token.split('.').length, 3);

  const header = JSON.parse(Buffer.from(h, 'base64url').toString());
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  assert.deepEqual(header, { alg: 'ES256', kid: 'KEY123' });
  assert.deepEqual(claims, { iss: 'TEAM123', iat });

  const verified = crypto.verify(
    'sha256',
    Buffer.from(`${h}.${p}`),
    { key: crypto.createPublicKey(pem), dsaEncoding: 'ieee-p1363' },
    Buffer.from(sig, 'base64url'),
  );
  assert.equal(verified, true);
});
