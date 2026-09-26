import { expect, test } from '@playwright/test';
import { installAskApi, installAskContext, propertyId } from './fixtures';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.11 (FRD v1.111): the calm shell is the default for everyone. These specs use the default;
// every other spec in this folder pins the setting off (see installAskContext) so it keeps checking the previous presentation.
test.beforeEach(async ({ context }) => installAskContext(context, { calm: 'default' }));

test('calm landing: one slim header, a state strip, starter chips, and no helper copy', async ({ page }) => {
  const api = await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await expect(page.locator('[data-ask-layout="full-window"]')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Ask Cozy' })).toHaveCount(1);
  await expect(page.getByText('Answers use your selected home record')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'How can I help with your home?' })).toBeVisible();
  await expect(page.getByPlaceholder('Ask anything about your home…')).toBeInViewport();
  await expect(page.getByText('Enter to send · Shift+Enter for a new line')).toHaveCount(0);
  await expect(page.getByText('Record-based when available')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Popular ways to use Ask Cozy' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'For your attention' })).toHaveCount(0);
  await expect(page.locator('[data-calm-state-strip]')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Things you can ask' }).getByRole('button')).not.toHaveCount(0);
  const conversationNav = page.getByRole('navigation', { name: 'Ask Cozy conversations' });
  await expect(conversationNav.getByText('Your home assistant')).toHaveCount(0);
  await expect(conversationNav.getByText(/navigation remains available above/)).toHaveCount(0);
  await expect(conversationNav.getByPlaceholder('Search conversations')).toBeVisible();

  const chip = page.getByRole('list', { name: 'Things you can ask' }).getByRole('button').first();
  await chip.click();
  await expect.poll(() => api.executionBodies.length).toBe(1);
});

test('calm answer: no answer frame, one overflow menu, and the composer stays plain', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByRole('list', { name: 'Things you can ask' }).getByRole('button').first().click();
  const options = page.getByRole('button', { name: 'Response options' });
  await expect(options.first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Refresh this result/ })).toHaveCount(0);
  await expect(page.locator('article > div.rounded-3xl')).toHaveCount(0);
  await expect(page.getByText('Enter to send · Shift+Enter for a new line')).toHaveCount(0);
  await options.first().click();
  await expect(page.getByRole('menuitem', { name: /Refresh/ })).toBeVisible();
});

test('calm domain list: the list has no outer frame and the summary leads', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Show my claims');
  await page.keyboard.press('Enter');
  const list = page.locator('article section.overflow-hidden').first();
  await expect(list).toBeVisible();
  await expect(list).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('[data-calm-summary]').first()).toBeVisible();
});

test('calm tool discovery: one compact row for the match, related tools collapsed, no per-tool paragraphs', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await page.getByPlaceholder('Ask anything about your home…').fill('Is there a tool to help with refinancing?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByRole('heading', { name: 'Best match for your goal' })).toBeVisible();
  await expect(page.getByText('More home details will improve the result')).toBeVisible();
  await expect(page.getByText(/Full tool:/)).toHaveCount(0);
  const related = page.locator('details[data-calm-secondary]');
  await expect(related).toHaveCount(1);
  await expect(related).not.toHaveAttribute('open', '');
  await related.locator('summary').click();
  await expect(related.getByRole('link', { name: /Open Break-Even/ })).toBeVisible();
});

test('calm desktop: no second title band, the status dot sits in the rail, and there is one page heading', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Ask Cozy' })).toHaveCount(1);
  await expect(page.locator('header').filter({ hasText: 'Ask Cozy' })).toBeHidden();
});

test('?calm=0 returns to the previous presentation and is remembered', async ({ page }) => {
  await installAskApi(page);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}&calm=0`);
  await expect(page.getByRole('heading', { name: 'Popular ways to use Ask Cozy' })).toBeVisible();
  await expect(page.getByText('Answers use your selected home record')).toBeVisible();
  await expect(page.locator('[data-calm-landing]')).toHaveCount(0);
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  await expect(page.getByRole('heading', { name: 'Popular ways to use Ask Cozy' })).toBeVisible();
  await page.goto(`/acceptance/ask?propertyId=${propertyId}&calm=1`);
  await expect(page.locator('[data-calm-landing]')).toBeVisible();
});
