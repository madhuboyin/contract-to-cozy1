import { expect, test, type Page } from '@playwright/test';
import { askApiOrigin, assertAskAuthenticated, fulfillAskRoute, installAskApi, installAskContext, propertyId } from './fixtures';
import answers from './compactAnswerBlocks.json';

// Fixture-backed browser acceptance (the blocks are the ones the backend builds, served through the Ask API fixture): this is NOT end-to-end validation. It does not exercise API serialization,
// real authentication or property access, database record shapes, live claim and project relationships, source evidence, or a real saved session.
//
// Geometry across the viewports the owner review asked for: a phone, a tablet, a short and a standard desktop, and a 320px width (what a 640px window shows at 200% zoom).
type Case = { question: string; status: string; blocks: unknown[] };
const cases = answers as unknown as Record<string, Case>;
const VIEWPORTS = [
  { name: 'phone 390x844', width: 390, height: 844 },
  { name: 'tablet 768x1024', width: 768, height: 1024 },
  { name: 'short desktop 1280x720', width: 1280, height: 720 },
  { name: 'standard desktop 1440x900', width: 1440, height: 900 },
  { name: '200% zoom (320 CSS px wide)', width: 320, height: 568 },
] as const;

test.beforeEach(async ({ context }) => installAskContext(context, { calm: 'default' }));

async function ask(page: Page, key: string) {
  const fixture = cases[key];
  await installAskApi(page);
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
  await expect(page.locator('[data-pending-turn]')).toHaveCount(0);
  await expect(page.locator('main article').last().getByRole('button', { name: 'Response options' })).toBeVisible();
}

for (const viewport of VIEWPORTS) {
  for (const key of Object.keys(cases)) {
    test(`${key} at ${viewport.name}: no horizontal scroll, nothing wider than the screen, controls large enough`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await ask(page, key);
      const article = page.locator('main article').last();
      const overflow = await page.evaluate(() => {
        const el = document.documentElement;
        const articleEl = Array.from(document.querySelectorAll('main article')).pop() as HTMLElement;
        const wide = Array.from(articleEl.querySelectorAll<HTMLElement>('*')).filter((node) => {
          const box = node.getBoundingClientRect();
          return box.width > 0 && box.right > el.clientWidth + 1 && getComputedStyle(node).position !== 'fixed' && !node.closest('[data-allow-scroll], [role="table"], table');
        }).slice(0, 5).map((node) => `${node.tagName.toLowerCase()}.${String(node.className).slice(0, 60)}`);
        return { page: el.scrollWidth - el.clientWidth, article: articleEl.scrollWidth - articleEl.clientWidth, wide };
      });
      expect(overflow.page, `the page scrolls sideways: ${JSON.stringify(overflow)}`).toBeLessThanOrEqual(1);
      expect(overflow.article, `the answer is wider than its column: ${JSON.stringify(overflow)}`).toBeLessThanOrEqual(1);
      expect(overflow.wide, `elements wider than the screen: ${JSON.stringify(overflow.wide)}`).toEqual([]);
      // WCAG 2.2 target size (minimum): every visible control in the answer is at least 24x24 CSS px.
      const controls = await article.locator('button:visible, a:visible').evaluateAll((nodes) => nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { label: (node.getAttribute('aria-label') ?? node.textContent ?? '').trim().slice(0, 40), width: Math.round(box.width), height: Math.round(box.height) };
      }).filter((control) => control.width > 0));
      expect(controls.length, 'the check inspected no controls').toBeGreaterThan(0);
      const small = controls.filter((control) => control.width < 24 || control.height < 24);
      expect(small, `controls below 24x24: ${JSON.stringify(small)}`).toEqual([]);
    });
  }
}

test('long titles wrap inside the row and never push the answer wider than the phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ask(page, 'permitsLongAndMany');
  const article = page.locator('main article').last();
  await expect(article.getByText(/Reinforced-concrete-retaining-wall/)).toBeVisible();
  const rows = article.locator('[data-dense-row-content]');
  expect(await rows.count()).toBeGreaterThanOrEqual(8);
  const box = await article.boundingBox();
  const heights: number[] = [];
  for (let i = 0; i < (await rows.count()); i += 1) heights.push(Math.round((await rows.nth(i).boundingBox())!.height));
  console.log(`permitsLongAndMany @390: ${heights.length} rows, heights ${heights.join(', ')}px, answer width ${Math.round(box!.width)}px`);
  expect(box!.width).toBeLessThanOrEqual(390);
});

test('a short desktop window shows a count and one record above the composer without scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await ask(page, 'permitsUnknownOnly');
  const box = await page.locator('main article').last().boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(720 - 130);
});
