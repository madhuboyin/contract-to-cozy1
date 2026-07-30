import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/renovations',
  fullyParallel: false,
  retries: 0,
  reporter: 'line',
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://localhost:3124',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/start-renovation-acceptance.js',
    url: 'http://127.0.0.1:3124/login',
    env: {
      HOSTNAME: '127.0.0.1',
      PORT: '3124',
      RENOVATION_ACCEPTANCE_FIXTURE: '1',
    },
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
