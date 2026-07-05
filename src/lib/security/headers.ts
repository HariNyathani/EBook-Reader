/**
 * Security response headers (Phase 15, ISD §15.G, §15.H, §15.Z, §15.AA).
 *
 * This module supersedes `src/lib/http/headers.ts` for the FULL
 * security header set. The original module is preserved because it
 * also exposes the `epubDeliveryHeaders()` / `coverDeliveryHeaders()`
 * helpers consumed by the route handlers, and we don't want a
 * cross-cutting rename.
 *
 * The full security header set returned by `buildSecurityHeaders()`:
 *   - Content-Security-Policy (nonce-based, see ./csp.ts)
 *   - X-Content-Type-Options: nosniff
 *   - X-DNS-Prefetch-Control: on
 *   - Referrer-Policy: strict-origin-when-cross-origin
 *   - Permissions-Policy: deny all unused capabilities
 *   - Strict-Transport-Security: 1y + includeSubDomains + preload (prod)
 *   - Cross-Origin-Opener-Policy: same-origin (prod)
 *
 * NOT included (intentionally):
 *   - X-Frame-Options: redundant with CSP frame-ancestors and would
 *     break the reader's same-origin iframe.
 *   - Cross-Origin-Embedder-Policy: breaks blob: iframes used by
 *     foliate. Verified: foliate's blob: URL is created from
 *     same-origin bytes, so CORP=credentialled is not required.
 *   - Cross-Origin-Resource-Policy: same reasoning; same-origin
 *     resources don't need it.
 *
 * The middleware imports `getOrGenerateNonce` and the response
 * header builder; the headers are applied as part of every response
 * (including the redirect responses for auth).
 */

import {
  buildSecurityHeaders as buildCspHeaders,
  generateNonce,
  CSP_NONCE_HEADER,
  type FullSecurityHeadersOptions,
} from './csp';

/** Re-export the nonce utilities. */
export { generateNonce, CSP_NONCE_HEADER };

/** Re-export the type. */
export type { FullSecurityHeadersOptions };

/**
 * Convenience: build the full security header set for a given request
 * context. Used by middleware and the next.config headers() callback.
 */
export function buildFullSecurityHeaders(
  opts: Omit<FullSecurityHeadersOptions, 'nonce'> & { nonce?: string },
): Array<{ key: string; value: string }> {
  const nonce = opts.nonce ?? generateNonce();
  return buildCspHeaders({ ...opts, nonce });
}
