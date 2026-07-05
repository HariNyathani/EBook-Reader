'use client';

import { useTransition } from 'react';
import { BookCard } from '@/components/book-card';
import { ProgressBadge } from './progress-badge';
import type { BookWithProgress } from '@/types/library';
import { addToLibraryAction, removeFromLibraryAction } from '../actions';
import { useUiStore } from '@/store/ui-store';
import { useOfflineStore, selectIsDownloaded } from '@/store/offline-store';
import { OfflineToggle } from '@/features/offline/components/offline-toggle';
import Link from 'next/link';
import { ROUTES } from '@/lib/routes';

interface LibraryGridProps {
  books: BookWithProgress[];
  /** Current user id (server-derived). Required for the offline toggle. */
  userId: string;
}

/**
 * Server component that renders a grid of book cards.
 * Each card displays cover, metadata, progress, and action buttons.
 *
 * Phase 13 (ISD §13.H): each card shows an "Available offline" badge
 * (driven by the offline store) and a compact "Download for offline"
 * / "Available offline" toggle.
 */
export function LibraryGrid({ books, userId }: LibraryGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {books.map((book) => (
        <BookCardWrapper key={book.id} book={book} userId={userId} />
      ))}
    </div>
  );
}

interface BookCardWrapperProps {
  book: BookWithProgress;
  userId: string;
}

/**
 * Client component wrapper for BookCard with action buttons.
 * Handles add/remove library actions, displays progress, and wires
 * the per-book offline toggle.
 */
function BookCardWrapper({ book, userId }: BookCardWrapperProps) {
  const [isPending, startTransition] = useTransition();
  const showToast = useUiStore((s) => s.showToast);
  // Selective subscription — only re-renders when this book's
  // download status flips. (Phase 14 §14.W: selector discipline.)
  const isDownloaded = useOfflineStore(selectIsDownloaded(book.id));

  async function handleAddRemove() {
    startTransition(async () => {
      const action = book.inLibrary ? removeFromLibraryAction : addToLibraryAction;
      const result = await action({ bookId: book.id });

      if (result.status === 'success') {
        showToast(book.inLibrary ? 'Removed from library' : 'Added to library', 'success');
      } else {
        showToast(result.message, 'error');
      }
    });
  }

  const actionLabel = book.inLibrary ? 'Remove from library' : 'Add to library';

  return (
    <div className="relative">
      <BookCard
        title={book.title}
        author={book.author}
        coverSrc={book.cover_key ? `/api/covers/${book.id}` : undefined}
        availableOffline={isDownloaded}
      />
      {/* Progress badge overlay */}
      {book.percentage > 0 && (
        <div className="absolute right-2 top-2">
          <ProgressBadge percentage={book.percentage} />
        </div>
      )}
      {/* Action buttons overlay */}
      <div className="absolute bottom-2 left-2 right-2 flex flex-col gap-1">
        <div className="flex gap-2">
          <Link
            href={ROUTES.READER(book.id)}
            className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-center text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            Read
          </Link>
          <button
            onClick={handleAddRemove}
            disabled={isPending}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-gray-300 transition-colors hover:bg-gray-50 disabled:opacity-50"
            aria-busy={isPending}
            title={book.inLibrary ? 'Remove from library' : 'Add to library'}
          >
            {actionLabel}
          </button>
        </div>
        <OfflineToggle
          bookId={book.id}
          title={book.title}
          author={book.author}
          userId={userId}
          compact
        />
      </div>
    </div>
  );
}
