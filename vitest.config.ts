import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Vitest config — Phase 16 (ISD §16.H, §16.BB, §16.DD #1, Appendix H #5).
 *
 * Coverage strategy:
 * - The threshold gate (lines >= 70%) is enforced ONLY on the
 *   `src/lib/**` path. The per-glob threshold is what CI asserts.
 * - `src/lib/supabase/**` and `src/lib/http/**` are excluded
 *   from the threshold because they are thin initialization
 *   modules that import server-only / edge runtime APIs (not
 *   loadable in jsdom) — they are exercised end-to-end by the
 *   integration tests.
 * - `src/lib/monitoring/**` is excluded because the Sentry
 *   wrapper is a no-op when the SDK is not configured.
 * - Vendored foliate-js and generated types are excluded.
 * - The e2e + integration suites are excluded from the default
 *   test run; they have their own commands.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      'tests/e2e/**',
      'tests/integration/**',
    ],
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      // The gate is enforced on src/lib/** EXCEPT the
      // server-only / edge-runtime / thin-init modules below.
      include: ['src/lib/**/*.ts'],
      exclude: [
        'src/lib/**/*.d.ts',
        'src/lib/**/index.ts',
        // Server-only / edge-runtime init modules — exercised by
        // integration tests, not unit tests.
        'src/lib/supabase/**',
        'src/lib/http/**',
        // Sentry wrappers — no-op when the SDK is not configured.
        'src/lib/monitoring/**',
        'src/vendor/**',
      ],
      thresholds: {
        // Phase 16 §16.DD #1: lines >= 70% on the critical lib/*
        // path. The CI script also parses coverage-summary.json
        // and asserts the global number; this in-process gate
        // enforces it on the included files.
        lines: 70,
        statements: 70,
        functions: 65,
        branches: 60,
        perFile: false,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
