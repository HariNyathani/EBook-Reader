'use client';

/**
 * Fetch book blob — downloads the EPUB via the gated handler and creates an ephemeral objectURL.
 *
 * ISD §9.F: This utility fetches the EPUB from GET /api/books/[id]/file (Phase 6),
 * converts it to a Blob, and creates an ephemeral objectURL for the engine to open.
 * The caller must call revoke() on unmount or error to prevent memory leaks.
 *
 * Security: The EPUB is fetched with credentials (cookie auth), held only as an
 * ephemeral Blob/objectURL, and revoked on unmount. No book bytes are persisted
 * to disk/IndexedDB in Phase 9 (Phase 10 adds progress persistence, not book bytes).
 */

import { ROUTES } from '@/lib/routes';
import { ReaderLoadError } from '../engine/types';

/**
 * Result of fetching a book blob.
 * The caller must call revoke() to release the objectURL when done.
 */
export interface BookBlobResult {
  /** The objectURL to pass to engine.open(). */
  objectURL: string;
  /** Call this to revoke the objectURL and free memory. */
  revoke: () => void;
}

/**
 * Fetches the EPUB for a book and returns an objectURL + revoke function.
 *
 * @param bookId - The book UUID
 * @param signal - Optional AbortSignal for cancellation (e.g., on unmount)
 * @returns A BookBlobResult with the objectURL and revoke function
 * @throws ReaderLoadError if the fetch fails (401/403/404/network)
 */
export async function fetchBookBlob(
  bookId: string,
  signal?: AbortSignal,
): Promise<BookBlobResult> {
  const url = ROUTES.READER(bookId).replace('/reader/', '/api/books/') + '/file';

  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      signal,
    });

    // Map HTTP status codes to typed errors
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

    // Read the response as a Blob
    const blob = await response.blob();

    // Validate that we got a non-empty blob
    if (blob.size === 0) {
      throw new ReaderLoadError('Book file is empty or corrupt', 'CORRUPT');
    }

    // Create an ephemeral objectURL
    const objectURL = URL.createObjectURL(blob);

    // Return the URL and a revoke function
    return {
      objectURL,
      revoke: () => {
        try {
          URL.revokeObjectURL(objectURL);
        } catch {
          // Ignore errors (e.g., if already revoked)
        }
      },
    };
  } catch (err) {
    // If it's already a ReaderLoadError, re-throw
    if (err instanceof ReaderLoadError) {
      throw err;
    }

    // Check if the fetch was aborted
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ReaderLoadError('Fetch aborted', 'NETWORK');
    }

    // Network error or other failure
    throw new ReaderLoadError(
      err instanceof Error ? err.message : 'Failed to fetch book',
      'NETWORK',
    );
  }
}
