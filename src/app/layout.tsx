import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ServiceWorkerRegistrar } from '@/components/pwa/service-worker-registrar';
import { ReportVitals } from '@/lib/perf/report-vitals';
import { LiveAnnouncer } from '@/components/a11y/announcer';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Librea',
  description: 'A private, walled-garden EPUB reader web application.',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">
        {children}
        {/* Phase 2: Registers /sw.js in production (no-op in dev unless NEXT_PUBLIC_SW_DEV=true) */}
        <ServiceWorkerRegistrar />
        {/* Phase 14: Web Vitals monitoring (no visible UI). PII-free. */}
        <ReportVitals />
        {/* Phase 15 (ISD §15.AA): Shared ARIA live region for SR announcements. */}
        <LiveAnnouncer />
      </body>
    </html>
  );
}
