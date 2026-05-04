import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Read from .env.local
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ||
  'http://127.0.0.1:3000';
const shouldStartLocalServer = !process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // To avoid db conflicts
  timeout: 120000,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: shouldStartLocalServer
    ? {
        command: 'pnpm exec next dev --hostname 127.0.0.1 --port 3000',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        ignoreHTTPSErrors: true,
        stdout: 'pipe',
        stderr: 'pipe',
      }
    : undefined,
});
