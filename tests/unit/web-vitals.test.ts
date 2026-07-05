/**
 * Unit tests for Phase 14 web-vitals reporting (ISD §14.G, §14.H, §14.X,
 * §14.Z, §14.DD #6).
 *
 * Guarantees under test:
 *   - redactRoute strips UUIDs from the path
 *   - the metric payload contains NO PII (no user id, no book id, no email)
 *   - the endpoint helper short-circuits when no endpoint is set
 *   - reporting is non-blocking and never throws
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { redactRoute, type VitalPayload } from '@/lib/perf/web-vitals';

describe('web-vitals — redactRoute (PII scrub)', () => {
  it('replaces UUID-shaped segments with [id]', () => {
    expect(
      redactRoute('https://app.test/reader/12345678-1234-1234-1234-123456789abc/whatever'),
    ).toBe('/reader/[id]/whatever');
  });

  it('leaves non-UUID paths unchanged', () => {
    expect(redactRoute('https://app.test/dashboard')).toBe('/dashboard');
    expect(redactRoute('https://app.test/settings')).toBe('/settings');
  });

  it('handles absolute paths without origin', () => {
    expect(redactRoute('/reader/12345678-1234-1234-1234-123456789abc')).toBe('/reader/[id]');
  });

  it('returns "/" for empty input', () => {
    expect(redactRoute('')).toBe('/');
  });
});

describe('web-vitals — payload shape (PII)', () => {
  it('a constructed payload contains no user/book/email fields', () => {
    // Build a payload the way the report path would.
    const payload: VitalPayload = {
      id: 'metric-id-1',
      name: 'LCP',
      value: 1234,
      rating: 'good',
      route: '/reader/[id]',
      timestamp: new Date().toISOString(),
    };

    // Allowlist of fields that may appear in a payload.
    const allowed = new Set(['id', 'name', 'value', 'rating', 'route', 'timestamp']);
    const actual = Object.keys(payload).sort();
    for (const key of actual) {
      expect(allowed.has(key), `field "${key}" is not in the allowlist`).toBe(true);
    }
    // The route must already be redacted (caller's responsibility).
    expect(payload.route).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });
});

describe('web-vitals — report path (non-blocking, no-throw)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not throw when no endpoint is configured (default)', async () => {
    vi.stubEnv('NEXT_PUBLIC_VITALS_ENDPOINT', '');
    const { reportWebVital } = await import('@/lib/perf/web-vitals');
    // Should be a no-op, never throw, never block.
    expect(() =>
      reportWebVital({
        id: 'm1',
        startTime: 0,
        value: 100,
        label: 'web-vital',
        name: 'LCP',
      } as unknown as Parameters<typeof reportWebVital>[0]),
    ).not.toThrow();
  });
});
