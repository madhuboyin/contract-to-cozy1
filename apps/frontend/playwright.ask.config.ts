import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/ask', fullyParallel: false, retries: 0, reporter: 'line',
  use: { baseURL: 'http://localhost:3123', trace: 'retain-on-failure' },
  webServer: { command: 'npx next start -p 3123 -H 127.0.0.1', env: { ASK_ACCEPTANCE_FIXTURE: '1' }, url: 'http://127.0.0.1:3123/acceptance/ask', reuseExistingServer: false, timeout: 120_000 },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] }, testMatch: /mobile\.spec\.ts/ },
  ],
});
