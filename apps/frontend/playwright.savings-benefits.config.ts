import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/savings-benefits',
  fullyParallel: false,
  retries: 0,
  reporter: [['line'], ['json', { outputFile: 'test-results/savings-benefits-evidence.json' }]],
  use: {
    baseURL: 'http://localhost:3118',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/start-ownership-cost-acceptance.js',
    env: {
      HOSTNAME: '127.0.0.1',
      PORT: '3118',
      SAVINGS_BENEFITS_ACCEPTANCE_FIXTURE: '1',
    },
    url: 'http://127.0.0.1:3118/acceptance/savings-benefits',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
});
