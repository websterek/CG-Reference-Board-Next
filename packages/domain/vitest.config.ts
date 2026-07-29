/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
  resolve: {
    alias: {
      // Map .js imports back to .ts source during dev/test runtime.
      // (Required because package.json "type": "module" forces ESM and TS
      // doesn't rewrite extensions; vitest's own TS transformer tolerates the
      // rewritten paths.)
    },
  },
});
