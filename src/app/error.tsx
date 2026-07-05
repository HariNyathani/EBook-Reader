'use client';

import { ErrorFallback } from '@/components/error-fallback';

/** Root segment error boundary — catches errors in the root app segment. */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorFallback error={error} reset={reset} message="Something went wrong." />;
}
