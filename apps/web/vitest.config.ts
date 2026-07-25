import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Mirrors the "@/*" -> "./*" path mapping in tsconfig.json so tests can use
// the same aliased imports as application code.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  test: {
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Only applies to test files that opt into the jsdom environment (via a
    // `@vitest-environment jsdom` docblock). Provides a real http(s) origin
    // so jsdom exposes window.localStorage/sessionStorage.
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
  },
});
