'use client';

/**
 * ContinueReading component — displays books the user is currently reading.
 * ISD §10.I: Horizontal list of in-progress books with "Continue" CTA.
 */

import Link from 'next/link';
import type { BookWithProgressAndTimestamp } from '@/features/library/queries';
import { ROUTES } from '@/lib/routes';

interface ContinueReadingProps {
  books: BookWithProgressAndTimestamp[];
}

export function ContinueReading({ books }: ContinueReadingProps) {
  if (books.length === 0) {
    return null;
  }

  return (
    <section className="mb-8">
      <h2 className="mb-4 text-2xl font-bold">Continue Reading</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {books.map((book) => {
          const coverUrl = book.cover_key ? `/api/covers/${book.id}` : null;
          return (
            <Link
              key={book.id}
              href={ROUTES.READER(book.id)}
              className="group relative overflow-hidden rounded-lg border border-gray-200 transition-shadow hover:shadow-lg"
            >
              {/* Cover image */}
              <div className="relative aspect-[2/3] w-full bg-gray-100">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverUrl} alt={book.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center p-4 text-center text-sm text-gray-400">
                    {book.title}
                  </div>
                )}
              </div>

              {/* Progress bar */}
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-2">
                <div className="mb-1 flex items-center justify-between text-xs text-white">
                  <span className="truncate font-medium">{book.title}</span>
                  <span className="ml-2 shrink-0">{book.percentage}%</span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full bg-green-500 transition-all"
                    style={{ width: `${book.percentage}%` }}
                  />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
