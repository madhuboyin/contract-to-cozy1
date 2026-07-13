const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function createPrismaMock() {
  const memberSummaries = [];
  const pets = [];
  const goals = [];
  const preferences = [];
  const lifestyleAttributes = [];

  function tableMock(rows) {
    return {
      findFirst: async ({ where }) => {
        return (
          rows.find((r) =>
            Object.entries(where).every(([k, v]) => r[k] === v),
          ) || null
        );
      },
      create: async ({ data }) => {
        const row = { id: `id-${rows.length + 1}`, ...data };
        rows.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = rows.find((r) => r.id === where.id);
        Object.assign(row, data);
        return row;
      },
    };
  }

  const prismaMock = {
    householdMemberSummary: tableMock(memberSummaries),
    petProfile: tableMock(pets),
    householdGoal: tableMock(goals),
    householdPreference: tableMock(preferences),
    lifestyleAttribute: tableMock(lifestyleAttributes),
  };

  return { prismaMock, memberSummaries, pets, goals, preferences, lifestyleAttributes };
}

function installPrismaMock(prismaMock) {
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: { prisma: prismaMock },
  };
}

function loadRepository() {
  const repoPath = require.resolve('../../src/modules/personalization/infrastructure/compositionDataRepository.ts');
  delete require.cache[repoPath];
  return require('../../src/modules/personalization/infrastructure/compositionDataRepository.ts');
}

test('upsertHouseholdMemberSummary: creates a new row when none exists', async () => {
  const { prismaMock, memberSummaries } = createPrismaMock();
  installPrismaMock(prismaMock);
  const { upsertHouseholdMemberSummary } = loadRepository();

  await upsertHouseholdMemberSummary('hh-1', { type: 'CHILD' });

  assert.equal(memberSummaries.length, 1);
  assert.equal(memberSummaries[0].type, 'CHILD');
  assert.equal(memberSummaries[0].lifeStage, null);
});

test('upsertHouseholdMemberSummary: updates the existing row instead of duplicating', async () => {
  const { prismaMock, memberSummaries } = createPrismaMock();
  installPrismaMock(prismaMock);
  const { upsertHouseholdMemberSummary } = loadRepository();

  await upsertHouseholdMemberSummary('hh-1', { type: 'SENIOR', count: 1 });
  await upsertHouseholdMemberSummary('hh-1', { type: 'SENIOR', count: 2 });

  assert.equal(memberSummaries.length, 1);
  assert.equal(memberSummaries[0].count, 2);
});

test('createPetProfile: always creates a new row (no unique constraint)', async () => {
  const { prismaMock, pets } = createPrismaMock();
  installPrismaMock(prismaMock);
  const { createPetProfile } = loadRepository();

  await createPetProfile('hh-1', { petType: 'DOG' });
  await createPetProfile('hh-1', { petType: 'CAT' });

  assert.equal(pets.length, 2);
});

test('upsertHouseholdGoal: creates then updates on repeat for the same goalCode', async () => {
  const { prismaMock, goals } = createPrismaMock();
  installPrismaMock(prismaMock);
  const { upsertHouseholdGoal } = loadRepository();

  await upsertHouseholdGoal('hh-1', { goalCode: 'AGING_IN_PLACE', priority: 1 });
  await upsertHouseholdGoal('hh-1', { goalCode: 'AGING_IN_PLACE', priority: 5 });

  assert.equal(goals.length, 1);
  assert.equal(goals[0].priority, 5);
});

test('upsertHouseholdPreference: creates then updates the valueJson on repeat', async () => {
  const { prismaMock, preferences } = createPrismaMock();
  installPrismaMock(prismaMock);
  const { upsertHouseholdPreference } = loadRepository();

  await upsertHouseholdPreference('hh-1', { key: 'BUDGET_POSTURE', valueJson: { value: true } });
  await upsertHouseholdPreference('hh-1', { key: 'BUDGET_POSTURE', valueJson: { value: false } });

  assert.equal(preferences.length, 1);
  assert.deepEqual(preferences[0].valueJson, { value: false });
});

test('upsertLifestyleAttribute: creates then updates valueBoolean on repeat', async () => {
  const { prismaMock, lifestyleAttributes } = createPrismaMock();
  installPrismaMock(prismaMock);
  const { upsertLifestyleAttribute } = loadRepository();

  await upsertLifestyleAttribute('hh-1', { key: 'TRAVEL_FREQUENCY', valueBoolean: true });
  await upsertLifestyleAttribute('hh-1', { key: 'TRAVEL_FREQUENCY', valueBoolean: false });

  assert.equal(lifestyleAttributes.length, 1);
  assert.equal(lifestyleAttributes[0].valueBoolean, false);
});
