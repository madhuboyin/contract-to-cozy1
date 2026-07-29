import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/ownership-costs',
  fullyParallel: false,
  retries: 0,
  reporter: [['line'], ['json', { outputFile: 'test-results/ownership-cost-evidence.json' }]],
  use: {
    baseURL: 'http://localhost:3116',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/start-ownership-cost-acceptance.js',
    env: {
      HOSTNAME: '127.0.0.1',
      PORT: '3116',
      OWNERSHIP_COST_ACCEPTANCE_FIXTURE: '1',
    },
    url: 'http://127.0.0.1:3116/acceptance/ownership-costs/ownership-cost-acceptance-property',
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
    {
      name: 'mobile-webkit',
      use: { ...devices['iPhone 13'] },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
});
