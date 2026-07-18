const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { CreateProjectSchema } = require('../../src/validators/projectTracker.validators.ts');
const { getTemplateByJourneyTypeKey } = require('../../src/services/guidanceEngine/guidanceTemplateRegistry.ts');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

function projectFixture(overrides = {}) {
  return {
    name: 'HVAC repair',
    projectType: 'HVAC_REPAIR',
    contractorName: 'Trusted HVAC',
    sourceType: 'GUIDANCE',
    guidanceJourneyId: 'journey-1',
    inventoryItemId: 'item-1',
    executionPath: 'REPAIR',
    fulfillmentMode: 'PROVIDER',
    fundingMode: 'MIXED',
    complexity: 'MAJOR',
    contractAmountCents: 150000,
    startDate: '2026-08-01',
    ...overrides,
  };
}

test('asset lifecycle journey continues through all six Phase 3 execution and closure stages', () => {
  const template = getTemplateByJourneyTypeKey('asset_lifecycle_resolution');
  assert.equal(template.version, '3.0.0');
  assert.equal(template.steps.length, 14);
  assert.deepEqual(template.steps.slice(8).map((step) => step.stepKey), [
    'confirm_scope_and_provider',
    'track_work',
    'verify_outcome',
    'capture_proof',
    'update_home_record',
    'set_future_care',
  ]);
  assert.ok(template.steps.slice(8).every((step) => step.isRequired));
});

test('guided project contract keeps execution alternatives orthogonal and requires provider identity only for provider work', () => {
  assert.equal(CreateProjectSchema.safeParse(projectFixture()).success, true);
  assert.equal(CreateProjectSchema.safeParse(projectFixture({ contractorName: undefined })).success, false);
  assert.equal(CreateProjectSchema.safeParse(projectFixture({
    contractorName: undefined,
    fulfillmentMode: 'DIY',
  })).success, true);
  assert.equal(CreateProjectSchema.safeParse(projectFixture({
    sourceType: 'GUIDANCE',
    guidanceJourneyId: undefined,
  })).success, false);
});

test('project persistence validates property-scoped lineage and stores the Phase 3 context', () => {
  const service = read('../../src/services/projectTracker.service.ts');
  for (const field of [
    'guidanceJourneyId', 'inventoryItemId', 'executionPath', 'fulfillmentMode',
    'fundingMode', 'complexity', 'recommendationVersion',
  ]) assert.match(service, new RegExp(field));
  assert.match(service, /INVALID_GUIDANCE_JOURNEY/);
  assert.match(service, /JOURNEY_ITEM_MISMATCH/);
});

test('project creation advances the canonical journey and the guided UI captures adaptive execution context', () => {
  const controller = read('../../src/controllers/projectTracker.controller.ts');
  const page = read('../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/projects/new/page.tsx');
  assert.match(controller, /stepKey: 'confirm_scope_and_provider'/);
  assert.match(controller, /sourceEntityType: 'PROJECT'/);
  for (const control of ['executionPath', 'fulfillmentMode', 'fundingMode', 'complexity']) {
    assert.match(page, new RegExp(control));
  }
  assert.match(page, /sourceType: guidanceJourneyId \? 'GUIDANCE' : 'MANUAL'/);
});

test('Phase 3 schema changes do not include a migration script', () => {
  const schema = read('../../prisma/schema.prisma');
  for (const declaration of [
    'ProjectExecutionPath', 'ProjectFulfillmentMode', 'ProjectFundingMode', 'ProjectComplexity',
  ]) assert.match(schema, new RegExp(`enum ${declaration}`));
  const migrationRoot = path.resolve(__dirname, '../../prisma/migrations');
  const phase3Migrations = fs.readdirSync(migrationRoot).filter((entry) => /phase.?3|major.?moment/i.test(entry));
  assert.deepEqual(phase3Migrations, []);
});
