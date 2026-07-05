import type { NextConfig } from 'next';
import { securityHeaders } from './src/lib/http/headers';

const nextConfig: NextConfig = {
  reactStrictMode: true,

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
