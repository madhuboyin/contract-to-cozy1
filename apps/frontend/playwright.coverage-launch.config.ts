import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/coverage-launch',
  fullyParallel: false,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:3121',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/start-coverage-launch-acceptance.js',
    env: {
      HOSTNAME: '127.0.0.1',
      PORT: '3121',
      COVERAGE_LAUNCH_ACCEPTANCE_FIXTURE: '1',
    },
    url: 'http://127.0.0.1:3121/acceptance/coverage-launch',
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
