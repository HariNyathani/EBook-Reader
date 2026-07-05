'use server';

import { revalidateTag } from 'next/cache';
import { requireApproved } from '@/features/auth/session';
import { createClient } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/result';
import type { ActionResult } from '@/lib/result';
import { libraryMutationSchema } from './schemas';
import { userLibraryTag } from './cache';

/**
 * Adds a book to the current user's "My Library".
 *
 * Security (ISD §8.S):
 * - Requires approved user (requireApproved)
 * - userId derived from session claims (never from client input)
 * - Uses request-scoped server client (RLS enforces ownership)
 * - Idempotent: uses ON CONFLICT DO NOTHING (unique constraint on user_id, book_id)
 *
 * Cache invalidation: Revalidates the per-user library tag.
 *
 * @param input - { bookId: string }
 */
export async function addToLibraryAction(input: unknown): Promise<ActionResult> {
  // Step 1: Authorization — derive userId from session claims
  let claims;
  try {
    claims = await requireApproved();
  } catch (err) {
    if ((err as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw err;
    return fail('Unauthorized', 'FORBIDDEN');
  }

  // Step 2: Validate input
  const parsed = libraryMutationSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.errors.map((e) => e.message).join('; '), 'INVALID_INPUT');
  }

  const { bookId } = parsed.data;

  // Step 3: Check if book exists (RLS ensures only approved users see books)
  const supabase = await createClient();
  const { data: book, error: bookError } = await supabase
    .from('books')
    .select('id')
    .eq('id', bookId)
    .limit(1)
    .single();

  if (bookError || !book) {
    return fail('Book not found', 'NOT_FOUND');
  }

  // Step 4: Insert into user_libraries (idempotent via unique constraint)
  // ISD-NOTE: We use double type assertion to work around Supabase's type inference bug
  const insertData = {
    user_id: claims.userId,
    book_id: bookId,
  };
  const { error } = await supabase
    .from('user_libraries')
    .insert(insertData as unknown as never)
    .select('id')
    .single();

  // If error is a unique constraint violation, treat as success (idempotent)
  if (error) {
    // Check if it's a unique constraint violation (Postgres error code 23505)
    const isDuplicate = error.code === '23505';
    if (!isDuplicate) {
      console.error('[addToLibraryAction] Supabase error:', error);
      return fail('Failed to add book to library', 'INTERNAL');
    }
    // Duplicate — already in library, treat as success
  }

  // Step 5: Revalidate per-user library cache
  revalidateTag(userLibraryTag(claims.userId));

  return ok();
}

/**
 * Removes a book from the current user's "My Library".
 *
 * Security (ISD §8.S):
 * - Requires approved user (requireApproved)
 * - userId derived from session claims (never from client input)
 * - Uses request-scoped server client (RLS enforces ownership)
 * - Idempotent: no-op if book not in library
 *
 * Cache invalidation: Revalidates the per-user library tag.
 *
 * @param input - { bookId: string }
 */
export async function removeFromLibraryAction(input: unknown): Promise<ActionResult> {
  // Step 1: Authorization — derive userId from session claims
  let claims;
  try {
    claims = await requireApproved();
  } catch (err) {
    if ((err as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw err;
    return fail('Unauthorized', 'FORBIDDEN');
  }

  // Step 2: Validate input
  const parsed = libraryMutationSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.errors.map((e) => e.message).join('; '), 'INVALID_INPUT');
  }

  const { bookId } = parsed.data;

  // Step 3: Delete from user_libraries (RLS ensures user can only delete own rows)
  const supabase = await createClient();
  const { error } = await supabase
    .from('user_libraries')
    .delete()
    .eq('user_id', claims.userId)
    .eq('book_id', bookId);

  if (error) {
    console.error('[removeFromLibraryAction] Supabase error:', error);
    return fail('Failed to remove book from library', 'INTERNAL');
  }

  // Step 4: Revalidate per-user library cache
  revalidateTag(userLibraryTag(claims.userId));

  return ok();
}
