import { listBooks } from '@/features/admin/books/queries';
import { AdminBooksTable } from '@/features/admin/books/components/admin-books-table';
import Link from 'next/link';
import { requireAdmin } from '@/features/auth/session';

/**
 * Admin books page — lists all uploaded books with delete actions.
 * Server Component; calls requireAdmin() for authorization.
 */
export default async function AdminBooksPage() {
  await requireAdmin();

  const { rows: books, total } = await listBooks();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Book Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            {total} book{total !== 1 ? 's' : ''} in the library
          </p>
        </div>
        <Link
          href="/admin/uploads"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          Upload New Book
        </Link>
      </div>

      <AdminBooksTable books={books} />
    </div>
  );
}
