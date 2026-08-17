import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/home-buyer-lifecycle',
  fullyParallel: false,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:3126',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/start-home-buyer-lifecycle-acceptance.js',
    env: {
      HOSTNAME: '127.0.0.1',
      PORT: '3126',
      HOME_BUYER_LIFECYCLE_ACCEPTANCE_FIXTURE: '1',
    },
    url: 'http://127.0.0.1:3126/acceptance/home-buyer-lifecycle',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] }, testMatch: /mobile\.spec\.ts/ },
  ],
});
