import { requireApproved } from '@/features/auth/session';
import { getBookById, getProgressForBook } from '@/features/library/queries';
import { notFound } from 'next/navigation';
import ReaderView from '@/features/reader/components/reader-view.dynamic';

/**
 * Reader page — server component that fetches the book and renders the client-side ReaderView.
 *
 * Phase 9 (ISD §9.F): Replaces the Phase 1 placeholder. This is a server component that:
 * 1. Calls requireApproved() to enforce auth + approval (defense-in-depth)
 * 2. Fetches the book via getBookById() (Phase 8)
 * 3. Renders the dynamic ReaderView (client-only, ssr: false)
 *
 * Phase 10: Fetch initial progress and pass initialCfi for resume reading.
 *
 * Phase 13: Passes the current userId to the reader so fetchBookBlob can
 * prefer the offline copy (IndexedDB) when present.
 *
 * ISD §9.L: Route is force-dynamic (auth + per-book).
 */
interface ReaderPageProps {
  params: Promise<{ bookId: string }>;
}

export const dynamic = 'force-dynamic';

export default async function ReaderPage({ params }: ReaderPageProps) {
  const { bookId } = await params;

  // Defense-in-depth: requireApproved() enforces auth + approval at the layout level,
  // but we call it here as well for explicitness and to fail fast.
  const claims = await requireApproved();

  // Fetch the book metadata and saved progress in parallel
  const [book, initialCfi] = await Promise.all([
    getBookById(bookId),
    getProgressForBook(claims.userId, bookId),
  ]);

  if (!book) {
    notFound();
  }

  // Render the client-side reader (dynamic import, ssr: false)
  return (
    <main className="h-screen w-full overflow-hidden">
      <ReaderView
        bookId={bookId}
        userId={claims.userId}
        format={book.format}
        initialCfi={initialCfi ?? undefined}
        bookTitle={book.title}
      />
    </main>
  );
}
