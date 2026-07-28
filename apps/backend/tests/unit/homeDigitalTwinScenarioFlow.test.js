const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { prisma } = require('../../src/lib/prisma.ts');
const {
  HomeDigitalTwinScenarioService,
} = require('../../src/services/homeDigitalTwinScenario.service.ts');

test('ensureComparisonOptions returns newly created draft options so every option can be queued', async () => {
  const originalComponentFindFirst = prisma.homeTwinComponent.findFirst;
  const originalScenarioFindMany = prisma.homeTwinScenario.findMany;
  const service = new HomeDigitalTwinScenarioService();
  const createdRows = [];

  prisma.homeTwinComponent.findFirst = async () => ({
    id: 'component-1',
    componentType: 'HVAC',
    label: 'Upstairs HVAC',
  });
  prisma.homeTwinScenario.findMany = async (args) => {
    if (args.select) return [];
    return createdRows;
  };
  service.createScenario = async (_twinId, propertyId, userId, input) => {
    const row = {
      id: `scenario-${createdRows.length + 1}`,
      digitalTwinId: 'twin-1',
      propertyId,
      createdByUserId: userId,
      componentId: input.componentId,
      name: input.name,
      scenarioType: input.scenarioType,
      status: 'DRAFT',
      description: input.description,
      inputPayload: input.inputPayload,
      isPinned: false,
      isArchived: false,
      impacts: [],
      component: {
        id: 'component-1',
        componentType: 'HVAC',
        label: 'Upstairs HVAC',
        sourceType: 'INVENTORY',
        sourceReferenceId: 'inventory-1',
      },
      computationRuns: [],
      decisionStatus: 'OPEN',
    };
    createdRows.push(row);
    return row;
  };

  try {
    const comparison = await service.ensureComparisonOptions(
      'twin-1',
      'property-1',
      'component-1',
      'user-1',
    );
    assert.equal(comparison.options.length, 5);
    assert.deepEqual(
      comparison.options.map((option) => option.scenarioType).sort(),
      [
        'MAINTAIN_COMPONENT',
        'REPAIR_COMPONENT',
        'REPLACE_COMPONENT',
        'UPGRADE_COMPONENT',
        'WAIT_MONITOR',
      ].sort(),
    );
    assert.ok(comparison.options.every((option) => option.status === 'DRAFT'));
  } finally {
    prisma.homeTwinComponent.findFirst = originalComponentFindFirst;
    prisma.homeTwinScenario.findMany = originalScenarioFindMany;
  }
});

test('readiness requirements change with the decision instead of global completeness', async () => {
  const originalComponentFindFirst = prisma.homeTwinComponent.findFirst;
  const service = new HomeDigitalTwinScenarioService();
  prisma.homeTwinComponent.findFirst = async () => ({
    id: 'component-1',
    componentType: 'HVAC',
    projectedFacts: [
      { fieldName: 'replacementCostEstimate', factState: 'VERIFIED' },
      { fieldName: 'conditionScore', factState: 'REPORTED' },
      { fieldName: 'annualOperatingCostEstimate', factState: 'DEFAULT' },
    ],
  });

  try {
    const wait = await service.getReadiness('twin-1', {
      componentId: 'component-1',
      scenarioType: 'WAIT_MONITOR',
    });
    const repair = await service.getReadiness('twin-1', {
      componentId: 'component-1',
      scenarioType: 'REPAIR_COMPONENT',
    });
    const upgrade = await service.getReadiness('twin-1', {
      componentId: 'component-1',
      scenarioType: 'UPGRADE_COMPONENT',
    });

    assert.equal(wait.readiness, 'SUFFICIENT');
    assert.deepEqual(wait.missing, []);
    assert.deepEqual(repair.missing.map((item) => item.field), ['repairQuote']);
    assert.deepEqual(upgrade.missing.map((item) => item.field), ['annualOperatingCostEstimate']);
  } finally {
    prisma.homeTwinComponent.findFirst = originalComponentFindFirst;
  }
});
