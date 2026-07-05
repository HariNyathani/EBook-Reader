/**
 * Library feature constants (ISD §8.G constants.ts).
 */

/** Default page size for catalog pagination. */
export const LIBRARY_PAGE_SIZE = 24;

/** Sort options for the catalog. */
export const SORTS = ['recent', 'title', 'author'] as const;

export type SortOption = (typeof SORTS)[number];
