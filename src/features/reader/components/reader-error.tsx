'use client';

/**
 * ReaderError — in-reader error/retry UI (ISD §11.G, §11.X).
 *
 * Shown when the engine fails to load the book or the engine emits an
 * error event. Coordinates with the Phase-2 error boundary:
 *   - "Retry" remounts the engine (by reloading the page) so a fresh
 *     useReaderEngine instance is created.
 *   - "Return to Library" navigates back to the dashboard.
 *
 * The component does NOT import the engine; it only renders UI.
 */

import Link from 'next/link';
import { ROUTES } from '@/lib/routes';

interface ReaderErrorProps {
  error: Error;
  onRetry: () => void;
}

export function ReaderError({ error, onRetry }: ReaderErrorProps) {
  // Map common error codes to user-friendly messages.
  const isPermission = /403|forbidden/i.test(error.message);
  const isNotFound = /404|not found/i.test(error.message);
  const title = isPermission
    ? 'You don’t have access to this book'
    : isNotFound
      ? 'This book couldn’t be found'
      : 'Something went wrong opening this book';
  return (
    <div
      role="alert"
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/40 p-6 text-center text-white"
    >
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
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-md text-sm opacity-80">{error.message}</p>
      <div className="mt-2 flex gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-white/30 bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20"
        >
          Try again
        </button>
        <Link
          href={ROUTES.DASHBOARD}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gray-200"
        >
          Return to Library
        </Link>
      </div>
    </div>
  );
}
