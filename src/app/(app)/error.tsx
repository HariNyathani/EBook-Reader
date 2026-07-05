'use client';

import { ErrorFallback } from '@/components/error-fallback';

/** (app) segment error boundary — catches errors in authenticated app pages. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorFallback error={error} reset={reset} message="Something went wrong in the app." />;
}
