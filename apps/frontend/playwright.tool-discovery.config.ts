import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tool-discovery',
  fullyParallel: false,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:3107',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/start-tool-discovery-acceptance.js',
    env: {
      HOSTNAME: '127.0.0.1',
      PORT: '3107',
      TOOL_DISCOVERY_ACCEPTANCE_FIXTURE: '1',
    },
    url: 'http://127.0.0.1:3107/acceptance/tool-discovery',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-pwa', use: { ...devices['iPhone 13'] } },
  ],
});
