import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { installAskContext, propertyId, stripUpgradeInsecure } from './fixtures';
import { installConversations, openAndAsk } from './conversationFixtures';

// Sole Homeowner Interface Phase 9 / FR-A11Y-001: automated audit of every surface on desktop and phone: WCAG 2.2 AA rules (axe), one h1 and one main
// landmark, keyboard reachability with visible focus and accessible names, reflow at 200% and 400% zoom, reduced motion, and announced states.
// Record, Work, Saved and Notifications are answers in the conversation now, so the surfaces audited are the Ask page and each of those answers as it
// appears on screen (derived by deriveConversationContracts.js from the real captured pages through the real answer builders).
// Automated checks find a class of defects, not all of them: the manual screen-reader and real-device pass in docs/operations/ASK_CERTIFICATION_RUNBOOK.md remains required.
const home = `propertyId=${propertyId}`;
type Surface = { name: string; saved?: 'conversationSavedStale'; open: (page: Page) => Promise<void>; ready: RegExp | 'composer' };
const waitReady = (page: Page, surface: Surface) => (surface.ready === 'composer' ? expect(page.getByPlaceholder(/^Ask anything about /).first()) : expect(page.getByText(surface.ready).first())).toBeVisible({ timeout: 20000 });
const surfaces: Surface[] = [
  { name: 'Ask', open: async (page) => { await page.goto(`/dashboard/ask?${home}`); }, ready: 'composer' },
  { name: 'Work answer', open: (page) => openAndAsk(page, `/dashboard/ask/work?${home}`, 'What needs me?'), ready: /2 things need you/ },
  { name: 'Saved answer', open: (page) => openAndAsk(page, `/dashboard/ask/saved?${home}`, 'Show my saved results'), ready: /Winter 2026 checklist/ },
  { name: 'Saved answer with an out-of-date result', saved: 'conversationSavedStale', open: (page) => openAndAsk(page, `/dashboard/ask/saved?${home}`, 'Show my saved results'), ready: /A quote changed after this was compared/ },
  { name: 'Notifications answer', open: (page) => openAndAsk(page, `/dashboard/ask/notifications?${home}`, "What's new?"), ready: /4 notifications, 4 unread/ },
  { name: 'Dismissed notifications answer', open: (page) => openAndAsk(page, `/dashboard/ask?${home}&question=${encodeURIComponent('Show dismissed notifications')}`, 'Show dismissed notifications'), ready: /An old notice/ },
];

test.beforeEach(async ({ context, page }) => { await installAskContext(context); await stripUpgradeInsecure(page); });

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[role="status"]:has-text("Loading")')).toHaveCount(0, { timeout: 15000 });
}

// Playwright's WebKit is not served mocked responses to requests the page makes after it has loaded (see playwright.ask-certification.config.ts), so an
// answer that must be sent first cannot be shown there; WebKit audits the Ask page itself, and the answers are audited on Chromium (desktop and phone).
const needsAnswer = (surface: Surface) => surface.ready !== 'composer';
const WEBKIT_REASON = 'Playwright WebKit cannot be served the mocked answer this surface needs; it is audited on Chromium and by the manual real-device pass.';

for (const surface of surfaces) {
  test.describe(surface.name, () => {
    test.beforeEach(({ browserName }) => { test.skip(browserName === 'webkit' && needsAnswer(surface), WEBKIT_REASON); });
    test('has no serious or critical WCAG 2.2 AA violation, one h1, and one main landmark', async ({ page }) => {
      await installConversations(page, { saved: surface.saved });
      await surface.open(page);
      await waitReady(page, surface);
      await settle(page);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      const blocking = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
      expect(blocking.map((violation) => `${violation.id} (${violation.impact}): ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(' | ')}`), 'serious or critical accessibility violations').toEqual([]);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('main')).toHaveCount(1);
    });

    test('is fully reachable by keyboard: every stop has an accessible name and a visible focus, and focus is never trapped', async ({ page, browserName, isMobile }) => {
      test.skip(browserName === 'webkit' && isMobile, 'iPhone Safari has no Tab key and desktop Safari skips links by default; keyboard reach is certified on Chromium here and on desktop Safari by the manual pass.');
      await installConversations(page, { saved: surface.saved });
      await surface.open(page);
      await waitReady(page, surface);
      await settle(page);
      const stops: Array<{ name: string; visible: boolean; key: string }> = [];
      for (let step = 0; step < 80; step += 1) {
        await page.keyboard.press('Tab');
        const stop = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const style = getComputedStyle(el);
          const labelText = ((el as HTMLInputElement).labels ? Array.from((el as HTMLInputElement).labels!).map((label) => label.textContent).join(' ') : '') || el.closest('label')?.textContent || '';
          const name = (el.getAttribute('aria-label') || labelText || el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby')!)?.textContent || el.textContent || (el as HTMLInputElement).placeholder || el.getAttribute('title') || '').trim();
          const outlined = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
          const shadowed = style.boxShadow !== 'none';
          const ringed = el.matches(':focus-visible');
          return { name, visible: outlined || shadowed || ringed, key: `${el.tagName}:${name}:${Math.round(el.getBoundingClientRect().top)}` };
        });
        if (!stop) break;
        stops.push(stop);
      }
      expect(stops.length, 'the page has focusable controls').toBeGreaterThan(5);
      expect(stops.filter((stop) => !stop.name).map((stop) => stop.key), 'controls with no accessible name').toEqual([]);
      // A date or time field has several Tab stops inside one control (its segments and the browser's own picker button, which paints its own ring):
      // a control passes when its segments show focus, so group the stops by control.
      const shown = new Map<string, boolean>();
      for (const stop of stops) shown.set(stop.key, (shown.get(stop.key) ?? false) || stop.visible);
      expect([...shown].filter(([, visible]) => !visible).map(([key]) => key), 'controls with no visible focus').toEqual([]);
      expect(new Set(stops.map((stop) => stop.key)).size, 'focus keeps moving: no trap').toBeGreaterThan(stops.length / 2);
    });

    for (const [label, width] of [['200%', 640], ['400%', 320]] as const) {
      test(`reflows at ${label} zoom (${width}px wide) with no horizontal scrolling and nothing clipped off-screen`, async ({ page }) => {
        await installConversations(page, { saved: surface.saved });
        await page.setViewportSize({ width, height: 800 });
        await surface.open(page);
        await waitReady(page, surface);
        await settle(page);
        const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
        expect(overflow.scroll, `page is ${overflow.scroll}px wide in a ${overflow.inner}px window`).toBeLessThanOrEqual(overflow.inner + 1);
      });
    }

    test('honors reduced motion: nothing keeps animating once the page has loaded', async ({ page }) => {
      await installConversations(page, { saved: surface.saved });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await surface.open(page);
      await waitReady(page, surface);
      await settle(page);
      const running = await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running' && animation.effect?.getTiming().iterations === Infinity).map((animation) => (animation.effect as KeyframeEffect).target?.tagName ?? 'unknown'));
      expect(running).toEqual([]);
    });
  });
}

test.describe('announced states', () => {
  for (const surface of surfaces.filter((entry) => /Work|Saved answer$|Notifications answer/.test(entry.name))) {
    test(`${surface.name}: an answer that cannot be given is announced as an alert or status, in words, and the question is kept`, async ({ page, browserName }) => {
      test.skip(browserName === 'webkit', WEBKIT_REASON);
      await installConversations(page, { failAnswers: true });
      await surface.open(page);
      const announced = page.locator('[role="alert"], [role="status"]').filter({ hasText: /could not|try again|unavailable|couldn.t/i });
      await expect(announced.first()).toBeVisible({ timeout: 20000 });
      await expect(page.getByPlaceholder(/^Ask anything about /).first()).not.toHaveValue('');
    });
  }
});
