/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', '__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    environment: 'happy-dom',
    globals: false,
  },
});

// Playwright spec files live at the repo root in /e2e — don't pick them up.
