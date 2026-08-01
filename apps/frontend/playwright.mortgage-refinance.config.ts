import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/mortgage-refinance-radar',
  fullyParallel: false,
  retries: 0,
  reporter: [['line'], ['json', { outputFile: 'test-results/mortgage-refinance-evidence.json' }]],
  use: {
    baseURL: 'http://localhost:3123',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/start-mortgage-refinance-acceptance.js',
    env: {
      HOSTNAME: '127.0.0.1',
      PORT: '3123',
      MORTGAGE_REFINANCE_ACCEPTANCE_FIXTURE: '1',
    },
    url: 'http://127.0.0.1:3123/acceptance/mortgage-refinance-radar/refi-open',
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
