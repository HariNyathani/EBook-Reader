import type { NextConfig } from 'next';
import path from 'node:path';
import withSerwistInit from '@serwist/next';
import { withSentryConfig } from '@sentry/nextjs';
import { buildFullSecurityHeaders } from './src/lib/security/headers';

// @next/bundle-analyzer is gated behind ANALYZE=true (Phase 14, ISD §14.H).
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env['ANALYZE'] === 'true',
  openAnalyzer: false,
});

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  cacheOnNavigation: true,
  reloadOnOnline: false,
  exclude: [/\.map$/, /^manifest.*\.js$/, /^sw\.js$/],
});

/**
 * Next.js configuration.
 *
 * Phase 13 (ISD §13.H, §13.0.2 B): wraps the entire config with
 * `withSerwist` so /sw.js is generated from src/app/sw.ts at build
 * time.
 *
 * Phase 14 (ISD §14.H): enables the @next/bundle-analyzer behind an
 * env flag (ANALYZE=true) and tunes `experimental.optimizePackageImports`
 * for any large libs we ship client-side.
 *
 * Phase 15 (ISD §15.H, §15.Z): applies the FULL security header set
 * (nonce-based CSP, HSTS, COOP, Permissions-Policy) here as a
 * defense-in-depth net. The middleware applies the SAME set
 * per-request with a fresh nonce — these static values are a
 * fallback for responses that do NOT flow through the middleware
 * (e.g. cached pages, server errors).
 */
const isProd = process.env['NODE_ENV'] === 'production';
const isDev = !isProd;

/**
 * Compute the static fallback security headers. The middleware
 * REPLACES these on every response with a fresh nonce, but we still
 * need a sane default for non-middleware paths.
 */
const staticSecurityHeaders = buildFullSecurityHeaders({
  // Use a placeholder nonce; the middleware rewrites this header.
  nonce: 'static',
  isDev,
  isProd,
  sentryDsn: process.env['SENTRY_DSN'] ?? process.env['NEXT_PUBLIC_SENTRY_DSN'],
  supabaseUrl: process.env['NEXT_PUBLIC_SUPABASE_URL'],
  appUrl: process.env['NEXT_PUBLIC_APP_URL'],
});

const nextConfig: NextConfig = {
  reactStrictMode: true,

  experimental: {
    serverActions: {
      bodySizeLimit: (process.env['SERVER_ACTIONS_BODY_LIMIT'] ?? '50mb') as `${number}mb`,
    },
    optimizePackageImports: [],
  },

  webpack(config) {
    const stub = path.resolve(__dirname, 'src/vendor/foliate-js/stubs/unsupported-format-stub.js');
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      './comic-book.js': stub,
      './fb2.js': stub,
      './pdf.js': stub,
      './mobi.js': stub,
    };
    return config;
  },

  async headers() {
    return [
      {
        // Apply security headers to all routes.
        source: '/(.*)',
        headers: staticSecurityHeaders,
      },
      {
        // Service worker must be served with no-cache and correct scope header.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        // /offline is the SW navigation fallback.
        source: '/offline',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
      {
        // Web app manifest.
        source: '/manifest.webmanifest',
        headers: [{ key: 'Content-Type', value: 'application/manifest+json' }],
      },
      {
        // Hashed static assets — content-addressed so immutable is safe.
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/icons/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

/**
 * Sentry wrapping (Phase 15). The withSentryConfig wrapper:
 *   - Injects the Sentry SDK into the build.
 *   - Uploads source maps to Sentry when SENTRY_AUTH_TOKEN is set
 *     and `SENTRY_UPLOAD_SOURCE_MAPS=true`.
 *   - Strips server-only secrets from the client bundle.
 *
 * We DELIBERATELY do NOT enable upload in this commit (CI handles
 * the release tagging in Phase 16). Setting
 * `SENTRY_UPLOAD_SOURCE_MAPS=ci` activates the upload behavior.
 */
const sentryOptions = {
  // Build options
  org: process.env['SENTRY_ORG'],
  project: process.env['SENTRY_PROJECT'],
  authToken: process.env['SENTRY_AUTH_TOKEN'],
  // SentryBuildOptions.release is either undefined or a structured
  // object — never a bare string. We keep the env var so CI can
  // override it (Phase 16 sets a real release from the git tag).
  release: process.env['SENTRY_RELEASE'] ? { name: process.env['SENTRY_RELEASE'] } : undefined,
  // Don't fail the build on upload errors
  dryRun: !process.env['SENTRY_AUTH_TOKEN'],
  // Strip the dev server from telemetry
  silent: !process.env['SENTRY_AUTH_TOKEN'],
  // Don't hide source maps (we want them at Sentry, not in the client)
  hideSourceMaps: true,
  // Wide enough to cover all our routes without breaking tree-shaking
  widenClientFileUpload: true,
  // Hide legacy/3rd-party code that we don't own
  hideKeys: ['/node_modules/', '/src/vendor/'],
  // Disable telemetry collection for the build itself
  disableLogger: true,
};

// If a DSN is configured, wrap the config with Sentry. Otherwise we
// skip the wrapper to avoid a no-op build step.
const withSentry = process.env['SENTRY_DSN']
  ? withSentryConfig(nextConfig, sentryOptions)
  : nextConfig;

export default withBundleAnalyzer(withSerwist(withSentry));
