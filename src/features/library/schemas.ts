import { z } from 'zod';
import { uuidSchema } from '@/lib/validation/primitives';
import { SORTS } from './constants';

/**
 * Schema for adding/removing a book to/from a user's library.
 * Only requires bookId — userId is derived from session claims server-side.
 */
export const libraryMutationSchema = z.object({
  bookId: uuidSchema,
});

export type LibraryMutationInput = z.infer<typeof libraryMutationSchema>;

/**
 * Schema for catalog query parameters (search, sort, page).
 * Uses coercion for URL search params (strings → numbers).
 */
export const catalogParamsSchema = z.object({
  query: z.string().trim().max(200).optional(),
  sort: z.enum(SORTS).default('recent'),
  page: z.coerce.number().int().positive().default(1),
});

export type CatalogParams = z.infer<typeof catalogParamsSchema>;
