import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--no-sandbox'],
    },
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1050 } },
    },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command:
      process.env.PLAYWRIGHT_SKIP_BUILD === '1'
        ? 'npm run start -- --port 3100'
        : 'npm run build && npm run start -- --port 3100',
    url: 'http://127.0.0.1:3100',
    timeout: 120000,
    env: {
      TRAFFIC_STORAGE: 'local',
      TRAFFIC_DATA_DIR: '/tmp/traffic-lab-e2e-data',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
