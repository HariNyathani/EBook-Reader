/**
 * Regression test for the Upstash rate-limit signal fix (Phase 15 audit).
 *
 * THE BUG: the Redis client was constructed with
 *   `signal: AbortSignal.timeout(500)`
 * — a SINGLE AbortSignal created once at client construction. The
 * Upstash client reuses the config `signal` for every request, so the
 * one-shot timeout fired ~500ms after cold start and then permanently
 * aborted ALL subsequent calls, silently disabling the distributed
 * limiter and forcing the in-memory fallback forever.
 *
 * THE FIX: pass a factory `() => AbortSignal.timeout(500)` so every
 * request gets a fresh, non-aborted signal.
 *
 * We mock `@upstash/redis` + `@upstash/ratelimit` to capture the Redis
 * constructor config and assert `signal` is a per-request factory.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Shared capture of the config passed to `new Redis(...)`.
const captured = vi.hoisted(() => ({ redisConfig: null as Record<string, unknown> | null }));

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation((cfg: Record<string, unknown>) => {
    captured.redisConfig = cfg;
    return { __mockRedis: true };
  }),
}));

vi.mock('@upstash/ratelimit', () => {
  class Ratelimit {
    cfg: unknown;
    constructor(cfg: unknown) {
      this.cfg = cfg;
    }
    async limit(_id: string) {
      return { success: true, limit: 5, remaining: 4, reset: Date.now() + 1000 };
    }
    static slidingWindow(...args: unknown[]) {
      return { __sliding: args };
    }
  }
  return { Ratelimit };
});

const originalEnv = { ...process.env };
beforeEach(() => {
  // Configure Upstash so the limiter builds a Redis client (not fallback).
  process.env['UPSTASH_REDIS_REST_URL'] = 'https://example.upstash.io';
  process.env['UPSTASH_REDIS_REST_TOKEN'] = 'test-token';
  captured.redisConfig = null;
  vi.resetModules();
});
afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe('rate-limit — Upstash signal is a per-request factory (regression)', () => {
  it('constructs Redis with signal as a function, not a one-shot AbortSignal', async () => {
    const mod = await import('@/lib/security/rate-limit');

    // Trigger lazy Upstash construction.
    const result = await mod.defaultLimiter('factory-test-key');
    expect(result.fallback).toBe(false); // used Upstash (mock), not the fallback

    expect(captured.redisConfig).toBeTruthy();
    const signal = captured.redisConfig!['signal'];

    // The core assertion: signal MUST be a factory, not a static signal.
    expect(typeof signal).toBe('function');
    expect(signal).not.toBeInstanceOf(AbortSignal);
  });

  it('the factory yields a fresh, non-aborted AbortSignal on each call', async () => {
    const mod = await import('@/lib/security/rate-limit');
    await mod.defaultLimiter('factory-test-key-2');

    const signal = captured.redisConfig!['signal'] as () => AbortSignal;
    const s1 = signal();
    const s2 = signal();

    expect(s1).toBeInstanceOf(AbortSignal);
    expect(s2).toBeInstanceOf(AbortSignal);
    // Distinct instances — the bug was a single shared signal.
    expect(s1).not.toBe(s2);
    // Fresh signals are not already aborted (the bug aborted after 500ms).
    expect(s1.aborted).toBe(false);
    expect(s2.aborted).toBe(false);
  });
});
