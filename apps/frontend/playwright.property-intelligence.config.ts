import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/property-intelligence',
  fullyParallel: false,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:3122',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/start-property-intelligence-acceptance.js',
    env: {
      HOSTNAME: '127.0.0.1',
      PORT: '3122',
      PROPERTY_INTELLIGENCE_ACCEPTANCE_FIXTURE: '1',
    },
    url: 'http://127.0.0.1:3122/acceptance/property-intelligence',
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
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
});
