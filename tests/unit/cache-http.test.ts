/**
 * Unit tests for Phase 14 cache policy module (ISD §14.G, §14.H, §14.Z).
 *
 * Guarantees under test:
 *   - the policy enum produces the right Cache-Control header
 *   - no policy allows public + max-age for an EPUB / API route
 *   - covers are private (never public)
 *   - static assets are public + immutable
 */

import { describe, it, expect } from 'vitest';
import {
  cacheControlFor,
  cacheHeaderFor,
  ROUTE_CACHE_POLICIES,
  type CachePolicy,
} from '@/lib/cache/http';

describe('cache-control — policy builders (ISD §14.Z)', () => {
  it('no-store: never cacheable', () => {
    const cc = cacheControlFor('no-store');
    expect(cc.header).toBe('no-store');
    expect(cc.publicCacheable).toBe(false);
    expect(cc.browserCacheable).toBe(false);
  });

  it('private-short: browser-cacheable, never public', () => {
    const cc = cacheControlFor('private-short');
    expect(cc.header).toBe('private, max-age=3600');
    expect(cc.publicCacheable).toBe(false);
    expect(cc.browserCacheable).toBe(true);
    expect(cc.maxAgeSeconds).toBe(3600);
  });

  it('public-immutable: aggressively cacheable', () => {
    const cc = cacheControlFor('public-immutable');
    expect(cc.header).toBe('public, max-age=31536000, immutable');
    expect(cc.publicCacheable).toBe(true);
    expect(cc.browserCacheable).toBe(true);
  });

  it('api-no-store: never cacheable, stricter than no-store', () => {
    const cc = cacheControlFor('api-no-store');
    expect(cc.publicCacheable).toBe(false);
    expect(cc.browserCacheable).toBe(false);
    expect(cc.header).toContain('no-store');
  });

  it('navigation-private: browser may cache, never public', () => {
    const cc = cacheControlFor('navigation-private');
    expect(cc.publicCacheable).toBe(false);
    expect(cc.browserCacheable).toBe(true);
  });
});

describe('cache-control — privacy invariants (ISD §14.Z)', () => {
  it('EPUB delivery is never public-cacheable', () => {
    const policy: CachePolicy = ROUTE_CACHE_POLICIES['/api/books/*']!;
    expect(policy).toBe('no-store');
    expect(cacheControlFor(policy).publicCacheable).toBe(false);
  });

  it('cover delivery is never public-cacheable (private only)', () => {
    const policy: CachePolicy = ROUTE_CACHE_POLICIES['/api/covers/*']!;
    expect(policy).toBe('private-short');
    const cc = cacheControlFor(policy);
    expect(cc.publicCacheable).toBe(false);
    expect(cc.header.startsWith('private')).toBe(true);
  });

  it('progress beacon is never cached', () => {
    const policy: CachePolicy = ROUTE_CACHE_POLICIES['/api/progress']!;
    expect(policy).toBe('no-store');
    expect(cacheControlFor(policy).browserCacheable).toBe(false);
  });

  it('static assets are public + immutable', () => {
    const policy: CachePolicy = ROUTE_CACHE_POLICIES['/_next/static/*']!;
    expect(policy).toBe('public-immutable');
    const cc = cacheControlFor(policy);
    expect(cc.publicCacheable).toBe(true);
    expect(cc.header).toContain('immutable');
  });

  it('icons are public + immutable', () => {
    const policy: CachePolicy = ROUTE_CACHE_POLICIES['/icons/*']!;
    expect(policy).toBe('public-immutable');
  });

  it('page navigations are private, never public', () => {
    for (const route of [
      '/dashboard',
      '/reader/*',
      '/admin/*',
      '/settings',
      '/login',
      '/register',
    ]) {
      const policy: CachePolicy = ROUTE_CACHE_POLICIES[route]!;
      expect(policy, `route ${route} should be navigation-private`).toBe('navigation-private');
      expect(cacheControlFor(policy).publicCacheable, `route ${route}`).toBe(false);
    }
  });
});

describe('cache-control — header string helper', () => {
  it('returns the header value as a plain string', () => {
    expect(cacheHeaderFor('no-store')).toBe('no-store');
    expect(cacheHeaderFor('private-short')).toBe('private, max-age=3600');
    expect(cacheHeaderFor('public-immutable')).toBe('public, max-age=31536000, immutable');
  });
});
