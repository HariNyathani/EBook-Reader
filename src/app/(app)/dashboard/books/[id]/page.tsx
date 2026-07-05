import { requireApproved } from '@/features/auth/session';
import { getBookById, getMyLibrary, getProgressMap } from '@/features/library/queries';
import { notFound } from 'next/navigation';
import { ProgressBadge } from '@/features/library/components/progress-badge';
import { BookCardActions } from '@/features/library/components/book-card-actions';
import Link from 'next/link';
import { ROUTES } from '@/lib/routes';

export const metadata = {
  title: 'Book Details — EPUB Reader',
  description: 'View book details and reading progress.',
};

/**
 * Book details page — displays cover, metadata, progress, and actions.
 */
export default async function BookDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const claims = await requireApproved();
  const { id } = await params;

  // Fetch data in parallel
  const [book, myLibrary, progressMap] = await Promise.all([
    getBookById(id),
    getMyLibrary(claims.userId),
    getProgressMap(claims.userId),
  ]);

  if (!book) {
    notFound();
  }

  const inLibrary = myLibrary.some((b) => b.id === book.id);
  const percentage = progressMap[book.id] ?? 0;

  return (
    <div className="mx-auto max-w-4xl">
      {/* Breadcrumb */}
      <nav className="mb-6">
        <Link
          href={ROUTES.DASHBOARD}
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          ← Back to Library
        </Link>
      </nav>

      <div className="grid gap-8 md:grid-cols-[300px_1fr]">
        {/* Cover */}
        <div className="space-y-4">
          <div className="aspect-[2/3] w-full overflow-hidden rounded-lg shadow-lg">
            {book.cover_key ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/covers/${book.id}`}
                alt={`Cover of ${book.title}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gray-100 text-gray-400">
                <span className="text-6xl">📖</span>
              </div>
            )}
          </div>
        </div>

        {/* Metadata */}
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{book.title}</h1>
            {book.author && (
              <p className="mt-2 text-lg text-gray-600">by {book.author}</p>
            )}
          </div>

          {/* Progress */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">Reading Progress:</span>
            <ProgressBadge percentage={percentage} />
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href={ROUTES.READER(book.id)}
              className="flex-1 rounded-lg bg-blue-600 px-6 py-3 text-center text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              {percentage > 0 ? 'Continue Reading' : 'Start Reading'}
            </Link>
            <BookCardActions bookId={book.id} inLibrary={inLibrary} />
          </div>

          {/* Metadata details */}
          <div className="space-y-3 border-t border-gray-200 pt-6">
            <div>
              <span className="text-sm font-medium text-gray-700">Format:</span>
              <span className="ml-2 text-sm text-gray-600">{book.format.toUpperCase()}</span>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-700">Added:</span>
              <span className="ml-2 text-sm text-gray-600">
                {new Date(book.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
