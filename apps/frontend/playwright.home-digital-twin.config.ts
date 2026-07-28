import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/home-digital-twin',
  fullyParallel: false,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:3115',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/start-home-digital-twin-acceptance.js',
    env: {
      HOSTNAME: '127.0.0.1',
      PORT: '3115',
      HOME_DIGITAL_TWIN_ACCEPTANCE_FIXTURE: '1',
    },
    url: 'http://127.0.0.1:3115/acceptance/home-digital-twin',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] }, testMatch: /mobile\.spec\.ts/ },
  ],
});
