'use client';

import { ErrorFallback } from '@/components/error-fallback';

/** Admin segment error boundary. */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorFallback error={error} reset={reset} message="Something went wrong in the admin panel." />
  );
}
