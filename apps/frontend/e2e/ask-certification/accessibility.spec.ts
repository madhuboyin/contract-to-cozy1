import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { installAskContext, installDestinationApi, propertyId, stripUpgradeInsecure } from './fixtures';

// Sole Homeowner Interface Phase 9 / FR-A11Y-001: automated audit of every destination on desktop and phone: WCAG 2.2 AA rules (axe), one h1 and
// one main landmark, keyboard reachability with visible focus and accessible names, reflow at 200% and 400% zoom, reduced motion, and announced states.
// Automated checks find a class of defects, not all of them: the manual screen-reader and real-device pass in docs/operations/ASK_CERTIFICATION_RUNBOOK.md remains required.
const home = `propertyId=${propertyId}`;
const destinations = [
  { name: 'Record', path: `/dashboard/ask/record?${home}`, heading: /^Record$/ },
  { name: 'Record rooms', path: `/dashboard/ask/record?${home}&section=rooms`, heading: /Rooms/ },
  { name: 'Record documents', path: `/dashboard/ask/record?${home}&section=documents`, heading: /Documents/ },
  { name: 'Work', path: `/dashboard/ask/work?${home}`, heading: /^Work$/ },
  { name: 'Saved', path: `/dashboard/ask/saved?${home}`, heading: /^Saved$/ },
  { name: 'Notifications', path: `/dashboard/ask/notifications?${home}`, heading: /Notifications/ },
  { name: 'Record export review', path: `/dashboard/ask/record?${home}&export=review`, heading: /Export home record/ },
  { name: 'Notification settings', path: `/dashboard/ask/notifications?${home}&tab=settings`, heading: /Notifications/ },
];

test.beforeEach(async ({ context, page }) => { await installAskContext(context); await stripUpgradeInsecure(page); });

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[role="status"]:has-text("Loading")')).toHaveCount(0, { timeout: 15000 });
}

for (const destination of destinations) {
  test.describe(destination.name, () => {
    test('has no serious or critical WCAG 2.2 AA violation, one h1, and one main landmark', async ({ page }) => {
      await installDestinationApi(page);
      await page.goto(destination.path);
      await expect(page.getByRole('heading', { name: destination.heading }).first()).toBeVisible({ timeout: 20000 });
      await settle(page);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      const blocking = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
      expect(blocking.map((violation) => `${violation.id} (${violation.impact}): ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(' | ')}`), 'serious or critical accessibility violations').toEqual([]);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('main')).toHaveCount(1);
    });

    test('is fully reachable by keyboard: every stop has an accessible name and a visible focus, and focus is never trapped', async ({ page, browserName, isMobile }) => {
      test.skip(browserName === 'webkit' && isMobile, 'iPhone Safari has no Tab key and desktop Safari skips links by default; keyboard reach is certified on Chromium here and on desktop Safari by the manual pass.');
      await installDestinationApi(page);
      await page.goto(destination.path);
      await expect(page.getByRole('heading', { name: destination.heading }).first()).toBeVisible({ timeout: 20000 });
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
        await installDestinationApi(page);
        await page.setViewportSize({ width, height: 800 });
        await page.goto(destination.path);
        await expect(page.getByRole('heading', { name: destination.heading }).first()).toBeVisible({ timeout: 20000 });
        await settle(page);
        const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
        expect(overflow.scroll, `page is ${overflow.scroll}px wide in a ${overflow.inner}px window`).toBeLessThanOrEqual(overflow.inner + 1);
      });
    }

    test('honors reduced motion: nothing keeps animating once the page has loaded', async ({ page }) => {
      await installDestinationApi(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(destination.path);
      await expect(page.getByRole('heading', { name: destination.heading }).first()).toBeVisible({ timeout: 20000 });
      await settle(page);
      const running = await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running' && animation.effect?.getTiming().iterations === Infinity).map((animation) => (animation.effect as KeyframeEffect).target?.tagName ?? 'unknown'));
      expect(running).toEqual([]);
    });
  });
}

test.describe('announced states', () => {
  for (const destination of destinations.filter((entry) => ['Record', 'Work', 'Saved', 'Notifications'].includes(entry.name))) {
    test(`${destination.name}: a failed read is announced as an alert or status, in words, with a way to try again`, async ({ page }) => {
      await installDestinationApi(page, { failReads: true });
      await page.goto(destination.path);
      const announced = page.locator('[role="alert"], [role="status"]').filter({ hasText: /could not|try again|unavailable|couldn.t/i });
      await expect(announced.first()).toBeVisible({ timeout: 20000 });
      await expect(page.getByRole('button', { name: /try again|retry|reload/i }).first()).toBeVisible();
    });
  }
});
