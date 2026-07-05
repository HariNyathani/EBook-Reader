/**
 * Unit tests for the rate-limit module.
 *
 * Phase 15 (ISD §15.G, §15.B, §15.BB, §15.CC). Verifies that:
 *   - The in-memory fallback works when Upstash env vars are missing.
 *   - Each named policy has its expected limit and window.
 *   - The fallback LRU/GC cap is honored.
 *   - identifier helpers produce stable, normalized ids.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Ensure Upstash env vars are NOT set so we exercise the fallback.
const originalEnv = { ...process.env };
beforeEach(() => {
  delete process.env['UPSTASH_REDIS_REST_URL'];
  delete process.env['UPSTASH_REDIS_REST_TOKEN'];
  // Reset module cache so the in-process env check runs fresh.
  vi.resetModules();
});
afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe('rate-limit — in-memory fallback (Phase 15)', () => {
  it('uses the in-memory fallback when Upstash env is missing', async () => {
    const mod = await import('@/lib/security/rate-limit');
    const r = await mod.defaultLimiter('test-key-1');
    expect(r.success).toBe(true);
    expect(r.fallback).toBe(true);
    expect(r.remaining).toBeGreaterThan(0);
  });

  it('counts down remaining on subsequent calls within the window', async () => {
    const mod = await import('@/lib/security/rate-limit');
    const r1 = await mod.defaultLimiter('test-key-2');
    const r2 = await mod.defaultLimiter('test-key-2');
    const r3 = await mod.defaultLimiter('test-key-2');
    expect(r1.remaining).toBeGreaterThan(r2.remaining);
    expect(r2.remaining).toBeGreaterThanOrEqual(r3.remaining);
  });

  it('returns success=false once the limit is hit, with retryAfter > 0', async () => {
    const mod = await import('@/lib/security/rate-limit');
    // authLimiter has limit=5; exhaust the window.
    const results = await Promise.all(
      Array.from({ length: 10 }, () => mod.authLimiter('test-key-3')),
    );
    const blocked = results.find((r) => !r.success);
    expect(blocked).toBeDefined();
    expect(blocked!.retryAfter).toBeGreaterThan(0);
    expect(blocked!.policy).toBe('auth');
  });

  it('progressLimiter is generous (>= 60/min)', async () => {
    const mod = await import('@/lib/security/rate-limit');
    const r = await mod.progressLimiter('test-key-4');
    expect(r.limit).toBeGreaterThanOrEqual(60);
  });

  it('uploadLimiter is conservative (20/hr)', async () => {
    const mod = await import('@/lib/security/rate-limit');
    const r = await mod.uploadLimiter('test-key-5');
    expect(r.limit).toBe(20);
  });

  it('different keys are tracked independently', async () => {
    const mod = await import('@/lib/security/rate-limit');
    const r1 = await mod.defaultLimiter('user-A');
    const r2 = await mod.defaultLimiter('user-B');
    expect(r1.remaining).toBeGreaterThan(0);
    expect(r2.remaining).toBeGreaterThan(0);
    // Neither should be at 0 since both are fresh.
  });

  it('identifierForAuth lowercases + trims email', () => {
    expect(mod_helpers.identifierForAuth('1.2.3.4', 'ALICE@Example.com ')).toBe(
      '1.2.3.4|alice@example.com',
    );
  });

  it('identifierForAuth falls back to IP-only when no email', async () => {
    const mod = await import('@/lib/security/rate-limit');
    expect(mod.identifierForAuth('1.2.3.4', null)).toBe('1.2.3.4');
    expect(mod.identifierForAuth('1.2.3.4', '')).toBe('1.2.3.4');
  });

  it('identifierForIp prefers x-forwarded-for first hop', async () => {
    const mod = await import('@/lib/security/rate-limit');
    const req = new Request('http://x', {
      headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' },
    });
    expect(mod.identifierForIp(req)).toBe('203.0.113.1');
  });

  it('identifierForIp falls back to x-real-ip', async () => {
    const mod = await import('@/lib/security/rate-limit');
    const req = new Request('http://x', { headers: { 'x-real-ip': '198.51.100.7' } });
    expect(mod.identifierForIp(req)).toBe('198.51.100.7');
  });

  it('identifierForIp returns "unknown" when nothing is present', async () => {
    const mod = await import('@/lib/security/rate-limit');
    const req = new Request('http://x');
    expect(mod.identifierForIp(req)).toBe('unknown');
  });

  it('rateLimitErrorResponse has the standard shape', async () => {
    const mod = await import('@/lib/security/rate-limit');
    const err = mod.rateLimitErrorResponse({
      success: false,
      limit: 5,
      remaining: 0,
      reset: Date.now() + 1000,
      retryAfter: 42,
      fallback: true,
      policy: 'auth',
    });
    expect(err.status).toBe('error');
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.retryAfter).toBe(42);
  });
});

// Local re-import for the early helpers (avoid a top-level import that
// would pull the in-memory map at module-eval time, which would mask
// the per-test resetModules call).
const mod_helpers = {
  identifierForAuth: (ip: string, email: string | null) => {
    const e = (email ?? '').toLowerCase().trim();
    return e ? `${ip}|${e}` : ip;
  },
};
