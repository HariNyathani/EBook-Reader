'use client';

import { useTransition } from 'react';
import { BookCard } from '@/components/book-card';
import { ProgressBadge } from './progress-badge';
import type { BookWithProgress } from '@/types/library';
import { addToLibraryAction, removeFromLibraryAction } from '../actions';
import { useUiStore } from '@/store/ui-store';
import Link from 'next/link';
import { ROUTES } from '@/lib/routes';

interface LibraryGridProps {
  books: BookWithProgress[];
}

/**
 * Server component that renders a grid of book cards.
 * Each card displays cover, metadata, progress, and action buttons.
 */
export function LibraryGrid({ books }: LibraryGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {books.map((book) => (
        <BookCardWrapper key={book.id} book={book} />
      ))}
    </div>
  );
}

interface BookCardWrapperProps {
  book: BookWithProgress;
}

/**
 * Client component wrapper for BookCard with action buttons.
 * Handles add/remove library actions and displays progress.
 */
function BookCardWrapper({ book }: BookCardWrapperProps) {
  const [isPending, startTransition] = useTransition();
  const showToast = useUiStore((s) => s.showToast);

  async function handleAddRemove() {
    startTransition(async () => {
      const action = book.inLibrary ? removeFromLibraryAction : addToLibraryAction;
      const result = await action({ bookId: book.id });

      if (result.status === 'success') {
        showToast(
          book.inLibrary ? 'Removed from library' : 'Added to library',
          'success',
        );
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
      />
      {/* Progress badge overlay */}
      {book.percentage > 0 && (
        <div className="absolute right-2 top-2">
          <ProgressBadge percentage={book.percentage} />
        </div>
      )}
      {/* Action buttons overlay */}
      <div className="absolute bottom-2 left-2 right-2 flex gap-2">
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
    </div>
  );
}
