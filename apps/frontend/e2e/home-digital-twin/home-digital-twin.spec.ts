import { expect, test } from '@playwright/test';
import axeCore from 'axe-core';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/properties/home-digital-twin-acceptance-property/home-digital-twin', async (route) => {
    await route.fulfill({ json: { success: true, data: { twin: null, context: null } } });
  });
});

test('desktop presents the homeowner outcome and passes automated accessibility', async ({ page }) => {
  await page.goto('/acceptance/home-digital-twin');
  await expect(page.getByRole('heading', { name: 'Home Upgrade Planner' })).toBeVisible();
  await expect(page.getByText(/compare repair, replacement, upgrade, and wait options/i)).toBeVisible();
  await page.addScriptTag({ content: axeCore.source });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: typeof axeCore }).axe;
    return (await axe.run(document, {
      rules: {
        'color-contrast': { enabled: false },
      },
    })).violations;
  });
  expect(violations).toEqual([]);
});

test('initialized planner exercises comparison, typed assumptions, and run evidence', async ({ page }) => {
  const propertyId = 'home-digital-twin-acceptance-property';
  const component = {
    id: 'component-1',
    componentType: 'HVAC',
    label: 'Upstairs HVAC',
    sourceReferenceId: 'inventory-1',
  };
  const scenario = {
    id: 'scenario-1',
    digitalTwinId: 'twin-1',
    propertyId,
    createdByUserId: 'user-1',
    componentId: component.id,
    component,
    name: 'Upgrade Upstairs HVAC',
    scenarioType: 'UPGRADE_COMPONENT',
    status: 'COMPUTED',
    description: 'Compare a higher-efficiency replacement.',
    inputPayload: { componentType: 'HVAC', assumptions: { replacementCost: 12000 } },
    baselineSnapshot: null,
    decisionStatus: 'OPEN',
    decisionReason: null,
    decidedAt: null,
    staleAt: null,
    staleReason: null,
    isPinned: false,
    isArchived: false,
    lastComputedAt: '2026-07-28T12:00:00.000Z',
    createdAt: '2026-07-28T12:00:00.000Z',
    updatedAt: '2026-07-28T12:00:00.000Z',
    impacts: [],
    safetyBoundary: null,
    sensitivity: [],
    latestRun: { status: 'SUCCEEDED', startedAt: '2026-07-28T12:00:00.000Z', completedAt: '2026-07-28T12:00:01.000Z', errorMessage: null },
    projectPrefill: { projectType: 'HVAC_REPLACEMENT', category: 'HVAC', inventoryItemId: 'inventory-1' },
  };

  await page.unroute(`**/api/properties/${propertyId}/home-digital-twin`);
  await page.route(`**/api/properties/${propertyId}/home-digital-twin`, (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          twin: {
            id: 'twin-1',
            propertyId,
            status: 'ACTIVE',
            completenessScore: 0.8,
            staleReason: null,
            needsRecompute: false,
            lastComputedAt: '2026-07-28T12:00:00.000Z',
            components: [component],
            recentScenarios: [scenario],
          },
          context: null,
        },
      },
    }),
  );
  await page.route(`**/api/properties/${propertyId}/home-digital-twin/recommended-scenarios`, (route) =>
    route.fulfill({ json: { success: true, data: { recommendations: [] } } }),
  );
  await page.route(`**/api/properties/${propertyId}/home-digital-twin/components/${component.id}/scenarios/compare`, (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          comparison: {
            component,
            options: [
              { ...scenario, id: 'maintain-1', name: 'Maintain Upstairs HVAC', scenarioType: 'MAINTAIN_COMPONENT' },
              { ...scenario, id: 'repair-1', name: 'Repair Upstairs HVAC', scenarioType: 'REPAIR_COMPONENT' },
              { ...scenario, id: 'replace-1', name: 'Replace Upstairs HVAC', scenarioType: 'REPLACE_COMPONENT' },
              scenario,
              { ...scenario, id: 'wait-1', name: 'Wait and monitor Upstairs HVAC', scenarioType: 'WAIT_MONITOR' },
            ],
          },
        },
      },
    }),
  );
  await page.route(`**/api/properties/${propertyId}/home-digital-twin/scenarios/${scenario.id}/runs`, (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          runs: [
            {
              id: 'run-2',
              status: 'SUCCEEDED',
              modelVersion: 'hdt-scenario-v2',
              calculationVersion: 1,
              startedAt: '2026-07-28T12:00:00.000Z',
              completedAt: '2026-07-28T12:00:01.000Z',
              errorMessage: null,
              inputSnapshot: { inputPayload: scenario.inputPayload, component },
              sourceSnapshot: { twinVersion: 2, componentFacts: [] },
              outputSnapshot: { impacts: [] },
            },
            {
              id: 'run-1',
              status: 'SUCCEEDED',
              modelVersion: 'hdt-scenario-v2',
              calculationVersion: 1,
              startedAt: '2026-07-27T12:00:00.000Z',
              completedAt: '2026-07-27T12:00:01.000Z',
              errorMessage: null,
              inputSnapshot: { inputPayload: { componentType: 'HVAC', assumptions: { replacementCost: 10000 } }, component },
              sourceSnapshot: { twinVersion: 1, componentFacts: [] },
              outputSnapshot: { impacts: [] },
            },
          ],
        },
      },
    }),
  );
  await page.route(`**/api/properties/${propertyId}/home-digital-twin/scenarios/${scenario.id}/handoff`, (route) =>
    route.fulfill({ json: { success: true, data: { handoff: null } } }),
  );

  await page.goto('/acceptance/home-digital-twin');
  await page.getByRole('listitem', { name: 'Compare options for Upstairs HVAC' }).click();
  await expect(page.getByRole('heading', { name: 'Compare options: Upstairs HVAC' })).toBeVisible();
  await expect(page.getByText('Maintain Upstairs HVAC')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'View scenario: Upgrade Upstairs HVAC' }).click();
  await expect(page.getByLabel('Project estimate ($)')).toHaveValue('12000');
  await page.getByText('Evidence used for latest calculation').click();
  await expect(page.getByText(/Changed since the previous run: inputs, source facts/)).toBeVisible();
  await page.getByText('Inputs and assumptions').click();
  await expect(page.getByText(/replacementCost/)).toBeVisible();
});

test('queued calculations remain visibly pending until the worker finishes', async ({ page }) => {
  const propertyId = 'home-digital-twin-acceptance-property';
  const component = {
    id: 'component-queued',
    componentType: 'HVAC',
    label: 'Main HVAC',
    sourceReferenceId: 'inventory-queued',
  };
  const queuedAt = new Date().toISOString();
  const queuedScenario = {
    id: 'scenario-queued',
    componentId: component.id,
    component,
    name: 'Replace Main HVAC',
    scenarioType: 'REPLACE_COMPONENT',
    status: 'READY',
    description: null,
    inputPayload: { componentType: 'HVAC', assumptions: {} },
    baselineSnapshot: null,
    baselineDependencyFingerprint: null,
    decisionStatus: 'OPEN',
    decisionReason: null,
    decidedAt: null,
    staleAt: queuedAt,
    staleReason: 'A refreshed calculation is queued.',
    isPinned: false,
    isArchived: false,
    lastComputedAt: null,
    createdAt: '2026-07-28T12:00:00.000Z',
    updatedAt: queuedAt,
    impacts: [],
    safetyBoundary: null,
    sensitivity: [],
    latestRun: {
      status: 'QUEUED',
      startedAt: queuedAt,
      completedAt: null,
      errorMessage: null,
    },
    projectPrefill: {
      projectType: 'HVAC_REPLACEMENT',
      category: 'HVAC',
      inventoryItemId: 'inventory-queued',
    },
  };

  await page.unroute(`**/api/properties/${propertyId}/home-digital-twin`);
  await page.route(`**/api/properties/${propertyId}/home-digital-twin`, (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          twin: {
            id: 'twin-queued',
            propertyId,
            status: 'ACTIVE',
            completenessScore: 0.7,
            staleReason: null,
            needsRecompute: false,
            lastComputedAt: '2026-07-28T12:00:00.000Z',
            components: [component],
            recentScenarios: [queuedScenario],
          },
          context: null,
        },
      },
    }),
  );
  await page.route(`**/api/properties/${propertyId}/home-digital-twin/recommended-scenarios`, (route) =>
    route.fulfill({ json: { success: true, data: { recommendations: [] } } }),
  );
  await page.route(`**/api/properties/${propertyId}/home-digital-twin/scenarios/${queuedScenario.id}/runs`, (route) =>
    route.fulfill({ json: { success: true, data: { runs: [] } } }),
  );
  await page.route(`**/api/properties/${propertyId}/home-digital-twin/scenarios/${queuedScenario.id}/handoff`, (route) =>
    route.fulfill({ json: { success: true, data: { handoff: null } } }),
  );

  await page.goto('/acceptance/home-digital-twin');
  await page.getByRole('button', { name: 'View scenario: Replace Main HVAC' }).click();
  await expect(page.getByText('Calculation queued', { exact: true })).toBeVisible();
  await expect(page.getByText(/refresh automatically when the calculation finishes/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run analysis for this scenario' })).toHaveCount(0);
});
