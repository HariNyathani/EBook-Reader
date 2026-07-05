import type { Metadata } from 'next';
import './globals.css';
import { ServiceWorkerRegistrar } from '@/components/pwa/service-worker-registrar';

export const metadata: Metadata = {
  title: 'EPUB Reader',
  description: 'A private, walled-garden EPUB reader web application.',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Phase 2: Registers /sw.js in production (no-op in dev unless NEXT_PUBLIC_SW_DEV=true) */}
        <ServiceWorkerRegistrar />
        {/* Phase 4: Auth session provider goes here */}
        {/* Phase 2: Error boundaries are per-segment (error.tsx files) — no wrapper needed here */}
      </body>
    </html>
  );
}
