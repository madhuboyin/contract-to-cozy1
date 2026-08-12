import { expect, test, type Page, type Route } from '@playwright/test';
import axeCore from 'axe-core';
import { installAskContext, propertyId } from './fixtures';

// Ask Intelligence FRD Phase 8A exit criterion: "desktop/mobile accessibility
// evidence retained" for the two new presentation blocks (DECISION_PROGRESS,
// SCENARIO_COMPARISON). No live backend/DB is used -- these are self-contained
// route mocks, following the axe-core pattern already established in
// e2e/savings-benefits/savings-benefits.spec.ts.

const apiOrigin = 'http://localhost:8080';

async function fulfill(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installDecisionPlatformRoutes(page: Page) {
  await page.route(`${apiOrigin}/api/csrf-token`, (route) => fulfill(route, { csrfToken: 'ask-acceptance-csrf' }));
  await page.route(`${apiOrigin}/api/properties*`, (route) => fulfill(route, { success: true, data: { properties: [{ id: propertyId, name: 'Acceptance Home', addressLine1: '1 Cozy Way', city: 'Boston', state: 'MA', zipCode: '02108' }] } }));
  await page.route(`${apiOrigin}/api/ask/sessions/*`, (route) => fulfill(route, { success: true, data: { executions: [] } }));

  await page.route(`${apiOrigin}/api/ask/executions`, async (route) => {
    const body = route.request().postDataJSON() as { message: string };

    if (/status of my hvac decision/i.test(body.message)) {
      await fulfill(route, {
        success: true, data: {
          schemaVersion: '1.0', executionId: 'execution-hvac-decision-progress', sessionId: 'ask-acceptance-session',
          question: body.message, status: 'ANSWERED', property: { id: propertyId, label: 'Acceptance Home' },
          operation: { id: 'HVAC_DECISION_CONTINUE', version: '1.0', family: 'DECISION_ANALYSIS' },
          contextVersion: 'hvac-decision-context-v1',
          blocks: [{
            type: 'DECISION_PROGRESS', id: 'hvac-decision-progress', title: 'Repair or replace: Furnace',
            decisionThreadId: 'thread-1', lifecycleStatus: 'RECOMMENDATION_AVAILABLE', contextStatus: 'STALE',
            verdict: 'MONITOR', reasonCodes: ['NO_RECENT_REPAIR_SPEND', 'ACTIVE_WARRANTY_REDUCES_REPAIR_RISK'],
            limitationCodes: ['NO_TECHNICIAN_ASSESSMENT_ON_FILE', 'REPLACEMENT_COST_RANGE_UNAVAILABLE'],
            contextIssueCodes: ['HVAC_ITEM_FACT_CORRECTED'], confidenceLabel: 'MEDIUM',
            generatedAt: new Date().toISOString(),
            actions: [{ id: 'open-decision', label: 'Open decision', href: `/dashboard/properties/${propertyId}/tools/decision-platform?decisionThreadId=thread-1`, style: 'PRIMARY' }],
          }],
          captureRequests: [], confirmation: null, suggestions: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
      }, 201);
      return;
    }

    if (/quote.*furnace.*compare/i.test(body.message)) {
      await fulfill(route, {
        success: true, data: {
          schemaVersion: '1.0', executionId: 'execution-hvac-scenario-comparison', sessionId: 'ask-acceptance-session',
          question: body.message, status: 'ANSWERED', property: { id: propertyId, label: 'Acceptance Home' },
          operation: { id: 'HVAC_DECISION_SCENARIO', version: '1.0', family: 'DECISION_ANALYSIS' },
          contextVersion: 'hvac-scenario-context-v1',
          blocks: [{
            type: 'SCENARIO_COMPARISON', id: 'hvac-scenario-comparison', title: 'Scenario: Acme HVAC',
            decisionThreadId: 'thread-1', scenarioId: 'scenario-1',
            baseline: { label: 'Current recommendation', verdict: 'MONITOR', reasonCodes: ['NO_RECENT_REPAIR_SPEND'], limitationCodes: ['NO_TECHNICIAN_ASSESSMENT_ON_FILE'] },
            scenario: { label: 'Quote from Acme HVAC', verdict: 'REPLACE', reasonCodes: ['ELEVATED_REPAIR_SPEND'], limitationCodes: ['NO_TECHNICIAN_ASSESSMENT_ON_FILE'], assumptions: [{ label: 'Quote amount', value: '$8,500.00' }, { label: 'Vendor', value: 'Acme HVAC' }] },
            comparisonDirection: 'SCENARIO_FAVORS_REPLACE',
            actions: [{ id: 'open-decision', label: 'Open decision', href: `/dashboard/properties/${propertyId}/tools/decision-platform?decisionThreadId=thread-1`, style: 'PRIMARY' }],
          }],
          captureRequests: [], confirmation: null, suggestions: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
      }, 201);
      return;
    }

    throw new Error(`Unhandled Ask acceptance fixture message: ${body.message}`);
  });
}

// Scoped to the new block's own rendered subtree (found by its heading text),
// not the whole document. A whole-page axe.run() surfaces a pre-existing,
// unrelated nested-<main>-landmark issue in the /acceptance/ask harness shell
// that predates Phase 8A and is out of scope for it -- this keeps the check
// precisely targeted at what Phase 8A actually introduces (DECISION_PROGRESS,
// SCENARIO_COMPARISON), matching the FRD's "accessibility evidence" exit
// criterion for those two blocks specifically.
async function expectZeroAxeViolations(page: Page, headingText: string) {
  await page.addScriptTag({ content: axeCore.source });
  const violations = await page.evaluate(async (heading) => {
    const axe = (window as unknown as { axe: typeof axeCore }).axe;
    const headingEl = [...document.querySelectorAll('h3')].find((el) => el.textContent?.includes(heading));
    const section = headingEl?.closest('section') ?? document.body;
    return (await axe.run(section)).violations;
  }, headingText);
  expect(violations).toEqual([]);
}

test.beforeEach(async ({ context }) => installAskContext(context));

test('DECISION_PROGRESS (including a STALE context banner) passes accessibility checks', async ({ page }) => {
  await installDecisionPlatformRoutes(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill("What's the status of my HVAC decision?");
  await page.getByRole('button', { name: 'Send question' }).click();

  await expect(page.getByRole('heading', { name: 'Repair or replace: Furnace' })).toBeVisible();
  await expect(page.getByText('MONITOR', { exact: false })).toBeVisible();
  await expect(page.getByText('Needs refresh')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open decision' })).toHaveAttribute('href', /decisionThreadId=thread-1/);

  await expectZeroAxeViolations(page, 'Repair or replace: Furnace');
});

test('SCENARIO_COMPARISON passes accessibility checks', async ({ page }) => {
  await installDecisionPlatformRoutes(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('I got a new quote for my furnace, please compare it to the decision');
  await page.getByRole('button', { name: 'Send question' }).click();

  await expect(page.getByRole('heading', { name: 'Scenario: Acme HVAC' })).toBeVisible();
  await expect(page.getByText('shifts the recommendation toward replacing')).toBeVisible();
  await expect(page.getByText('$8,500.00')).toBeVisible();

  await expectZeroAxeViolations(page, 'Scenario: Acme HVAC');
});
