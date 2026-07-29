const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ============================================================================
// Mocks
//
// insuranceHome.ts and warrantyHome.ts talk to prisma directly, so the
// canonical InsurancePolicy/Warranty lookups and the homeSavingsAccount
// update() are stubbed here rather than hitting a real database.
// ============================================================================

let insurancePolicy = null;
let warranty = null;
const updateCalls = [];

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    prisma: {
      insurancePolicy: {
        findUnique: async () => insurancePolicy,
        findFirst: async () => insurancePolicy,
      },
      warranty: {
        findUnique: async () => warranty,
        findFirst: async () => warranty,
      },
      homeSavingsAccount: {
        update: async ({ where, data }) => {
          updateCalls.push({ where, data });
          return { id: where.id, ...data };
        },
      },
    },
  },
};

const {
  canonicalFactsChanged,
  calculateEstimatedPaybackMonths,
  highestSingleAnnualSavings,
} = require('../../src/services/homeSavings/helpers.ts');
const {
  insuranceHomeCategory,
} = require('../../src/services/homeSavings/categories/insuranceHome.ts');
const {
  warrantyHomeCategory,
} = require('../../src/services/homeSavings/categories/warrantyHome.ts');

function decimal(value) {
  return { toNumber: () => value };
}

test.beforeEach(() => {
  insurancePolicy = null;
  warranty = null;
  updateCalls.length = 0;
});

test('payback uses monthly savings or an annual fallback and does not invent a value', () => {
  assert.equal(calculateEstimatedPaybackMonths(25, 300, 75), 3);
  assert.equal(calculateEstimatedPaybackMonths(null, 240, 50), 2.5);
  assert.equal(calculateEstimatedPaybackMonths(0, 0, 50), null);
  assert.equal(calculateEstimatedPaybackMonths(25, 300, null), null);
});

test('aggregate savings uses the highest single net annual opportunity, not an overlapping sum', () => {
  const opportunities = [
    { netAnnualSavings: 420, estimatedAnnualSavings: 500 },
    { netAnnualSavings: 300, estimatedAnnualSavings: 350 },
    { netAnnualSavings: null, estimatedAnnualSavings: 390 },
  ];
  assert.equal(highestSingleAnnualSavings(opportunities), 420);
});

test('canonicalFactsChanged detects a drifted amount and treats equal Decimals as unchanged', () => {
  const cached = {
    providerName: 'Acme',
    planName: 'HO-3',
    amount: decimal(1200),
    startDate: new Date('2024-01-01'),
    renewalDate: new Date('2025-01-01'),
    contractEndDate: null,
  };
  assert.equal(
    canonicalFactsChanged(cached, { ...cached, amount: 1200 }),
    false,
    'identical values should not be reported as changed'
  );
  assert.equal(
    canonicalFactsChanged(cached, { ...cached, amount: 1500 }),
    true,
    'a different premium should be reported as changed'
  );
});

test('insuranceHome.ensureAccount refreshes a stale cached premium from the canonical policy', async () => {
  insurancePolicy = {
    id: 'policy-1',
    carrierName: 'New Carrier',
    coverageType: 'HO-3',
    policyNumber: '999999',
    premiumAmount: decimal(1800),
    startDate: new Date('2025-01-01'),
    expiryDate: new Date('2026-01-01'),
    deductibleAmount: decimal(1000),
  };

  const existingAccount = {
    id: 'account-1',
    insurancePolicyId: 'policy-1',
    providerName: 'Old Carrier',
    planName: 'HO-3',
    amount: decimal(1200),
    startDate: new Date('2024-01-01'),
    renewalDate: new Date('2025-01-01'),
    contractEndDate: null,
  };

  const result = await insuranceHomeCategory.ensureAccount({
    homeownerProfileId: 'hop-1',
    property: { id: 'property-1', state: 'NJ', zipCode: '07001' },
    existingAccount,
    metadata: {},
  });

  assert.equal(updateCalls.length, 1, 'a drifted premium should trigger exactly one update');
  assert.equal(updateCalls[0].where.id, 'account-1');
  assert.equal(updateCalls[0].data.providerName, 'New Carrier');
  assert.equal(result.providerName, 'New Carrier');
});

test('insuranceHome.ensureAccount is a no-op when the canonical policy has not changed', async () => {
  insurancePolicy = {
    id: 'policy-1',
    carrierName: 'Acme',
    coverageType: 'HO-3',
    policyNumber: '999999',
    premiumAmount: decimal(1200),
    startDate: new Date('2024-01-01'),
    expiryDate: new Date('2025-01-01'),
    deductibleAmount: decimal(1000),
  };

  const existingAccount = {
    id: 'account-1',
    insurancePolicyId: 'policy-1',
    providerName: 'Acme',
    planName: 'HO-3',
    amount: decimal(1200),
    startDate: new Date('2024-01-01'),
    renewalDate: new Date('2025-01-01'),
    contractEndDate: null,
  };

  const result = await insuranceHomeCategory.ensureAccount({
    homeownerProfileId: 'hop-1',
    property: { id: 'property-1', state: 'NJ', zipCode: '07001' },
    existingAccount,
    metadata: {},
  });

  assert.equal(updateCalls.length, 0, 'unchanged canonical facts should not trigger a write');
  assert.equal(result, existingAccount);
});

test('insuranceHome.ensureAccount tolerates a deleted canonical policy', async () => {
  insurancePolicy = null;

  const existingAccount = {
    id: 'account-1',
    insurancePolicyId: 'policy-deleted',
    providerName: 'Acme',
    planName: 'HO-3',
    amount: decimal(1200),
    startDate: new Date('2024-01-01'),
    renewalDate: new Date('2025-01-01'),
    contractEndDate: null,
  };

  const result = await insuranceHomeCategory.ensureAccount({
    homeownerProfileId: 'hop-1',
    property: { id: 'property-1', state: 'NJ', zipCode: '07001' },
    existingAccount,
    metadata: {},
  });

  assert.equal(updateCalls.length, 0);
  assert.equal(result, existingAccount);
});

test('warrantyHome.ensureAccount refreshes a stale cached cost and expiry from the canonical warranty', async () => {
  warranty = {
    id: 'warranty-1',
    providerName: 'New Warranty Co',
    category: 'APPLIANCE',
    cost: decimal(900),
    startDate: new Date('2025-02-01'),
    expiryDate: new Date('2026-02-01'),
  };

  const existingAccount = {
    id: 'account-2',
    warrantyId: 'warranty-1',
    providerName: 'Old Warranty Co',
    planName: 'APPLIANCE',
    amount: decimal(700),
    startDate: new Date('2024-02-01'),
    renewalDate: new Date('2025-02-01'),
    contractEndDate: new Date('2025-02-01'),
  };

  const result = await warrantyHomeCategory.ensureAccount({
    homeownerProfileId: 'hop-1',
    property: { id: 'property-1', state: 'NJ', zipCode: '07001' },
    existingAccount,
    metadata: {},
  });

  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].data.providerName, 'New Warranty Co');
  assert.equal(result.renewalDate.getTime(), new Date('2026-02-01').getTime());
});

test('warrantyHome.ensureAccount without a linked canonical warranty leaves the account untouched', async () => {
  const existingAccount = {
    id: 'account-3',
    warrantyId: null,
    providerName: 'Manual Entry',
    planName: 'APPLIANCE',
    amount: decimal(500),
    startDate: null,
    renewalDate: null,
    contractEndDate: null,
  };

  const result = await warrantyHomeCategory.ensureAccount({
    homeownerProfileId: 'hop-1',
    property: { id: 'property-1', state: 'NJ', zipCode: '07001' },
    existingAccount,
    metadata: {},
  });

  assert.equal(updateCalls.length, 0);
  assert.equal(result, existingAccount);
});
