import { expect, test, type Page, type Route } from '@playwright/test';
import axeCore from 'axe-core';
import { installAskContext, propertyId } from './fixtures';

// Ask Intelligence FRD Phase 8A/8B exit criterion: "desktop/mobile
// accessibility evidence retained" for the five HVAC Decision Platform
// presentation blocks (DECISION_PROGRESS, SCENARIO_COMPARISON from Phase 8A;
// PREFERENCE_REFERENCE, WHY_NOW, RECOMMENDATION_CHANGE from Phase 8B). No
// live backend/DB is used -- these are self-contained route mocks,
// following the axe-core pattern already established in
// e2e/savings-benefits/savings-benefits.spec.ts.

const apiOrigin = 'http://localhost:8080';

async function fulfill(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installDecisionPlatformRoutes(page: Page) {
  await page.route(`${apiOrigin}/api/csrf-token`, (route) => fulfill(route, { csrfToken: 'ask-acceptance-csrf' }));
  await page.route(`${apiOrigin}/api/properties*`, (route) => fulfill(route, { success: true, data: { properties: [{ id: propertyId, name: 'Acceptance Home', addressLine1: '1 Cozy Way', city: 'Boston', state: 'MA', zipCode: '02108' }] } }));
  await page.route(`${apiOrigin}/api/ask/sessions/*`, (route) => fulfill(route, {
    success: true,
    data: new URL(route.request().url()).pathname.endsWith('/recent') ? { items: [] } : { executions: [] },
  }));

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
            // No "Open decision" action -- there is no decision-platform
            // dashboard page in this phase's scope (see the Phase 8A
            // functional-review commit); the block renders everything
            // inline instead of linking out.
            actions: [],
          }],
          skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null,
          correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false },
          suggestions: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
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
            actions: [],
          }],
          skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null,
          correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false },
          suggestions: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
      }, 201);
      return;
    }

    if (/recomputed hvac decision/i.test(body.message)) {
      await fulfill(route, {
        success: true, data: {
          schemaVersion: '1.0', executionId: 'execution-hvac-decision-recomputed', sessionId: 'ask-acceptance-session',
          question: body.message, status: 'ANSWERED', property: { id: propertyId, label: 'Acceptance Home' },
          operation: { id: 'HVAC_DECISION_CONTINUE', version: '1.0', family: 'DECISION_ANALYSIS' },
          contextVersion: 'hvac-decision-recomputed-context-v1',
          // A recompute after a fact correction: DECISION_PROGRESS (now
          // CURRENT again) + WHY_NOW (the recompute trigger) +
          // RECOMMENDATION_CHANGE (the verdict shift) + PREFERENCE_REFERENCE
          // (a confirmed preference was used) all render together, exactly
          // as continueHvacDecisionThread assembles them server-side.
          blocks: [
            {
              type: 'DECISION_PROGRESS', id: 'hvac-decision-progress', title: 'Repair or replace: Furnace',
              decisionThreadId: 'thread-1', lifecycleStatus: 'RECOMMENDATION_AVAILABLE', contextStatus: 'CURRENT',
              verdict: 'REPLACE', reasonCodes: ['ELEVATED_REPAIR_SPEND', 'CONDITION_POOR'],
              limitationCodes: ['NO_TECHNICIAN_ASSESSMENT_ON_FILE'], contextIssueCodes: [], confidenceLabel: 'HIGH',
              generatedAt: new Date().toISOString(), actions: [],
            },
            {
              type: 'WHY_NOW', id: 'hvac-decision-why-now', title: 'Why now',
              triggerCodes: ['HVAC_ITEM_FACT_CORRECTED'], evidenceCodes: ['ELEVATED_REPAIR_SPEND', 'CONDITION_POOR'],
              timingNote: 'Recalculated after a recorded fact changed.', confidenceLabel: 'HIGH',
            },
            {
              type: 'RECOMMENDATION_CHANGE', id: 'hvac-decision-change', title: 'What changed', decisionThreadId: 'thread-1',
              previousVerdict: 'MONITOR', currentVerdict: 'REPLACE', category: 'MATERIAL',
              changedFactors: ['CANONICAL_FACT', 'PREFERENCE'], changedAt: new Date().toISOString(),
            },
            {
              type: 'PREFERENCE_REFERENCE', id: 'hvac-decision-preference-ownership-horizon', title: 'Using your confirmed plan',
              preferenceKey: 'OWNERSHIP_HORIZON', summary: 'Using your confirmed plan to sell in about 18 months.',
              visibility: 'HOUSEHOLD_SUMMARY', confirmedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 31536000000).toISOString(),
            },
          ],
          skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null,
          correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false },
          suggestions: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
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

  await expectZeroAxeViolations(page, 'Repair or replace: Furnace');
});

test('WHY_NOW, RECOMMENDATION_CHANGE, and PREFERENCE_REFERENCE (rendered together after a recompute) pass accessibility checks', async ({ page }) => {
  await installDecisionPlatformRoutes(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill("What's the status of my recomputed HVAC decision?");
  await page.getByRole('button', { name: 'Send question' }).click();

  await expect(page.getByRole('heading', { name: 'Repair or replace: Furnace' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Why now' })).toBeVisible();
  await expect(page.getByText('Recalculated after a recorded fact changed.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What changed' })).toBeVisible();
  await expect(page.getByText('This changes the recommendation')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Using your confirmed plan' })).toBeVisible();
  await expect(page.getByText('Using your confirmed plan to sell in about 18 months.')).toBeVisible();

  await expectZeroAxeViolations(page, 'Why now');
  await expectZeroAxeViolations(page, 'What changed');
  await expectZeroAxeViolations(page, 'Using your confirmed plan');
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
