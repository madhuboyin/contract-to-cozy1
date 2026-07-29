const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { Prisma } = require('@prisma/client');
const { prisma } = require('../../src/lib/prisma.ts');
const {
  declineSensitiveFact,
  recordSensitiveFact,
} = require('../../src/services/hiddenAssetSensitiveFacts.service.ts');

test('an explicit sensitive answer that fails a mandatory rule inactivates the prior match', async () => {
  const originals = {
    matchFindFirst: prisma.propertyHiddenAssetMatch.findFirst,
    factFindMany: prisma.propertyHiddenAssetSensitiveFact.findMany,
    factUpsert: prisma.propertyHiddenAssetSensitiveFact.upsert,
    transaction: prisma.$transaction,
  };
  const matchUpdates = [];
  const criterionCreates = [];
  const now = new Date();
  const match = {
    id: 'match-1',
    status: 'DETECTED',
    propertyId: 'property-1',
    property: {
      state: 'NJ',
      city: 'Trenton',
      zipCode: '08608',
    },
    program: {
      id: 'program-1',
      name: 'Income-qualified rebate',
      category: 'REBATE',
      version: 3,
      benefitEstimateMin: null,
      benefitEstimateMax: 1_000,
      lastVerifiedAt: now,
      rules: [{
        id: 'rule-income',
        attribute: 'income',
        operator: 'LESS_THAN_OR_EQUAL',
        value: '50000',
        sortOrder: 0,
        kind: 'MANDATORY',
        groupKey: null,
        evidenceRequirement: null,
        homeownerExplanation: 'Household income must be at or below the program limit.',
        isSensitive: true,
        requiresExternalVerification: false,
        unknownHandling: 'HOLD_CANDIDATE',
      }],
    },
  };

  try {
    prisma.propertyHiddenAssetMatch.findFirst = async () => match;
    prisma.propertyHiddenAssetSensitiveFact.upsert = async () => ({ id: 'fact-1' });
    prisma.propertyHiddenAssetSensitiveFact.findMany = async () => [{
      factKey: 'INCOME',
      status: 'PROVIDED',
      valueJson: { value: 100_000 },
    }];
    prisma.$transaction = async (callback) => callback({
      propertyHiddenAssetMatch: {
        update: async ({ data }) => {
          matchUpdates.push(data);
          return { ...match, ...data };
        },
      },
      propertyHiddenAssetCriterionResult: {
        deleteMany: async () => ({ count: 1 }),
        createMany: async ({ data }) => {
          criterionCreates.push(...data);
          return { count: data.length };
        },
      },
    });

    await recordSensitiveFact('match-1', 'user-1', {
      factKey: 'INCOME',
      value: 100_000,
      consented: true,
      consentVersion: 'v1',
    });

    assert.equal(matchUpdates.length, 1);
    assert.equal(matchUpdates[0].status, 'INACTIVE');
    assert.equal(matchUpdates[0].matchedRuleCount, 0);
    assert.deepEqual(matchUpdates[0].matchReasons, []);
    assert.equal(criterionCreates.length, 1);
    assert.equal(criterionCreates[0].ruleId, 'rule-income');
    assert.equal(criterionCreates[0].result, 'NOT_MET');
  } finally {
    prisma.propertyHiddenAssetMatch.findFirst = originals.matchFindFirst;
    prisma.propertyHiddenAssetSensitiveFact.findMany = originals.factFindMany;
    prisma.propertyHiddenAssetSensitiveFact.upsert = originals.factUpsert;
    prisma.$transaction = originals.transaction;
  }
});

test('declining a previously provided sensitive fact clears its stored value', async () => {
  const originals = {
    matchFindFirst: prisma.propertyHiddenAssetMatch.findFirst,
    factFindMany: prisma.propertyHiddenAssetSensitiveFact.findMany,
    factUpsert: prisma.propertyHiddenAssetSensitiveFact.upsert,
    transaction: prisma.$transaction,
  };
  let upsertInput;
  const match = {
    id: 'match-1',
    status: 'DETECTED',
    propertyId: 'property-1',
    property: { state: 'NJ', city: 'Trenton', zipCode: '08608' },
    program: {
      id: 'program-1',
      name: 'Income-qualified rebate',
      category: 'REBATE',
      version: 1,
      benefitEstimateMin: null,
      benefitEstimateMax: 1_000,
      lastVerifiedAt: new Date(),
      rules: [{
        id: 'rule-income',
        attribute: 'income',
        operator: 'LESS_THAN_OR_EQUAL',
        value: '50000',
        sortOrder: 0,
        kind: 'MANDATORY',
        groupKey: null,
        evidenceRequirement: null,
        homeownerExplanation: null,
        isSensitive: true,
        requiresExternalVerification: false,
        unknownHandling: 'HOLD_CANDIDATE',
      }],
    },
  };

  try {
    prisma.propertyHiddenAssetMatch.findFirst = async () => match;
    prisma.propertyHiddenAssetSensitiveFact.upsert = async (input) => {
      upsertInput = input;
      return { id: 'fact-1' };
    };
    prisma.propertyHiddenAssetSensitiveFact.findMany = async () => [];
    prisma.$transaction = async (callback) => callback({
      propertyHiddenAssetMatch: {
        update: async ({ data }) => ({ ...match, ...data }),
      },
      propertyHiddenAssetCriterionResult: {
        deleteMany: async () => ({ count: 1 }),
        createMany: async ({ data }) => ({ count: data.length }),
      },
    });

    await declineSensitiveFact('match-1', 'user-1', 'INCOME');
    assert.equal(upsertInput.update.status, 'DECLINED');
    assert.equal(upsertInput.update.valueJson, Prisma.DbNull);
  } finally {
    prisma.propertyHiddenAssetMatch.findFirst = originals.matchFindFirst;
    prisma.propertyHiddenAssetSensitiveFact.findMany = originals.factFindMany;
    prisma.propertyHiddenAssetSensitiveFact.upsert = originals.factUpsert;
    prisma.$transaction = originals.transaction;
  }
});
