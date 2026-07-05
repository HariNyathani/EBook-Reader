'use client';

import Link from 'next/link';
import { ROUTES } from '@/lib/routes';

interface ErrorFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Override the "Return to Library" destination. Defaults to ROUTES.DASHBOARD. */
  homeHref?: string;
  /** Override the primary message shown to the user. */
  message?: string;
}

/**
 * Reusable error fallback UI rendered by per-segment error.tsx boundaries.
 * Per SAD §8.3: each segment has its own boundary; the reader segment uses
 * the exact copy "Failed to load book. Return to Library."
 */
export function ErrorFallback({
  error,
  reset,
  homeHref = ROUTES.DASHBOARD,
  message = 'Something went wrong.',
}: ErrorFallbackProps) {
  // Log to console; a real error reporting service (e.g. Sentry) would be wired here.
  console.error('[ErrorBoundary]', error);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={24}
          height={24}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <p className="max-w-sm text-base font-medium">{message}</p>

      {process.env.NODE_ENV === 'development' && error.message && (
        <pre className="bg-foreground/5 text-foreground/60 max-w-md overflow-auto rounded p-3 text-left text-xs">
          {error.message}
          {error.digest ? `\nDigest: ${error.digest}` : ''}
        </pre>
      )}

      <div className="flex gap-3">
        <button
          onClick={reset}
          className="border-foreground/20 hover:bg-foreground/5 rounded-md border px-4 py-2 text-sm font-medium"
        >
          Try again
        </button>
        <Link
          href={homeHref}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          Return to Library
        </Link>
      </div>
    </div>
  );
}
