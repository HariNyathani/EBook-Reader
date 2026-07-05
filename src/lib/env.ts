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
 *   Client/Anywhere: import { publicEnv } from '@/lib/env';  // never throws at import
 *   Validated public read: import { getPublicEnv } from '@/lib/env';
 *
 * ---------------------------------------------------------------------------
 * NEXT_PUBLIC INLINING (audit fix — HIGH):
 * Next.js only inlines NEXT_PUBLIC_* variables into the CLIENT bundle when they are
 * accessed with DOT notation (`process.env.NEXT_PUBLIC_FOO`). Bracket access
 * (`process.env['NEXT_PUBLIC_FOO']`) is NOT statically replaced, so it resolves to
 * `undefined` in the browser. Therefore all NEXT_PUBLIC_* reads below use dot notation,
 * and `publicEnv` is built defensively so a missing var can never crash the client
 * bundle at import time (validation is deferred to `getPublicEnv()`).
 * ---------------------------------------------------------------------------
 */

import { z } from 'zod';

// ===========================================================================
// Public env (NEXT_PUBLIC_* — readable in client and server)
// ===========================================================================
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'),
  NEXT_PUBLIC_APP_URL: z.string().url('NEXT_PUBLIC_APP_URL must be a valid URL'),
  // Phase 13 (ISD §13.K): opt-out flag for the service worker. Default
  // enabled in production; set NEXT_PUBLIC_PWA_ENABLED=false to disable
  // the SW (e.g. in a preview environment that does not yet have the
  // offline infrastructure ready).
  NEXT_PUBLIC_PWA_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v): boolean => (v === undefined ? true : v === 'true')),
  // Phase 15 (ISD §15.G, §15.D): browser-side Sentry DSN. Safe to
  // expose publicly (per Sentry's own documentation). When unset the
  // browser SDK is a no-op.
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  // Phase 15 (ISD §15.G): opt-in for in-browser Sentry. When 'false'
  // the client SDK skips initialization entirely (useful for E2E
  // tests that don't want Sentry side effects).
  NEXT_PUBLIC_SENTRY_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v): boolean => (v === undefined ? true : v === 'true')),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/**
 * Reads the raw NEXT_PUBLIC_* values using DOT notation so Next.js inlines them
 * into the client bundle at build time. Values may be `undefined` at runtime if a
 * var is unset — callers that need validation should use `getPublicEnv()`.
 */
function readPublicEnv(): PublicEnv {
  const raw = process.env.NEXT_PUBLIC_PWA_ENABLED;
  const flag = raw === 'false' ? false : raw === 'true' ? true : true; // default enabled
  const sentryEnabledRaw = process.env.NEXT_PUBLIC_SENTRY_ENABLED;
  const sentryEnabled =
    sentryEnabledRaw === 'false' ? false : sentryEnabledRaw === 'true' ? true : true;
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL as string,
    NEXT_PUBLIC_PWA_ENABLED: flag,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENABLED: sentryEnabled,
  };
}

let _publicEnv: PublicEnv | null = null;

/**
 * Returns the VALIDATED public environment variables (NEXT_PUBLIC_*).
 * Throws a descriptive error if any are missing/invalid. Cached after first call.
 * Use this when you want a hard guarantee the public env is present.
 */
export function getPublicEnv(): PublicEnv {
  if (_publicEnv) return _publicEnv;

  const result = publicEnvSchema.safeParse(readPublicEnv());
  if (!result.success) {
    const missing = result.error.errors.map((e) => `  • ${e.path.join('.')}: ${e.message}`);
    throw new Error(
      `[env] Missing or invalid public environment variables:\n${missing.join('\n')}`,
    );
  }

  _publicEnv = result.data;
  return _publicEnv;
}

/**
 * Defensive public-env object. Safe to import from client or server code.
 *
 * IMPORTANT: This NEVER throws at module-import time. The NEXT_PUBLIC_* values are
 * inlined by Next.js at build (dot notation in `readPublicEnv`), so in a correctly
 * configured build they are present in the client bundle. If a var is missing, the
 * corresponding property is simply `undefined` at runtime (surfacing at the point of
 * use, e.g. when the Supabase client is created) instead of white-screening the whole
 * client subtree at import. Prefer `getPublicEnv()` when you want up-front validation.
 */
export const publicEnv: PublicEnv = readPublicEnv();

/** Reset cached public env (for testing only). */
export function _resetPublicEnvCache(): void {
  _publicEnv = null;
}

// ===========================================================================
// Server env (secrets — server-side only)
// ===========================================================================

/**
 * Fail-closed guard: no NEXT_PUBLIC_* variable may carry a secret token.
 *
 * Runs ONLY from `getServerEnv()` (a server-only code path), never at module import,
 * so it is never bundled/executed in the browser. Iterating `process.env` is safe
 * server-side where it is fully populated.
 */
const FORBIDDEN_PUBLIC_PATTERNS = ['SERVICE_ROLE', 'SECRET', 'SERVICE'] as const;

function assertNoPublicSecretLeak(): void {
  for (const key of Object.keys(process.env)) {
    if (!key.startsWith('NEXT_PUBLIC_')) continue;
    const upperKey = key.toUpperCase();
    for (const forbidden of FORBIDDEN_PUBLIC_PATTERNS) {
      if (upperKey.includes(forbidden)) {
        throw new Error(
          `[env] SECURITY VIOLATION: "${key}" contains a forbidden pattern "${forbidden}". ` +
            `Secrets must never be exposed via NEXT_PUBLIC_* variables.`,
        );
      }
    }
  }
}

const serverEnvSchema = z.object({
  // Supabase
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  // Optional for Phase 4 — the SSR client validates via getUser(); manual JWT verification not required.
  SUPABASE_JWT_SECRET: z.string().optional(),

  // Cloudflare R2
  R2_ACCOUNT_ID: z.string().min(1, 'R2_ACCOUNT_ID is required'),
  R2_ACCESS_KEY_ID: z.string().min(1, 'R2_ACCESS_KEY_ID is required'),
  R2_SECRET_ACCESS_KEY: z.string().min(1, 'R2_SECRET_ACCESS_KEY is required'),
  R2_BUCKET: z.string().min(1).default('epub-reader-assets'),

  // Upload configuration (Phase 6)
  UPLOAD_STRATEGY: z.enum(['stream', 'presigned']).default('stream'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(52_428_800), // 50 MB
  SERVER_ACTIONS_BODY_LIMIT: z.string().default('50mb'),

  // Phase 15 (ISD §15.K): Application environment for monitoring /
  // rate-limit / secrets separation. One of 'development' | 'preview'
  // | 'production'. Production build REFUSES to start without the
  // required monitoring/limiter vars (or an explicit opt-out flag).
  APP_ENV: z.enum(['development', 'preview', 'production']).optional().default('development'),

  // Phase 15 (ISD §15.G, §15.B): Upstash rate limiter credentials.
  // Both must be present for Upstash to be used; absence triggers the
  // documented in-memory fallback (see lib/security/rate-limit.ts).
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

  // Phase 15 (ISD §15.G, §15.D): Sentry DSN. Server-side is the
  // canonical DSN; the public one is optional (used by the browser
  // bundle, see NEXT_PUBLIC_SENTRY_DSN above).
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_AUTH_TOKEN: z.string().min(1).optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional(),
  SENTRY_RELEASE: z.string().optional(),
  // Allows opt-out of Sentry-in-prod in unusual situations (testing
  // a deploy without monitoring). Defaults to 'true' (require).
  SENTRY_REQUIRED: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v): boolean => (v === undefined ? true : v === 'true')),
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
 * Server secrets are read with bracket notation intentionally — they are NOT
 * NEXT_PUBLIC_ and must never be inlined into any bundle; they are only ever read
 * server-side where `process.env` is live.
 */
export function getServerEnv(): ServerEnv {
  if (_serverEnv) return _serverEnv;

  // Server-only secret-leak guard (moved out of module import path).
  assertNoPublicSecretLeak();

  const result = serverEnvSchema.safeParse({
    SUPABASE_URL: process.env['SUPABASE_URL'],
    SUPABASE_SERVICE_ROLE_KEY: process.env['SUPABASE_SERVICE_ROLE_KEY'],
    SUPABASE_JWT_SECRET: process.env['SUPABASE_JWT_SECRET'],
    R2_ACCOUNT_ID: process.env['R2_ACCOUNT_ID'],
    R2_ACCESS_KEY_ID: process.env['R2_ACCESS_KEY_ID'],
    R2_SECRET_ACCESS_KEY: process.env['R2_SECRET_ACCESS_KEY'],
    R2_BUCKET: process.env['R2_BUCKET'],
    UPLOAD_STRATEGY: process.env['UPLOAD_STRATEGY'],
    MAX_UPLOAD_BYTES: process.env['MAX_UPLOAD_BYTES'],
    SERVER_ACTIONS_BODY_LIMIT: process.env['SERVER_ACTIONS_BODY_LIMIT'],
    APP_ENV: process.env['APP_ENV'],
    UPSTASH_REDIS_REST_URL: process.env['UPSTASH_REDIS_REST_URL'],
    UPSTASH_REDIS_REST_TOKEN: process.env['UPSTASH_REDIS_REST_TOKEN'],
    SENTRY_DSN: process.env['SENTRY_DSN'],
    SENTRY_AUTH_TOKEN: process.env['SENTRY_AUTH_TOKEN'],
    SENTRY_TRACES_SAMPLE_RATE: process.env['SENTRY_TRACES_SAMPLE_RATE'],
    SENTRY_RELEASE: process.env['SENTRY_RELEASE'],
    SENTRY_REQUIRED: process.env['SENTRY_REQUIRED'],
  });

  // Production gate (ISD §15.DD #5): require Upstash + Sentry in
  // production, unless explicitly opted out.
  // We do this AFTER the basic parse so that the user gets the
  // full list of missing vars at once.
  if (result.success && result.data.APP_ENV === 'production') {
    const missing: string[] = [];
    if (!result.data.UPSTASH_REDIS_REST_URL) missing.push('UPSTASH_REDIS_REST_URL');
    if (!result.data.UPSTASH_REDIS_REST_TOKEN) missing.push('UPSTASH_REDIS_REST_TOKEN');
    if (!result.data.SENTRY_DSN && result.data.SENTRY_REQUIRED) missing.push('SENTRY_DSN');
    if (missing.length > 0) {
      throw new Error(
        `[env] PRODUCTION BUILD REQUIRES the following env vars: ${missing.join(', ')}. ` +
          `Refusing to start without monitoring + rate limiting. ` +
          `Set SENTRY_REQUIRED=false ONLY for temporary diagnostic deploys.`,
      );
    }
  }

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
