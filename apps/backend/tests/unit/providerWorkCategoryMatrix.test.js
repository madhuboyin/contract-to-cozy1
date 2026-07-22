const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { providerSearchSchema } = require('../../src/types/provider.types.ts');
const { createBookingSchema } = require('../../src/types/booking.types.ts');
const {
  hasUnresolvedResponsibilityScope,
  resolveResponsibilityFactKeys,
} = require('../../src/services/projectCompliance/workScope.ts');

const matrix = [
  ['HVAC', ['responsibility.hvac']],
  ['WATER_HEATER', ['responsibility.plumbing']],
  ['PLUMBING', ['responsibility.plumbing']],
  ['ROOFING', ['responsibility.roof']],
  ['GUTTERS', ['responsibility.roof']],
  ['SIDING', ['responsibility.buildingExterior']],
  ['WINDOWS_DOORS', ['responsibility.buildingExterior']],
  ['LANDSCAPING', ['responsibility.landscaping']],
  ['LANDSCAPING_DRAINAGE', ['responsibility.landscaping']],
  ['PEST_CONTROL', ['responsibility.pestControl']],
  ['ELECTRICAL', ['responsibility.sharedSystems']],
  ['INSULATION', ['responsibility.sharedSystems']],
  ['FLOORING', ['responsibility.sharedSystems']],
  ['PAINTING', ['responsibility.sharedSystems']],
  ['SECURITY_SAFETY', ['responsibility.commonSafety']],
  ['LOCKSMITH', ['responsibility.commonSafety']],
  ['HANDYMAN', ['responsibility.sharedSystems']],
  ['GENERAL_HANDYMAN', ['responsibility.sharedSystems']],
  ['MOLD_REMEDIATION', ['responsibility.sharedSystems']],
  ['FOUNDATION', ['responsibility.sharedSystems']],
  ['SOLAR', ['responsibility.roof']],
];

test('every responsibility-bearing provider work category resolves to the intended fact', () => {
  for (const [workCategory, expectedFacts] of matrix) {
    const work = { serviceCategory: workCategory };
    assert.deepEqual(resolveResponsibilityFactKeys(work), expectedFacts, workCategory);
    assert.equal(hasUnresolvedResponsibilityScope(work), false, workCategory);
  }
});

test('marketplace-only categories are explicitly non-responsibility-gated', () => {
  for (const workCategory of [
    'INSPECTION', 'APPLIANCE_REPAIR', 'APPLIANCE_REPLACEMENT', 'CLEANING', 'MOVING',
    'INSURANCE', 'ATTORNEY', 'FINANCE', 'WARRANTY', 'ADMIN',
  ]) {
    const work = { serviceCategory: workCategory };
    assert.deepEqual(resolveResponsibilityFactKeys(work), [], workCategory);
    assert.equal(hasUnresolvedResponsibilityScope(work), false, workCategory);
  }
});

test('provider search accepts a distinct, validated work category', () => {
  const parsed = providerSearchSchema.parse({
    category: 'INSPECTION',
    workCategory: 'ROOFING',
  });
  assert.equal(parsed.category, 'INSPECTION');
  assert.equal(parsed.workCategory, 'ROOFING');
  assert.throws(() => providerSearchSchema.parse({ category: 'INSPECTION', workCategory: 'NOT_REAL_WORK' }));

  const providerController = fs.readFileSync(path.resolve(__dirname, '../../src/controllers/provider.controller.ts'), 'utf8');
  assert.match(providerController, /serviceCategory: workCategory \?\? providerQuery\.category/);
});

test('booking preserves the same work category through its hard responsibility gate', () => {
  const parsed = createBookingSchema.parse({
    providerId: '11111111-1111-4111-8111-111111111111',
    serviceId: '22222222-2222-4222-8222-222222222222',
    propertyId: '33333333-3333-4333-8333-333333333333',
    description: 'Inspect and repair the roof shingles.',
    estimatedPrice: 500,
    workCategory: 'ROOFING',
  });
  assert.equal(parsed.workCategory, 'ROOFING');

  const bookingService = fs.readFileSync(path.resolve(__dirname, '../../src/services/booking.service.ts'), 'utf8');
  assert.match(bookingService, /serviceCategory: input\.workCategory \?\? service\.category/);
});
