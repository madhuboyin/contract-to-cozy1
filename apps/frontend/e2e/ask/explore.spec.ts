import { expect, test } from '@playwright/test';
import { installAskApi, installAskContext, propertyId } from './fixtures';

// Explore with Cozy, Phase 2 (desktop). Topic selection stays inside Ask and sends nothing; a starter sends exactly one request.
// The calm shell is the product default and starts the desktop rail collapsed; the previous presentation (calm off) starts it expanded.

test('the collapsed rail opens Explore; a topic click sends nothing; Not now keeps the draft; a starter sends one request', async ({ context, page }) => {
  await installAskContext(context, { calm: 'default' });
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  const composer = page.getByPlaceholder(/^Ask anything about /);
  await composer.fill('is my roof ok');

  await page.getByRole('navigation', { name: 'Conversation actions' }).getByRole('button', { name: 'Explore with Cozy' }).click();
  await expect(page.getByRole('heading', { name: 'Home care' })).toBeVisible();
  expect(api.executionBodies).toHaveLength(0);
  expect(new URL(page.url()).pathname).toBe('/acceptance/ask');

  await page.getByRole('group', { name: 'Topics' }).getByRole('button', { name: 'DIY & Projects' }).click();
  await expect(page.getByText(/Nothing to suggest here right now/)).toBeVisible();
  expect(api.executionBodies).toHaveLength(0);

  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('heading', { name: 'DIY & Projects' })).toHaveCount(0);
  await expect(composer).toHaveValue('is my roof ok');
  expect(api.executionBodies).toHaveLength(0);

  await page.getByRole('navigation', { name: 'Conversation actions' }).getByRole('button', { name: 'Explore with Cozy' }).click();
  await page.getByRole('button', { name: 'Home care for this season' }).click();
  await expect.poll(() => api.executionBodies.length).toBe(1);
  expect(api.executionBodies[0]).toMatchObject({
    message: 'What home care should I do this season?', propertyId,
    launchContext: { operationId: 'SEASONAL_HOME_CARE', discovery: { entryId: 'maintain-seasonal', surface: 'TOPIC', topicId: 'HOME_CARE' } },
  });
});

test('the expanded rail carries the Explore group apart from history', async ({ context, page }) => {
  await installAskContext(context);
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  const group = page.getByRole('region', { name: 'Explore with Cozy' });
  await expect(group).toBeVisible();
  // Indicators come from the server: present for two topics, omitted (not zero) for the third.
  await expect(group.getByRole('button')).toHaveText(['Home care3 need attention', 'DIY & Projects', 'My Home Record72% complete', 'More ideas']);
});

test('More ideas: search finds a reviewed idea by an approved alias, a pick launches it once with its operation, and nothing else is sent', async ({ context, page }) => {
  await installAskContext(context);
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByRole('button', { name: /Explore everything Ask Cozy can do/ }).click();
  const dialog = page.getByRole('dialog', { name: 'What Ask Cozy can help with' });
  await dialog.getByRole('searchbox', { name: 'Search what Ask Cozy can help with' }).fill('rebates');
  const results = dialog.getByRole('list', { name: 'Matching ideas' });
  await expect(results.getByRole('button')).toHaveCount(1);
  await expect(results).toContainText('Where could I save money?');
  await expect(results).toContainText('Reduce costs');
  expect(api.executionBodies).toHaveLength(0);
  await results.getByRole('button').click();
  await expect.poll(() => api.executionBodies.length).toBe(1);
  expect(api.executionBodies[0]).toMatchObject({
    message: 'Where could I save money on this home?', propertyId,
    launchContext: { operationId: 'SAVINGS_OPPORTUNITIES', discovery: { entryId: 'save-opportunities', surface: 'EXPLORER' } },
  });
});

test('More ideas: a search with no match says so and clears back to browsing', async ({ context, page }) => {
  await installAskContext(context);
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByRole('button', { name: /Explore everything Ask Cozy can do/ }).click();
  const dialog = page.getByRole('dialog', { name: 'What Ask Cozy can help with' });
  const box = dialog.getByRole('searchbox');
  await box.fill('SAVINGS_OPPORTUNITIES');
  await expect(dialog.getByText(/Nothing matches that yet/)).toBeVisible();
  await box.fill('');
  await expect(dialog.getByRole('heading', { name: 'Reduce costs' })).toBeVisible();
});

// Target selectors (IW-SHELL-022): the area chooser lives inside the focused topic view. Reading it writes nothing and a single option still waits.
async function openAddDetail(page: import('@playwright/test').Page) {
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByRole('navigation', { name: 'Conversation actions' }).getByRole('button', { name: 'Explore with Cozy' }).click();
  await page.getByRole('group', { name: 'Topics' }).getByRole('button', { name: 'My Home Record' }).click();
  await page.getByRole('button', { name: 'Add a missing detail' }).click();
}

test('Add a missing detail: the chooser reads options without sending, a single option waits, and choosing it sends one request with its area', async ({ context, page }) => {
  await installAskContext(context, { calm: 'default' });
  const api = await installAskApi(page);
  await openAddDetail(page);
  const option = page.getByRole('button', { name: /Home systems/ });
  await expect(option).toBeVisible();
  expect(api.selectorReads).toEqual(['PROPERTY_AREA']);
  expect(api.executionBodies).toHaveLength(0);
  await option.click();
  await expect.poll(() => api.executionBodies.length).toBe(1);
  expect(api.executionBodies[0]).toMatchObject({
    message: 'Fill in the missing home systems details.', propertyId,
    launchContext: { operationId: 'PROPERTY_CONTEXT_AREA_CAPTURE', entityType: 'PROPERTY_CONTEXT_AREA', entityId: 'SYSTEMS', discovery: { entryId: 'understand-add-detail', surface: 'TOPIC', topicId: 'HOME_RECORD' } },
  });
});

test('Add a missing detail: Back returns to the topic and sends nothing', async ({ context, page }) => {
  await installAskContext(context, { calm: 'default' });
  const api = await installAskApi(page);
  await openAddDetail(page);
  await page.getByRole('button', { name: 'Back to My Home Record' }).click();
  await expect(page.getByRole('button', { name: 'Add a missing detail' })).toBeVisible();
  expect(api.executionBodies).toHaveLength(0);
});

test('Add a missing detail: nothing missing is explained, and an unreadable record offers a retry instead of claiming nothing is missing', async ({ context, page }) => {
  await installAskContext(context, { calm: 'default' });
  await installAskApi(page, { selectorState: 'NONE_ELIGIBLE' });
  await openAddDetail(page);
  await expect(page.getByText(/nothing to add/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);

  const second = await context.newPage();
  await installAskApi(second, { selectorState: 'UNAVAILABLE' });
  await openAddDetail(second);
  await expect(second.getByText(/could not be checked/i)).toBeVisible();
  await expect(second.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(second.getByText(/nothing to add/i)).toHaveCount(0);
});
