/**
 * Centralized, Zod-validated environment accessor.
 *
 * RULES (SAD §8.1, ISD §2.G):
 * - This is the ONLY file in the project that reads `process.env` directly.
 * - `serverEnv` must never be imported from client-side code.
 * - `publicEnv` is safe to import anywhere (NEXT_PUBLIC_* vars only).
 * - No R2 secret, Supabase service key, or JWT secret may appear in a NEXT_PUBLIC_* variable.
 *
 * Usage:
 *   Server: import { getServerEnv } from '@/lib/env';
 *   Client/Anywhere: import { publicEnv } from '@/lib/env';
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Guard: Fail the build/boot if any NEXT_PUBLIC_* key contains a secret token.
// ---------------------------------------------------------------------------
const FORBIDDEN_PUBLIC_PATTERNS = ['SERVICE_ROLE', 'SECRET', 'SERVICE'];
for (const [key, value] of Object.entries(process.env)) {
  if (key.startsWith('NEXT_PUBLIC_') && value) {
    for (const forbidden of FORBIDDEN_PUBLIC_PATTERNS) {
      if (key.toUpperCase().includes(forbidden)) {
        throw new Error(
          `[env] SECURITY VIOLATION: "${key}" contains a forbidden pattern "${forbidden}". ` +
            `Secrets must never be exposed via NEXT_PUBLIC_* variables.`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public env (NEXT_PUBLIC_* — readable client and server)
// ---------------------------------------------------------------------------
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'),
  NEXT_PUBLIC_APP_URL: z.string().url('NEXT_PUBLIC_APP_URL must be a valid URL'),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

function parsePublicEnv(): PublicEnv {
  const result = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env['NEXT_PUBLIC_SUPABASE_URL'],
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    NEXT_PUBLIC_APP_URL: process.env['NEXT_PUBLIC_APP_URL'],
  });

  if (!result.success) {
    const missing = result.error.errors.map((e) => `  • ${e.path.join('.')}: ${e.message}`);
    throw new Error(
      `[env] Missing or invalid public environment variables:\n${missing.join('\n')}`,
    );
  }

  return result.data;
}

// ISD-NOTE: publicEnv is parsed lazily (cached after first call) so that missing NEXT_PUBLIC_*
// vars do not crash server-side unit tests that don't exercise the public env path.
// In practice, Next.js bakes NEXT_PUBLIC_* at build time — they must be set before `pnpm build`.
let _publicEnv: PublicEnv | null = null;

/**
 * Returns the validated public environment variables (NEXT_PUBLIC_*).
 * Cached after first call. Safe to call from client or server code.
 */
export function getPublicEnv(): PublicEnv {
  if (_publicEnv) return _publicEnv;
  _publicEnv = parsePublicEnv();
  return _publicEnv;
}

/**
 * Convenience accessor — same as getPublicEnv() but evaluated at import time
 * only when the module is first loaded in a live (non-test) Next.js context.
 * Tests that mock env vars should call getPublicEnv() after vi.stubEnv().
 */
export const publicEnv: PublicEnv = (() => {
  // In test environments, don't fail eagerly — return a minimal stub that tests override.
  if (process.env['VITEST']) {
    return {
      NEXT_PUBLIC_SUPABASE_URL:
        process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? 'https://stub.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? 'stub-anon-key',
      NEXT_PUBLIC_APP_URL: process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000',
    } as PublicEnv;
  }
  return parsePublicEnv();
})();

// ---------------------------------------------------------------------------
// Server env (secrets — server-side only)
// ---------------------------------------------------------------------------
const serverEnvSchema = z.object({
  // Supabase — declared now, consumed Phase 3+
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  // Optional for Phase 4 — may use getUser() instead of manual JWT verification
  SUPABASE_JWT_SECRET: z.string().optional(),

  // Cloudflare R2 — consumed this phase
  R2_ACCOUNT_ID: z.string().min(1, 'R2_ACCOUNT_ID is required'),
  R2_ACCESS_KEY_ID: z.string().min(1, 'R2_ACCESS_KEY_ID is required'),
  R2_SECRET_ACCESS_KEY: z.string().min(1, 'R2_SECRET_ACCESS_KEY is required'),
  R2_BUCKET: z.string().min(1).default('epub-reader-assets'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema> & {
  /** Derived: https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com */
  R2_ENDPOINT: string;
};

let _serverEnv: ServerEnv | null = null;

/**
 * Returns the validated server environment, parsed once and cached.
 * Throws a descriptive error listing all missing/invalid keys if validation fails.
 *
 * Call from server-only code: Server Components, Server Actions, Route Handlers.
 */
export function getServerEnv(): ServerEnv {
  if (_serverEnv) return _serverEnv;

  const result = serverEnvSchema.safeParse({
    SUPABASE_URL: process.env['SUPABASE_URL'],
    SUPABASE_SERVICE_ROLE_KEY: process.env['SUPABASE_SERVICE_ROLE_KEY'],
    SUPABASE_JWT_SECRET: process.env['SUPABASE_JWT_SECRET'],
    R2_ACCOUNT_ID: process.env['R2_ACCOUNT_ID'],
    R2_ACCESS_KEY_ID: process.env['R2_ACCESS_KEY_ID'],
    R2_SECRET_ACCESS_KEY: process.env['R2_SECRET_ACCESS_KEY'],
    R2_BUCKET: process.env['R2_BUCKET'],
  });

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  • ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(
      `[env] Missing or invalid server environment variables. ` +
        `Ensure your .env.local file is populated (see .env.example):\n${errors}`,
    );
  }

  _serverEnv = {
    ...result.data,
    R2_ENDPOINT: `https://${result.data.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  };

  return _serverEnv;
}

/** Reset cached server env (for testing only). */
export function _resetServerEnvCache(): void {
  _serverEnv = null;
}
