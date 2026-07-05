import type { NextConfig } from 'next';
import { securityHeaders } from './src/lib/http/headers';
import path from 'node:path';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Server Actions body size limit (Phase 6)
  // Required for EPUB uploads — default 1MB is too small for typical EPUB files
  // ISD §5·0.2 note (B): raised to 50MB to accommodate large EPUB uploads.
  // NOTE: `serverActions` MUST live under `experimental` — Next.js 15 reads
  // `experimental.serverActions.bodySizeLimit`. A top-level key is silently
  // ignored (NextConfig's index signature hides the typo from typecheck),
  // leaving the 1MB default and breaking any upload >1MB.
  experimental: {
    serverActions: {
      // SizeLimit is a `${number}mb`-style template type; env is a plain string.
      bodySizeLimit: (process.env['SERVER_ACTIONS_BODY_LIMIT'] ?? '50mb') as `${number}mb`,
    },
  },

  // ISD §9.E: foliate-js is vendored. The real <foliate-view> element
  // dynamic-imports several book-format adapters (CBZ, FB2, PDF, MOBI/KF8)
  // in addition to the EPUB one. We only support EPUB, so we alias those
  // dynamic imports to a stub module that throws an
  // `UnsupportedTypeError` at runtime. Without these aliases, webpack
  // fails at build time because the dynamic-import targets do not exist
  // on disk. The stub is in `src/vendor/foliate-js/stubs/`.
  webpack(config) {
    const stub = path.resolve(
      __dirname,
      'src/vendor/foliate-js/stubs/unsupported-format-stub.js',
    );
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
        // Apply security headers to all routes
        source: '/(.*)',
        headers: securityHeaders(),
      },
      {
        // Service worker must be served with no-cache and correct scope header.
        // Browsers require Cache-Control: no-cache for SW update detection.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        // Web app manifest — serve with correct MIME type
        source: '/manifest.webmanifest',
        headers: [{ key: 'Content-Type', value: 'application/manifest+json' }],
      },
    ];
  },

  // ISD-NOTE: Not using next/image for private cover bytes.
  // Private R2 covers are served via a Route Handler (/api/covers/[id]) that enforces
  // Cache-Control: private. next/image would add an optimization layer that could
  // accidentally cache private content. Using plain <img> in BookCard for now.
  // If next/image is needed in future, add remotePatterns for same-origin cover route only.
};

export default nextConfig;
