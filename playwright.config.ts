import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for GridBoard multi-user e2e tests.
 *
 * These tests exercise collaboration contracts across two browser contexts.
 * They require the dev server running at http://localhost:5173 and the server
 * at http://localhost:3000 with Postgres + MinIO up via docker-compose.
 *
 * Tasks covered:
 *   - 12.11 Open board in two browsers and verify real-time sync
 *   - 12.12 Two-browser concurrent drag — no torn position (D1 nested-pos fix)
 *   - 12.13 Cross-layer concurrent edit — both users see correct z-order
 *   - 12.14 1000-rectangle board pan/zoom holds 60 FPS
 *   - 12.15 Viewer token — viewer attempts move, mutation rejected
 *   - 12.16 Upload image and verify it renders on canvas
 */

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
});
