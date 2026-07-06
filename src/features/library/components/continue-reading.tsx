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
    <section className="mb-12">
      <h2 className="mb-6 text-xl font-bold tracking-tight text-gray-900">Continue Reading</h2>
      <div className="flex gap-6 overflow-x-auto pb-6 snap-x -mx-4 px-4 sm:mx-0 sm:px-0 hide-scrollbar">
        {books.map((book) => {
          const coverUrl = book.cover_key ? `/api/covers/${book.id}` : null;
          return (
            <Link
              key={book.id}
              href={ROUTES.READER(book.id)}
              className="group relative flex-none w-72 sm:w-80 h-40 overflow-hidden rounded-2xl glass-panel shadow-glass hover:shadow-glass-hover transition-all duration-300 snap-center hover:scale-[1.02]"
            >
              {/* Blurred background extracted from cover */}
              {coverUrl && (
                <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={coverUrl} alt="" className="w-full h-full object-cover blur-2xl scale-110" />
                </div>
              )}
              
              <div className="relative z-10 flex h-full items-center gap-4 p-4">
                <div className="relative h-32 w-24 shrink-0 overflow-hidden rounded-lg shadow-book group-hover:shadow-book-hover transition-all duration-300">
                  {coverUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={coverUrl} alt={book.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-white p-2 text-center text-[10px] text-gray-400">
                      {book.title}
                    </div>
                  )}
                  <div className="absolute inset-0 ring-1 ring-inset ring-black/5 rounded-lg" />
                </div>

                <div className="flex flex-col h-full py-2 flex-1 min-w-0">
                  <h3 className="line-clamp-2 text-sm font-bold leading-tight text-gray-900 mb-1">{book.title}</h3>
                  {book.author && <p className="text-xs font-medium text-gray-500 line-clamp-1 mb-auto">{book.author}</p>}
                  
                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      <span>Progress</span>
                      <span>{book.percentage}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/5 shadow-inner">
                      <div
                        className="h-full bg-gray-900 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${book.percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
