'use client';

/**
 * Fetch book blob — opens an EPUB for the reader (Phase 13 + Phase 9).
 *
 * Phase 9 (ISD §9.F): downloads the EPUB from GET /api/books/[id]/file
 * (Phase 6) and returns an ephemeral objectURL for the engine. The
 * caller must call revoke() on unmount to prevent memory leaks.
 *
 * Phase 13 (ISD §13.H): if the user has previously downloaded the book
 * for offline reading, we **prefer the local copy** (faster, works
 * offline). The network fallback is only used when no local copy
 * exists.
 *
 * Security: The EPUB is fetched with credentials (cookie auth), held
 * only as an ephemeral Blob/objectURL, and revoked on unmount. Book
 * bytes in IndexedDB are per-user namespaced (Phase 13 scoped
 * exception to the no-persist invariant, ISD §13.0.2 A).
 */

import { ROUTES } from '@/lib/routes';
import { ReaderLoadError } from '../engine/types';
import { getOfflineBook, touchOfflineBook } from '@/features/offline/book-store';

/** Book load source — observable for tests / diagnostics. */
export type BookSource = 'offline' | 'network';

export interface BookBlobResult {
  /** The objectURL to pass to engine.open(). */
  objectURL: string;
  /** Call this to revoke the objectURL and free memory. */
  revoke: () => void;
  /** Where the bytes came from. */
  source: BookSource;
}

/**
 * Fetches the EPUB for a book and returns an objectURL + revoke function.
 *
 * Resolution order:
 *   1. Offline copy (IndexedDB, per-user) — preferred for already-downloaded
 *      books. The reader opens instantly, no network round-trip.
 *   2. Network: GET /api/books/[id]/file — fallback when no offline copy.
 *
 * @param bookId - The book UUID
 * @param userId - Current user id (from session claims, server-derived)
 * @param signal - Optional AbortSignal for cancellation (e.g., on unmount)
 * @returns A BookBlobResult with the objectURL, revoke function, and source
 * @throws ReaderLoadError if neither path yields a usable blob
 */
export async function fetchBookBlob(
  bookId: string,
  userId: string | null,
  signal?: AbortSignal,
): Promise<BookBlobResult> {
  // 1. Try the offline copy first.
  if (userId) {
    try {
      const offline = await getOfflineBook(userId, bookId);
      if (offline) {
        // Bump lastReadAt (LRU bump, fire-and-forget — never blocks the
        // open and never throws).
        void touchOfflineBook(userId, bookId).catch(() => undefined);
        const objectURL = URL.createObjectURL(offline.blob);
        return {
          objectURL,
          source: 'offline',
          revoke: () => {
            try {
              URL.revokeObjectURL(objectURL);
            } catch {
              // ignore — already revoked
            }
          },
        };
      }
    } catch (err) {
      // IDB unavailable or record corrupt — fall through to network.
      console.warn('[fetchBookBlob] offline lookup failed, falling back to network:', err);
    }
  }

  // 2. Network fallback.
  const url = ROUTES.READER(bookId).replace('/reader/', '/api/books/') + '/file';

  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      signal,
    });

    if (!response.ok) {
      switch (response.status) {
        case 401:
          throw new ReaderLoadError('Unauthorized: please log in', 'UNAUTHORIZED');
        case 403:
          throw new ReaderLoadError('Forbidden: access denied', 'FORBIDDEN');
        case 404:
          throw new ReaderLoadError('Book not found', 'NOT_FOUND');
        default:
          throw new ReaderLoadError(
            `Failed to fetch book: ${response.status} ${response.statusText}`,
            'NETWORK',
          );
      }
    }

    const blob = await response.blob();
    if (blob.size === 0) {
      throw new ReaderLoadError('Book file is empty or corrupt', 'CORRUPT');
    }

    const objectURL = URL.createObjectURL(blob);
    return {
      objectURL,
      source: 'network',
      revoke: () => {
        try {
          URL.revokeObjectURL(objectURL);
        } catch {
          // ignore
        }
      },
    };
  } catch (err) {
    if (err instanceof ReaderLoadError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ReaderLoadError('Fetch aborted', 'NETWORK');
    }
    throw new ReaderLoadError(
      err instanceof Error ? err.message : 'Failed to fetch book',
      'NETWORK',
    );
  }
}
