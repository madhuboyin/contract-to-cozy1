'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  CreateRenovationExplorationSchema,
  UpdateRenovationOptionDispositionSchema,
} = require('../../src/validators/renovationExplore.validators.ts');

test('exploration captures goals, constraints, responsibility, budget, and preferences', () => {
  const result = CreateRenovationExplorationSchema.parse({
    goals: ['Improve accessibility'],
    constraints: { preserveCabinetry: true },
    responsibilityContext: 'HOMEOWNER',
    spacesAffected: ['KITCHEN'],
    systemsAffected: ['PLUMBING'],
    budgetMinCents: 1000000,
    budgetMaxCents: 2500000,
    targetTiming: 'Within 12 months',
    accessibilityPreferences: ['ZERO_STEP'],
    resiliencePreferences: [],
    efficiencyPreferences: ['LOWER_ENERGY_USE'],
    maintenancePreferences: ['LOW_MAINTENANCE'],
  });
  assert.equal(result.responsibilityContext, 'HOMEOWNER');
  assert.equal(result.budgetMaxCents, 2500000);
  assert.deepEqual(result.spacesAffected, ['KITCHEN']);
});

test('invalid budget ranges and arbitrary option states are rejected', () => {
  assert.equal(CreateRenovationExplorationSchema.safeParse({
    goals: ['Modernize'],
    budgetMinCents: 2000,
    budgetMaxCents: 1000,
  }).success, false);
  assert.equal(UpdateRenovationOptionDispositionSchema.safeParse({
    status: 'SELECTED',
  }).success, false);
});

test('recommendations persist before disposition and conversion is explicit', () => {
  const service = fs.readFileSync(
    path.join(__dirname, '../../src/services/renovationExplore.service.ts'),
    'utf8',
  );
  const legacyRoute = fs.readFileSync(
    path.join(__dirname, '../../src/routes/homeModification.routes.ts'),
    'utf8',
  );
  const ui = fs.readFileSync(
    path.join(__dirname, '../../../frontend/src/components/HomeModificationAdvisor.tsx'),
    'utf8',
  );
  const legacyPage = fs.readFileSync(
    path.join(__dirname, '../../../frontend/src/app/(dashboard)/dashboard/modifications/page.tsx'),
    'utf8',
  );

  assert.match(service, /prisma\.renovationExploration\.create/);
  assert.match(service, /status:\s*'SELECTED'/);
  assert.match(service, /idempotencyKey:\s*`upgrade-option:\$\{option\.id\}`/);
  assert.match(service, /sourceType:\s*'UPGRADE_OPTION'/);
  assert.match(service, /assumptions:\s*option\.assumptions/);
  assert.match(service, /propertyContextSnapshot/);
  assert.match(service, /Maximum exploration budget/);
  assert.match(service, /Affected spaces/);
  assert.match(service, /withinBudget/);
  assert.match(legacyRoute, /rel="successor-version"/);
  assert.match(legacyPage, /PropertyScopedToolRedirectPage/);
  assert.match(ui, /Side-by-side comparison/);
  assert.match(ui, /'Saved' : 'Save'/);
  assert.match(ui, /> Reject/);
  assert.match(ui, /Create renovation plan/);
  assert.doesNotMatch(ui, /averageROI|totalEstimatedCost|permitRequired/);
});
