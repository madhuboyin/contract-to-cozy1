import { expect, test, type Page } from '@playwright/test';
import { installAskApi, installAskContext, propertyId } from './fixtures';

test.beforeEach(async ({ context }) => installAskContext(context, { calm: 'default' }));
const composer = (page: Page) => page.getByPlaceholder(/^Ask anything about /);
const open = async (page: Page) => page.goto(`/acceptance/ask?propertyId=${propertyId}`);
const ask = async (page: Page, question: string) => { await composer(page).fill(question); await page.keyboard.press('Enter'); };
const noSidewaysScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

test('Project Tracker uses the readable measure, content-driven cards, no blank footer, and desktop record density', async ({ page }) => {
  await installAskApi(page);
  await open(page);
  await ask(page, 'Show my project tracker visual fixture.');

  const answer = page.locator('#ask-execution-execution-project-tracker');
  await expect(answer).toHaveAttribute('data-answer-width', 'standard');
  expect((await answer.boundingBox())?.width).toBeLessThanOrEqual(920);
  await expect(answer.locator('[data-project-record-grid] > li')).toHaveCount(4);
  await expect(answer.getByText('More actions').first()).toBeVisible();
  const cardHeights = await answer.locator('[data-project-record-grid] > li').evaluateAll((cards) => cards.map((card) => Math.round(card.getBoundingClientRect().height)));
  expect(Math.max(...cardHeights)).toBeLessThan(260);
  await expect(answer.locator('div.border-t[class*="bg-slate-50/70"]')).toHaveCount(0);
  await expect(page).toHaveScreenshot('project-tracker-desktop.png', { animations: 'disabled', fullPage: true });
});

test('Project Tracker stacks without horizontal scrolling on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAskApi(page);
  await open(page);
  await ask(page, 'Show my project tracker visual fixture.');

  const cards = page.locator('[data-project-record-grid] > li');
  const first = await cards.nth(0).boundingBox();
  const second = await cards.nth(1).boundingBox();
  expect(first && second && second.y >= first.y + first.height).toBe(true);
  await noSidewaysScroll(page);
  await expect(page).toHaveScreenshot('project-tracker-mobile.png', { animations: 'disabled', fullPage: true });
});
