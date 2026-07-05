'use client';

/**
 * Global error boundary — catches errors in the root layout itself.
 * Must render <html><body> because the root layout is unavailable when this fires.
 * Per Next.js App Router docs, global-error.tsx replaces the entire page.
 */

import { ErrorFallback } from '@/components/error-fallback';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <ErrorFallback error={error} reset={reset} message="A critical error occurred." />
      </body>
    </html>
  );
}
