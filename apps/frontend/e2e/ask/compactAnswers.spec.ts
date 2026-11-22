import { expect, test, type Page } from '@playwright/test';
import { askApiOrigin, assertAskAuthenticated, fulfillAskRoute, installAskApi, installAskContext, propertyId } from './fixtures';
import answers from './compactAnswerBlocks.json';

// UI review 2026-11-21, slice 5: browser acceptance for the compact answer anatomy. The blocks are the ones the backend really builds
// (regenerate with `node scripts/ask-dump-cross-domain-answers.js` in apps/backend; the backend suite checks the file is current), served through the Ask API fixture.
type Case = { question: string; status: string; blocks: unknown[] };
const cases = answers as unknown as Record<string, Case>;

// The composer and its margins take about this much of a short window.
const COMPOSER_RESERVE = 130;

test.beforeEach(async ({ context }) => installAskContext(context, { calm: 'default' }));

async function ask(page: Page, key: string) {
  const fixture = cases[key];
  await installAskApi(page);
  // Registered after the shared fixture, so this route answers the turn.
  await page.route(`${askApiOrigin}/api/ask/executions`, async (route) => {
    assertAskAuthenticated(route.request());
    const now = new Date().toISOString();
    await fulfillAskRoute(route, { success: true, data: {
      schemaVersion: '1.0', executionId: `execution-${key}`, sessionId: 'ask-acceptance-session', question: fixture.question, status: fixture.status,
      property: { id: propertyId, label: 'Acceptance Home' }, operation: { id: 'DATA_POINT_READ', version: '1.0', family: 'RECORD_QUERY' }, contextVersion: 'compact-v1',
      blocks: fixture.blocks, skill: null, skillHandoff: null, captureRequests: [], confirmation: null, clarification: null,
      correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false }, suggestions: [], createdAt: now, updatedAt: now,
    } }, 201);
  });
  await page.goto(`/acceptance/ask?propertyId=${propertyId}`);
  const composer = page.getByPlaceholder(/^Ask anything about /);
  await composer.fill(fixture.question);
  await composer.press('Enter');
  // The answer has arrived when the pending turn is gone. (The calm answer composes its own headline for some record lists, so the producer's title is not awaited.)
  await expect(page.locator('[data-pending-turn]')).toHaveCount(0);
  await expect(page.locator('main article').last().getByRole('button', { name: 'Response options' })).toBeVisible();
}

const bodyText = (page: Page) => page.locator('main article').last().innerText();

for (const key of Object.keys(cases)) {
  test(`${key}: no system wording, no "(s)", no repeated count or heading`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await ask(page, key);
    const text = await bodyText(page);
    expect(text).not.toMatch(/Matched records|confirmed matches|\(s\)|persisted analysis|canonical|prepared response/i);
    expect(text).not.toMatch(/\$\d+\.\d\d\b/);
  });
}

test('permits with only an unknown record: the record is its own collection and the answer fits one screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await ask(page, 'permitsUnknownOnly');
  const article = page.locator('main article').last();
  // Answer first: the heading is the answer, not the topic label.
  await expect(article.getByRole('heading', { name: 'No projects are confirmed as needing a permit.' })).toBeVisible();
  await expect(article.getByText('Project permit requirements')).toHaveCount(0);
  await expect(article.getByRole('heading', { name: 'Needs confirmation', level: 3 })).toHaveCount(1);
  await expect(article.getByText('Office Desk')).toBeVisible();
  await expect(article.getByText('Permit requirement not recorded')).toBeVisible();
  await expect(article.getByText('Matched records')).toHaveCount(0);
  const box = await article.boundingBox();
  expect(box).toBeTruthy();
  // Measured against the window, leaving room for the composer: a count and one record fit above it without scrolling.
  console.log(`permitsUnknownOnly: answer bottom ${Math.round(box!.y + box!.height)}px of a 720px window`);
  expect(box!.y + box!.height).toBeLessThanOrEqual(720 - COMPOSER_RESERVE);
});

test('own-vs-rent without a tenant rent leads with the limitation and shows no list or card', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await ask(page, 'ownVsRentMissingRent');
  const article = page.locator('main article').last();
  await expect(article).toContainText('I can’t determine the owning-versus-renting break-even yet.');
  await expect(article).toContainText('It needs the monthly rent for a comparable home');
  await expect(article.locator('[data-list-density]')).toHaveCount(0);
  await expect(article.getByText('Own-vs-rent break-even analysis')).toHaveCount(0);
  const box = await article.boundingBox();
  console.log(`ownVsRentMissingRent: answer bottom ${Math.round(box!.y + box!.height)}px of a 720px window`);
  expect(box!.y + box!.height).toBeLessThanOrEqual(720 - COMPOSER_RESERVE);
});

test('own-vs-rent with inputs is a conclusion, facts and assumptions, with whole-dollar figures', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ask(page, 'ownVsRentComputed');
  const article = page.locator('main article').last();
  await expect(article).toContainText(/Owning beats renting starting in year \d/);
  await expect(article).toContainText('$34,684');
  console.log(`ownVsRentComputed text: ${(await article.innerText()).replace(/\n+/g, ' | ')}`);
  await expect(article.locator('[data-list-density]')).toHaveCount(0);
});

test('dense rows: a list record is one compact row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ask(page, 'permitsMixed');
  const rows = page.locator('main article').last().locator('[data-dense-row-content]');
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  for (let i = 0; i < count; i += 1) {
    const box = await rows.nth(i).boundingBox();
    console.log(`permitsMixed row ${i}: ${Math.round(box!.height)}px`);
    expect(box!.height).toBeLessThanOrEqual(64);
  }
});

test('a claims list has no stray count fragment and names its group', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ask(page, 'openClaims');
  const article = page.locator('main article').last();
  await expect(article.getByText('Water-damage claim')).toBeVisible();
  const text = await article.innerText();
  expect(text).not.toMatch(/^\s*·\s*\d+\s*$/m);
  expect(text).toMatch(/claims · 1/i);
});

test('a mixed permit answer states the confirmed count first, then the unconfirmed ones apart', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ask(page, 'permitsMixed');
  const article = page.locator('main article').last();
  await expect(article.getByRole('heading', { name: '1 project needs a permit.' })).toBeVisible();
  await expect(article).toContainText('2 more have no permit requirement recorded.');
  await expect(article.getByText('200A Electrical Panel Upgrade')).toBeVisible();
  await expect(article.getByRole('heading', { name: 'Needs confirmation', level: 3 })).toBeVisible();
  await expect(article).toContainText('Deck rebuild');
  await expect(article).toContainText('Fence repair');
});
