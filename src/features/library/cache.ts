/**
 * Library cache tag helpers (ISD §8.G cache.ts).
 *
 * These tags are used with `unstable_cache` for cache invalidation.
 * Per-user caches MUST include the userId in both the cache key and tag
 * to prevent cross-user data leakage (ISD §8.Z).
 */

/** Shared cache tag for the book catalog (same for all approved users). */
export const LIBRARY_TAG = 'library';

/**
 * Per-user cache tag for "My Library" collections.
 * Includes userId to prevent cross-user leakage.
 */
export function userLibraryTag(userId: string): string {
  return `library:${userId}`;
}

/**
 * Per-user cache tag for reading progress.
 * Includes userId to prevent cross-user leakage.
 */
export function progressTag(userId: string): string {
  return `progress:${userId}`;
}
