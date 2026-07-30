/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', '__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    environment: 'happy-dom',
    globals: false,
  },
  resolve: {
    // Ensure vitest's require() can resolve .ts/.tsx files (needed by
    // Toolbar.tsx's useUIStoreSafe which uses require('../state/uiStore')).
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
  },
});

// Playwright spec files live at the repo root in /e2e — don't pick them up.
