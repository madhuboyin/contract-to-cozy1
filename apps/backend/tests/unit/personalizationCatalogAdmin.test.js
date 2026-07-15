const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadService({
  catalogDefinitions = [],
} = {}) {
  const writes = [];
  const audits = [];
  const reads = [];
  const db = {
    recommendationRule: {
      updateMany: async (args) => writes.push(['rule.updateMany', args]),
      update: async (args) => writes.push(['rule.update', args]),
    },
    recommendationContentVersion: {
      updateMany: async (args) => writes.push(['content.updateMany', args]),
      update: async (args) => writes.push(['content.update', args]),
    },
    recommendationDefinition: {
      update: async (args) => writes.push(['definition.update', args]),
    },
    profileQuestion: {
      updateMany: async (args) => writes.push(['question.updateMany', args]),
      update: async (args) => writes.push(['question.update', args]),
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: {
      prisma: {
        recommendationDefinition: {
          findMany: async (args) => {
            reads.push(['definition.findMany', args]);
            const includedCodes = args?.where?.code?.in;
            return includedCodes
              ? catalogDefinitions.filter((definition) => includedCodes.includes(definition.code))
              : catalogDefinitions;
          },
          findUnique: async () => ({ id: 'def-1', rules: [{ id: 'rule-1' }], contentVersions: [{ id: 'content-1' }] }),
        },
        profileQuestion: {
          findUnique: async () => ({ id: 'question-1' }),
          findMany: async () => [],
        },
        $transaction: async (callback) => callback(db),
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
  const servicePath = require.resolve('../../src/services/personalizationCatalogAdmin.service.ts');
  delete require.cache[servicePath];
  return { ...require(servicePath), writes, audits, reads };
}

const activation = {
  code: 'smoke_co_detector_battery_check',
  ruleVersion: 1,
  contentVersion: 1,
  locale: 'en-US',
  reviewerUserId: 'reviewer-1',
};

test('one MFA reviewer activates a reviewed rule/content bundle transactionally', async () => {
  const { activatePersonalizationDefinitionBundle, writes, audits } = loadService();
  const result = await activatePersonalizationDefinitionBundle(activation);
  assert.equal(result.status, 'ACTIVE');
  assert.deepEqual(writes.map(([operation]) => operation), [
    'rule.updateMany', 'rule.update', 'content.updateMany', 'content.update', 'definition.update',
  ]);
  assert.equal(writes[1][1].data.authoredBy, null);
  assert.equal(writes[1][1].data.reviewedBy, 'reviewer-1');
  assert.deepEqual(audits[0].metadata, { ruleVersion: 1, contentVersion: 1, locale: 'en-US' });
});

test('blocks activation of definitions without implemented application behavior', async () => {
  const planOnly = loadService();
  await assert.rejects(
    () => planOnly.activatePersonalizationDefinitionBundle({ ...activation, code: 'air_purifier_pet_suggestion' }),
    (error) => error.code === 'NOT_FOUND',
  );
  assert.equal(planOnly.writes.length, 0);
});

test('activates a selected profile question version and retires an older active version', async () => {
  const { activatePersonalizationQuestion, writes, audits } = loadService();
  const result = await activatePersonalizationQuestion({ code: 'household_pets', version: 1, reviewerUserId: 'reviewer-1' });
  assert.equal(result.status, 'ACTIVE');
  assert.deepEqual(writes.map(([operation]) => operation), ['question.updateMany', 'question.update']);
  assert.equal(audits[0].action, 'PERSONALIZATION_PROFILE_QUESTION_ACTIVATED');
});

test('catalog returns only implemented definitions without unrelated admin identities', async () => {
  const implemented = {
    id: 'def-implemented',
    code: 'hvac_filter_replacement_check_proof',
    rules: [],
    contentVersions: [],
  };
  const planOnly = {
    id: 'def-plan',
    code: 'air_purifier_pet_suggestion',
    rules: [],
    contentVersions: [],
  };
  const { listPersonalizationCatalog, reads } = loadService({
    catalogDefinitions: [implemented, planOnly],
  });

  const result = await listPersonalizationCatalog();
  assert.deepEqual(result.definitions.map((definition) => definition.code), [implemented.code]);
  assert.ok(reads[0][1].where.code.in.includes(implemented.code));
  assert.ok(!reads[0][1].where.code.in.includes(planOnly.code));
  assert.deepEqual(Object.keys(result).sort(), ['definitions', 'questions']);
});
