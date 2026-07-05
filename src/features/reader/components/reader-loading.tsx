'use client';

/**
 * ReaderLoading — full-screen loading state for the reader (ISD §11.G).
 *
 * Shown while the EPUB is being downloaded and parsed. Includes a
 * subtle progress hint when the fetch is streamed.
 *
 * The component does NOT import from the engine and never touches the
 * reader iframe (SAD §5.1). The download progress percentage is
 * optional and supplied by the parent (use-reader-engine can wire it
 * from a future fetch progress callback).
 */

import { Spinner } from '@/components/ui/spinner';

interface ReaderLoadingProps {
  /** Optional message under the spinner. */
  message?: string;
  /** Optional download progress 0..1 (undefined = indeterminate). */
  progress?: number;
}

export function ReaderLoading({ message = 'Opening your book…', progress }: ReaderLoadingProps) {
  const hasProgress = typeof progress === 'number' && progress >= 0 && progress <= 1;
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/30 backdrop-blur-sm"
    >
      <Spinner size={32} label="Loading" />
      <p className="text-sm font-medium text-gray-700">{message}</p>
      {hasProgress ? (
        <div className="h-1 w-48 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${Math.round((progress as number) * 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
