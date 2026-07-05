'use client';

import { ErrorFallback } from '@/components/error-fallback';

/**
 * Reader segment error boundary — SAD §8.3 exact copy:
 * "Failed to load book. Return to Library."
 */
export default function ReaderError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorFallback error={error} reset={reset} message="Failed to load book. Return to Library." />
  );
}
