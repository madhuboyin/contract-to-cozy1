import { expect, test } from '@playwright/test';
import { installAskApi, installAskContext, propertyId } from './fixtures';

test.beforeEach(async ({ context }) => installAskContext(context));

test('starting surface teaches capability breadth without competing CTAs', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1, name: 'Ask Cozy' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What can I help with?' })).toHaveCount(0);
  await expect(page.getByText('Changed recently', { exact: true })).toHaveCount(0);
  await expect(page.getByPlaceholder('Ask anything about your home…')).toBeInViewport();
  await expect(page.getByRole('heading', { name: 'Popular ways to use Ask Cozy' })).toBeVisible();
  await expect(page.getByText('Decide', { exact: true })).toBeVisible();
  await expect(page.getByText('Protect', { exact: true })).toBeVisible();
  await expect(page.getByText('Save', { exact: true })).toBeVisible();
  await expect(page.getByText('Understand', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'For your attention' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Continue where you left off' })).toHaveCount(0);
  await expect(page.getByText('View all', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Ask why', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Help me continue this decision: Repair or replace the refrigerator/ }).first().click();
  await expect.poll(() => api.executionBodies.length).toBe(1);
  expect(api.executionBodies[0]).toMatchObject({
    launchContext: { entityType: 'DECISION_THREAD', entityId: 'decision-1' },
  });
});

test('one home subject appears only once across discovery and attention', async ({ page }) => {
  await installAskApi(page, { duplicateRefrigerator: true });
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);

  const attention = page.getByRole('button', { name: /Plan ahead for Refrigerator.*Ask Cozy about this/ });
  await expect(attention).toBeVisible();
  await expect(page.getByRole('button', { name: /Help me continue this decision: Repair or replace the refrigerator/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /What should I do next for.*Plan ahead for Refrigerator/ })).toHaveCount(0);
  await expect(page.getByText('Decide', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Maintain', { exact: true })).toBeVisible();
  await expect(page.getByText('Understand', { exact: true })).toBeVisible();
  await expect(page.getByText('Protect', { exact: true })).toBeVisible();
  await expect(page.getByText('Save', { exact: true })).toBeVisible();
});

test('new conversation returns to a fresh surface and recent sessions can be restored explicitly', async ({ page }) => {
  await installAskApi(page, { recentSessions: true });
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await expect(page.getByRole('heading', { name: 'Recent Ask Cozy sessions' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Refrigerator replacement timing/ })).toBeVisible();

  await page.getByRole('button', { name: /Refrigerator replacement timing/ }).click();
  await expect(page.getByRole('heading', { name: 'A little more context will improve this answer' })).toBeVisible();

  await page.getByRole('button', { name: 'New Ask Cozy session' }).click();
  await expect(page.getByRole('heading', { name: 'Popular ways to use Ask Cozy' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A little more context will improve this answer' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Refrigerator replacement timing/ })).toBeVisible();

  await page.getByPlaceholder('Ask anything about your home…').fill('When should I replace my refrigerator?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByRole('heading', { name: 'A little more context will improve this answer' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New Ask Cozy session' })).toBeVisible();
});

test('pending Ask actions stay compact and can be dismissed before execution', async ({ page }) => {
  await installAskApi(page, { pendingWork: true });
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);

  const pending = page.getByRole('region', { name: 'Pending Ask actions' });
  await expect(pending).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Continue where you left off' })).toHaveCount(0);
  await expect(pending.getByText('I want to create a maintenance task')).toBeVisible();
  await pending.getByRole('button', { name: 'Dismiss' }).click();
  await expect(pending).toHaveCount(0);
});

test('degraded personalization falls back to property-safe capability examples', async ({ page }) => {
  await installAskApi(page);
  await page.unroute('http://localhost:8080/api/ask/concierge-home*');
  await page.route('http://localhost:8080/api/ask/concierge-home*', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, error: { message: 'Concierge unavailable', code: 'UNAVAILABLE' } }),
  }));

  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);

  await expect(page.getByText('Your personalized home overview is temporarily unavailable. You can still ask any question above.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Help me compare repair and replacement options for a home system or appliance/ })).toBeVisible();
  await expect(page.getByText('Should I repair or replace my refrigerator?', { exact: true })).toHaveCount(0);
});

test('capability explorer progressively reveals registry-backed examples', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByRole('button', { name: /Explore everything Ask Cozy can do/ }).click();
  const dialog = page.getByRole('dialog', { name: 'What Ask Cozy can help with' });
  await expect(dialog).toBeVisible();
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox?.width).toBeGreaterThanOrEqual(800);
  expect(dialogBox?.height).toBeLessThanOrEqual(620);
  await expect(page.getByRole('heading', { name: 'What Ask Cozy can help with' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Understand your home' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Maintain and prevent' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Protect your home' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reduce costs' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Compare and decide' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plan and monitor' })).toBeVisible();
  for (const card of await dialog.locator('section').all()) {
    expect((await card.boundingBox())?.height).toBeLessThan(200);
  }
  await page.getByRole('button', { name: 'Give me a summary of my home record.' }).click();
  await expect(page.getByRole('dialog', { name: 'What Ask Cozy can help with' })).toHaveCount(0);
  await expect.poll(() => api.executionQuestions).toContain('Give me a summary of my home record.');
});

test('personalized attention exposes one conversational action', async ({ page }) => {
  const api = await installAskApi(page, { noDecision: true });
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await expect(page.getByRole('heading', { name: 'For your attention' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Schedule HVAC service.*Ask Cozy about this/ })).toBeVisible();
  await expect(page.getByText('View all', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Review action', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Ask why', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Schedule HVAC service.*Ask Cozy about this/ }).click();
  await expect.poll(() => api.executionBodies.length).toBe(1);
  expect(api.executionBodies[0]).toMatchObject({
    message: 'What should I do next for “Schedule HVAC service”?',
    launchContext: {
      capabilityId: 'home-operations',
      entityType: 'HOME_ACTION',
      entityId: 'action-1',
      actionId: 'action-1',
    },
  });
});

test('weather attention answers inline with the complete preparation checklist before navigation', async ({ page }) => {
  const api = await installAskApi(page, { noDecision: true, heatAttention: true });
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);

  await page.getByRole('button', { name: /Multi-day heat risk ahead preparation.*Ask Cozy about this/ }).click();

  await expect.poll(() => api.executionBodies.length).toBe(1);
  expect(api.executionBodies[0]).toMatchObject({
    message: 'How should I prepare for the multi-day heat risk at this home?',
    launchContext: { entityType: 'HOME_ACTION', entityId: 'heat-action-1', actionId: 'heat-action-1' },
  });
  await expect(page).toHaveURL(new RegExp(`/acceptance/ask\\?propertyId=${propertyId}$`));
  const response = page.locator('#ask-execution-execution-heat-preparation');
  await expect(response.getByRole('heading', { name: 'Prepare this home' })).toBeVisible();
  await expect(response.getByText('Inspect the HVAC filter before the heat arrives.')).toBeVisible();
  await expect(response.getByText('Keep the outdoor condenser area clear.')).toBeVisible();
  await expect(response.getByText('Use shades and avoid peak-hour heat-generating activities.')).toBeVisible();
  await expect(response.getByText('Confirm the incident response and preserve the evidence needed for follow-up.')).toHaveCount(0);
  await expect(response.getByRole('link', { name: 'View in Home Actions' })).toHaveCount(0);
  const checklistLink = response.getByRole('link', { name: 'Open preparation checklist' });
  await expect(checklistLink).toHaveCount(1);
  const checklistHref = await checklistLink.getAttribute('href');
  const checklistUrl = new URL(checklistHref!, 'http://localhost');
  expect(checklistUrl.searchParams.get('from')).toBe('ask');
  expect(checklistUrl.searchParams.get('backTo')).toContain('executionId=execution-heat-preparation');
  await expect.poll(async () => (await response.boundingBox())?.y ?? 0).toBeGreaterThan(80);
});

test('refrigerator capture preserves year precision and resumes automatically', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('When should I replace my refrigerator?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await page.getByRole('button', { name: 'Good' }).click();
  await page.getByRole('group', { name: 'Purchase date precision' }).getByRole('button', { name: 'Year' }).click();
  await page.getByLabel('Purchase date value').fill('2018');
  await page.getByRole('button', { name: 'Save and update answer' }).click();
  await expect(page.getByRole('heading', { name: 'Updated answer' })).toBeVisible();
  expect(api.captureBodies[0]).toMatchObject({ answer: { mode: 'UPDATE', entityId: 'fridge-1', values: { condition: 'GOOD', purchasedOn: { precision: 'YEAR', value: '2018' } } } });
});

test('refinance capture saves consented profile inputs and resumes automatically', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Is refinancing a good option?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await page.getByLabel('Mortgage balance').fill('350000');
  await page.getByLabel('Current interest rate').fill('7.25');
  await page.getByLabel('Remaining term').fill('25');
  await page.getByText('Save these details to my Financing Profile.').click();
  await page.getByRole('button', { name: 'Save and update answer' }).click();
  await expect(page.getByRole('heading', { name: 'Updated answer' })).toBeVisible();
  expect(api.captureBodies[0]).toMatchObject({ sensitiveDataConfirmed: true, answer: { currentMortgageBalanceUsd: 350000, interestRatePct: 7.25, remainingTermYears: 25 } });
});

test('context conflict refreshes inline values and retries without losing the draft', async ({ page }) => {
  const api = await installAskApi(page, { conflictOnce: true });
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('When should I replace my refrigerator?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await page.getByRole('button', { name: 'Fair' }).click();
  await page.getByRole('group', { name: 'Purchase date precision' }).getByRole('button', { name: 'Year' }).click();
  await page.getByLabel('Purchase date value').fill('2017');
  await page.getByRole('button', { name: 'Save and update answer' }).click();
  await expect(page.getByText(/Review the refreshed values and continue/)).toBeVisible();
  await expect(page.getByLabel('Purchase date value')).toHaveValue('2017');
  await page.getByRole('button', { name: 'Save and update answer' }).click();
  await expect(page.getByRole('heading', { name: 'Updated answer' })).toBeVisible();
  expect(api.captureAttempts()).toBe(2);
  expect(api.captureBodies[1]).toMatchObject({ expectedContextVersion: 'context-v2' });
});

test('permission denial keeps a safe full-form recovery path', async ({ page }) => {
  await installAskApi(page, { permissionDenied: true });
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('When should I replace my refrigerator?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await page.getByRole('button', { name: 'Good' }).click();
  await page.getByRole('group', { name: 'Purchase date precision' }).getByRole('button', { name: 'I’m not sure' }).click();
  await page.getByRole('button', { name: 'Save and update answer' }).click();
  await expect(page.getByText(/contributor or owner/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Open full form/ })).toBeVisible();
});

test('capability discovery shows readiness and related-tool continuity', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Is there a tool to help with refinancing?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByRole('heading', { name: 'Best match for your goal' })).toBeVisible();
  await expect(page.getByText('More home details will improve the result')).toBeVisible();
  await expect(page.getByText('Add current mortgage facts before running a comparison.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Related tools for what comes next' })).toBeVisible();
  const relatedToolHref = await page.getByRole('link', { name: /Break-Even/ }).getAttribute('href');
  expect(relatedToolHref).toMatch(new RegExp(`/properties/${propertyId}/tools/break-even\\?`));
  expect(new URL(relatedToolHref!, 'http://localhost').searchParams.get('backTo')).toContain('/dashboard/ask?');
});

test('unavailable capability fails honestly without a launch link', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Show the disabled refinance tool');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByLabel('Mortgage Refinance Radar unavailable')).toBeVisible();
  await expect(page.getByText('This tool is disabled by the current rollout policy.')).toBeVisible();
  await expect(page.getByRole('link', { name: /Mortgage Refinance Radar/ })).toHaveCount(0);
});
