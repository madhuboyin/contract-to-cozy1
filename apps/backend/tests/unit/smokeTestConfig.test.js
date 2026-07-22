// apps/backend/tests/unit/smokeTestConfig.test.js
//
// W6 item 2: property + internal-email allowlists for controlled smoke
// validation. Deliberately env-var-based, read fresh on every call (no
// caching) so an operator can adjust it without a restart.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function withEnv(overrides, fn) {
  const originals = {};
  for (const key of Object.keys(overrides)) {
    originals[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  return (async () => {
    try {
      return await fn();
    } finally {
      for (const key of Object.keys(originals)) {
        if (originals[key] === undefined) delete process.env[key];
        else process.env[key] = originals[key];
      }
    }
  })();
}

function loadModule() {
  const path = require.resolve('../../src/config/smokeTestConfig.ts');
  delete require.cache[path];
  return require(path);
}

test('empty env: both allowlists are empty and nothing is allowlisted', async () => {
  await withEnv(
    { SMOKE_TEST_PROPERTY_ALLOWLIST: undefined, SMOKE_TEST_RECIPIENT_EMAIL_ALLOWLIST: undefined },
    async () => {
      const { getSmokeTestConfig, isPropertyAllowlisted, isRecipientAllowlisted, isSmokeAllowlistConfigured } = loadModule();
      const config = getSmokeTestConfig();
      assert.equal(config.propertyAllowlist.size, 0);
      assert.equal(config.recipientAllowlist.size, 0);
      assert.equal(isPropertyAllowlisted('property-1'), false);
      assert.equal(isRecipientAllowlisted('a@example.com'), false);
      assert.equal(isSmokeAllowlistConfigured(), false);
    },
  );
});

test('parses a comma-separated list, trims whitespace, drops empty entries', async () => {
  await withEnv({ SMOKE_TEST_PROPERTY_ALLOWLIST: ' property-1, property-2 ,,property-3' }, async () => {
    const { getSmokeTestConfig } = loadModule();
    const config = getSmokeTestConfig();
    assert.deepEqual([...config.propertyAllowlist].sort(), ['property-1', 'property-2', 'property-3']);
  });
});

test('recipient allowlist matching is case-insensitive', async () => {
  await withEnv({ SMOKE_TEST_RECIPIENT_EMAIL_ALLOWLIST: 'Ops@Example.com' }, async () => {
    const { isRecipientAllowlisted } = loadModule();
    assert.equal(isRecipientAllowlisted('ops@example.com'), true);
    assert.equal(isRecipientAllowlisted('OPS@EXAMPLE.COM'), true);
    assert.equal(isRecipientAllowlisted('someone-else@example.com'), false);
  });
});

test('isPropertyAllowlisted / isRecipientAllowlisted are false for null/undefined input', async () => {
  await withEnv({ SMOKE_TEST_PROPERTY_ALLOWLIST: 'property-1' }, async () => {
    const { isPropertyAllowlisted, isRecipientAllowlisted } = loadModule();
    assert.equal(isPropertyAllowlisted(null), false);
    assert.equal(isPropertyAllowlisted(undefined), false);
    assert.equal(isRecipientAllowlisted(null), false);
  });
});

test('isSmokeAllowlistConfigured requires BOTH allowlists to have at least one entry', async () => {
  await withEnv(
    { SMOKE_TEST_PROPERTY_ALLOWLIST: 'property-1', SMOKE_TEST_RECIPIENT_EMAIL_ALLOWLIST: undefined },
    async () => {
      const { isSmokeAllowlistConfigured } = loadModule();
      assert.equal(isSmokeAllowlistConfigured(), false, 'property-only is not fully configured');
    },
  );
  await withEnv(
    { SMOKE_TEST_PROPERTY_ALLOWLIST: 'property-1', SMOKE_TEST_RECIPIENT_EMAIL_ALLOWLIST: 'ops@example.com' },
    async () => {
      const { isSmokeAllowlistConfigured } = loadModule();
      assert.equal(isSmokeAllowlistConfigured(), true);
    },
  );
});

test('reads fresh on every call — no caching across env changes', async () => {
  const { isPropertyAllowlisted } = loadModule();
  await withEnv({ SMOKE_TEST_PROPERTY_ALLOWLIST: 'property-1' }, async () => {
    assert.equal(isPropertyAllowlisted('property-1'), true);
  });
  await withEnv({ SMOKE_TEST_PROPERTY_ALLOWLIST: undefined }, async () => {
    assert.equal(isPropertyAllowlisted('property-1'), false);
  });
});
