import { requireApproved } from '@/features/auth/session';
import {
  getCatalog,
  getMyLibrary,
  getProgressMap,
  getContinueReading,
} from '@/features/library/queries';
import { catalogParamsSchema } from '@/features/library/schemas';
import { LibraryGrid } from '@/features/library/components/library-grid';
import { CatalogToolbar } from '@/features/library/components/catalog-toolbar';
import { EmptyState } from '@/features/library/components/empty-state';
import { ContinueReading } from '@/features/library/components/continue-reading';
import type { BookWithProgress } from '@/types/library';
import { Suspense } from 'react';

export const metadata = {
  title: 'Dashboard — EPUB Reader',
  description: 'Your personal reading library.',
};

/**
 * Dashboard page — approved user's reading dashboard.
 * Displays "My Library" section and catalog grid with search/sort/pagination.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const claims = await requireApproved();
  const params = await searchParams;

  // Validate and normalize search params
  const catalogParams = catalogParamsSchema.parse({
    query: params.query,
    sort: params.sort,
    page: params.page,
  });

  // Fetch data in parallel
  const [catalog, myLibrary, progressMap, continueReading] = await Promise.all([
    getCatalog(catalogParams),
    getMyLibrary(claims.userId),
    getProgressMap(claims.userId),
    getContinueReading(claims.userId),
  ]);

  // Compose BookWithProgress view models
  const catalogWithProgress: BookWithProgress[] = catalog.rows.map((book) => ({
    ...book,
    percentage: progressMap[book.id] ?? 0,
    inLibrary: myLibrary.some((b) => b.id === book.id),
  }));

  const myLibraryWithProgress: BookWithProgress[] = myLibrary.map((book) => ({
    ...book,
    percentage: progressMap[book.id] ?? 0,
    inLibrary: true,
  }));

  const totalPages = Math.ceil(catalog.total / 24);

  return (
    <div className="mx-auto max-w-7xl space-y-10">
      {/* Header */}
      <div className="pt-2">
        <h1 className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-500 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
          Your Library
        </h1>
        <p className="mt-2 text-sm font-medium text-gray-500">
          Welcome back! Browse the catalog and manage your reading list.
        </p>
      </div>

      {/* My Library Section */}
      {myLibraryWithProgress.length > 0 && (
        <section>
          <h2 className="mb-5 text-xl font-bold tracking-tight text-gray-900">My Library</h2>
          <LibraryGrid books={myLibraryWithProgress} userId={claims.userId} />
        </section>
      )}

      {/* Continue Reading Section */}
      {continueReading.length > 0 && (
        <ContinueReading books={continueReading} />
      )}

      {/* Catalog Section */}
      <section>
        <h2 className="mb-5 text-xl font-bold tracking-tight text-gray-900">Browse Catalog</h2>
        <Suspense fallback={<div>Loading...</div>}>
          <CatalogToolbar />
        </Suspense>

        {catalogWithProgress.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="No books found"
              description={
                catalogParams.query
                  ? `No books match "${catalogParams.query}". Try a different search.`
                  : 'The catalog is empty. An administrator will add books soon.'
              }
              icon="📚"
            />
          </div>
        ) : (
          <>
            <div className="mt-6">
              <LibraryGrid books={catalogWithProgress} userId={claims.userId} />
            </div>

            {/* Pagination — floating glass pill */}
            {totalPages > 1 && (
              <div className="mt-10 flex justify-center">
                <nav className="glass-panel flex items-center gap-1 rounded-full p-1.5" aria-label="Pagination">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <a
                      key={page}
                      href={`?page=${page}${catalogParams.query ? `&query=${encodeURIComponent(catalogParams.query)}` : ''}&sort=${catalogParams.sort}`}
                      aria-current={page === catalogParams.page ? 'page' : undefined}
                      className={`flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-sm font-semibold transition-all ${
                        page === catalogParams.page
                          ? 'accent-gradient text-white shadow-accent-glow'
                          : 'text-gray-600 hover:bg-white/70 hover:text-gray-900 hover:shadow-sm'
                      }`}
                    >
                      {page}
                    </a>
                  ))}
                </nav>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
