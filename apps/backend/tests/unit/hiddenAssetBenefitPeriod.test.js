const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ============================================================================
// Mocks
// ============================================================================

let programs = new Map();
let rules = [];
let versionSnapshots = [];

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    prisma: {
      hiddenAssetProgram: {
        findUnique: async ({ where }) => programs.get(where.id) ?? null,
        create: async ({ data }) => {
          const row = { id: `program-${programs.size + 1}`, version: 1, ...data };
          programs.set(row.id, row);
          return row;
        },
        update: async ({ where, data }) => {
          const row = programs.get(where.id);
          const { version, ...rest } = data;
          Object.assign(row, rest);
          if (version && typeof version === 'object' && 'increment' in version) {
            row.version = (row.version ?? 1) + version.increment;
          } else if (version !== undefined) {
            row.version = version;
          }
          return row;
        },
        updateMany: async ({ where, data }) => {
          const row = programs.get(where.id);
          if (!row || (where.version !== undefined && row.version !== where.version)) return { count: 0 };
          const { version, ...rest } = data;
          Object.assign(row, rest);
          if (version?.increment) row.version = (row.version ?? 1) + version.increment;
          return { count: 1 };
        },
        findUniqueOrThrow: async ({ where }) => programs.get(where.id),
      },
      hiddenAssetProgramRule: {
        createMany: async ({ data }) => {
          rules.push(...data);
          return { count: data.length };
        },
        deleteMany: async () => ({ count: 0 }),
      },
      hiddenAssetProgramVersionSnapshot: {
        create: async ({ data }) => {
          const row = { id: `snapshot-${versionSnapshots.length + 1}`, ...data };
          versionSnapshots.push(row);
          return row;
        },
      },
      auditLog: { create: async ({ data }) => ({ id: 'audit-1', ...data }) },
      $transaction: async (fn) =>
        fn({
          hiddenAssetProgram: require.cache[prismaPath].exports.prisma.hiddenAssetProgram,
          hiddenAssetProgramRule: require.cache[prismaPath].exports.prisma.hiddenAssetProgramRule,
          hiddenAssetProgramVersionSnapshot: require.cache[prismaPath].exports.prisma.hiddenAssetProgramVersionSnapshot,
          auditLog: require.cache[prismaPath].exports.prisma.auditLog,
        }),
    },
  },
};

const {
  savingsBenefitsAdminService,
} = require('../../src/services/savingsBenefitsAdmin.service.ts');

test.beforeEach(() => {
  programs = new Map();
  rules = [];
  versionSnapshots = [];
});

function baseProgramInput(overrides = {}) {
  return {
    sourceId: 'source-1',
    name: 'Test Program',
    category: 'TAX_EXEMPTION',
    regionType: 'STATE',
    regionValue: 'NJ',
    benefitType: 'REBATE',
    rules: [{ attribute: 'state', operator: 'EQUALS', value: 'NJ' }],
    ...overrides,
  };
}

test('createProgram defaults benefitPeriod to UNKNOWN when omitted', async () => {
  const created = await savingsBenefitsAdminService.createProgram(baseProgramInput(), 'admin-1');
  assert.equal(created.benefitPeriod, 'UNKNOWN');
});

test('createProgram respects an explicit benefitPeriod', async () => {
  const created = await savingsBenefitsAdminService.createProgram(
    baseProgramInput({ benefitPeriod: 'ANNUAL' }), 'admin-1'
  );
  assert.equal(created.benefitPeriod, 'ANNUAL');
});

test('updateProgram preserves the existing benefitPeriod when omitted', async () => {
  const created = await savingsBenefitsAdminService.createProgram(
    baseProgramInput({ benefitPeriod: 'ONE_TIME' }), 'admin-1'
  );
  const updated = await savingsBenefitsAdminService.updateProgram(created.id, baseProgramInput(), 'admin-1');
  assert.equal(updated.benefitPeriod, 'ONE_TIME');
});

test('updateProgram overrides benefitPeriod when explicitly provided', async () => {
  const created = await savingsBenefitsAdminService.createProgram(
    baseProgramInput({ benefitPeriod: 'ONE_TIME' }), 'admin-1'
  );
  const updated = await savingsBenefitsAdminService.updateProgram(
    created.id,
    baseProgramInput({ benefitPeriod: 'MONTHLY' }), 'admin-1'
  );
  assert.equal(updated.benefitPeriod, 'MONTHLY');
});
