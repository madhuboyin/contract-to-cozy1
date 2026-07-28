const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  PropertyTaxOperationsService,
} = require('../../src/services/propertyTax/propertyTaxOperations.service');

const root = path.resolve(__dirname, '../../../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function operationsDb(overrides = {}) {
  return {
    taxAssessorDataSource: {
      async findMany() {
        return [{
          id: 'source-1',
          name: 'Reviewed assessor',
          slug: 'reviewed-assessor',
          status: 'ACTIVE',
          adapterType: 'SOCRATA',
          normalizedCoverageKey: 'US-NY-new-york',
          lastFetchAt: new Date('2026-07-28T10:00:00.000Z'),
          lastFetchError: null,
          _count: {
            parcelMatches: 2,
            assessmentRecords: 3,
            billRecords: 0,
          },
        }];
      },
      async findUnique() {
        return { id: 'source-1', status: 'ACTIVE' };
      },
      async update(input) {
        return { id: input.where.id, status: input.data.status };
      },
    },
    propertyTaxRuleProfile: {
      async findMany() {
        return [{
          id: 'rule-1',
          title: 'Reviewed rule',
          version: 1,
          status: 'ACTIVE',
          propertyClass: '1',
          reviewedAt: new Date('2026-07-01T00:00:00.000Z'),
          expiresAt: new Date('2026-08-10T00:00:00.000Z'),
          jurisdiction: { normalizedKey: 'US-NY-new-york' },
          _count: { citations: 2, deadlineRules: 2, appealCases: 1 },
          controlEvents: [],
        }];
      },
    },
    systemSetting: {
      async findUnique() {
        return null;
      },
      async upsert(input) {
        return { key: input.where.key, value: false };
      },
    },
    propertyTaxParcelMatch: {
      async count() {
        return 2;
      },
    },
    propertyTaxAppealReminder: {
      async count() {
        return 1;
      },
    },
    propertyTaxAppealCase: {
      calls: 0,
      async count() {
        this.calls += 1;
        return this.calls === 1 ? 1 : 0;
      },
    },
    propertyTaxDocumentIntake: {
      async count() {
        return 1;
      },
    },
    ...overrides,
  };
}

test('operations dashboard detects source, rule, deadline, and evidence risks', async () => {
  const service = new PropertyTaxOperationsService(operationsDb(), async () => {});
  const result = await service.getDashboard(
    new Date('2026-07-28T12:00:00.000Z'),
  );

  assert.equal(result.sources[0].health, 'HEALTHY');
  assert.equal(result.rules[0].expiringSoon, true);
  assert.equal(result.ai.enabled, false);
  assert.equal(result.ai.failClosed, true);
  assert.equal(
    result.guardrails.find((item) => item.code === 'FALSE_MATCH').count,
    2,
  );
  assert.equal(
    result.guardrails.find((item) => item.code === 'MISSED_DEADLINE_RISK').severity,
    'CRITICAL',
  );
  assert.equal(
    result.guardrails.find((item) => item.code === 'STALE_RULE').count,
    1,
  );
});

test('source emergency disable requires a reason and writes the admin audit contract', async () => {
  const audits = [];
  const db = operationsDb();
  const service = new PropertyTaxOperationsService(
    db,
    async (input) => audits.push(input),
  );

  await assert.rejects(
    () => service.setSourceEnabled({
      sourceId: 'source-1',
      enabled: false,
      actorUserId: 'admin-1',
      reason: 'short',
    }),
    /specific reason/,
  );

  const result = await service.setSourceEnabled({
    sourceId: 'source-1',
    enabled: false,
    actorUserId: 'admin-1',
    reason: 'Provider returned incorrect parcel matches',
  });

  assert.equal(result.status, 'INACTIVE');
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'PROPERTY_TAX_SOURCE_EMERGENCY_DISABLED');
  assert.equal(audits[0].capability, 'INTEGRATION_MANAGE');
});

test('AI emergency disable is fail-closed, durable, and audited', async () => {
  const audits = [];
  const db = operationsDb();
  const service = new PropertyTaxOperationsService(
    db,
    async (input) => audits.push(input),
  );
  const setting = await service.emergencyDisableAi({
    actorUserId: 'admin-1',
    reason: 'Provider provenance review is incomplete',
  });

  assert.equal(setting.value, false);
  assert.equal(audits[0].action, 'PROPERTY_TAX_AI_EMERGENCY_DISABLED');
  assert.deepEqual(audits[0].newValues, { enabled: false });
});

test('Slice 8 wires operations, outcome measurement, guardrails, and browser acceptance', () => {
  const routes = read('apps/backend/src/routes/propertyTax.routes.ts');
  const operations = read(
    'apps/backend/src/services/propertyTax/propertyTaxOperations.service.ts',
  );
  const adminUi = read(
    'apps/frontend/src/app/(dashboard)/dashboard/admin/property-tax/page.tsx',
  );
  const client = read(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/property-tax/PropertyTaxClient.tsx',
  );
  const analytics = read('apps/frontend/src/lib/analytics/events.ts');
  const browserConfig = read('apps/frontend/playwright.property-tax.config.ts');
  const browserAcceptance = read(
    'apps/frontend/e2e/property-tax/property-tax.spec.ts',
  );
  const mobileAcceptance = read(
    'apps/frontend/e2e/property-tax/property-tax.mobile.spec.ts',
  );

  assert.match(routes, /admin\/property-tax\/operations/);
  assert.match(routes, /admin\/property-tax\/sources\/:sourceId/);
  assert.match(routes, /admin\/property-tax\/ai\/emergency-disable/);
  assert.match(operations, /FALSE_MATCH/);
  assert.match(operations, /MISSED_DEADLINE_RISK/);
  assert.match(operations, /UNSUPPORTED_CLAIM/);
  assert.match(operations, /STALE_RULE/);
  assert.match(adminUi, /Official assessment sources/);
  assert.match(adminUi, /Reviewed jurisdiction rules/);
  assert.match(adminUi, /Emergency disable AI/);
  assert.match(analytics, /property_tax_outcome_recorded/);
  assert.match(client, /DOCUMENT_REVIEW_CONFIRMED/);
  assert.match(client, /EXEMPTION_DECISION/);
  assert.match(client, /EXTERNAL_FILING/);
  assert.match(client, /savings_verified/);
  assert.match(browserConfig, /Desktop Chrome/);
  assert.match(browserConfig, /Desktop Firefox/);
  assert.match(browserConfig, /Desktop Safari/);
  assert.match(browserConfig, /Pixel 7/);
  assert.match(browserConfig, /iPhone 13/);
  assert.match(browserAcceptance, /preserves launch context/);
  assert.match(browserAcceptance, /skip navigation/);
  assert.match(mobileAcceptance, /44px targets/);
  assert.match(mobileAcceptance, /reduced motion/);

  const migrationRoot = path.join(root, 'apps/backend/prisma/migrations');
  const migrationNames = fs.existsSync(migrationRoot)
    ? fs.readdirSync(migrationRoot)
    : [];
  assert.equal(
    migrationNames.some((name) => /appeal|property.?tax/i.test(name)),
    false,
  );
});
