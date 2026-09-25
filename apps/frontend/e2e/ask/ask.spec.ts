import { expect, test } from '@playwright/test';
import { installAskApi, installAskContext, propertyId } from './fixtures';

// The page uses a generated per-conversation session id; sessionStorage keys embed it.
const sessionIdOf = (url: string) => new URL(url).searchParams.get('sessionId');

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
  await expect(conversationNav.getByRole('button', { name: /^When should I replace my refrigerator\?/ })).toBeVisible();

  await conversationNav.getByRole('button', { name: /^When should I replace my refrigerator\?/ }).click();
  await expect(page.getByRole('heading', { name: 'A little more context will improve this answer' })).toBeVisible();
  await expect(page).toHaveURL(/sessionId=recent-session-1/);
  await expect(conversationNav.getByRole('button', { name: /^When should I replace my refrigerator\?/ })).toHaveAttribute('aria-current', 'page');

  await conversationNav.getByRole('button', { name: 'New Ask Cozy session' }).click();
  await expect(page.getByRole('heading', { name: 'Popular ways to use Ask Cozy' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A little more context will improve this answer' })).toHaveCount(0);
  await expect(page).not.toHaveURL(/sessionId=/);
  await expect(conversationNav.getByRole('button', { name: /^When should I replace my refrigerator\?/ })).toBeVisible();

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

  await conversationNav.getByRole('button', { name: /^When should I replace my refrigerator\?/ }).click();
  await composer.fill('Compare the repair estimates first');
  await conversationNav.getByRole('button', { name: 'New Ask Cozy session' }).click();
  await expect(composer).toHaveValue('');
  await composer.fill('Plan the next project');
  await conversationNav.getByRole('button', { name: /^When should I replace my refrigerator\?/ }).click();
  await expect(composer).toHaveValue('Compare the repair estimates first');
});

test('conversation rail loads an older page without replacing the already loaded history', async ({ page }) => {
  await installAskApi(page, { recentSessions: true, recentSessionsPages: true });
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  const conversationNav = page.getByRole('navigation', { name: 'Ask Cozy conversations' });
  await expect(conversationNav.getByRole('button', { name: /^When should I replace my refrigerator\?/ })).toBeVisible();
  await conversationNav.getByRole('button', { name: 'Load older conversations' }).click();
  await expect(conversationNav.getByRole('button', { name: /^Older roof project/ })).toBeVisible();
  await expect(conversationNav.getByRole('button', { name: /^When should I replace my refrigerator\?/ })).toBeVisible();
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
  await expect(conversationNav.getByRole('button', { name: /^Older roof project/ })).toBeVisible();
  await expect(conversationNav.getByRole('button', { name: /^When should I replace my refrigerator\?/ })).toHaveCount(0);
});

test('conversation rail switches to authorized all-home history and keeps property labels visible', async ({ page }) => {
  await installAskApi(page, { recentSessions: true, allHomeSessions: true });
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  const conversationNav = page.getByRole('navigation', { name: 'Ask Cozy conversations' });
  await conversationNav.getByRole('button', { name: 'All homes' }).click();
  await expect(conversationNav.getByRole('button', { name: /^Boiler replacement options.*Second Home/ })).toBeVisible();
  const searchRequest = page.waitForRequest((request) => request.url().endsWith('/api/ask/sessions/search'));
  await conversationNav.getByPlaceholder('Search conversations').fill('boiler');
  const request = await searchRequest;
  expect(request.postDataJSON()).toMatchObject({ scope: 'ALL_HOMES', query: 'boiler' });
  expect(request.url()).not.toContain('boiler');
  await expect(conversationNav.getByRole('button', { name: /^Boiler replacement options.*Second Home/ })).toBeVisible();
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

  await expect(page.getByRole('article').getByText(question, { exact: true })).toHaveCount(1);
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
  await expect(response.getByRole('link', { name: /Open home timeline/ })).toHaveAttribute('href', new RegExp(`^/dashboard/properties/${propertyId}/timeline\\?backTo=`));

  await response.getByRole('button', { name: 'Roof replacement' }).click();
  await expect(response.getByText('The roof replacement is recorded with verified evidence.')).toBeVisible();
  await expect(response.getByText('$18,500')).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('a contributor corrects a timeline event title inline: exact identity is sent, the text field is edited, and the receipt stays in the conversation', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Give me a correctable summary of my home record.');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Recent verified home activity' }) });
  await response.getByRole('button', { name: 'Roof replacement' }).click();
  await expect(response.getByText('The roof replacement is recorded with verified evidence.')).toBeVisible();
  await response.getByText('Correct a detail').click();
  await response.getByRole('button', { name: /Correct title/ }).click();

  // The click dispatches through the normal Ask path with the exact event identity.
  await expect.poll(() => api.executionBodies.some((body) => body.message === 'Correct the title of this timeline event.'
    && (body.launchContext as { entityType?: string; entityId?: string } | undefined)?.entityType === 'HOME_EVENT'
    && (body.launchContext as { entityId?: string } | undefined)?.entityId === 'event-property-summary')).toBe(true);
  await expect(page.getByText('Correct the title of "Roof replacement"?')).toBeVisible();
  await expect(page.getByText('No shared-home record has changed yet', { exact: false })).toBeVisible();

  // The new TEXT editable field: edit, save (a new confirmation version), consent, confirm.
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('textbox', { name: 'Corrected title' }).fill('Roof replacement (full tear-off)');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => api.correctionEditBodies).toEqual([{ confirmationVersion: 1, edits: { value: 'Roof replacement (full tear-off)' } }]);
  await expect(page.getByRole('definition').filter({ hasText: 'Roof replacement (full tear-off)' })).toBeVisible();
  await page.getByLabel(/I authorize this correction to the shared home timeline/).check();
  await page.getByRole('button', { name: 'Save title' }).click();

  await expect.poll(() => api.correctionConfirmBodies).toEqual([expect.objectContaining({ confirmationVersion: 2, consentConfirmed: true })]);
  await expect(page.getByText('Home timeline event corrected')).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

// Shared flow for the inventory / warranty / room corrections: open the record's inline detail from the
// Property Summary, click the declared correction action, verify the exact identity reaches the server,
// edit the confirmation's editable field, consent, confirm, and see the receipt without leaving Ask.
async function correctionFlow(page: import('@playwright/test').Page, api: Awaited<ReturnType<typeof installAskApi>>, spec: {
  block: string; recordButton: string; detailText: string; actionLabel: RegExp; actionMessage: string; entityType: string; entityId: string;
  confirmationTitle: string; fieldLabel: string; newValue: string; confirmLabel: string; consentText: RegExp; receiptTitle: string;
  // Optional: open the "Correct a detail" disclosure first, pick from a dropdown, and how the saved value reads.
  disclosure?: boolean; select?: boolean; shownValue?: string;
}) {
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Give me a correctable summary of my home record.');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.getByRole('article').filter({ has: page.getByRole('heading', { name: spec.block, exact: true }) });
  await response.getByRole('button', { name: spec.recordButton, exact: true }).click();
  await expect(response.getByText(spec.detailText)).toBeVisible();
  if (spec.disclosure) await response.getByText('Correct a detail').click();
  await response.getByRole('button', { name: spec.actionLabel }).click();

  await expect.poll(() => api.executionBodies.some((body) => body.message === spec.actionMessage
    && (body.launchContext as { entityType?: string } | undefined)?.entityType === spec.entityType
    && (body.launchContext as { entityId?: string } | undefined)?.entityId === spec.entityId)).toBe(true);
  await expect(page.getByText(spec.confirmationTitle)).toBeVisible();
  await expect(page.getByText('No shared-home record has changed yet', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  if (spec.select) await page.getByLabel(spec.fieldLabel).selectOption(spec.newValue);
  else await page.getByLabel(spec.fieldLabel).fill(spec.newValue);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => api.correctionEditBodies).toEqual([{ confirmationVersion: 1, edits: { value: spec.newValue } }]);
  await expect(page.getByRole('definition').filter({ hasText: spec.shownValue ?? spec.newValue })).toBeVisible();
  await page.getByLabel(spec.consentText).check();
  await page.getByRole('button', { name: spec.confirmLabel, exact: true }).click();

  await expect.poll(() => api.correctionConfirmBodies).toEqual([expect.objectContaining({ confirmationVersion: 2, consentConfirmed: true })]);
  await expect(page.getByText(spec.receiptTitle)).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
}

test('a contributor corrects an inventory item install date inline through the DATE field', async ({ page }) => {
  const api = await installAskApi(page);
  await correctionFlow(page, api, {
    block: 'Systems and inventory', recordButton: 'Water heater', detailText: 'Tank-style, in basement utility closet.', actionLabel: /^Correct install date/,
    actionMessage: 'Correct the install date of this inventory item.', entityType: 'INVENTORY_ITEM', entityId: 'item-property-summary', disclosure: true,
    confirmationTitle: 'Correct installed date for Water heater?', fieldLabel: 'Corrected installed date', newValue: '2021-03-15', confirmLabel: 'Save installed date',
    consentText: /I authorize this correction to the shared home inventory record/, receiptTitle: 'Inventory record updated',
  });
});

test('a contributor corrects an inventory item condition inline through a dropdown', async ({ page }) => {
  const api = await installAskApi(page);
  await correctionFlow(page, api, {
    block: 'Systems and inventory', recordButton: 'Water heater', detailText: 'Tank-style, in basement utility closet.', actionLabel: /^Correct condition/,
    actionMessage: 'Correct the condition of this inventory item.', entityType: 'INVENTORY_ITEM', entityId: 'item-property-summary', disclosure: true, select: true,
    confirmationTitle: 'Correct condition for Water heater?', fieldLabel: 'Corrected condition', newValue: 'FAIR', shownValue: 'Fair', confirmLabel: 'Save condition',
    consentText: /I authorize this correction to the shared home inventory record/, receiptTitle: 'Inventory record updated',
  });
});

test('a contributor corrects an inventory item purchase cost inline through the money field', async ({ page }) => {
  const api = await installAskApi(page);
  await correctionFlow(page, api, {
    block: 'Systems and inventory', recordButton: 'Water heater', detailText: 'Tank-style, in basement utility closet.', actionLabel: /^Correct purchase cost/,
    actionMessage: 'Correct the purchase cost of this inventory item.', entityType: 'INVENTORY_ITEM', entityId: 'item-property-summary', disclosure: true,
    confirmationTitle: 'Correct purchase cost for Water heater?', fieldLabel: 'Corrected purchase cost', newValue: '925.50', shownValue: '$925.50', confirmLabel: 'Save purchase cost',
    consentText: /I authorize this correction to the shared home inventory record/, receiptTitle: 'Inventory record updated',
  });
});

test('a contributor corrects their own warranty expiry date inline through the DATE field', async ({ page }) => {
  const api = await installAskApi(page);
  await correctionFlow(page, api, {
    block: 'Warranties', recordButton: 'Acme Home Warranty', detailText: 'Covers HVAC and major appliances.', actionLabel: /^Correct expiry date/,
    actionMessage: 'Correct the expiry date of this warranty.', entityType: 'WARRANTY', entityId: 'warranty-property-summary', disclosure: true,
    confirmationTitle: 'Correct the expiry date of the Acme Home Warranty warranty?', fieldLabel: 'Corrected expiry date', newValue: '2028-06-30', confirmLabel: 'Save expiry date',
    consentText: /I authorize this correction to the warranty record/, receiptTitle: 'Warranty updated',
  });
});

test('a contributor corrects a timeline event amount inline through the money field', async ({ page }) => {
  const api = await installAskApi(page);
  await correctionFlow(page, api, {
    block: 'Recent verified home activity', recordButton: 'Roof replacement', detailText: 'The roof replacement is recorded with verified evidence.', actionLabel: /^Correct amount/,
    actionMessage: 'Correct the amount of this timeline event.', entityType: 'HOME_EVENT', entityId: 'event-property-summary', disclosure: true,
    confirmationTitle: 'Correct the amount of "Roof replacement"?', fieldLabel: 'Corrected amount', newValue: '19250.50', shownValue: '$19250.50', confirmLabel: 'Save amount',
    consentText: /I authorize this correction to the shared home timeline/, receiptTitle: 'Home timeline event corrected',
  });
});

test('a contributor corrects a warranty coverage type inline through a dropdown', async ({ page }) => {
  const api = await installAskApi(page);
  await correctionFlow(page, api, {
    block: 'Warranties', recordButton: 'Acme Home Warranty', detailText: 'Covers HVAC and major appliances.', actionLabel: /^Correct coverage type/,
    actionMessage: 'Correct the coverage type of this warranty.', entityType: 'WARRANTY', entityId: 'warranty-property-summary', disclosure: true, select: true,
    confirmationTitle: 'Correct the coverage type of the Acme Home Warranty warranty?', fieldLabel: 'Corrected coverage type', newValue: 'HVAC', shownValue: 'HVAC', confirmLabel: 'Save coverage type',
    consentText: /I authorize this correction to the warranty record/, receiptTitle: 'Warranty updated',
  });
});

test('a contributor renames a room inline through the TEXT field', async ({ page }) => {
  const api = await installAskApi(page);
  await correctionFlow(page, api, {
    block: 'Rooms', recordButton: 'Kitchen', detailText: 'Good · 82/100', actionLabel: /^Rename room/,
    actionMessage: 'Rename this room.', entityType: 'INVENTORY_ROOM', entityId: 'room-property-summary',
    confirmationTitle: 'Rename "Kitchen"?', fieldLabel: 'New room name', newValue: 'Chef kitchen', confirmLabel: 'Save room name',
    consentText: /I authorize this rename of the shared home record/, receiptTitle: 'Room renamed',
  });
});

test('a contributor changes a room type inline through a dropdown', async ({ page }) => {
  const api = await installAskApi(page);
  await correctionFlow(page, api, {
    block: 'Rooms', recordButton: 'Kitchen', detailText: 'Good · 82/100', actionLabel: /^Change room type/,
    actionMessage: 'Change the type of this room.', entityType: 'INVENTORY_ROOM', entityId: 'room-property-summary', select: true,
    confirmationTitle: 'Change the type of "Kitchen"?', fieldLabel: 'New type', newValue: 'OFFICE', shownValue: 'OFFICE', confirmLabel: 'Save type',
    consentText: /I authorize this type change to the shared home record/, receiptTitle: 'Room updated',
  });
});

test('a contributor changes a room floor level inline through the TEXT field', async ({ page }) => {
  const api = await installAskApi(page);
  await correctionFlow(page, api, {
    block: 'Rooms', recordButton: 'Kitchen', detailText: 'Good · 82/100', actionLabel: /^Change floor level/,
    actionMessage: 'Change the floor level of this room.', entityType: 'INVENTORY_ROOM', entityId: 'room-property-summary',
    confirmationTitle: 'Change the floor level of "Kitchen"?', fieldLabel: 'New floor level', newValue: '-1', confirmLabel: 'Save floor level',
    consentText: /I authorize this floor level change to the shared home record/, receiptTitle: 'Room updated',
  });
});

test('a contributor changes a timeline event\'s visibility inline through a dropdown', async ({ page }) => {
  const api = await installAskApi(page);
  await correctionFlow(page, api, {
    block: 'Recent verified home activity', recordButton: 'Roof replacement', detailText: 'The roof replacement is recorded with verified evidence.',
    actionLabel: /^Change visibility/, actionMessage: 'Change the visibility of this timeline event.', entityType: 'HOME_EVENT', entityId: 'event-property-summary',
    disclosure: true, select: true,
    confirmationTitle: 'Change who can see "Roof replacement"?', fieldLabel: 'New visibility', newValue: 'RESALE_PACK', shownValue: 'Resale pack', confirmLabel: 'Save visibility',
    consentText: /I authorize this visibility change to the shared home timeline/, receiptTitle: 'Visibility changed',
  });
});

test('a contributor links a timeline event to a room inline through a dropdown, including unlinking with "No room"', async ({ page }) => {
  const api = await installAskApi(page);
  await correctionFlow(page, api, {
    block: 'Recent verified home activity', recordButton: 'Roof replacement', detailText: 'The roof replacement is recorded with verified evidence.',
    actionLabel: /^Correct room/, actionMessage: 'Correct the room of this timeline event.', entityType: 'HOME_EVENT', entityId: 'event-property-summary',
    disclosure: true, select: true,
    confirmationTitle: 'Correct the room of "Roof replacement"?', fieldLabel: 'Corrected room', newValue: 'room-property-summary', shownValue: 'Kitchen', confirmLabel: 'Save room',
    consentText: /I authorize this correction to the shared home timeline/, receiptTitle: 'Home timeline event corrected',
  });
});

test('a contributor links an inventory item to a room inline through a dropdown', async ({ page }) => {
  const api = await installAskApi(page);
  await correctionFlow(page, api, {
    block: 'Systems and inventory', recordButton: 'Water heater', detailText: 'Tank-style, in basement utility closet.',
    actionLabel: /^Correct room/, actionMessage: 'Correct the room of this inventory item.', entityType: 'INVENTORY_ITEM', entityId: 'item-property-summary',
    disclosure: true, select: true,
    confirmationTitle: 'Correct room for Water heater?', fieldLabel: 'Corrected room', newValue: 'room-property-summary', shownValue: 'Kitchen', confirmLabel: 'Save room',
    consentText: /I authorize this correction to the shared home inventory record/, receiptTitle: 'Inventory record updated',
  });
});

test('a contributor adds a timeline event inline: the Add action opens the form, Continue leads to a review, and confirming shows the receipt', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Give me a correctable summary of my home record.');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Recent verified home activity' }) });
  await response.getByRole('button', { name: 'Add a timeline event' }).click();
  await expect.poll(() => api.executionBodies.some((body) => body.message === 'Add an event to my home timeline.'
    && (body.launchContext as { operationId?: string } | undefined)?.operationId === 'CAPTURE_EVENT_CONFIRM')).toBe(true);
  await expect(page.getByText('Nothing has been saved yet', { exact: false })).toBeVisible();

  await page.getByLabel('Title', { exact: true }).fill('Water heater replaced');
  await page.getByRole('button', { name: 'Repair', exact: true }).click();
  await page.getByLabel('Date', { exact: true }).fill('2026-08-15');
  await page.getByRole('button', { name: 'Continue to review' }).click();

  await expect.poll(() => api.addCaptureBodies).toEqual([expect.objectContaining({
    requirementId: 'capture-event-add', captureKey: 'CAPTURE_EVENT_ADD', expectedContextVersion: 'event-add-context-v1',
    answer: expect.objectContaining({ title: 'Water heater replaced', type: 'REPAIR', occurredAt: '2026-08-15' }),
  })]);
  await expect(page.getByText('Add this to your home timeline?').first()).toBeVisible();
  await expect(page.getByText('You entered these details', { exact: false }).first()).toBeVisible();
  await page.getByLabel(/I confirm this is accurate and authorize ContractToCozy to save it to my home timeline/).check();
  await page.getByRole('button', { name: 'Add to timeline', exact: true }).click();
  await expect.poll(() => api.correctionConfirmBodies).toEqual([expect.objectContaining({ confirmationVersion: 1, consentConfirmed: true })]);
  await expect(page.getByText('Added to your home timeline')).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('a contributor adds a room inline: the Add action opens the form, Continue leads to a review, and confirming shows the receipt', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Give me a correctable summary of my home record.');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Rooms', exact: true }) });
  await response.getByRole('button', { name: 'Add a room' }).click();
  await expect.poll(() => api.executionBodies.some((body) => body.message === 'Add a room to my home record.'
    && (body.launchContext as { operationId?: string } | undefined)?.operationId === 'ROOM_CREATE')).toBe(true);
  await expect(page.getByText('Nothing has been saved yet', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'Office', exact: true }).click();
  await page.getByLabel('Room name', { exact: true }).fill('Home office');
  await page.getByLabel('Floor level', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Continue to review' }).click();

  await expect.poll(() => api.addCaptureBodies).toEqual([expect.objectContaining({
    requirementId: 'room-create-inputs', captureKey: 'ROOM_CREATE_INPUTS', expectedContextVersion: 'room-add-context-v1',
    answer: expect.objectContaining({ type: 'OFFICE', name: 'Home office' }),
  })]);
  await expect(page.getByText('Add the room "Home office"?').first()).toBeVisible();
  await page.getByLabel(/I authorize adding this room to the shared home record/).check();
  await page.getByRole('button', { name: 'Add room', exact: true }).click();
  await expect.poll(() => api.correctionConfirmBodies).toEqual([expect.objectContaining({ confirmationVersion: 1, consentConfirmed: true })]);
  await expect(page.getByText('Room added')).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('a contributor adds an inventory item inline: the Add action opens the form, Continue leads to a review, and confirming shows the receipt', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Give me a correctable summary of my home record.');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Systems and inventory', exact: true }) });
  await expect(response.getByRole('link', { name: /Open home inventory/ })).toBeVisible();
  await response.getByRole('button', { name: 'Add an item' }).click();
  await expect.poll(() => api.executionBodies.some((body) => body.message === 'Add an item to my home inventory.'
    && (body.launchContext as { operationId?: string } | undefined)?.operationId === 'INVENTORY_ITEM_CREATE')).toBe(true);
  await expect(page.getByText('Nothing has been saved yet', { exact: false })).toBeVisible();

  await page.getByLabel('Item name', { exact: true }).fill('Bosch dishwasher');
  await page.getByRole('button', { name: 'Appliance', exact: true }).click();
  await page.locator('#ask-execution-execution-item-add').getByRole('button', { name: 'Kitchen', exact: true }).click();
  await page.getByLabel('Brand', { exact: true }).fill('Bosch');
  await page.getByRole('button', { name: 'Continue to review' }).click();

  await expect.poll(() => api.addCaptureBodies).toEqual([expect.objectContaining({
    requirementId: 'inventory-create-inputs', captureKey: 'INVENTORY_ITEM_CREATE_INPUTS', expectedContextVersion: 'item-add-context-v1',
    answer: expect.objectContaining({ name: 'Bosch dishwasher', category: 'APPLIANCE', roomId: 'room-kitchen', brand: 'Bosch' }),
  })]);
  await expect(page.getByText('Add "Bosch dishwasher" to your inventory?').first()).toBeVisible();
  await page.getByLabel(/I authorize adding this item to the shared home record/).check();
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await expect.poll(() => api.correctionConfirmBodies).toEqual([expect.objectContaining({ confirmationVersion: 1, consentConfirmed: true })]);
  await expect(page.getByText('Item added')).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('a contributor fills in a missing area detail inline: the row action opens the question, Continue leads to a review naming every area, and confirming shows the receipt with what is still incomplete', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Give me a correctable summary of my home record.');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Areas that can improve', exact: true }) });
  await response.getByRole('button', { name: 'Fill in missing details' }).click();
  await expect.poll(() => api.executionBodies.some((body) => body.message === 'Fill in the missing structure details.'
    && (body.launchContext as { operationId?: string; entityType?: string; entityId?: string } | undefined)?.operationId === 'PROPERTY_CONTEXT_AREA_CAPTURE'
    && (body.launchContext as { entityType?: string } | undefined)?.entityType === 'PROPERTY_CONTEXT_AREA'
    && (body.launchContext as { entityId?: string } | undefined)?.entityId === 'STRUCTURE')).toBe(true);
  await expect(page.getByText('Nothing has been saved yet', { exact: false })).toBeVisible();

  const form = page.locator('#ask-execution-execution-area-add');
  await form.getByRole('button', { name: 'Asphalt shingle', exact: true }).click();
  await form.getByLabel('Roof replacement year', { exact: true }).fill('2018');
  await form.getByRole('button', { name: 'Continue to review' }).click();
  await expect.poll(() => api.addCaptureBodies).toEqual([expect.objectContaining({
    requirementId: 'area-roof-requirement', captureKey: 'ROOF_STRUCTURE_PROFILE', expectedContextVersion: 'area-add-context-v1',
    answer: { roofType: 'ASPHALT_SHINGLE', roofReplacementYear: 2018 },
  })]);
  await expect(page.getByText('Save "Roof details" to your home record?').first()).toBeVisible();
  await expect(page.getByText('Structure, Maintenance responsibility').first()).toBeVisible();
  await page.getByLabel(/I authorize saving these details to the shared home record/).check();
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect.poll(() => api.correctionConfirmBodies).toEqual([expect.objectContaining({ confirmationVersion: 1, consentConfirmed: true })]);
  await expect(page.getByText('Details saved')).toBeVisible();
  // The end state never claims the area is done.
  await expect(page.getByText('No more questions in this session')).toBeVisible();
  await expect(page.getByText(/cannot be filled in here/)).toBeVisible();
  await expect(page.getByText(/all done/i)).toHaveCount(0);
});

test('"Skip for now" on an area question sends only the skip marker, saves nothing and offers the question flow again', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Give me a correctable summary of my home record.');
  await page.getByRole('button', { name: 'Send question' }).click();
  const response = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Areas that can improve', exact: true }) });
  await response.getByRole('button', { name: 'Fill in missing details' }).click();
  const form = page.locator('#ask-execution-execution-area-add');
  // Skipping needs no answer: the required fields are still empty.
  await form.getByRole('button', { name: 'Skip for now' }).click();
  await expect.poll(() => api.addCaptureBodies).toEqual([expect.objectContaining({ answer: { $skip: true } })]);
  await expect(page.getByText('Skipped for now')).toBeVisible();
  expect(api.correctionConfirmBodies).toEqual([]);
});

test('a contributor adds a warranty inline: the Add action opens the form, Continue leads to a review, and confirming shows the receipt', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Give me a correctable summary of my home record.');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Warranties', exact: true }) });
  await expect(response.getByRole('link', { name: /Open Warranties/ })).toBeVisible();
  await response.getByRole('button', { name: 'Add a warranty' }).click();

  // The declared action dispatches through the normal Ask path, pinned to the capture operation.
  await expect.poll(() => api.executionBodies.some((body) => body.message === 'Add a warranty to my home record.'
    && (body.launchContext as { operationId?: string } | undefined)?.operationId === 'CAPTURE_WARRANTY_CONFIRM')).toBe(true);
  await expect(page.getByRole('heading', { name: 'Add a warranty', level: 3 }).last()).toBeVisible();
  await expect(page.getByText('Nothing has been saved yet', { exact: false })).toBeVisible();

  await page.getByLabel('Provider').fill('Acme Home Warranty');
  await page.getByRole('button', { name: 'HOME_WARRANTY_PLAN' }).click();
  await page.getByLabel('Start date').fill('2026-01-01');
  await page.getByLabel('Expiration date').fill('2027-12-01');
  await page.getByRole('button', { name: 'Continue to review' }).click();

  await expect.poll(() => api.warrantyAddCaptureBodies).toEqual([expect.objectContaining({
    requirementId: 'capture-warranty-edit', captureKey: 'CAPTURE_WARRANTY_EDIT', expectedContextVersion: 'warranty-add-context-v1',
    answer: expect.objectContaining({ providerName: 'Acme Home Warranty', category: 'HOME_WARRANTY_PLAN', startDate: '2026-01-01', expiryDate: '2027-12-01' }),
  })]);
  await expect(page.getByText('Save this warranty to your property record?').first()).toBeVisible();
  await expect(page.getByText('You entered these details', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Cozy noticed', { exact: false })).toHaveCount(0);

  await page.getByLabel(/I confirm this is accurate and authorize ContractToCozy/).check();
  await page.getByRole('button', { name: 'Save warranty', exact: true }).click();
  await expect.poll(() => api.correctionConfirmBodies).toEqual([expect.objectContaining({ confirmationVersion: 1, consentConfirmed: true })]);
  await expect(page.getByText('Recorded to your property record')).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('a viewer-shaped result declares no correction actions, so no correction control renders', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Give me a summary of my home record.');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Recent verified home activity' }) });
  await response.getByRole('button', { name: 'Roof replacement' }).click();
  await expect(response.getByText('The roof replacement is recorded with verified evidence.')).toBeVisible();
  await expect(response.getByRole('button', { name: /^Correct (title|date|install|purchase|provider|expiry)/ })).toHaveCount(0);
});

test('Property Summary rooms open canonical detail inline with the full Rooms collection secondary', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Give me a summary of my home record.');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Rooms', exact: true }) });
  await expect(response.getByRole('link', { name: 'Kitchen' })).toHaveCount(0);
  await expect(response.getByRole('button', { name: 'Kitchen' })).toBeVisible();
  await expect(response.getByRole('link', { name: /Open Rooms/ })).toHaveAttribute('href', new RegExp(`^/dashboard/properties/${propertyId}/rooms\\?backTo=`));

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
  await expect(response.getByRole('link', { name: /Open Documents/ })).toHaveAttribute('href', new RegExp(`^/dashboard/documents\\?propertyId=${propertyId}&backTo=`));

  await response.getByRole('button', { name: 'Homeowners policy declaration' }).click();
  await expect(response.getByText('Annual declarations page from the carrier.')).toBeVisible();
  await expect(response.getByText('240.0 KB')).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('Property Summary household members open canonical detail inline with the full household collection secondary', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Give me a summary of my home record.');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Household access', exact: true }) });
  await expect(response.getByRole('link', { name: 'Jordan Reyes' })).toHaveCount(0);
  await expect(response.getByRole('button', { name: 'Jordan Reyes' })).toBeVisible();
  await expect(response.getByRole('link', { name: /Open household access/ })).toHaveAttribute('href', new RegExp(`^/dashboard/properties/${propertyId}/household\\?backTo=`));

  // No per-member correction action exists (read-only, like Documents) -- the canonical re-fetch re-derives
  // role/email/primary-owner/joined from the household/members list endpoint, not from the list item's own fields.
  await response.getByRole('button', { name: 'Jordan Reyes' }).click();
  // exact: true -- the list item's own meta ("Owner · Joined Jun 1, 2025") also contains the substring "Owner",
  // so a loose match resolves to two elements; the detail's <dd> is the only node whose full text is "Owner".
  await expect(response.getByText('Owner', { exact: true })).toBeVisible();
  await expect(response.getByText('jordan@example.com')).toBeVisible();
  await expect(response.getByText('Yes', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('a departed household member shows a distinct "no longer a member" state, not an access-loss redaction', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Give me a summary of my home record.');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Household access', exact: true }) });
  // 'Alex Departed' is in the list fixture but absent from the household/members canonical mock -- the household
  // endpoint has no per-member 404, so this is a data-absence check, not an HTTP error (unlike every other entity).
  await response.getByRole('button', { name: 'Alex Departed' }).click();
  await expect(response.getByText('No longer a household member')).toBeVisible();
  await expect(response.getByText('This person is no longer part of this household.')).toBeVisible();
  // The rest of the Ask result -- other collections, the conversation -- stays intact; this is not a whole-result redaction.
  await expect(page.getByRole('heading', { name: 'Here is the current Living Home Record for Acceptance Home' })).toBeVisible();
});

test('inventory item detail: item-not-found is scoped to the detail panel, distinct from an access-loss redaction', async ({ page }) => {
  // Both are 404s with the same HTTP status -- InventoryItemDetail distinguishes them by the response body's
  // error code (ITEM_NOT_FOUND), not status alone. See InventoryResultList.tsx's own errorCode comment.
  await installAskApi(page, { inventoryDetailNotFound: true });
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Give me a correctable summary of my home record.');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Systems and inventory', exact: true }) });
  await response.getByRole('button', { name: 'Water heater' }).click();
  await expect(response.getByText('Item no longer exists')).toBeVisible();
  await expect(response.getByText('This item was removed after the Ask result was created.')).toBeVisible();
  // Scoped to this one detail panel -- the rest of the result, including other collections, stays intact.
  await expect(page.getByRole('heading', { name: 'Rooms', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('inventory item detail access loss (a different 404 error code) redacts the whole result, not just the detail panel', async ({ page }) => {
  await installAskApi(page, { inventoryDetailAccessLost: true });
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Give me a correctable summary of my home record.');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-property-summary');
  await response.getByRole('button', { name: 'Water heater' }).click();

  await expect(response).toHaveAttribute('role', 'alert');
  await expect(response.getByRole('heading', { name: 'Result unavailable' })).toBeVisible();
  await expect(response).toContainText('Access to this result is no longer available.');
  // The whole result is redacted -- unlike ITEM_NOT_FOUND above, other collections in the same result disappear too.
  await expect(response.getByRole('heading', { name: 'Rooms', exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('an ambiguous inventory question opens the matching item inline instead of ejecting to /inventory before it is confirmed', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Tell me about my smoke detector.');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Which inventory item do you mean?', exact: true }) });
  await expect(response.getByText('Kitchen smoke detector')).toBeVisible();
  await expect(response.getByText('Hallway smoke detector')).toBeVisible();
  await expect(response.getByRole('link', { name: 'Kitchen smoke detector' })).toHaveCount(0);

  // IW-PRIN-002: selecting an ambiguous match opens inline canonical detail (same InventoryResultList as
  // inventory-results), not an implicit navigation to /inventory before the homeowner confirmed which item they meant.
  await response.getByRole('button', { name: 'Kitchen smoke detector' }).click();
  // exact: true -- the list item's own description ("Kidde brand") also contains the substring "Kidde";
  // the detail's <dd> is the only node whose full text is "Kidde".
  await expect(response.getByText('Kidde', { exact: true })).toBeVisible();
  await expect(response.getByText('Ceiling-mounted, above the range.')).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('a contributor attaches evidence to a timeline event inline: the file uploads out of band, then Ask confirms and shows the receipt', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Give me a correctable summary of my home record.');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Recent verified home activity' }) });
  await response.getByRole('button', { name: 'Roof replacement' }).click();
  await expect(response.getByText('The roof replacement is recorded with verified evidence.')).toBeVisible();

  // Attach evidence is its own control, not folded behind "Correct a detail" like the other declared actions --
  // visible immediately once the event has any declared action at all. Tag-scoped, not getByRole('button', ...):
  // a hidden <input type="file"> also carries an implicit "button" ARIA role in Chromium, so a role-only query
  // matches both it and the real <button>.
  await expect(response.locator('button', { hasText: 'Attach evidence' })).toBeVisible();

  // No native file dialog in a headless run: set the file directly on the underlying (visually hidden) input.
  await response.getByLabel('Attach evidence file for Roof replacement').setInputFiles({
    name: 'invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('fixture invoice bytes'),
  });

  // The upload completes out of band (POST .../evidence-upload, mocked), THEN Ask is asked to attach the
  // resulting documentId to the exact event identity -- never a raw file, never message-extracted.
  await expect.poll(() => api.executionBodies.some((body) => body.message === 'Attach evidence to this home timeline entry.'
    && (body.launchContext as { entityType?: string; entityId?: string; documentId?: string } | undefined)?.entityType === 'HOME_EVENT'
    && (body.launchContext as { entityId?: string } | undefined)?.entityId === 'event-property-summary'
    && (body.launchContext as { documentId?: string } | undefined)?.documentId === 'document-evidence-fixture')).toBe(true);

  await expect(page.getByText('Attach this document as evidence?')).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: 'invoice.pdf' })).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: 'Roof replacement' })).toBeVisible();
  // No editable fields at all -- nothing left to edit once the file is already uploaded, only review and consent.
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);

  await page.getByLabel(/I confirm this document is evidence for this home record entry/).check();
  await page.getByRole('button', { name: 'Attach document' }).click();

  await expect.poll(() => api.correctionConfirmBodies).toEqual([expect.objectContaining({ confirmationVersion: 1, consentConfirmed: true })]);
  await expect(page.getByText('Attached to your home timeline')).toBeVisible();
  await expect(page.getByText('invoice.pdf is now attached as evidence on your home timeline.')).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('attaching evidence rejects an unsupported file type before ever calling the upload endpoint', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Give me a correctable summary of my home record.');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Recent verified home activity' }) });
  await response.getByRole('button', { name: 'Roof replacement' }).click();
  await response.getByLabel('Attach evidence file for Roof replacement').setInputFiles({
    name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('plain text'),
  });

  await expect(response.getByRole('alert')).toHaveText('Choose a JPEG, PNG, WEBP, or PDF file.');
  // Client-side rejection: never dispatched to Ask at all, unlike the accepted-file scenario above.
  expect(api.executionBodies.some((body) => body.message === 'Attach evidence to this home timeline entry.')).toBe(false);
});

test('Home Capital Timeline: a reserve allocation opens canonical detail inline, keeping the traditional Reserve Fund page as a secondary option', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Create a capital reserve plan for future replacements.');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Active reserve allocations', exact: true }) });
  await expect(response.getByRole('link', { name: 'Water heater' })).toHaveCount(0);
  await expect(response.getByRole('link', { name: /Open Reserve Fund/ })).toHaveAttribute('href', new RegExp(`^/dashboard/properties/${propertyId}/tools/reserve-fund\\?backTo=`));

  await response.getByRole('button', { name: 'Water heater' }).click();
  await expect(response.getByText('Typical service life for this water heater type is 10-12 years; it was installed 5 years ago.')).toBeVisible();
  await expect(response.getByText('$1,200', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('Home Capital Timeline: a TABLE row opens canonical capital-window detail inline (TABLE-block row-click-to-detail platform capability)', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Create a capital reserve plan for future replacements.');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Upcoming capital windows', exact: true }) });
  await expect(response.getByRole('button', { name: 'Roof replacement' })).toHaveAttribute('aria-expanded', 'false');
  await expect(response.getByText('Typical service life for asphalt shingle roofing')).toHaveCount(0);

  await response.getByRole('button', { name: 'Roof replacement' }).click();
  await expect(response.getByText('Typical service life for asphalt shingle roofing is 20-25 years; this roof was installed 22 years ago.')).toBeVisible();
  await expect(response.getByText('$8,000 – $12,000', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);

  // Closing returns focus to the row trigger and leaves the reserve-allocations block (a separate,
  // pre-existing detail-eligible block in the same response) unaffected.
  await response.getByRole('button', { name: /Close capital window detail/ }).click();
  await expect(response.getByText('Typical service life for asphalt shingle roofing')).toHaveCount(0);
  await expect(response.getByRole('button', { name: 'Roof replacement' })).toBeFocused();
  await expect(response.getByRole('button', { name: 'Water heater' })).toBeVisible();
});

test('Home Capital Timeline: re-running with a different horizon dispatches the same operation and shows the new result inline (planning/refinement follow-up)', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Create a capital reserve plan for future replacements.');
  await page.getByRole('button', { name: 'Send question' }).click();

  const firstResponse = page.locator('#ask-execution-execution-capital-reserve-plan');
  await expect(firstResponse.getByText(/10-year horizon/)).toBeVisible();
  await expect(firstResponse.getByRole('button', { name: 'Show 5-year horizon' })).toBeVisible();
  await expect(firstResponse.getByRole('button', { name: 'Show 10-year horizon' })).toHaveCount(0);

  await firstResponse.getByRole('button', { name: 'Show 5-year horizon' }).click();

  const secondResponse = page.locator('#ask-execution-execution-capital-reserve-plan-5yr');
  await expect(secondResponse.getByText(/5-year horizon/)).toBeVisible();
  // The re-run dispatches the SAME CAPITAL_RESERVE_PLAN operation (declared item-action identity, ASK-COZY's
  // highest-priority routing source), not free-text reclassification -- asserted on the exact request body.
  await expect.poll(() => api.executionBodies.at(-1)).toEqual(expect.objectContaining({
    message: 'Show my capital reserve plan for a 5-year horizon.',
    launchContext: expect.objectContaining({ operationId: 'CAPITAL_RESERVE_PLAN' }),
  }));
  // The toggle now offers the OTHER horizon only, and the original 10-year response is left untouched in
  // the transcript instead of being replaced.
  await expect(secondResponse.getByRole('button', { name: 'Show 10-year horizon' })).toBeVisible();
  await expect(secondResponse.getByRole('button', { name: 'Show 5-year horizon' })).toHaveCount(0);
  await expect(firstResponse.getByText(/10-year horizon/)).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('Home Event Radar: a monitored event opens canonical detail inline, keeping the traditional Home Event Radar page as a secondary option', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Show my home event radar feed.');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Home Event Radar feed', exact: true }) });
  await expect(response.getByRole('link', { name: 'severe thunderstorm warning' })).toHaveCount(0);
  await expect(response.getByRole('link', { name: /Open Home Event Radar/ })).toHaveAttribute('href', new RegExp(`^/dashboard/properties/${propertyId}/tools/home-event-radar\\?backTo=`));

  await response.getByRole('button', { name: 'severe thunderstorm warning' }).click();
  await expect(response.getByText('This storm cell tracks over your recorded property location.')).toBeVisible();
  await expect(response.getByText('Secure outdoor furniture and loose items')).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('Home Event Radar: filter chips re-ask with their own message, and Save writes the exact event directly with a receipt (FRD v1.40)', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Show my home event radar feed.');
  await page.getByRole('button', { name: 'Send question' }).click();

  const feed = page.locator('#ask-execution-execution-home-event-radar-feed');
  await expect(feed.getByRole('button', { name: 'Any time' })).toHaveAttribute('aria-pressed', 'true');
  await feed.getByRole('button', { name: 'Happening now' }).click();
  await expect.poll(() => api.executionBodies.at(-1)?.message).toBe('Show my home event radar feed happening now.');
  const refined = page.locator('#ask-execution-execution-home-event-radar-feed-now');
  await expect(refined.getByRole('button', { name: 'Happening now' })).toHaveAttribute('aria-pressed', 'true');

  // Actions appear only in the detail, chosen from the LIVE canonical state (userState 'new' in the detail route).
  await expect(refined.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await refined.getByRole('button', { name: 'severe thunderstorm warning' }).click();
  await expect(refined.getByText('This storm cell tracks over your recorded property location.')).toBeVisible();
  await expect(refined.getByRole('button', { name: 'Remove from saved' })).toHaveCount(0);
  await expect(refined.getByRole('button', { name: 'Restore' })).toHaveCount(0);
  await expect(refined.getByRole('button', { name: 'Mark done' })).toBeVisible();

  await refined.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => api.executionBodies.at(-1)).toEqual(expect.objectContaining({
    message: 'Save this monitored event.',
    launchContext: expect.objectContaining({ entityType: 'RADAR_MATCH', entityId: 'match-property-summary', operationId: 'HOME_EVENT_RADAR_STATE' }),
  }));
  const receipt = page.locator('#ask-execution-execution-radar-state-save');
  await expect(receipt.getByText('Event saved')).toBeVisible();
  await expect(receipt.getByText('for you only')).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('Home Event Radar: "Plan this action" sends the recommended action\'s code, then form -> review -> receipt (FRD v1.41)', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Show my home event radar feed.');
  await page.getByRole('button', { name: 'Send question' }).click();

  const feed = page.locator('#ask-execution-execution-home-event-radar-feed');
  await feed.getByRole('button', { name: 'severe thunderstorm warning' }).click();
  await expect(feed.getByText('This storm cell tracks over your recorded property location.')).toBeVisible();
  // Planning is per recommended action, never a button in the event's own action row.
  await expect(feed.locator('[data-radar-action="radar-plan-task"]')).toHaveCount(0);
  await feed.getByRole('button', { name: 'Plan this action: Secure outdoor furniture and loose items' }).click();
  await expect.poll(() => api.executionBodies.at(-1)).toEqual(expect.objectContaining({
    message: 'Plan this recommended action from a monitored event.',
    launchContext: expect.objectContaining({ entityType: 'RADAR_MATCH', entityId: 'match-property-summary', operationId: 'HOME_EVENT_RADAR_TASK', actionId: 'SECURE_OUTDOOR_ITEMS', sourceExecutionId: 'execution-home-event-radar-feed' }),
  }));

  const task = page.locator('#ask-execution-execution-radar-task');
  await expect(task.getByText('Nothing has been added yet', { exact: false })).toBeVisible();
  await task.getByRole('button', { name: 'Set a reminder', exact: true }).click();
  await task.getByLabel('Due date value').fill('2026-09-30');
  await task.getByLabel('Due time', { exact: true }).fill('07:30');
  await task.getByRole('button', { name: 'Alex Kim', exact: true }).click();
  await task.getByRole('button', { name: 'Continue to review' }).click();
  await expect.poll(() => api.addCaptureBodies).toEqual([expect.objectContaining({
    requirementId: 'radar-task-inputs', captureKey: 'HOME_EVENT_RADAR_TASK_INPUTS', expectedContextVersion: 'radar-task-context-v1',
    answer: expect.objectContaining({ operation: 'create_reminder', dueDate: { precision: 'EXACT_DATE', value: '2026-09-30' }, dueTime: '07:30', assigneeUserId: 'user-alex' }),
  })]);

  await expect(task.getByText('Set a reminder for "Secure outdoor furniture and loose items"?').first()).toBeVisible();
  await task.getByLabel(/I authorize adding this to the shared maintenance list/).check();
  await task.getByRole('button', { name: 'Set reminder', exact: true }).click();
  await expect.poll(() => api.correctionConfirmBodies).toEqual([expect.objectContaining({ confirmationVersion: 1, consentConfirmed: true })]);
  await expect(task.getByText('Reminder set')).toBeVisible();
  await expect(task.getByRole('link', { name: /Open task/ })).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('Claims: a claim opens canonical detail inline and a legal status change pins the exact claim and CLAIM_TRANSITION (FRD v1.42)', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Show my claims');
  await page.getByRole('button', { name: 'Send question' }).click();

  const list = page.locator('#ask-execution-execution-claims');
  await expect(list.getByRole('link', { name: 'Kitchen leak' })).toHaveCount(0);
  await list.getByRole('button', { name: 'Kitchen leak' }).click();
  await expect(list.getByText('Water under the kitchen sink damaged the cabinet floor.')).toBeVisible();
  // A draft claim may start, submit or close -- never approve or deny.
  await expect(list.locator('[data-claim-action]')).toHaveCount(3);
  await expect(list.getByRole('button', { name: 'Mark approved' })).toHaveCount(0);
  await list.getByRole('button', { name: 'Mark submitted' }).click();
  await expect.poll(() => api.executionBodies.at(-1)).toEqual(expect.objectContaining({
    message: 'Submit this claim.',
    launchContext: expect.objectContaining({ entityType: 'CLAIM', entityId: 'claim-kitchen-leak', operationId: 'CLAIM_TRANSITION', sourceExecutionId: 'execution-claims' }),
  }));
  await expect(page.locator('#ask-execution-execution-claim-transition').getByText('Change Kitchen leak to submitted?').first()).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('Inspection hub: a finding opens inline through its report, live state picks the actions, and Resolve asks how it was resolved (FRD v1.43)', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Show my open inspection findings');
  await page.getByRole('button', { name: 'Send question' }).click();

  const list = page.locator('#ask-execution-execution-inspection-findings');
  await list.getByRole('button', { name: 'ROOF: Missing shingles on the north slope' }).click();
  await expect(list.getByText('Several shingles are missing on the north slope.')).toBeVisible();
  // The live finding is already accepted as work, so "Accept as work" is not offered.
  await expect(list.locator('[data-finding-action]')).toHaveCount(2);
  await expect(list.getByRole('button', { name: 'Accept as work' })).toHaveCount(0);
  await expect(list.getByRole('link', { name: /Open the report/ })).toHaveAttribute('href', new RegExp(`^/dashboard/properties/${propertyId}/inspection-hub/report-roof\\?findingId=finding-roof`));
  await list.getByRole('button', { name: 'Mark resolved' }).click();
  await expect.poll(() => api.executionBodies.at(-1)).toEqual(expect.objectContaining({
    message: 'Mark this inspection finding resolved.',
    launchContext: expect.objectContaining({ entityType: 'INSPECTION_FINDING', entityId: 'finding-roof', operationId: 'INSPECTION_FINDING_UPDATE', sourceExecutionId: 'execution-inspection-findings' }),
  }));
  const review = page.locator('#ask-execution-execution-finding-resolve');
  await expect(review.getByText('Resolve this finding?').first()).toBeVisible();
  await expect(review.getByText('How was this resolved?').first()).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('Inspection deck: decisions are made card by card, nothing is sent until the end, and one confirmation covers them (FRD v1.75)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Go through my inspection findings');
  await page.getByRole('button', { name: 'Send question' }).click();

  const deck = page.locator('#ask-execution-execution-inspection-deck');
  await expect(deck.getByText('1 of 3')).toBeVisible();
  await deck.getByRole('button', { name: 'Details' }).click();
  const sheet = page.getByRole('dialog', { name: 'Finding detail: ROOF: Missing shingles on the north slope' });
  await expect(sheet.getByText('Several shingles are missing on the north slope.')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Mark resolved' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  await deck.getByRole('button', { name: 'Accept as work' }).click();
  await deck.getByRole('group', { name: /Double-tapped breaker, 2 of 3/ }).press('ArrowLeft');
  await deck.getByRole('button', { name: 'Skip for now' }).click();
  await expect.poll(() => api.executionBodies.length).toBe(1);
  await expect(deck.locator('[data-ask-deck-review="Accept as work"]')).toContainText('ROOF: Missing shingles on the north slope');
  await expect(deck.locator('[data-ask-deck-review="Dismiss"]')).toContainText('ELECTRICAL: Double-tapped breaker');
  await deck.getByRole('button', { name: 'Review and confirm 2 changes' }).click();

  await expect.poll(() => api.executionBodies.at(-1)).toEqual(expect.objectContaining({
    message: 'Review my inspection finding decisions.',
    launchContext: expect.objectContaining({
      operationId: 'INSPECTION_FINDING_UPDATE', entityType: 'INSPECTION_FINDING', sourceExecutionId: 'execution-inspection-deck',
      batchDecisions: [{ entityId: 'finding-roof', actionId: 'finding-accept' }, { entityId: 'finding-breaker', actionId: 'finding-dismiss' }],
    }),
  }));
  expect(api.executionBodies).toHaveLength(2);
  const review = page.locator('#ask-execution-execution-inspection-batch');
  await expect(review.getByText('Confirm 2 findings?').first()).toBeVisible();
  await expect(review.getByRole('button', { name: 'Confirm 2 changes' })).toBeVisible();
  await expect(deck.getByText('Sent for your confirmation below. Nothing changes until you confirm.')).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('Inspection deck on a phone: the card fits the screen and Details opens as a bottom sheet (FRD v1.75)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Go through my inspection findings');
  await page.getByRole('button', { name: 'Send question' }).click();

  const deck = page.locator('#ask-execution-execution-inspection-deck');
  const card = deck.getByRole('group', { name: /Missing shingles on the north slope, 1 of 3/ });
  await expect(card).toBeVisible();
  const cardBox = await card.boundingBox();
  expect(cardBox && cardBox.x + cardBox.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await deck.getByRole('button', { name: 'Details' }).click();
  const sheet = page.getByRole('dialog', { name: /Finding detail/ });
  await expect(sheet.getByText('Several shingles are missing on the north slope.')).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box && Math.round(box.y + box.height)).toBeGreaterThanOrEqual(843);
});

test('Seller prep: a checklist item opens inline from the sale case, live state picks the decision, and it proposes a confirmed change (FRD v1.44)', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Check my sale readiness');
  await page.getByRole('button', { name: 'Send question' }).click();

  const list = page.locator('#ask-execution-execution-seller-prep');
  await list.getByRole('button', { name: 'Paint the front door' }).click();
  await expect(list.getByText('A fresh front door is a low-cost first impression.')).toBeVisible();
  // The list said OPEN, but the live item is already pursued, so only "Stop pursuing" is offered.
  await expect(list.locator('[data-sale-item-action]')).toHaveCount(1);
  await expect(list.getByRole('button', { name: 'Pursue before listing' })).toHaveCount(0);
  await expect(list.getByRole('link', { name: /Open in the checklist/ })).toHaveAttribute('href', new RegExp(`^/dashboard/properties/${propertyId}/tools/sale-case\\?focusItemId=item-door`));
  await list.getByRole('button', { name: 'Stop pursuing' }).click();
  await expect.poll(() => api.executionBodies.at(-1)).toEqual(expect.objectContaining({
    message: 'Stop pursuing this seller-prep checklist item.',
    launchContext: expect.objectContaining({ entityType: 'SALE_READINESS_ITEM', entityId: 'item-door', operationId: 'SELLER_PREP_ITEM_DECISION', sourceExecutionId: 'execution-seller-prep' }),
  }));
  const review = page.locator('#ask-execution-execution-sale-item-unpursue');
  await expect(review.getByText('Unpursue "Paint the front door"?').first()).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('seller-prep checklist items show as category shelves; a card opens the live item in a side drawer with its decision, and the List switch keeps it (FRD v1.84)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('What should I fix before listing?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-seller-prep-shelves');
  await expect(response.getByRole('list', { name: 'Presentation, 1 item' })).toBeVisible();
  const card = response.getByRole('button', { name: /Paint the front door/ });
  await expect(card).toContainText('$200–$400 estimated');
  await card.click();
  const drawer = page.getByRole('dialog', { name: 'Item detail: Paint the front door' });
  await expect(drawer.getByText('A fresh front door is a low-cost first impression.')).toBeVisible();
  // The list said OPEN, but the live item is already pursued, so only "Stop pursuing" is offered.
  await expect(drawer.locator('[data-sale-item-action]')).toHaveCount(1);
  const box = await drawer.boundingBox();
  expect(box && box.x + box.width).toBeGreaterThan(1430);
  await drawer.getByRole('button', { name: 'Stop pursuing' }).click();
  await expect.poll(() => api.executionBodies.at(-1)).toEqual(expect.objectContaining({
    message: 'Stop pursuing this seller-prep checklist item.',
    launchContext: expect.objectContaining({ entityType: 'SALE_READINESS_ITEM', entityId: 'item-door', operationId: 'SELLER_PREP_ITEM_DECISION', sourceExecutionId: 'execution-seller-prep-shelves' }),
  }));

  await response.getByRole('button', { name: 'List', exact: true }).click();
  await expect(response.getByRole('button', { name: 'Paint the front door' })).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('on a phone, seller-prep shelves stay inside the screen and an item opens as a bottom sheet (FRD v1.84)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('What should I fix before listing?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-seller-prep-shelves');
  await expect(response.getByRole('list', { name: 'Presentation, 1 item' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await response.getByRole('button', { name: /Paint the front door/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Item detail: Paint the front door' });
  await expect(sheet.getByText('A fresh front door is a low-cost first impression.')).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box && Math.round(box.y + box.height)).toBeGreaterThanOrEqual(843);
  await sheet.getByRole('button', { name: 'Close item detail for Paint the front door' }).click();
  await expect(sheet).toBeHidden();
});

test('Refinance: the analysis shows the homeowner’s rate monitor, and Pause works inline (FRD v1.45)', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Is refinancing worth reviewing now?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const answer = page.locator('#ask-execution-execution-refinance-monitor-analysis');
  await expect(answer.getByText('Your mortgage-rate monitor')).toBeVisible();
  await expect(answer.getByText('5.500% or lower')).toBeVisible();
  await expect(answer.getByRole('link', { name: /Alert delivery settings/ })).toHaveAttribute('href', new RegExp(`^/dashboard/properties/${propertyId}/tools/mortgage-refinance-radar\\?.*#refinance-evidence-settings$`));
  await answer.getByRole('button', { name: 'Pause' }).click();
  await expect(answer.getByRole('button', { name: 'Resume' })).toBeVisible();
  expect(api.monitorPatchBodies).toEqual([{ action: 'PAUSE' }]);
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
});

test('Buyer closing: a blocking task opens inline from the Buyer Plan and Mark complete proposes that exact task (FRD v1.46)', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('What is due before closing?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const list = page.locator('#ask-execution-execution-buyer-deadlines');
  await expect(list.getByRole('link', { name: 'Closing' })).toBeVisible();
  await list.getByRole('button', { name: 'Order the appraisal' }).click();
  await expect(list.getByText('Your lender orders the appraisal once the loan is in process.')).toBeVisible();
  await expect(list.getByText('In progress')).toBeVisible();
  await expect(list.getByRole('link', { name: /Open in the Buyer Plan/ })).toHaveAttribute('href', new RegExp(`^/dashboard/properties/${propertyId}/buyer-plan\\?taskId=task-appraisal`));
  await list.getByRole('button', { name: 'Mark complete' }).click();
  await expect.poll(() => api.executionBodies.at(-1)).toEqual(expect.objectContaining({
    message: 'Mark this Buyer Plan task complete.',
    launchContext: expect.objectContaining({ entityType: 'BUYER_TASK', entityId: 'task-appraisal', operationId: 'BUYER_TASK_COMPLETE', sourceExecutionId: 'execution-buyer-deadlines' }),
  }));
  const review = page.locator('#ask-execution-execution-buyer-task-complete');
  await expect(review.getByText('Mark this Buyer Plan task complete?').first()).toBeVisible();
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
  await expect(response.getByRole('button', { name: 'Service the heat pump', exact: true })).toBeVisible();
  await expect(response.getByRole('link', { name: 'Service the heat pump' })).toHaveCount(0);
  await response.getByRole('button', { name: 'Service the heat pump', exact: true }).click();

  await expect(response.getByRole('heading', { name: 'Service the heat pump' })).toBeVisible();
  await expect(response.getByText('Annual preventive service for the recorded HVAC system.')).toBeVisible();
  await expect(response.getByText('$250')).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
  await expect(response.getByRole('link', { name: /Open Maintenance/ })).toBeVisible();
});

test('maintenance answers lead with chips and show timing shelves whose cards open the live task in a side drawer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('What maintenance is pending?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-maintenance-shelves');
  await expect(response.getByRole('list', { name: 'At a glance' })).toContainText('1 overdue');
  await expect(response.getByRole('list', { name: 'Overdue, 1 task' })).toBeVisible();
  await expect(response.getByRole('list', { name: 'Due in the next 30 days, 3 tasks' }).getByRole('listitem')).toHaveCount(3);
  const card = response.getByRole('button', { name: /Service the heat pump/ });
  await expect(card).toContainText('Was due Sep 20, 2026');
  await card.click();

  const drawer = page.getByRole('dialog', { name: 'Task detail: Service the heat pump' });
  await expect(drawer.getByText('Annual preventive service for the recorded HVAC system.')).toBeVisible();
  const box = await drawer.boundingBox();
  expect(box && box.x + box.width).toBeGreaterThan(1430);
  expect(box && box.x).toBeGreaterThan(900);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(card).toBeFocused();

  await response.getByRole('button', { name: 'List', exact: true }).click();
  await expect(response.getByRole('button', { name: 'Service the heat pump', exact: true })).toBeVisible();
  await response.getByRole('button', { name: 'Shelves', exact: true }).click();
  await expect(response.getByRole('list', { name: 'Overdue, 1 task' })).toBeVisible();
  await expect(page).toHaveURL(/\/acceptance\/ask\?/);
  await expect.poll(() => api.executionBodies.length).toBe(1);
});

test('on a phone, maintenance shelves scroll sideways and the task opens as a bottom sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('What maintenance is pending?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-maintenance-shelves');
  const shelf = response.getByRole('list', { name: 'Due in the next 30 days, 3 tasks' });
  await expect(shelf).toBeVisible();
  expect(await shelf.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await response.getByRole('button', { name: /Service the heat pump/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Task detail: Service the heat pump' });
  await expect(sheet.getByText('Annual preventive service for the recorded HVAC system.')).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box && Math.round(box.y + box.height)).toBeGreaterThanOrEqual(843);
  expect(box && box.width).toBeGreaterThan(380);
  await sheet.getByRole('button', { name: 'Close task detail for Service the heat pump' }).click();
  await expect(sheet).toBeHidden();
});

test('quote review shows a comparison strip with a declared Lowest price badge, and a Table view marks only the declared lead (FRD v1.76)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Compare my roofing quotes');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-quote-review-strip');
  const strip = response.getByRole('list', { name: 'Recorded proposals options' });
  await expect(strip).toHaveAttribute('data-comparison-presentation', 'strip');
  await expect(strip.getByRole('listitem')).toHaveCount(3);
  await expect(response.getByText('1 rejected quote is not shown', { exact: false })).toBeVisible();
  const summit = strip.getByRole('listitem', { name: /Summit Roofing/ });
  await expect(summit.getByText('Lowest price')).toHaveAttribute('data-badge-policy', 'QUOTE_LOWEST_PRICE_SCOPE_ALIGNED');
  await expect(summit.getByRole('img', { name: '79% of the highest price of these options' })).toBeVisible();
  await summit.getByText('Why this label').click();
  await expect(summit.getByText(/It is not a recommendation/)).toBeVisible();
  await expect(strip.getByRole('listitem', { name: /Acme Roofing/ }).getByRole('img', { name: 'Highest price of these options' })).toBeVisible();
  await expect(response.getByText('Option 1 of 3.', { exact: false })).toBeVisible();

  await response.getByRole('button', { name: 'Table', exact: true }).click();
  const table = response.getByRole('table', { name: 'Recorded proposals' });
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader')).toHaveText(['Acme Roofing', 'Summit Roofing', 'Ridge Line Roofing']);
  await expect(table.locator('[data-leading="true"]')).toHaveCount(1);
  await expect(table.locator('[data-leading="true"]')).toContainText('USD 9,800');
  await expect(table.getByText('Expired Sep 23, 2026')).toBeVisible();
  await expect(response.getByRole('heading', { name: 'Comparison controls' })).toBeVisible();
  await expect.poll(() => api.executionBodies.length).toBe(1);
});

test('on a phone, quote cards stack within the screen and the table scrolls inside its own box (FRD v1.76)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Compare my roofing quotes');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-quote-review-strip');
  const cards = response.getByRole('list', { name: 'Recorded proposals options' }).getByRole('listitem');
  await expect(cards).toHaveCount(3);
  for (const card of await cards.all()) {
    const box = await card.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);
  }
  await expect(response.getByRole('button', { name: 'Card strip' })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await response.getByRole('button', { name: 'Table', exact: true }).click();
  const scroller = response.locator('[data-comparison-presentation="table"]');
  await expect(scroller.getByRole('table', { name: 'Recorded proposals' })).toBeVisible();
  expect(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('sell, hold and rent show as a comparison strip with no winner badge or price bars, and the Table view lists both facts per path (FRD v1.85)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Should I sell, hold, or rent this home?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-sell-hold-rent-strip');
  const strip = response.getByRole('list', { name: '5-year scenario snapshot options' });
  await expect(strip.getByRole('listitem')).toHaveCount(3);
  await expect(strip.getByRole('listitem', { name: /Sell at the end/ })).toContainText('$412,000 modeled net proceeds');
  await expect(strip.getByRole('listitem', { name: /Rent the home out/ })).toContainText('-$6,500 modeled net change');
  await expect(strip.locator('[data-badge-policy]')).toHaveCount(0);
  await expect(strip.getByRole('img')).toHaveCount(0);

  await response.getByRole('button', { name: 'Table', exact: true }).click();
  const table = response.getByRole('table', { name: '5-year scenario snapshot' });
  await expect(table.getByRole('columnheader')).toHaveText(['Sell at the end of the horizon', 'Continue holding', 'Rent the home out']);
  await expect(table.getByRole('rowheader')).toHaveText(['Modeled outcome', 'Key components']);
  await expect(table.locator('[data-leading="true"]')).toHaveCount(0);
  await expect(response.getByRole('link', { name: /Explore and adjust scenarios/ })).toBeVisible();
  await expect.poll(() => api.executionBodies.length).toBe(1);
});

test('on a phone, the sell, hold and rent cards stack within the screen (FRD v1.85)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Should I sell, hold, or rent this home?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-sell-hold-rent-strip');
  const cards = response.getByRole('list', { name: '5-year scenario snapshot options' }).getByRole('listitem');
  await expect(cards).toHaveCount(3);
  for (const card of await cards.all()) {
    const box = await card.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('coverage comparison shows the policy and its alternative as a strip with premium bars and no winner, and the Table view lists the facts (FRD v1.86)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Compare my current insurance policy against alternatives');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-coverage-comparison-strip');
  const strip = response.getByRole('list', { name: 'Options options' });
  await expect(strip.getByRole('listitem')).toHaveCount(2);
  const current = strip.getByRole('listitem', { name: /Current policy/ });
  await expect(current).toContainText('Your current verified policy');
  await expect(current.getByRole('img', { name: 'Highest price of these options' })).toBeVisible();
  const quote = strip.getByRole('listitem', { name: /Harbor Insurance quote/ });
  await expect(quote).toContainText('Different protection');
  await expect(quote).toContainText('2 differences');
  await expect(quote.getByRole('img', { name: '75% of the highest price of these options' })).toBeVisible();
  await expect(strip.locator('[data-badge-policy]')).toHaveCount(0);

  await response.getByRole('button', { name: 'Table', exact: true }).click();
  const table = response.getByRole('table', { name: 'Options' });
  await expect(table.getByRole('columnheader')).toHaveText(['Current policy', 'Harbor Insurance quote']);
  await expect(table.getByText('Not listed')).toHaveCount(2);
  await expect(table.locator('[data-leading="true"]')).toHaveCount(0);
  await expect.poll(() => api.executionBodies.length).toBe(1);
});

test('on a phone, the coverage comparison cards stack within the screen (FRD v1.86)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Compare my current insurance policy against alternatives');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-coverage-comparison-strip');
  const cards = response.getByRole('list', { name: 'Options options' }).getByRole('listitem');
  await expect(cards).toHaveCount(2);
  for (const card of await cards.all()) {
    const box = await card.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('a refinance scenario shows next to the current comparison as a two-option strip with no winner, and the Table view lines up the shared figures (FRD v1.87)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('What if I refinanced at 5.5% for 15 years?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-refinance-scenario-strip');
  const strip = response.getByRole('list', { name: 'Illustrative scenario vs. your current loan options' });
  await expect(strip.getByRole('listitem')).toHaveCount(2);
  const current = strip.getByRole('listitem', { name: /Your current comparison/ });
  await expect(current).toContainText('6.875%');
  await expect(current).toContainText('28 months');
  const scenario = strip.getByRole('listitem', { name: /Illustrative scenario/ });
  await expect(scenario).toContainText('Modeled closing costs');
  await expect(scenario).toContainText('$77,000');
  await expect(strip.locator('[data-badge-policy]')).toHaveCount(0);
  await expect(strip.getByRole('img')).toHaveCount(0);

  await response.getByRole('button', { name: 'Table', exact: true }).click();
  const table = response.getByRole('table', { name: 'Illustrative scenario vs. your current loan' });
  await expect(table.getByRole('columnheader')).toHaveText(['Your current comparison (unchanged)', 'Illustrative scenario']);
  await expect(table.getByRole('row', { name: /Modeled monthly savings/ })).toContainText('$210');
  await expect(table.getByRole('row', { name: /Modeled monthly savings/ })).toContainText('$333');
  await expect(table.getByText('Not listed')).toHaveCount(5);
  await expect(table.locator('[data-leading="true"]')).toHaveCount(0);
  await expect(response.getByRole('link', { name: /Explore in Mortgage Refinance Radar/ })).toBeVisible();
  await expect.poll(() => api.executionBodies.length).toBe(1);
});

test('on a phone, the refinance scenario and current comparison cards stack within the screen (FRD v1.87)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('What if I refinanced at 5.5% for 15 years?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-refinance-scenario-strip');
  const cards = response.getByRole('list', { name: 'Illustrative scenario vs. your current loan options' }).getByRole('listitem');
  await expect(cards).toHaveCount(2);
  for (const card of await cards.all()) {
    const box = await card.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('saved upgrade options show as one strip per system with only the Selected badge, bars only for single figures, and a one-option system left in the list (FRD v1.89)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Show my upgrade planner options');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-home-upgrade-strip');
  const water = response.getByRole('list', { name: 'Basement water heater options options' });
  await expect(water.getByRole('listitem')).toHaveCount(2);
  const heatPump = water.getByRole('listitem', { name: /Heat pump water heater/ });
  await expect(heatPump.getByText('Selected')).toHaveAttribute('data-badge-policy', 'UPGRADE_SCENARIO_SELECTED');
  await expect(heatPump).toContainText('$2,800–$4,200');
  await expect(heatPump).toContainText('6 years');
  await expect(water.locator('[data-badge-policy]')).toHaveCount(1);
  await expect(water.getByRole('img')).toHaveCount(0);

  const roof = response.getByRole('list', { name: 'Roof options options' });
  await expect(roof.getByRole('listitem', { name: /Full re-roof/ }).getByRole('img', { name: 'Highest price of these options' })).toBeVisible();
  await expect(roof.getByRole('listitem', { name: /Patch the north slope/ }).getByRole('img', { name: '25% of the highest price of these options' })).toBeVisible();
  await expect(roof.getByRole('listitem', { name: /Patch the north slope/ })).toContainText('Results out of date');

  await expect(response.getByRole('heading', { name: 'Electrical Panel' })).toBeVisible();
  await expect(response.getByText('Panel upgrade')).toBeVisible();
  await response.getByRole('button', { name: 'Table', exact: true }).first().click();
  const table = response.getByRole('table', { name: 'Basement water heater options' });
  await expect(table.getByRole('columnheader')).toHaveText(['Heat pump water heater', 'Repair the tank']);
  await expect(table.locator('[data-leading="true"]')).toHaveCount(0);
  await expect.poll(() => api.executionBodies.length).toBe(1);
});

test('on a phone, each upgrade strip stacks its cards within the screen (FRD v1.89)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Show my upgrade planner options');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-home-upgrade-strip');
  for (const name of ['Basement water heater options options', 'Roof options options']) {
    const cards = response.getByRole('list', { name }).getByRole('listitem');
    await expect(cards).toHaveCount(2);
    for (const card of await cards.all()) {
      const box = await card.boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('capital windows sit on a timeline track by start month; a window opens its live canonical detail, and the List view keeps it (FRD v1.90)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('What big expenses are coming up for my home?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-capital-timeline-track');
  const track = response.locator('[data-display-pattern="timeline"]');
  await expect(track).toBeVisible();
  await expect(track.getByRole('group', { name: 'Show types' }).getByRole('button')).toHaveText(['Roofing', 'Plumbing']);
  await expect(track.getByRole('button', { name: /Jan 2027: Asphalt shingle roof \(Roofing\)/ })).toBeVisible();
  const heater = track.getByRole('button', { name: /May 2028: Water heater/ });
  await heater.click();
  const selected = track.locator('[data-ask-timeline-selected="timeline-heater"]');
  await expect(selected).toContainText('Window May 3, 2028–Apr 30, 2029 · Estimated $900–$1,600');
  await selected.getByRole('button', { name: /Details for Water heater/ }).click();
  await expect(track.getByText('Capital window no longer exists')).toBeVisible();

  await track.getByRole('button', { name: 'Previous event' }).click();
  await track.locator('[data-ask-timeline-selected="timeline-roof-property-summary"]').getByRole('button', { name: /Details for Asphalt shingle roof/ }).click();
  await expect(track.getByText('Capital window detail')).toBeVisible();
  await expect(track.getByText('Typical service life for asphalt shingle roofing is 20-25 years; this roof was installed 22 years ago.')).toBeVisible();

  await response.getByRole('button', { name: 'List', exact: true }).click();
  const list = response.locator('[data-display-pattern="timeline-list"]');
  await expect(list.getByRole('button', { name: /Details for/ })).toHaveCount(2);
  await list.getByRole('button', { name: /Details for Asphalt shingle roof/ }).click();
  await expect(list.getByText('Capital window detail')).toBeVisible();
  await expect.poll(() => api.executionBodies.length).toBe(1);
});

test('on a phone, the capital track scrolls inside its own box and a window opens its detail below (FRD v1.90)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('What big expenses are coming up for my home?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-capital-timeline-track');
  const track = response.locator('[data-display-pattern="timeline"]');
  await expect(track).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await track.getByRole('button', { name: /Jan 2027: Asphalt shingle roof/ }).click();
  await track.getByRole('button', { name: /Details for Asphalt shingle roof/ }).click();
  await expect(track.getByText('Capital window detail')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('home timeline answers on a track: latest event selected, category chips, stepping, undated events listed below, List kept (FRD v1.77)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Show my home timeline history');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-home-timeline-track');
  const track = response.locator('[data-display-pattern="timeline"]');
  await expect(track).toBeVisible();
  const detail = track.locator('[data-ask-timeline-selected="kitchen"]');
  await expect(detail.getByText('Jun 15, 2024 · Work done · Evidence Verified')).toBeVisible();
  await expect(detail.getByText('Improvement · Highlight')).toBeVisible();
  await expect(track.getByRole('button', { name: 'Feb 2024: Paint colours chosen (Records and notes)' })).toBeVisible();
  await expect(track.getByRole('group', { name: 'Show types' }).getByRole('button')).toHaveText(['Work done', 'Records and notes', 'Inspections', 'Claims', 'Purchases and value']);
  await track.getByRole('button', { name: 'Previous event' }).click();
  await expect(track.locator('[data-ask-timeline-selected="paint"]')).toBeVisible();
  await track.getByRole('button', { name: 'Claims', exact: true }).click();
  await expect(track.locator('[data-ask-timeline-point="claim"]')).toHaveCount(0);
  await expect(response.getByRole('heading', { name: 'Date unknown' }).first()).toBeVisible();
  await expect(response.getByText('Old roof work')).toBeVisible();

  await response.getByRole('button', { name: 'List', exact: true }).click();
  const list = response.locator('[data-timeline-list]');
  await expect(list.getByRole('listitem')).toHaveCount(5);
  await expect(list.getByRole('listitem').nth(2).getByText('2023', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? '{}').timelineLayouts?.['home-timeline-events'], `ctc:ask-result-view:v1:${sessionIdOf(page.url())}:${propertyId}:execution-home-timeline-track`)).toBe('LIST');
  await response.getByRole('button', { name: 'Timeline', exact: true }).click();
  await expect(track).toBeVisible();
  expect(api.executionBodies.length).toBe(1);
});

test('on a phone, the home timeline track scrolls sideways inside its box and the selected event fits the screen (FRD v1.77)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Show my home timeline history');
  await page.getByRole('button', { name: 'Send question' }).click();

  const track = page.locator('#ask-execution-execution-home-timeline-track [data-display-pattern="timeline"]');
  await expect(track).toBeVisible();
  const scroller = track.locator('[aria-label^="Home timeline,"]');
  expect(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const box = await track.locator('[data-ask-timeline-selected="kitchen"]').boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);
  await track.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.locator('#ask-execution-execution-home-timeline-track [data-timeline-list]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('appliance oracle answers as lifespan bars with the Oracle\'s labels, and Add purchase date asks to correct that appliance (FRD v1.78)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Show my appliance lifespans');
  await page.getByRole('button', { name: 'Send question' }).click();

  const block = page.locator('#ask-execution-execution-appliance-lifespan [data-display-pattern="lifespan"]');
  await expect(block).toBeVisible();
  const rows = block.locator('[data-ask-lifespan-item]');
  await expect(rows).toHaveCount(3);
  expect(await rows.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-ask-lifespan-item')))).toEqual(['item-dishwasher', 'item-water-heater', 'item-fridge']);
  const dishwasher = block.locator('[data-ask-lifespan-item="item-dishwasher"]');
  await expect(dishwasher.getByText('Critical · 64% failure risk')).toBeVisible();
  await expect(dishwasher.getByRole('img', { name: 'Dishwasher: 12 yrs old; typical life 8 to 12 years' })).toBeVisible();
  await expect(dishwasher.getByText('Past its expected life · Replacement about $800', { exact: false })).toBeVisible();
  await expect(block.getByText('No purchase date yet for this appliance')).toBeVisible();
  await block.locator('[data-ask-lifespan-missing="item-dryer"]').getByRole('button', { name: /Add purchase date/ }).click();
  await expect.poll(() => api.executionBodies.some((body) => body.message === 'Correct the purchase date of this inventory item.'
    && (body.launchContext as { entityType?: string } | undefined)?.entityType === 'INVENTORY_ITEM'
    && (body.launchContext as { entityId?: string } | undefined)?.entityId === 'item-dryer'
    && (body.launchContext as { operationId?: string } | undefined)?.operationId === 'INVENTORY_ITEM_CORRECT')).toBe(true);
});

test('on a phone, lifespan bars and their facts fit the screen with no sideways scroll (FRD v1.78)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Show my appliance lifespans');
  await page.getByRole('button', { name: 'Send question' }).click();

  const block = page.locator('#ask-execution-execution-appliance-lifespan [data-display-pattern="lifespan"]');
  await expect(block.locator('[data-ask-lifespan-item]')).toHaveCount(3);
  for (const row of await block.locator('[data-ask-lifespan-item]').all()) {
    const box = await row.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);
    await expect(row.locator('[data-ask-lifespan-meta]')).toBeVisible();
  }
  await expect(block.getByRole('button', { name: /Add purchase date/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('rooms answer as a room map by floor; a tile opens the live room detail in a side drawer with its corrections (FRD v1.79)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Show the rooms in my home record');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-room-map');
  await expect(response.locator('[data-display-pattern="room_map"]')).toBeVisible();
  await expect(response.getByRole('group', { name: 'Floor' }).getByRole('button')).toHaveText(['Ground floor (2)', 'Floor 1 (2)', 'Other (1)']);
  const kitchen = response.getByRole('list', { name: 'Ground floor, 2 rooms' }).getByRole('button', { name: /Kitchen/ });
  await expect(kitchen).toContainText('8 items');
  await expect(kitchen).toContainText('2 open tasks');
  await response.getByRole('button', { name: /^Floor 1/ }).click();
  await expect(response.getByRole('list', { name: 'Floor 1, 2 rooms' }).getByRole('button', { name: /Office/ })).toContainText('1 open task');
  await response.getByRole('button', { name: /^Ground floor/ }).click();
  await kitchen.click();
  const drawer = page.getByRole('dialog', { name: 'Room detail: Kitchen' });
  await expect(drawer.getByText('Good · 82/100')).toBeVisible();
  const box = await drawer.boundingBox();
  expect(box && Math.round(box.x + box.width)).toBeGreaterThanOrEqual(1439);
  await drawer.getByRole('button', { name: /Rename room/ }).click();
  await expect.poll(() => api.executionBodies.some((body) => body.message === 'Rename this room.'
    && (body.launchContext as { entityId?: string } | undefined)?.entityId === 'room-property-summary')).toBe(true);
});

test('on a phone, the room map tiles fit the screen and a room opens as a bottom sheet; List shows the counts (FRD v1.79)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Show the rooms in my home record');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-room-map');
  const tiles = response.locator('[data-ask-room-tile]');
  await expect(tiles).toHaveCount(2);
  for (const tile of await tiles.all()) {
    const box = await tile.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await response.locator('[data-ask-room-tile="room-property-summary"]').click();
  const sheet = page.getByRole('dialog', { name: 'Room detail: Kitchen' });
  await expect(sheet.getByText('Good · 82/100')).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box && Math.round(box.y + box.height)).toBeGreaterThanOrEqual(843);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await response.getByRole('button', { name: 'List', exact: true }).click();
  await expect(response.getByText('Kitchen · 8 items · 2 open tasks · Updated Sep 1, 2026')).toBeVisible();
});

test('sale readiness answers with a progress ring: percent and basis, must-address tiles, next steps whose decision is sent for that item (FRD v1.80)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('How ready is my home to sell');
  await page.getByRole('button', { name: 'Send question' }).click();

  const ring = page.locator('#ask-execution-execution-seller-prep-progress [data-display-pattern="progress"]');
  await expect(ring.getByRole('img', { name: '50% ready. 3 of 6 must-address items resolved or disclosed' })).toBeVisible();
  await expect(ring.locator('dl > div')).toHaveText(['Open2', 'Pursuing1', 'Waived1']);
  const blocker = ring.locator('[data-ask-progress-step="blocker-open"]');
  await expect(blocker.getByText('Safety & structural · Blocks a sale · $5,000–$9,000 estimated')).toBeVisible();
  await expect(blocker.getByRole('link', { name: 'Open Repair the cracked foundation wall' })).toHaveAttribute('href', /tools\/sale-case\?focusItemId=blocker-open/);
  await blocker.getByRole('button', { name: /Pursue before listing/ }).click();
  await expect.poll(() => api.executionBodies.some((body) => body.message === 'Pursue this seller-prep checklist item.'
    && (body.launchContext as { entityType?: string } | undefined)?.entityType === 'SALE_READINESS_ITEM'
    && (body.launchContext as { entityId?: string } | undefined)?.entityId === 'blocker-open')).toBe(true);
});

test('on a phone, the sale readiness ring, tiles and next steps fit the screen (FRD v1.80)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('How ready is my home to sell');
  await page.getByRole('button', { name: 'Send question' }).click();

  const ring = page.locator('#ask-execution-execution-seller-prep-progress [data-display-pattern="progress"]');
  await expect(ring.getByRole('img', { name: /^50% ready/ })).toBeVisible();
  for (const element of [...await ring.locator('dl > div').all(), ...await ring.locator('[data-ask-progress-step]').all()]) {
    const box = await element.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);
  }
  await expect(ring.locator('[data-ask-progress-step="verify-open"]').getByRole('button', { name: /Disclose and waive/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('the home record answers with a completeness ring, its own missing, conflicted and stale counts, and the least complete areas with their capture action (FRD v1.91)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('How complete is my home record?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const ring = page.locator('#ask-execution-execution-property-completeness-ring [data-display-pattern="progress"]');
  await expect(ring.getByRole('img', { name: '62% ready. 31 of 50 applicable facts known across 9 areas' })).toBeVisible();
  await expect(ring.locator('dl > div')).toHaveText(['Missing9', 'Conflicted1', 'Stale2']);
  await expect(ring.locator('[data-ask-progress-step]')).toHaveCount(3);
  const core = ring.locator('[data-ask-progress-step="CORE"]');
  await expect(core).toContainText('4 of 10 facts known');
  await expect(core.getByRole('link', { name: 'Open Core details' })).toHaveAttribute('href', /\/edit/);
  await core.getByRole('button', { name: 'Fill in missing details' }).click();
  await expect.poll(() => api.executionBodies.some((body) => body.message === 'Fill in the missing core property details.')).toBe(true);
  await expect(ring.locator('[data-ask-progress-step="EXTERIOR"]').getByRole('button')).toHaveCount(0);
});

test('on a phone, the completeness ring, tiles and next steps fit the screen (FRD v1.91)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('How complete is my home record?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const ring = page.locator('#ask-execution-execution-property-completeness-ring [data-display-pattern="progress"]');
  await expect(ring.getByRole('img', { name: /^62% ready/ })).toBeVisible();
  for (const element of [...await ring.locator('dl > div').all(), ...await ring.locator('[data-ask-progress-step]').all()]) {
    const box = await element.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('closing day answers with the workspace\'s five checks as a ring, blockers first, each step linking to the plan and none deciding anything (FRD v1.91)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('What do I need for closing day?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const ring = page.locator('#ask-execution-execution-buyer-closing-day-ring [data-display-pattern="progress"]');
  await expect(ring.getByRole('img', { name: '40% ready. 2 of 5 closing-day checks done' })).toBeVisible();
  await expect(ring.locator('dl > div')).toHaveText(['Done2', 'Not yet3', 'Blockers1']);
  const steps = ring.locator('[data-ask-progress-step]');
  await expect(steps).toHaveCount(3);
  await expect(steps.first()).toContainText('Lender needs pay stubs');
  await expect(steps.nth(1)).toContainText('Funds readiness reviewed');
  await expect(steps.first().getByRole('link', { name: 'Open Lender needs pay stubs' })).toHaveAttribute('href', /buyer-plan/);
  await expect(ring.getByRole('button')).toHaveCount(0);
  await expect.poll(() => api.executionBodies.length).toBe(1);
});

test('on a phone, the closing-day ring, tiles and steps fit the screen (FRD v1.91)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('What do I need for closing day?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const ring = page.locator('#ask-execution-execution-buyer-closing-day-ring [data-display-pattern="progress"]');
  await expect(ring.getByRole('img', { name: /^40% ready/ })).toBeVisible();
  for (const element of [...await ring.locator('dl > div').all(), ...await ring.locator('[data-ask-progress-step]').all()]) {
    const box = await element.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('home actions show their priorities as shelves whose cards open a read-only detail in a side drawer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('What needs my attention now?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-home-action-shelves');
  await expect(response.getByRole('list', { name: 'Now, 2 items' }).getByRole('listitem')).toHaveCount(2);
  await expect(response.getByRole('list', { name: 'Plan, 1 item' })).toBeVisible();
  const card = response.getByRole('button', { name: /Replace the HVAC filter/ });
  await expect(card).toContainText('Due Oct 3, 2026');
  await card.click();
  const drawer = page.getByRole('dialog', { name: 'Replace the HVAC filter' });
  await expect(drawer.getByText('A clogged filter strains the system.')).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Open record' })).toBeVisible();
  await expect(drawer.getByRole('button')).toHaveCount(1);
  const box = await drawer.boundingBox();
  expect(box && box.x + box.width).toBeGreaterThan(1430);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();

  await response.getByRole('button', { name: 'List', exact: true }).click();
  await expect(response.getByRole('link', { name: 'Replace the HVAC filter' })).toBeVisible();
  await expect.poll(() => api.executionBodies.length).toBe(1);
});

test('on a phone, home action shelves stay inside the screen and a card opens as a bottom sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('What needs my attention now?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-home-action-shelves');
  await expect(response.getByRole('list', { name: 'Now, 2 items' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await response.getByRole('button', { name: /Budget for a new roof/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Budget for a new roof' });
  await expect(sheet.getByText('The recorded roof is near the end of its typical life.')).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box && Math.round(box.y + box.height)).toBeGreaterThanOrEqual(843);
  await sheet.getByRole('button', { name: 'Close details' }).click();
  await expect(sheet).toBeHidden();
});

test('seasonal checklist tasks show as priority shelves whose cards open a read-only detail in a side drawer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('What seasonal tasks are pending?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-seasonal-shelves');
  await expect(response.getByRole('list', { name: 'Critical, 2 items' }).getByRole('listitem')).toHaveCount(2);
  await expect(response.getByRole('list', { name: 'Optional, 1 item' })).toBeVisible();
  const card = response.getByRole('button', { name: /Service air conditioner/ });
  await expect(card).toContainText('Recommended Aug 20, 2026');
  await card.click();
  const drawer = page.getByRole('dialog', { name: 'Service air conditioner' });
  await expect(drawer.getByText('Prepare the cooling system for sustained heat.')).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Open record' })).toHaveAttribute('href', /dashboard\/seasonal/);
  await expect(drawer.getByRole('button')).toHaveCount(1);
  const box = await drawer.boundingBox();
  expect(box && box.x + box.width).toBeGreaterThan(1430);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();

  await response.getByRole('button', { name: 'List', exact: true }).click();
  await expect(response.getByRole('link', { name: 'Service air conditioner' })).toBeVisible();
  await expect.poll(() => api.executionBodies.length).toBe(1);
});

test('on a phone, seasonal shelves stay inside the screen and a task opens as a bottom sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('What seasonal tasks are pending?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-seasonal-shelves');
  await expect(response.getByRole('list', { name: 'Critical, 2 items' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await response.getByRole('button', { name: /Clean dryer vent/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Clean dryer vent' });
  await expect(sheet.getByText('Lint buildup is a fire risk.')).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box && Math.round(box.y + box.height)).toBeGreaterThanOrEqual(843);
  await sheet.getByRole('button', { name: 'Close details' }).click();
  await expect(sheet).toBeHidden();
});

test('the status board shows appliances and systems as condition shelves whose cards open a read-only detail in a side drawer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Show my status board');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-status-board-shelves');
  await expect(response.getByRole('list', { name: 'Needs action, 2 items' }).getByRole('listitem')).toHaveCount(2);
  await expect(response.getByRole('list', { name: 'In good shape, 1 item' })).toBeVisible();
  const card = response.getByRole('button', { name: /Water heater/ });
  await expect(card).toContainText('12 yr old');
  await card.click();
  const drawer = page.getByRole('dialog', { name: 'Water heater' });
  await expect(drawer.getByText('Past expected life (10yr)')).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Open record' })).toHaveAttribute('href', /inventory/);
  await expect(drawer.getByRole('button')).toHaveCount(1);
  const box = await drawer.boundingBox();
  expect(box && box.x + box.width).toBeGreaterThan(1430);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();

  await response.getByRole('button', { name: 'List', exact: true }).click();
  await expect(response.getByRole('link', { name: 'Water heater' })).toBeVisible();
  await expect.poll(() => api.executionBodies.length).toBe(1);
});

test('on a phone, status board shelves stay inside the screen and an item opens as a bottom sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Show my status board');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-status-board-shelves');
  await expect(response.getByRole('list', { name: 'Needs action, 2 items' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await response.getByRole('button', { name: /Refrigerator/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Refrigerator' });
  await expect(sheet.getByText('3 yr old').first()).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box && Math.round(box.y + box.height)).toBeGreaterThanOrEqual(843);
  await sheet.getByRole('button', { name: 'Close details' }).click();
  await expect(sheet).toBeHidden();
});

test('the buyer plan shows the next task and blockers as shelves whose cards open a read-only detail in a side drawer (FRD v1.84)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('What is left before I close?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-buyer-plan-shelves');
  await expect(response.getByRole('list', { name: 'Do this next, 1 item' })).toBeVisible();
  await expect(response.getByRole('list', { name: 'Also watch before closing, 2 items' }).getByRole('listitem')).toHaveCount(2);
  const card = response.getByRole('button', { name: /Review the Closing Disclosure/ });
  await expect(card).toContainText('Due Aug 20, 2026');
  await card.click();
  const drawer = page.getByRole('dialog', { name: 'Review the Closing Disclosure' });
  await expect(drawer.getByText('Compare the current revision with the selected Loan Estimate.')).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Open record' })).toHaveAttribute('href', /buyer-plan\?taskId=task-cd/);
  await expect(drawer.getByRole('button')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();

  await response.getByRole('button', { name: 'List', exact: true }).click();
  await expect(response.getByRole('link', { name: 'Bind homeowners insurance' })).toBeVisible();
  await expect.poll(() => api.executionBodies.length).toBe(1);
});

test('on a phone, buyer plan shelves stay inside the screen and a task opens as a bottom sheet (FRD v1.84)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('What is left before I close?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-buyer-plan-shelves');
  await expect(response.getByRole('list', { name: 'Also watch before closing, 2 items' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await response.getByRole('button', { name: /Send the lender the pay stubs/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Send the lender the pay stubs' });
  await expect(sheet.getByText('The lender still needs two recent pay stubs.')).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box && Math.round(box.y + box.height)).toBeGreaterThanOrEqual(843);
  await sheet.getByRole('button', { name: 'Close details' }).click();
  await expect(sheet).toBeHidden();
});

test('maintenance detail access loss redacts the stale result and its actions without leaving Ask', async ({ page }) => {
  await installAskApi(page, { maintenanceDetailAccessLost: true });
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('What maintenance tasks are due this month?');
  await page.getByRole('button', { name: 'Send question' }).click();

  const response = page.locator('#ask-execution-execution-maintenance');
  await response.getByRole('button', { name: 'Service the heat pump', exact: true }).click();

  await expect(response).toHaveAttribute('role', 'alert');
  await expect(response.getByRole('heading', { name: 'Result unavailable' })).toBeVisible();
  await expect(response).toContainText('Access to this result is no longer available.');
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

  await expect(page.getByRole('button', { name: 'Inspect the attic fan', exact: true })).toBeVisible();
  await expect(page.getByText('Server results 51–51 of 51')).toBeVisible();
  // The first page is kept as a collapsed, superseded card on purpose (question stays visible, content
  // collapsed), so count expanded result headings rather than execution containers.
  await expect(page.getByRole('heading', { name: 'Maintenance record', exact: true })).toHaveCount(1);
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
  await expect.poll(() => page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? '{}').presentationModes?.['ownership-cost-categories'], `ctc:ask-result-view:v1:${sessionIdOf(page.url())}:ask-property-fixture:adaptive-table-result`)).toBe('CARDS');

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
  await expect(response.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true');
  await expect(response.locator('[data-comparison-presentation="strip"]')).toBeVisible();
  await response.getByText('Why this label').first().click();
  await expect(response.getByText('The recorded $650 repair estimate is lower than the modeled replacement estimate.')).toBeVisible();
  await expect(response.getByRole('button', { name: 'Review repair' })).toBeVisible();

  await response.getByRole('button', { name: 'Next option in Compare refrigerator options' }).click();
  await expect(response.getByText(/Option 2 of 3/)).toBeVisible();
  await response.getByRole('button', { name: 'Show all' }).click();
  await expect(response.locator('[data-comparison-presentation="grid"]')).toBeVisible();
  await expect.poll(() => page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? '{}').comparisonLayouts?.['refrigerator-options'], `ctc:ask-result-view:v1:${sessionIdOf(page.url())}:ask-property-fixture:comparison-strip-result`)).toBe('GRID');
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
  await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), `ctc:ask-context-panel:v1:${sessionIdOf(page.url())}:ask-property-fixture`)).toBe('execution-adaptive-table');

  await page.goBack();
  await expect(panel).toHaveCount(0);
  await page.goForward();
  await expect(panel.getByRole('heading', { name: 'Response context' })).toBeVisible();

  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toHaveCount(0);
  await expect(sourceTrigger).toBeFocused();
  await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), `ctc:ask-context-panel:v1:${sessionIdOf(page.url())}:ask-property-fixture`)).toBeNull();
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
  // The sheet has a single labelled close control (its X).
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
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
