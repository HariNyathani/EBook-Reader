import { z } from 'zod';
import { uuidSchema } from '@/lib/validation/primitives';

/**
 * Upload metadata schema — validates optional title/author overrides from the form.
 */
export const uploadMetaSchema = z.object({
  /** Optional title override (max 300 chars). */
  title: z.string().trim().max(300).optional(),
  /** Optional author override (max 200 chars). */
  author: z.string().trim().max(200).optional(),
});

export type UploadMetaInput = z.infer<typeof uploadMetaSchema>;

/**
 * Delete book schema — validates the bookId for deletion.
 */
export const deleteBookSchema = z.object({
  /** UUID of the book to delete. */
  bookId: uuidSchema,
});

export type DeleteBookInput = z.infer<typeof deleteBookSchema>;
