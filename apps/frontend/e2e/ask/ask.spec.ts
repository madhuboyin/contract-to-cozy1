import { expect, test } from '@playwright/test';
import { installAskApi, installAskContext, propertyId } from './fixtures';

test.beforeEach(async ({ context }) => installAskContext(context));

test('starting surface teaches capability breadth without competing CTAs', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await expect(page.locator('[data-ask-layout="full-window"]')).toBeVisible();
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
  const conversationNav = page.getByRole('navigation', { name: 'Ask Cozy conversations' });
  await expect(conversationNav).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Conversation history' })).toHaveCount(1);
  await expect(conversationNav.getByText('Your home assistant')).toBeVisible();
  await expect(conversationNav.getByPlaceholder('Search conversations')).toBeVisible();
  await expect(conversationNav.getByRole('button', { name: /Refrigerator replacement timing/ })).toBeVisible();

  await conversationNav.getByRole('button', { name: /Refrigerator replacement timing/ }).click();
  await expect(page.getByRole('heading', { name: 'A little more context will improve this answer' })).toBeVisible();
  await expect(page).toHaveURL(/sessionId=recent-session-1/);
  await expect(conversationNav.getByRole('button', { name: /Refrigerator replacement timing/ })).toHaveAttribute('aria-current', 'page');

  await conversationNav.getByRole('button', { name: 'New Ask Cozy session' }).click();
  await expect(page.getByRole('heading', { name: 'Popular ways to use Ask Cozy' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A little more context will improve this answer' })).toHaveCount(0);
  await expect(page).not.toHaveURL(/sessionId=/);
  await expect(conversationNav.getByRole('button', { name: /Refrigerator replacement timing/ })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole('heading', { name: 'A little more context will improve this answer' })).toBeVisible();
  await expect(page).toHaveURL(/sessionId=recent-session-1/);
  await conversationNav.getByRole('button', { name: 'New Ask Cozy session' }).click();
  await expect(page.getByRole('heading', { name: 'Popular ways to use Ask Cozy' })).toBeVisible();

  await page.getByPlaceholder('Ask anything about your home…').fill('When should I replace my refrigerator?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByRole('heading', { name: 'A little more context will improve this answer' })).toBeVisible();
  await expect(page).toHaveURL(/sessionId=/);
  await expect(page.getByRole('button', { name: 'New Ask Cozy session' })).toBeVisible();
});

test('conversation switching restores each session draft without copying it to a new conversation', async ({ page }) => {
  await installAskApi(page, { recentSessions: true });
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  const conversationNav = page.getByRole('navigation', { name: 'Ask Cozy conversations' });
  const composer = page.getByPlaceholder('Ask anything about your home…');

  await conversationNav.getByRole('button', { name: /Refrigerator replacement timing/ }).click();
  await composer.fill('Compare the repair estimates first');
  await conversationNav.getByRole('button', { name: 'New Ask Cozy session' }).click();
  await expect(composer).toHaveValue('');
  await composer.fill('Plan the next project');
  await conversationNav.getByRole('button', { name: /Refrigerator replacement timing/ }).click();
  await expect(composer).toHaveValue('Compare the repair estimates first');
});

test('conversation rail loads an older page without replacing the already loaded history', async ({ page }) => {
  await installAskApi(page, { recentSessions: true, recentSessionsPages: true });
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  const conversationNav = page.getByRole('navigation', { name: 'Ask Cozy conversations' });
  await expect(conversationNav.getByRole('button', { name: /Refrigerator replacement timing/ })).toBeVisible();
  await conversationNav.getByRole('button', { name: 'Load older conversations' }).click();
  await expect(conversationNav.getByRole('button', { name: /Older roof project/ })).toBeVisible();
  await expect(conversationNav.getByRole('button', { name: /Refrigerator replacement timing/ })).toBeVisible();
  await expect(conversationNav.getByRole('button', { name: 'Load older conversations' })).toHaveCount(0);
});

test('conversation search finds a question beyond the title without putting it in a URL', async ({ page }) => {
  await installAskApi(page, { recentSessions: true, searchSessions: true });
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  const conversationNav = page.getByRole('navigation', { name: 'Ask Cozy conversations' });
  const searchRequest = page.waitForRequest((request) => request.url().endsWith('/api/ask/sessions/search'));
  await conversationNav.getByPlaceholder('Search conversations').fill('flashing');
  const request = await searchRequest;
  expect(request.method()).toBe('POST');
  expect(request.postDataJSON()).toMatchObject({ propertyId, query: 'flashing' });
  expect(request.url()).not.toContain('flashing');
  await expect(conversationNav.getByRole('button', { name: /Older roof project/ })).toBeVisible();
  await expect(conversationNav.getByRole('button', { name: /Refrigerator replacement timing/ })).toHaveCount(0);
});

test('conversation rail switches to authorized all-home history and keeps property labels visible', async ({ page }) => {
  await installAskApi(page, { recentSessions: true, allHomeSessions: true });
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  const conversationNav = page.getByRole('navigation', { name: 'Ask Cozy conversations' });
  await conversationNav.getByRole('button', { name: 'All homes' }).click();
  await expect(conversationNav.getByRole('button', { name: /Boiler replacement options.*Second Home/ })).toBeVisible();
  const searchRequest = page.waitForRequest((request) => request.url().endsWith('/api/ask/sessions/search'));
  await conversationNav.getByPlaceholder('Search conversations').fill('boiler');
  const request = await searchRequest;
  expect(request.postDataJSON()).toMatchObject({ scope: 'ALL_HOMES', query: 'boiler' });
  expect(request.url()).not.toContain('boiler');
  await expect(conversationNav.getByRole('button', { name: /Boiler replacement options.*Second Home/ })).toBeVisible();
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

test('a completed question is not repeated as its own follow-up suggestion', async ({ page }) => {
  await installAskApi(page, { repeatedSuggestion: true });
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  const question = 'Show incomplete inventory records';
  await page.getByPlaceholder('Ask anything about your home…').fill(question);
  await page.getByRole('button', { name: 'Send question' }).click();

  await expect(page.getByText(question, { exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: question, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'List all appliances', exact: true })).toBeVisible();
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

test('Property Summary timeline events open canonical detail inline with traditional timeline navigation secondary', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Give me a summary of my home record.');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Recent verified home activity' }) });
  await expect(response.getByRole('link', { name: 'Roof replacement' })).toHaveCount(0);
  await expect(response.getByRole('button', { name: 'Roof replacement' })).toBeVisible();
  await expect(response.getByRole('link', { name: /Open home timeline/ })).toHaveAttribute('href', `/dashboard/properties/${propertyId}/timeline`);

  await response.getByRole('button', { name: 'Roof replacement' }).click();
  await expect(response.getByText('The roof replacement is recorded with verified evidence.')).toBeVisible();
  await expect(response.getByText('$18,500')).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('Property Summary rooms open canonical detail inline with the full Rooms collection secondary', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Give me a summary of my home record.');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Rooms', exact: true }) });
  await expect(response.getByRole('link', { name: 'Kitchen' })).toHaveCount(0);
  await expect(response.getByRole('button', { name: 'Kitchen' })).toBeVisible();
  await expect(response.getByRole('link', { name: /Open Rooms/ })).toHaveAttribute('href', `/dashboard/properties/${propertyId}/rooms`);

  await response.getByRole('button', { name: 'Kitchen' }).click();
  await expect(response.getByText('Good · 82/100')).toBeVisible();
  await expect(response.getByText('$12,500')).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('Property Summary documents open canonical detail inline with the full Documents collection secondary', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Give me a summary of my home record.');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Documents', exact: true }) });
  await expect(response.getByRole('link', { name: 'Homeowners policy declaration' })).toHaveCount(0);
  await expect(response.getByRole('button', { name: 'Homeowners policy declaration' })).toBeVisible();
  await expect(response.getByRole('link', { name: /Open Documents/ })).toHaveAttribute('href', `/dashboard/documents?propertyId=${propertyId}`);

  await response.getByRole('button', { name: 'Homeowners policy declaration' }).click();
  await expect(response.getByText('Annual declarations page from the carrier.')).toBeVisible();
  await expect(response.getByText('240.0 KB')).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
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
  await expect(page).toHaveURL(new RegExp(`/acceptance/ask\\?`));
  const askUrl = new URL(page.url());
  expect(askUrl.searchParams.get('propertyId')).toBe(propertyId);
  expect(askUrl.searchParams.get('sessionId')).toBeTruthy();
  expect(askUrl.searchParams.get('executionId')).toBe('execution-heat-preparation');
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

test('maintenance task titles open canonical detail inline and keep traditional navigation optional', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('What maintenance tasks are due this month?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-maintenance');
  await expect(response.getByRole('button', { name: 'Service the heat pump' })).toBeVisible();
  await expect(response.getByRole('link', { name: 'Service the heat pump' })).toHaveCount(0);
  await response.getByRole('button', { name: 'Service the heat pump' }).click();

  await expect(response.getByRole('heading', { name: 'Service the heat pump' })).toBeVisible();
  await expect(response.getByText('Annual preventive service for the recorded HVAC system.')).toBeVisible();
  await expect(response.getByText('$250')).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
  await expect(response.getByRole('link', { name: /Open Maintenance/ })).toBeVisible();
});

test('maintenance detail access loss redacts the stale result and its actions without leaving Ask', async ({ page }) => {
  await installAskApi(page, { maintenanceDetailAccessLost: true });
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('What maintenance tasks are due this month?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-maintenance');
  await response.getByRole('button', { name: 'Service the heat pump' }).click();

  await expect(response).toHaveAttribute('role', 'alert');
  await expect(response.getByRole('heading', { name: 'Result unavailable' })).toBeVisible();
  await expect(response).toContainText('This result is no longer available, or your access to this home has changed.');
  await expect(response.getByRole('button', { name: 'Complete' })).toHaveCount(0);
  await expect(response.getByRole('link', { name: /Open Maintenance/ })).toHaveCount(0);
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('maintenance create starts its capture inline and keeps setup optional', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('What maintenance tasks are due this month?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-maintenance');
  await response.getByRole('button', { name: 'Create a task' }).click();

  await expect(page.getByRole('heading', { name: 'Maintenance task details' })).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
  await expect(page.getByRole('link', { name: 'Maintenance Setup' })).toBeVisible();
});

test('maintenance collection pages through the full server result without leaving Ask', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('What maintenance tasks are due this month?');
  await page.getByRole('button', { name: 'Send question' }).click();

  await page.getByRole('button', { name: /Next page of Pending and in progress/ }).click();

  await expect(page.getByText('Inspect the attic fan')).toBeVisible();
  await expect(page.getByText('Server results 51–51 of 51')).toBeVisible();
  await expect(page.locator('[id^="ask-execution-"]').filter({ hasText: 'Maintenance record' })).toHaveCount(1);
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
  await expect(page.getByRole('link', { name: 'View all in Maintenance' })).toBeVisible();
});

test('adaptive table view switches locally and persists the homeowner choice without duplicating the result', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Compare ownership costs');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-adaptive-table');
  await expect(response.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true');
  await expect(response.getByRole('table', { name: 'Cost by category' })).toBeVisible();
  await response.getByRole('button', { name: 'Cards' }).click();

  await expect(response.getByRole('table')).toHaveCount(0);
  await expect(response.locator('[data-table-presentation="cards"]')).toBeVisible();
  await expect(response.getByText('Showing 2 of 3 records. View: cards.')).toBeVisible();
  await expect(response.getByRole('link', { name: 'Open ownership costs' })).toBeVisible();
  await expect.poll(() => api.executionBodies.length).toBe(1);
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('ctc:ask-result-view:v1:ask-acceptance-session:ask-property-fixture:adaptive-table-result') ?? '{}').presentationModes?.['ownership-cost-categories'])).toBe('CARDS');

  await response.getByRole('button', { name: 'Table' }).click();
  await expect(response.getByRole('table', { name: 'Cost by category' })).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
  await expect.poll(() => api.executionBodies.length).toBe(1);
});

test('bounded comparison strip explains declared badges and offers a persistent show-all path without leaving Ask', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Compare repair options');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-comparison-strip');
  await expect(response.getByRole('listitem')).toHaveCount(3);
  await expect(response.getByRole('button', { name: 'Card strip' })).toHaveAttribute('aria-pressed', 'true');
  await response.getByText('Why this label').first().click();
  await expect(response.getByText('The recorded $650 repair estimate is lower than the modeled replacement estimate.')).toBeVisible();
  await expect(response.getByRole('button', { name: 'Review repair' })).toBeVisible();

  await response.getByRole('button', { name: 'Next option in Compare refrigerator options' }).click();
  await expect(response.getByText(/Option 2 of 3/)).toBeVisible();
  await response.getByRole('button', { name: 'Show all' }).click();
  await expect(response.locator('[data-comparison-presentation="grid"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('ctc:ask-result-view:v1:ask-acceptance-session:ask-property-fixture:comparison-strip-result') ?? '{}').comparisonLayouts?.['refrigerator-options'])).toBe('GRID');
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
  await expect.poll(() => api.executionBodies.length).toBe(1);
});

test('bounded comparison adapts to stacked cards on mobile without losing options or actions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Compare repair options');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-comparison-strip');
  await expect(response.getByRole('listitem')).toHaveCount(3);
  await expect(response.getByRole('listitem', { name: /Option 1 of 3: Repair/ })).toBeVisible();
  await expect(response.getByRole('listitem', { name: /Option 3 of 3: Monitor/ })).toBeVisible();
  await expect(response.getByRole('button', { name: 'Review replacement' })).toBeVisible();
  await expect(response.getByRole('button', { name: 'Next option in Compare refrigerator options' })).toBeHidden();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
  await expect.poll(() => api.executionBodies.length).toBe(1);
});

test('response sources open beside the desktop conversation without replacing the Ask canvas', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Compare ownership costs');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-adaptive-table');
  const sourceTrigger = response.getByRole('button', { name: /View sources and context/ });
  await expect(response.getByText('Recorded insurance premiums remain representative for this planning view.')).toHaveCount(0);
  await expect(response.getByText('Future taxes and premiums may differ from the recorded amounts.')).toBeVisible();
  await sourceTrigger.click();

  const panel = page.getByRole('complementary', { name: 'Response context' });
  await expect(panel.getByRole('heading', { name: 'Response context' })).toBeVisible();
  await expect(panel.getByText('2026 property tax assessment')).toBeVisible();
  await expect(panel.getByText(/County assessor/)).toBeVisible();
  await expect(panel.getByText('Property tax: $6,200 per year.')).toBeVisible();
  await expect(panel.getByText('Insurance: $1,900 per year.')).toBeVisible();
  await expect(panel.getByText('Supports this claim')).toHaveCount(2);
  await expect(panel.getByText('Recorded insurance premiums remain representative for this planning view.')).toBeVisible();
  await expect(panel.getByText('Future taxes and premiums may differ from the recorded amounts.')).toBeVisible();
  await expect(page.getByPlaceholder('Ask anything about your home…')).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
  await expect.poll(() => api.executionBodies.length).toBe(1);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('ctc:ask-context-panel:v1:ask-acceptance-session:ask-property-fixture'))).toBe('execution-adaptive-table');

  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toHaveCount(0);
  await expect(sourceTrigger).toBeFocused();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('ctc:ask-context-panel:v1:ask-acceptance-session:ask-property-fixture'))).toBeNull();
});

test('response sources use a dismissible sheet on mobile and restore trigger focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Compare ownership costs');
  await page.getByRole('button', { name: 'Send question' }).click();

  const sourceTrigger = page.locator('#ask-execution-execution-adaptive-table').getByRole('button', { name: /View sources and context/ });
  await sourceTrigger.click();
  const sheet = page.getByRole('dialog', { name: 'Response context' });
  await expect(sheet.getByText('Home insurance premium')).toBeVisible();
  await expect(sheet.getByText('Insurance: $1,900 per year.')).toBeVisible();
  await expect(sheet.getByText('Recorded insurance premiums remain representative for this planning view.')).toBeVisible();
  await sheet.getByText('Close', { exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(sourceTrigger).toBeFocused();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('created output records open as authoritative response context while workflow status stays in the conversation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Show the task output');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-maintenance-output');
  await expect(response.getByRole('heading', { name: 'Maintenance task created' })).toBeVisible();
  await expect(response.getByText('The task is now part of this home’s canonical Maintenance record.')).toBeVisible();
  await expect(response.getByRole('link', { name: 'Open task in Maintenance' })).toHaveCount(0);
  await response.getByRole('button', { name: 'View response context' }).click();

  const panel = page.getByRole('complementary', { name: 'Response context' });
  await expect(panel.getByRole('heading', { name: 'Created record' })).toBeVisible();
  await expect(panel.getByText('Replace HVAC filter')).toBeVisible();
  await expect(panel.getByText(/Maintenance task · pending · Created/)).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Open task in Maintenance' })).toBeVisible();
  await expect(page.getByPlaceholder('Ask anything about your home…')).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('a reused quote workspace is disclosed as an exact output artifact without hiding the no-selection receipt', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Show the quote workspace output');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-quote-workspace-output');
  await expect(response.getByRole('heading', { name: 'Existing comparison workspace opened' })).toBeVisible();
  await expect(response.getByText('No provider or quote was selected. Add comparable proposals in the governed workspace.')).toBeVisible();
  await expect(response.getByRole('link', { name: 'Open comparison' })).toHaveCount(0);
  await response.getByRole('button', { name: 'View response context' }).click();

  const panel = page.getByRole('complementary', { name: 'Response context' });
  await expect(panel.getByRole('heading', { name: 'Workspace record' })).toBeVisible();
  await expect(panel.getByText('Plumbing quote comparison')).toBeVisible();
  await expect(panel.getByText(/Quote comparison workspace · draft · Existing record reused · Originally created/)).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Open comparison' })).toHaveAttribute('href', `/dashboard/properties/${propertyId}/tools/quote-comparison?workspaceId=workspace-1`);
  await expect(page.getByPlaceholder('Ask anything about your home…')).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('related records show the authoritative document-to-event relationship without replacing the conversation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Show the evidence relationship');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-related-records');
  await expect(response.getByRole('heading', { name: 'Attached to your home timeline' })).toBeVisible();
  await expect(response.getByText('Roof invoice.pdf is now attached as evidence on your home timeline.')).toBeVisible();
  await expect(response.getByRole('link', { name: 'Open home timeline' })).toHaveCount(0);
  await response.getByRole('button', { name: 'View response context' }).click();

  const panel = page.getByRole('complementary', { name: 'Response context' });
  await expect(panel.getByRole('heading', { name: 'Related records' })).toBeVisible();
  await expect(panel.getByText('Roof invoice.pdf')).toBeVisible();
  await expect(panel.getByText('Evidence for')).toBeVisible();
  await expect(panel.getByText('Roof replacement')).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Open home timeline' })).toBeVisible();
  await expect(page.getByPlaceholder('Ask anything about your home…')).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
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
