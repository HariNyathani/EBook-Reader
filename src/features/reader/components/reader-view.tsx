'use client';

/**
 * ReaderView — client component that mounts the reader engine and renders the book.
 *
 * ISD §9.F: This is the main reader container. It creates a ref for the engine mount point,
 * calls useReaderEngine to initialize the engine, and renders the book with minimal navigation.
 *
 * Phase 10: Added progress sync and reading session tracking hooks.
 *
 * Security: The engine renders EPUB content in a sandboxed iframe. React never
 * directly accesses the iframe DOM (SAD §5.1).
 */

import { useRef } from 'react';
import { useReaderEngine } from '../hooks/use-reader-engine';
import { useProgressSync } from '../progress/use-progress-sync';
import { useReadingSession } from '../progress/use-reading-session';
import type { BookFormat } from '../engine/types';
import { useReaderStore } from '@/store/reader-store';

interface ReaderViewProps {
  /** The book UUID to render. */
  bookId: string;
  /** The book format (only 'epub' in Phase 9). */
  format: BookFormat;
  /** Optional initial CFI for resume reading (Phase 10). */
  initialCfi?: string;
}

/**
 * ReaderView — renders the book in a sandboxed engine container.
 *
 * This component:
 * 1. Creates a containerRef for the engine mount point
 * 2. Calls useReaderEngine to initialize the engine and bridge events ↔ store
 * 3. Renders the container + minimal temporary navigation controls
 * 4. Shows loading/error states
 */
export default function ReaderView({ bookId, format, initialCfi }: ReaderViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isReady = useReaderStore((s) => s.isReady);
  const theme = useReaderStore((s) => s.theme);

  // Initialize the engine (sole bridge between React and the engine)
  const { next, prev, goTo, toc, error, loading } = useReaderEngine({
    containerRef,
    bookId,
    format,
    initialCfi,
  });

  // Phase 10: Mount progress sync and reading session tracking
  useProgressSync(bookId);
  useReadingSession(bookId);

  // Map theme to background color for the container
  const bgColor = theme === 'dark' ? '#1a1a1a' : theme === 'sepia' ? '#f4ecd8' : '#ffffff';

  return (
    <div
      className="relative flex h-screen w-full flex-col"
      style={{ backgroundColor: bgColor }}
    >
      {/* Engine mount point — the engine renders into this div */}
      <div ref={containerRef} className="flex-1 overflow-hidden" />

      {/* Loading state */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-white">Loading book...</div>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white">
          <div className="mb-4 text-xl font-bold">Failed to load book</div>
          <div className="mb-4 text-sm">{error.message}</div>
          <button
            onClick={() => window.location.reload()}
            className="rounded bg-white px-4 py-2 text-black hover:bg-gray-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* Temporary navigation controls (Phase 9 verification only — Phase 11 replaces with chrome) */}
      {isReady && !loading && !error && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-4">
          <button
            onClick={prev}
            className="rounded bg-black/50 px-6 py-3 text-white hover:bg-black/70"
            aria-label="Previous page"
          >
            ← Prev
          </button>
          <button
            onClick={next}
            className="rounded bg-black/50 px-6 py-3 text-white hover:bg-black/70"
            aria-label="Next page"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * ReaderSkeleton — loading placeholder for the reader.
 * Shown by the dynamic wrapper while the component loads.
 */
export function ReaderSkeleton() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-100">
      <div className="text-gray-500">Loading reader...</div>
    </div>
  );
}
