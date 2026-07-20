import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tool-discovery',
  fullyParallel: false,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run start -- --hostname 127.0.0.1',
    env: { TOOL_DISCOVERY_ACCEPTANCE_FIXTURE: '1' },
    url: 'http://127.0.0.1:3000/acceptance/tool-discovery',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
