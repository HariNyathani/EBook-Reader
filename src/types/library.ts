import type { Book } from './domain';

/**
 * Library view models (ISD §8.G library.ts).
 *
 * These types represent the composed data the dashboard needs to render.
 * They merge data from multiple tables (books, user_libraries, reading_progress).
 */

/**
 * A book with reading progress and library membership status.
 * Used by the dashboard grid and book details page.
 */
export interface BookWithProgress extends Book {
  /** Reading progress percentage (0–100). 0 if no progress row exists. */
  percentage: number;
  /** Whether this book is in the current user's "My Library". */
  inLibrary: boolean;
}

/**
 * The catalog view model — a page of books with total count for pagination.
 */
export interface CatalogView {
  rows: Book[];
  total: number;
}

/**
 * The "My Library" view model — books the user has added.
 */
export interface MyLibraryView {
  books: BookWithProgress[];
}
