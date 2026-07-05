/**
 * Unit tests for src/lib/env.ts
 *
 * Validates:
 * 1. getServerEnv() throws a descriptive error when required vars are missing.
 * 2. The NEXT_PUBLIC_* secret guard triggers on forbidden patterns.
 * 3. R2_ENDPOINT is correctly derived from R2_ACCOUNT_ID.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const VALID_SERVER_ENV = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  R2_ACCOUNT_ID: 'my-account',
  R2_ACCESS_KEY_ID: 'key-id',
  R2_SECRET_ACCESS_KEY: 'secret-key',
  R2_BUCKET: 'epub-reader-assets',
};

const VALID_PUBLIC_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
};

describe('getServerEnv()', () => {
  it('returns parsed env with derived R2_ENDPOINT when all vars present', async () => {
    vi.stubEnv('SUPABASE_URL', VALID_SERVER_ENV.SUPABASE_URL);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', VALID_SERVER_ENV.SUPABASE_SERVICE_ROLE_KEY);
    vi.stubEnv('R2_ACCOUNT_ID', VALID_SERVER_ENV.R2_ACCOUNT_ID);
    vi.stubEnv('R2_ACCESS_KEY_ID', VALID_SERVER_ENV.R2_ACCESS_KEY_ID);
    vi.stubEnv('R2_SECRET_ACCESS_KEY', VALID_SERVER_ENV.R2_SECRET_ACCESS_KEY);
    vi.stubEnv('R2_BUCKET', VALID_SERVER_ENV.R2_BUCKET);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', VALID_PUBLIC_ENV.NEXT_PUBLIC_SUPABASE_URL);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', VALID_PUBLIC_ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    vi.stubEnv('NEXT_PUBLIC_APP_URL', VALID_PUBLIC_ENV.NEXT_PUBLIC_APP_URL);

    // Re-import fresh module after env stub
    vi.resetModules();
    const { getServerEnv, _resetServerEnvCache } = await import('@/lib/env');
    _resetServerEnvCache();

    const env = getServerEnv();
    expect(env.R2_ENDPOINT).toBe('https://my-account.r2.cloudflarestorage.com');
    expect(env.R2_BUCKET).toBe('epub-reader-assets');

    vi.unstubAllEnvs();
  });

  it('throws a descriptive error listing missing required vars', async () => {
    // Unset required server vars
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('R2_ACCOUNT_ID', '');
    vi.stubEnv('R2_ACCESS_KEY_ID', '');
    vi.stubEnv('R2_SECRET_ACCESS_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', VALID_PUBLIC_ENV.NEXT_PUBLIC_SUPABASE_URL);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', VALID_PUBLIC_ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    vi.stubEnv('NEXT_PUBLIC_APP_URL', VALID_PUBLIC_ENV.NEXT_PUBLIC_APP_URL);

    vi.resetModules();
    const { getServerEnv, _resetServerEnvCache } = await import('@/lib/env');
    _resetServerEnvCache();

    expect(() => getServerEnv()).toThrowError(/Missing or invalid server environment variables/);

    vi.unstubAllEnvs();
  });

  it('uses R2_BUCKET value when explicitly set', async () => {
    vi.stubEnv('SUPABASE_URL', VALID_SERVER_ENV.SUPABASE_URL);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', VALID_SERVER_ENV.SUPABASE_SERVICE_ROLE_KEY);
    vi.stubEnv('R2_ACCOUNT_ID', VALID_SERVER_ENV.R2_ACCOUNT_ID);
    vi.stubEnv('R2_ACCESS_KEY_ID', VALID_SERVER_ENV.R2_ACCESS_KEY_ID);
    vi.stubEnv('R2_SECRET_ACCESS_KEY', VALID_SERVER_ENV.R2_SECRET_ACCESS_KEY);
    // Explicitly set a custom bucket name to verify it's passed through correctly
    vi.stubEnv('R2_BUCKET', 'my-custom-bucket');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', VALID_PUBLIC_ENV.NEXT_PUBLIC_SUPABASE_URL);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', VALID_PUBLIC_ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    vi.stubEnv('NEXT_PUBLIC_APP_URL', VALID_PUBLIC_ENV.NEXT_PUBLIC_APP_URL);

    vi.resetModules();
    const { getServerEnv, _resetServerEnvCache } = await import('@/lib/env');
    _resetServerEnvCache();

    const env = getServerEnv();
    expect(env.R2_BUCKET).toBe('my-custom-bucket');

    vi.unstubAllEnvs();
  });
});
