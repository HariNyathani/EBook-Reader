'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addToLibraryAction, removeFromLibraryAction } from '../actions';
import { useUiStore } from '@/store/ui-store';

interface BookCardActionsProps {
  bookId: string;
  inLibrary: boolean;
}

/**
 * Client component for add/remove library actions.
 * Used in book details page.
 */
export function BookCardActions({ bookId, inLibrary }: BookCardActionsProps) {
  const [isPending, startTransition] = useTransition();
  const showToast = useUiStore((s) => s.showToast);
  const router = useRouter();

  async function handleToggle() {
    startTransition(async () => {
      const action = inLibrary ? removeFromLibraryAction : addToLibraryAction;
      const result = await action({ bookId });

      if (result.status === 'success') {
        showToast(inLibrary ? 'Removed from library' : 'Added to library', 'success');
        router.refresh();
      } else {
        showToast(result.message, 'error');
      }
    });
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-gray-300 transition-colors hover:bg-gray-50 disabled:opacity-50"
      aria-busy={isPending}
    >
      {isPending ? '...' : inLibrary ? 'Remove from Library' : 'Add to Library'}
    </button>
  );
}
