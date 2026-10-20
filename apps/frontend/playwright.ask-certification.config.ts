import { defineConfig, devices } from '@playwright/test';

// Sole Homeowner Interface Phase 9: browser certification of the five destinations and the acceptance journeys, on desktop and on narrow phones.
// Responses are the REAL backend contracts captured from a scratch database (see e2e/ask-certification/contracts). Run:
//   ASK_ACCEPTANCE_FIXTURE=1 NEXT_PUBLIC_API_URL=http://localhost:3123 npm run build && npx playwright test --config=playwright.ask-certification.config.ts
// The build under test must use the page's own origin for the API, so every browser engine (WebKit does not intercept cross-origin preflights) can be served the captured contracts.
process.env.ASK_E2E_API_ORIGIN = 'http://localhost:3123';

export default defineConfig({
  testDir: './e2e/ask-certification', fullyParallel: false, retries: 0, reporter: 'line', timeout: 60_000,
  use: { baseURL: 'http://localhost:3123', trace: 'retain-on-failure' },
  webServer: { command: 'npx next start -p 3123 -H 127.0.0.1', env: { ASK_ACCEPTANCE_FIXTURE: '1' }, url: 'http://127.0.0.1:3123/acceptance/ask', reuseExistingServer: false, timeout: 120_000 },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
    // Playwright's WebKit does not serve mocked responses to requests the page makes after it has loaded, so only the structural audit (WCAG rules, reflow,
    // reduced motion) runs here. Mobile Safari journeys need a real device: see docs/operations/ASK_CERTIFICATION_RUNBOOK.md.
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] }, testMatch: /accessibility\.spec\.ts/ },
  ],
});
