/**
 * Content Security Policy (CSP) builder — Phase 15 (ISD §15.G, §15.Z, §15.AA, Appendix G.6).
 *
 * NONCE-BASED, STRICT CSP. No `unsafe-inline` for scripts. We use:
 *   - Per-request nonce for every <script> that the framework emits
 *     (Next.js 15 supports `nonce` for inline boot scripts via the
 *     middleware-injected header).
 *   - `'strict-dynamic'` allows nonce-allowlisted scripts to load
 *     additional scripts (CDN chunks, etc.) without further
 *     allowlisting. This is the modern recommendation and is
 *     browser-compatible (Chromium 52+, Firefox 52+, Safari 15.4+).
 *   - We keep `'self'` for legacy browsers without strict-dynamic.
 *
 * What we MUST preserve for the foliate-js reader (SAD §5.1, Phase 9):
 *   - `connect-src 'self' blob:` — foliate receives the book as a
 *     `blob:` objectURL *string* and `fetch()`es it to read the zip
 *     bytes. A fetch of a blob: URL is a connect-src request, so
 *     omitting `blob:` here blocks the read ("Failed to fetch").
 *   - `frame-src 'self' blob:` — foliate opens a sandboxed iframe with
 *     a `blob:` URL for the book content.
 *   - `img-src 'self' blob: data:` — foliate draws cover/thumb blobs.
 *   - `style-src 'self' 'unsafe-inline' blob:` — REQUIRED for the reader.
 *     Foliate renders each section in an `allow-same-origin` `blob:`
 *     iframe, which INHERITS this policy (a same-origin/local-scheme
 *     document does not get a fresh CSP). The reader theme CSS that
 *     foliate injects as `<style>`, plus the EPUB's own inline styles
 *     and `blob:` stylesheets/fonts, can't carry our per-request nonce —
 *     so with a nonce-only style-src the book renders blank. See the
 *     style-src block in buildCsp() for the full rationale and trade-off.
 *   - `font-src 'self' data: blob:` — EPUB embedded fonts (blob:).
 *
 * The nonce is generated per request by middleware and propagated
 * via the `x-nonce` request header. Next.js will read this header
 * when emitting inline boot scripts.
 *
 * Environment variables consumed:
 *   - NEXT_PUBLIC_SUPABASE_URL — added to connect-src
 *   - NEXT_PUBLIC_APP_URL — added to connect-src/frame-ancestors
 *   - NEXT_PUBLIC_SENTRY_DSN — added to connect-src
 *   - SENTRY_DSN — added to connect-src
 *
 * IMPORTANT: never include 'unsafe-inline' in SCRIPT-src. Never
 * include 'unsafe-eval'. The only allowed sources for executable
 * code are 'self', the per-request nonce, and 'strict-dynamic' for
 * trusted script chains. (style-src DOES use 'unsafe-inline' — see the
 * style-src block below for why the reader iframe forces this; it is a
 * deliberate, bounded exception that does NOT extend to scripts.)
 */

/**
 * Use Web Crypto, which is available in both Node 20+ and the
 * Edge runtime (Next.js middleware). This is universal and does
 * not require any node: scheme imports.
 */
const getCrypto = (): Crypto => {
  if (typeof globalThis.crypto !== 'undefined') return globalThis.crypto;
  // Last resort: throw if neither global crypto nor node:crypto is
  // available. In practice, both runtimes always provide one.
  throw new Error('[csp] No Web Crypto available');
};

/** Header name used to thread the per-request nonce through. */
export const CSP_NONCE_HEADER = 'x-nonce';

/** Per-request CSP header name. */
export const CSP_HEADER = 'Content-Security-Policy';

/** Per-request CSP report-only header (used in preview environments). */
export const CSP_REPORT_ONLY_HEADER = 'Content-Security-Policy-Report-Only';

/**
 * Generate a fresh CSP nonce for a single request.
 * Base64-encoded, 128 bits of entropy (recommended by CSP spec).
 *
 * MUST be called once per request in middleware and threaded through
 * to the document via the `x-nonce` header.
 *
 * Uses Web Crypto (available in both Node 20+ and the Edge runtime).
 * We previously used `crypto.randomBytes` from node:crypto but that
 * breaks in the Edge runtime (Next.js middleware); Web Crypto is
 * universal.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  getCrypto().getRandomValues(bytes);
  // Convert to base64 without depending on Buffer (edge runtime).
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  // btoa is available in both Node 20+ and the Edge runtime.
  return btoa(binary);
}

/**
 * Interface for the runtime context used to build the CSP header value.
 * All fields are optional; missing fields are simply omitted.
 */
export interface CspBuildContext {
  /** Per-request nonce (must be unique per response). */
  nonce: string;
  /** Whether to allow Next.js dev HMR. Only true in development. */
  isDev?: boolean;
  /** Optional Sentry DSN (host) to add to connect-src. */
  sentryDsn?: string;
  /** Optional Sentry tunnel endpoint host. */
  sentryTunnel?: string;
  /** Optional Supabase URL (for connect-src). */
  supabaseUrl?: string;
  /** Optional app URL (for connect-src/frame-ancestors). */
  appUrl?: string;
}

/**
 * Build the strict, nonce-based Content Security Policy value.
 *
 * The returned string is a single CSP header value suitable for
 * direct placement in a `Content-Security-Policy` response header.
 *
 * Directive reference (full list, in declared order):
 *   - default-src 'self'            — baseline
 *   - script-src 'self' 'nonce-…' 'strict-dynamic'   — strict
 *   - style-src 'self' 'unsafe-inline' blob:   — reader iframe needs inline CSS
 *   - img-src 'self' blob: data:    — for foliate covers/thumbs
 *   - font-src 'self' data: blob:   — for reader + EPUB-embedded fonts
 *   - connect-src 'self' blob: [supabase] [sentry] [app]
 *                                  (blob: — foliate fetch()es the book objectURL)
 *   - frame-src 'self' blob:        — for foliate sandboxed iframe
 *   - frame-ancestors 'self'        — no embedding elsewhere
 *   - object-src 'none'             — block <object>/<embed>
 *   - base-uri 'self'               — block <base> hijacking
 *   - form-action 'self'            — forms submit same-origin only
 *   - upgrade-insecure-requests     — force https (prod only)
 *   - worker-src 'self' blob:       — service worker (Serwist)
 *   - manifest-src 'self'           — PWA manifest
 *   - media-src 'self' blob:        — for audiobook/mp3 (future)
 *
 * @param ctx - The CSP build context
 * @returns The CSP header value (semicolon-separated directives)
 */
export function buildCsp(ctx: CspBuildContext): string {
  const directives: string[] = [];

  // 1. Baseline
  directives.push(`default-src 'self'`);

  // 2. script-src — strict. NEVER unsafe-inline or unsafe-eval.
  // In development we need a tiny allowance for Next.js HMR (eval is
  // required for fast-refresh). In production this is omitted.
  const scriptSources: string[] = [`'self'`, `'nonce-${ctx.nonce}'`, `'strict-dynamic'`];
  if (ctx.isDev) {
    // dev-only: HMR requires eval. This is gated to NODE_ENV=development
    // and is NEVER present in production CSP.
    scriptSources.push(`'unsafe-eval'`);
  }
  directives.push(`script-src ${scriptSources.join(' ')}`);

  // 3. style-src — 'self' + 'unsafe-inline' + blob:.
  //
  // WHY 'unsafe-inline' (and no nonce) here, unlike script-src:
  // The foliate-js reader renders each EPUB section inside an
  // `<iframe sandbox="allow-same-origin allow-scripts">` whose `src` is a
  // `blob:` URL (epub.js builds the section document as a Blob). Because
  // that iframe is same-origin AND loaded from a local scheme (blob:), the
  // section document **inherits this top-level CSP** — it does not get a
  // fresh policy. Inside it, the visual render depends on inline CSS we
  // cannot nonce:
  //   - foliate injects `<style>` elements into the section <head> and
  //     writes the reader theme/typography CSS into them (paginator.js);
  //   - the EPUB's own content uses inline `style="…"` attributes / `<style>`
  //     blocks and references its stylesheets + fonts as `blob:` resources.
  // Under a nonce-only `style-src` all of that is blocked, so the book
  // renders blank/unstyled even though pagination (applied via CSSOM
  // `element.style`, which CSP does not gate) succeeds. A same-origin blob:
  // iframe cannot be given a *looser* policy than its parent, so the
  // top-level `style-src` itself must permit inline styles.
  //
  // A nonce and 'unsafe-inline' are mutually exclusive in practice: when a
  // nonce/hash is present, browsers IGNORE 'unsafe-inline'. So we drop the
  // style nonce entirely. This is an accepted, bounded trade-off — the app
  // ships no nonce-dependent inline styles (Tailwind is external CSS), and
  // CSS injection is far lower severity than script injection, which stays
  // fully locked down (script-src keeps its nonce + strict-dynamic and does
  // NOT get 'unsafe-inline').
  directives.push(`style-src 'self' 'unsafe-inline' blob:`);

  // 4. img-src — must allow blob: and data: for foliate covers/thumbnails
  //    and inline EPUB images (rewritten to blob:).
  directives.push(`img-src 'self' blob: data:`);

  // 5. font-src — data: covers inline SVG fonts; 'self' covers hashed assets;
  //    blob: covers fonts embedded in the EPUB (foliate rewrites them to
  //    blob: URLs, and the reader iframe inherits this policy — see style-src).
  directives.push(`font-src 'self' data: blob:`);

  // 6. connect-src — the API origins we may talk to.
  //
  // `blob:` is REQUIRED for the foliate-js reader. We hand foliate an
  // ephemeral `blob:` objectURL (created from the EPUB bytes we fetched
  // from R2). foliate's `makeBook()` receives that URL as a *string* and
  // internally `fetch()`es it to read the zip (see
  // vendor/foliate-js/foliate-view.js → fetchFile). A `fetch()` of a
  // `blob:` URL is governed by connect-src, NOT frame-src/img-src — so
  // without `blob:` here the strict CSP blocks the read and the reader
  // throws "Failed to fetch". This is safe: `blob:` in connect-src only
  // permits fetching Blob URLs the page itself minted (same-origin,
  // ephemeral, revoked on unmount) — it is not an exfiltration vector.
  const connectSources: string[] = [`'self'`, `blob:`];
  if (ctx.supabaseUrl) connectSources.push(ctx.supabaseUrl);
  if (ctx.appUrl) connectSources.push(ctx.appUrl);
  if (ctx.sentryDsn) {
    try {
      const u = new URL(ctx.sentryDsn);
      connectSources.push(`${u.protocol}//${u.host}`);
    } catch {
      /* ignore malformed DSN */
    }
  }
  if (ctx.sentryTunnel) connectSources.push(ctx.sentryTunnel);
  directives.push(`connect-src ${connectSources.join(' ')}`);

  // 7. frame-src — MUST allow blob: for foliate's sandboxed iframe.
  directives.push(`frame-src 'self' blob:`);

  // 8. frame-ancestors — same-origin only.
  directives.push(`frame-ancestors 'self'`);

  // 9. object-src — none.
  directives.push(`object-src 'none'`);

  // 10. base-uri — self.
  directives.push(`base-uri 'self'`);

  // 11. form-action — self only (prevents form-jacking to attacker).
  directives.push(`form-action 'self'`);

  // 12. worker-src — self + blob (Serwist precache worker).
  directives.push(`worker-src 'self' blob:`);

  // 13. manifest-src — self.
  directives.push(`manifest-src 'self'`);

  // 14. media-src — for future audio annotations; blob: for the
  // reader's own media rendering.
  directives.push(`media-src 'self' blob:`);

  // 15. upgrade-insecure-requests — only in non-dev.
  if (!ctx.isDev) {
    // Inserted last so it applies to all subresource requests.
    directives.push(`upgrade-insecure-requests`);
  }

  return directives.join('; ');
}

/**
 * Build a CSP-Report-Only variant of the same policy.
 *
 * Used in preview environments to surface potential violations
 * without breaking the app. The `report-uri` points to our local
 * collector; in production the violations are forwarded to Sentry
 * (see monitoring/sentry.server.config.ts).
 *
 * @param ctx - The CSP build context
 * @param reportUri - The endpoint to send violation reports to
 * @returns The CSP report-only header value
 */
export function buildCspReportOnly(ctx: CspBuildContext, reportUri: string): string {
  const base = buildCsp(ctx);
  return `${base}; report-uri ${reportUri}`;
}

/**
 * Build the full set of security response headers for a given request
 * context. Combines the CSP with the rest of the security header set
 * (HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
 *
 * @param ctx - The CSP build context
 * @param isProd - Whether we are in production (controls HSTS)
 * @returns An array of { key, value } pairs suitable for the Next.js
 *          `headers()` callback.
 */
export interface FullSecurityHeadersOptions {
  nonce: string;
  isDev?: boolean;
  isProd?: boolean;
  sentryDsn?: string;
  sentryTunnel?: string;
  supabaseUrl?: string;
  appUrl?: string;
}

export function buildSecurityHeaders(
  opts: FullSecurityHeadersOptions,
): Array<{ key: string; value: string }> {
  const headers: Array<{ key: string; value: string }> = [
    {
      key: CSP_HEADER,
      value: buildCsp({
        nonce: opts.nonce,
        isDev: opts.isDev,
        sentryDsn: opts.sentryDsn,
        sentryTunnel: opts.sentryTunnel,
        supabaseUrl: opts.supabaseUrl,
        appUrl: opts.appUrl,
      }),
    },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-DNS-Prefetch-Control', value: 'on' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      // Lock down features the reader does not use. The reader only
      // needs same-origin framing; everything else is denied.
      value: [
        'accelerometer=()',
        'autoplay=()',
        'camera=()',
        'clipboard-read=(self)',
        'clipboard-write=(self)',
        'geolocation=()',
        'gyroscope=()',
        'hid=()',
        'magnetometer=()',
        'microphone=()',
        'midi=()',
        'payment=()',
        'picture-in-picture=()',
        'publickey-credentials-get=(self)',
        'screen-wake-lock=()',
        'serial=()',
        'sync-xhr=()',
        'usb=()',
        'xr-spatial-tracking=()',
      ].join(', '),
    },
  ];

  if (opts.isProd) {
    // HSTS: 1-year, include subdomains, preload-eligible.
    // Only emitted in production; enabling in dev breaks local http.
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=31536000; includeSubDomains; preload',
    });

    // Cross-Origin policies. We DO enable COOP (opener-isolation is a
    // Spectre mitigation), but we deliberately omit COEP because the
    // reader's blob: iframe can fail CORP/Cross-Origin-Resource-Policy
    // checks under COEP. Verified: blob: URLs from same-origin
    // fetches do not require credentialled isolation.
    headers.push({
      key: 'Cross-Origin-Opener-Policy',
      value: 'same-origin',
    });
  }

  return headers;
}
