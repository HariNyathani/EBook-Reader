/**
 * Shared HTTP response header builders.
 *
 * These are pure functions — no I/O. Safe to import from server or shared code.
 * They are consumed by Route Handlers for EPUB delivery and cover serving.
 *
 * Security note: epubDeliveryHeaders enforces no-store to prevent private content
 * from being cached by CDNs, proxies, or browsers (SAD §2.1).
 */

/**
 * Headers for secure EPUB file delivery.
 * Enforces no-cache to protect private content (SAD §2.1).
 *
 * @param filename - Optional filename for Content-Disposition (e.g. "my-book.epub")
 */
export function epubDeliveryHeaders(filename?: string): Record<string, string> {
  const disposition = filename
    ? `attachment; filename="${filename.replace(/"/g, '\\"')}"`
    : 'inline';

  return {
    'Content-Type': 'application/epub+zip',
    'Content-Disposition': disposition,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
}

/**
 * Headers for cover image delivery.
 * Private — not publicly cacheable.
 */
export function coverDeliveryHeaders(): Record<string, string> {
  return {
    'Content-Type': 'image/jpeg',
    'Cache-Control': 'private, max-age=300',
    'X-Content-Type-Options': 'nosniff',
  };
}

/**
 * Security headers applied to all routes via next.config.ts.
 *
 * CSP policy:
 * - `default-src 'self'` — restrictive baseline
 * - `script-src 'self' 'unsafe-eval'` — Next.js dev mode needs unsafe-eval; tighten in prod
 * - `style-src 'self' 'unsafe-inline'` — Tailwind/CSS-in-JS needs inline styles
 * - `img-src 'self' data: blob:` — covers served same-origin; blob for foliate canvas
 * - `connect-src 'self' <supabase>` — Supabase auth calls (NEXT_PUBLIC_SUPABASE_URL)
 * - `frame-ancestors 'self'` — allow Foliate's internal sandboxed iframe (same-origin)
 * - `frame-src 'self' blob:` — Foliate uses blob: URLs for sandboxed content rendering
 *
 * ISD-NOTE: CSP is intentionally kept permissive for Phase 2 to avoid blocking Supabase
 * auth calls (Phase 4) and Foliate (Phase 5). Tighten in production per security audit.
 *
 * IMPORTANT: frame-ancestors 'self' allows Foliate's sandboxed iframe which is same-origin.
 * Do NOT set X-Frame-Options: DENY globally — it would break the reader.
 */
export function securityHeaders(): Array<{ key: string; value: string }> {
  // ISD-NOTE: NEXT_PUBLIC_SUPABASE_URL is accessed directly here (not via publicEnv) because
  // this function runs in next.config.ts which executes before the app's module system.
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '';

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-eval' 'unsafe-inline'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    // connect-src includes Supabase origin so Phase 4 auth calls are not blocked
    `connect-src 'self'${supabaseUrl ? ` ${supabaseUrl}` : ''}`,
    // Allow Foliate's same-origin + blob iframe
    `frame-src 'self' blob:`,
    `frame-ancestors 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ');

  return [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-DNS-Prefetch-Control', value: 'on' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    // NOTE: X-Frame-Options is NOT set globally — Foliate's reader uses a same-origin iframe.
    // frame-ancestors 'self' in CSP covers the framing restriction.
  ];
}
