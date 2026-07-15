const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadService({ exists = true } = {}) {
  const updates = [];
  const audits = [];
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: {
      prisma: {
        recommendationDefinition: {
          findUnique: async () => exists ? { id: 'def-1' } : null,
          update: async ({ where, data }) => {
            updates.push({ where, data });
            return { code: where.code, status: 'ACTIVE', ...data };
          },
        },
      },
    },
  };
  const auditPath = require.resolve('../../src/services/personalizationAudit.service.ts');
  require.cache[auditPath] = {
    id: auditPath,
    filename: auditPath,
    loaded: true,
    exports: { recordPersonalizationAuditEvent: async (event) => audits.push(event) },
  };
  const servicePath = require.resolve('../../src/services/personalizationDefinitionAdmin.service.ts');
  delete require.cache[servicePath];
  return { ...require('../../src/services/personalizationDefinitionAdmin.service.ts'), updates, audits };
}

test('pause records definition state and an audit event', async () => {
  const { pausePersonalizationDefinition, updates, audits } = loadService();
  const result = await pausePersonalizationDefinition('dryer_vent_cleaning_reminder', 'admin-1', 'content review');
  assert.equal(result.code, 'dryer_vent_cleaning_reminder');
  assert.equal(updates[0].data.pausedBy, 'admin-1');
  assert.equal(updates[0].data.pauseReason, 'content review');
  assert.equal(audits[0].action, 'PERSONALIZATION_DEFINITION_PAUSED');
});
test('resume clears pause state and records an audit event', async () => {
  const { resumePersonalizationDefinition, updates, audits } = loadService();
  await resumePersonalizationDefinition('dryer_vent_cleaning_reminder', 'admin-2');
  assert.deepEqual(updates[0].data, { pausedAt: null, pausedBy: null, pauseReason: null });
  assert.equal(audits[0].action, 'PERSONALIZATION_DEFINITION_RESUMED');
});

test('unknown definition is a no-op', async () => {
  const { pausePersonalizationDefinition, updates, audits } = loadService({ exists: false });
  assert.equal(await pausePersonalizationDefinition('missing', 'admin-1', 'reason'), null);
  assert.equal(updates.length, 0);
  assert.equal(audits.length, 0);
});

test('plan-only definition codes cannot be paused or resumed', async () => {
  const { pausePersonalizationDefinition, resumePersonalizationDefinition, updates, audits } = loadService();
  assert.equal(await pausePersonalizationDefinition('air_purifier_pet_suggestion', 'admin-1', 'reason'), null);
  assert.equal(await resumePersonalizationDefinition('air_purifier_pet_suggestion', 'admin-1'), null);
  assert.equal(updates.length, 0);
  assert.equal(audits.length, 0);
});
