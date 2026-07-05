'use client';

import { useActionState, useEffect } from 'react';
import { deleteBookAction } from '@/features/admin/upload/actions';
import { useUiStore } from '@/store/ui-store';
import type { Book } from '@/types';

interface AdminBooksTableProps {
  books: Book[];
}

/**
 * Client component — delete action cell for a book row.
 */
function DeleteBookCell({ bookId }: { bookId: string }) {
  const showToast = useUiStore((s) => s.showToast);

  const [state, formAction, pending] = useActionState(async () => {
    // Confirm deletion
    if (!confirm('Are you sure you want to delete this book? This cannot be undone.')) {
      return null;
    }
    return deleteBookAction({ bookId });
  }, null);

  useEffect(() => {
    if (state?.status === 'success') {
      showToast('Book deleted successfully.', 'success');
    } else if (state?.status === 'error') {
      showToast(state.message, 'error');
    }
  }, [state, showToast]);

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
      >
        {pending ? '…' : 'Delete'}
      </button>
    </form>
  );
}

/**
 * Admin books table — server component rendering book list with delete actions.
 */
export function AdminBooksTable({ books }: AdminBooksTableProps) {
  if (books.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-500">
          No books uploaded yet. Go to{' '}
          <a href="/admin/uploads" className="text-blue-600 hover:underline">
            Uploads
          </a>{' '}
          to add your first book.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Title</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Author</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Format</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Cover</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Added</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {books.map((book) => (
            <tr key={book.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{book.title}</td>
              <td className="px-4 py-3 text-gray-600">{book.author ?? '—'}</td>
              <td className="px-4 py-3 text-gray-500">
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium uppercase">
                  {book.format}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-500">
                {book.cover_key ? (
                  <span className="text-emerald-600">✓</span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-gray-500">
                {new Date(book.created_at).toLocaleDateString()}
              </td>
              <td className="px-4 py-3">
                <DeleteBookCell bookId={book.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
