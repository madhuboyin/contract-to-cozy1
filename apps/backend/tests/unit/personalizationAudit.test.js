const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function installPrismaMock() {
  const entries = [];
  const prismaMock = {
    personalizationAuditEvent: {
      create: async ({ data }) => {
        entries.push(data);
        return { id: `audit-${entries.length}`, createdAt: new Date(), ...data };
      },
    },
  };

  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: { prisma: prismaMock },
  };

  return entries;
}

function loadService() {
  const servicePath = require.resolve('../../src/services/personalizationAudit.service.ts');
  delete require.cache[servicePath];
  return require('../../src/services/personalizationAudit.service.ts');
}

test('writes an audit event with the given fields', async () => {
  const entries = installPrismaMock();
  const { recordPersonalizationAuditEvent } = loadService();

  await recordPersonalizationAuditEvent({
    actorUserId: 'admin-1',
    action: 'PERSONALIZATION_KILL_SWITCH_PAUSED',
    entityType: 'SYSTEM_SETTING',
    entityId: 'personalization.killSwitch',
    reason: 'incident',
    metadata: { note: 'fine' },
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].actorUserId, 'admin-1');
  assert.equal(entries[0].action, 'PERSONALIZATION_KILL_SWITCH_PAUSED');
  assert.equal(entries[0].reason, 'incident');
  assert.deepEqual(entries[0].metadata, { note: 'fine' });
});

test('redacts sensitive-shaped keys in metadata before writing', async () => {
  const entries = installPrismaMock();
  const { recordPersonalizationAuditEvent } = loadService();

  await recordPersonalizationAuditEvent({
    actorUserId: 'admin-1',
    action: 'SOME_ACTION',
    entityType: 'X',
    entityId: 'y',
    metadata: { safe: 'ok', evidenceJson: { anything: 'sensitive' }, token: 'abc' },
  });

  assert.deepEqual(entries[0].metadata, {
    safe: 'ok',
    evidenceJson: '[REDACTED]',
    token: '[REDACTED]',
  });
});

test('omits the metadata field entirely when none is given', async () => {
  const entries = installPrismaMock();
  const { recordPersonalizationAuditEvent } = loadService();

  await recordPersonalizationAuditEvent({
    actorUserId: null,
    action: 'SOME_ACTION',
    entityType: 'X',
    entityId: 'y',
  });

  assert.equal(entries[0].metadata, undefined);
  assert.equal(entries[0].reason, null);
});
