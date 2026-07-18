import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/property-context',
  fullyParallel: false,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run start -- --hostname 127.0.0.1',
    env: { PROPERTY_CONTEXT_ACCEPTANCE_FIXTURE: '1' },
    url: 'http://127.0.0.1:3000/acceptance/property-context?scenario=scalar',
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
      use: { ...devices['Pixel 5'] },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
});
