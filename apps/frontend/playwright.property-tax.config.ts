import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/property-tax',
  fullyParallel: false,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:3114',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/start-property-tax-acceptance.js',
    env: {
      HOSTNAME: '127.0.0.1',
      PORT: '3114',
      PROPERTY_TAX_ACCEPTANCE_FIXTURE: '1',
    },
    url: 'http://127.0.0.1:3114/acceptance/property-tax',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: 'desktop-firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: 'desktop-webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      testMatch: /mobile\.spec\.ts/,
    },
    {
      name: 'mobile-webkit',
      use: { ...devices['iPhone 13'] },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
});
