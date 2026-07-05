/**
 * Application-wide constants.
 *
 * SECURITY: The key builders below produce R2 object keys ONLY — never full URLs.
 * This is consistent with SAD §1.2 ("store keys, not URLs").
 * Full URLs must be constructed server-side via the R2 layer (src/lib/r2/).
 */

/** User role identifiers used in authorization checks. */
export const ROLES = {
  USER: 'user',
  ADMIN: 'admin',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/**
 * R2 object key builders — pure string functions, no I/O.
 * The R2 bucket name is NOT included here; it lives in serverEnv.R2_BUCKET.
 */

/**
 * Builds the R2 object key for a book's EPUB file.
 * @example epubKey('abc-123') === 'epubs/abc-123.epub'
 */
export function epubKey(bookId: string): string {
  return `epubs/${bookId}.epub`;
}

/**
 * Builds the R2 object key for a book's cover image.
 * @example coverKey('abc-123') === 'covers/abc-123.jpg'
 */
export function coverKey(bookId: string): string {
  return `covers/${bookId}.jpg`;
}
