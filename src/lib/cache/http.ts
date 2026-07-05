/**
 * Centralized Cache-Control builders (Phase 14, ISD §14.G, §14.H, §14.Z).
 *
 * This module is the single source of truth for HTTP cache policies
 * across the app. The previous builders in `src/lib/http/headers.ts`
 * are still used by the EPUB/cover delivery handlers; this module
 * adds a typed policy enum + the corresponding `Cache-Control`
 * header values, and a helper for revalidation.
 *
 * Privacy invariants (Appendix G §G.5, ISD §14.Z):
 *   - EPUB responses: `Cache-Control: no-store`. Never served from
 *     a public cache. Never stored in the SW Cache Storage.
 *   - Cover responses: `Cache-Control: private, max-age=...`. The
 *     `private` token is mandatory — covers are gated by auth, so a
 *     shared cache would leak them.
 *   - `/api/*` is never made publicly cacheable. Default is no-store.
 *   - Static assets (JS/CSS/fonts/images under /_next/static, /icons):
 *     `public, max-age=31536000, immutable` — they are content-hashed.
 *
 * If you change a policy here, also update the related tests
 * (`tests/unit/cache-headers.test.ts`) and the operational runbook.
 */

export type CachePolicy =
  /** EPUB delivery — no cache anywhere. */
  | 'no-store'
  /** Covers — private cache only (browser may cache, CDN must not). */
  | 'private-short'
  /** Static content-hashed assets — public, immutable, 1y. */
  | 'public-immutable'
  /** Default API — no cache (defense in depth). */
  | 'api-no-store'
  /** Page navigations — private, short max-age (browser may cache, CDN must not). */
  | 'navigation-private';

export interface CacheControl {
  policy: CachePolicy;
  /** The Cache-Control header value. */
  header: string;
  /** Whether the response is allowed in shared (CDN) caches. */
  publicCacheable: boolean;
  /** Whether the response is allowed in browser caches. */
  browserCacheable: boolean;
  /** The max-age in seconds (0 if not applicable). */
  maxAgeSeconds: number;
}

/**
 * Build a Cache-Control value for the given policy.
 * The output is suitable for use in a `Cache-Control` header field.
 */
export function cacheControlFor(policy: CachePolicy): CacheControl {
  switch (policy) {
    case 'no-store':
      return {
        policy,
        header: 'no-store',
        publicCacheable: false,
        browserCacheable: false,
        maxAgeSeconds: 0,
      };
    case 'private-short':
      // Private = browser-only; max-age=3600s = 1h. Defends against
      // oversharing at the CDN.
      return {
        policy,
        header: 'private, max-age=3600',
        publicCacheable: false,
        browserCacheable: true,
        maxAgeSeconds: 3600,
      };
    case 'public-immutable':
      return {
        policy,
        header: 'public, max-age=31536000, immutable',
        publicCacheable: true,
        browserCacheable: true,
        maxAgeSeconds: 31_536_000,
      };
    case 'api-no-store':
      return {
        policy,
        header: 'no-store, no-cache, must-revalidate',
        publicCacheable: false,
        browserCacheable: false,
        maxAgeSeconds: 0,
      };
    case 'navigation-private':
      return {
        policy,
        header: 'private, max-age=0, must-revalidate',
        publicCacheable: false,
        browserCacheable: true,
        maxAgeSeconds: 0,
      };
  }
}

/**
 * Helper: produce a `Cache-Control` header value as a plain string.
 * Use this in `next.config.ts` and Route Handlers:
 *   headers: [{ key: 'Cache-Control', value: cacheHeaderFor('no-store') }]
 */
export function cacheHeaderFor(policy: CachePolicy): string {
  return cacheControlFor(policy).header;
}

/**
 * The map of every route → its canonical cache policy. Used by the
 * delivery handlers and any future route to ensure consistency.
 */
export const ROUTE_CACHE_POLICIES: Readonly<Record<string, CachePolicy>> = Object.freeze({
  // Public app-shell assets
  '/_next/static/*': 'public-immutable',
  '/icons/*': 'public-immutable',
  '/manifest.webmanifest': 'public-immutable',
  // Service worker is re-checked by the browser (no-cache) so updates
  // are picked up. Handled separately in next.config.ts headers().
  // Delivery handlers
  '/api/books/*': 'no-store',
  '/api/covers/*': 'private-short',
  '/api/progress': 'no-store',
  // Page navigations
  '/dashboard': 'navigation-private',
  '/reader/*': 'navigation-private',
  '/admin/*': 'navigation-private',
  '/settings': 'navigation-private',
  // Public auth pages
  '/login': 'navigation-private',
  '/register': 'navigation-private',
});
