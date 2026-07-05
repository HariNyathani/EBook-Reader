'use server';

import { revalidateTag, revalidatePath } from 'next/cache';
import { requireAdmin } from '@/features/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/result';
import type { ActionResult } from '@/lib/result';
import { epubKey, coverKey } from '@/lib/constants';
import { putObject, deleteObject, R2NotFoundError } from '@/lib/r2';
import { activeExtractor, EpubInvalidError, EpubEncryptedError, EpubParseError } from '@/lib/epub';
import { uploadMetaSchema, deleteBookSchema } from './schemas';
import { getMaxUploadBytes, ACCEPTED_EXT, ACCEPTED_MIME } from './constants';
import { uploadLimiter } from '@/lib/security/rate-limit';
import { logger } from '@/lib/logging/logger';

/**
 * Uploads a book EPUB file and creates a database record.
 *
 * Pipeline (SAD §6.1):
 * 1. requireAdmin() — verify admin authorization
 * 2. Validate file (presence, extension, MIME, size)
 * 3. Extract metadata (via activeExtractor — fallback in Phase 6, real in Phase 7)
 * 4. Upload EPUB to R2
 * 5. Upload cover to R2 if extracted (Phase 7+)
 * 6. Insert book record into database
 * 7. On DB failure: rollback R2 objects
 * 8. Revalidate library cache tag
 *
 * @param formData — FormData with fields: file (File), title? (string), author? (string)
 */
export async function uploadBookAction(
  formData: FormData,
): Promise<ActionResult<{ bookId: string }>> {
  // Step 1: Authorization
  let adminUserId: string;
  try {
    const claims = await requireAdmin();
    adminUserId = claims.userId;
  } catch (err) {
    if ((err as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw err;
    return fail('Unauthorized', 'FORBIDDEN');
  }

  // Step 1b: Rate-limit per admin user (defense against a runaway
  // admin client uploading too fast). 20/hour is generous; the
  // pipeline itself is slow (EPUB extraction + 2 R2 PUTs).
  const rl = await uploadLimiter(adminUserId);
  if (!rl.success) {
    logger.warn('rate_limit.exceeded', { policy: 'upload', userId: adminUserId });
    return fail(
      `Upload rate limit exceeded. Please try again in ${rl.retryAfter} seconds.`,
      'RATE_LIMITED',
    );
  }

  // Step 2: Validate file
  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return fail('No file provided', 'INVALID_FILE');
  }

  const filename = file.name.toLowerCase();
  const ext = filename.substring(filename.lastIndexOf('.'));

  if (!ACCEPTED_EXT.includes(ext as (typeof ACCEPTED_EXT)[number])) {
    return fail('Invalid file type. Only .epub files are accepted.', 'INVALID_FILE');
  }

  if (!ACCEPTED_MIME.includes(file.type as (typeof ACCEPTED_MIME)[number])) {
    return fail('Invalid MIME type. Only application/epub+zip is accepted.', 'INVALID_FILE');
  }

  const maxBytes = getMaxUploadBytes();
  if (file.size > maxBytes) {
    return fail(
      `File too large. Maximum size is ${Math.round(maxBytes / 1_048_576)} MB.`,
      'TOO_LARGE',
    );
  }

  // Parse optional metadata from form
  const title = formData.get('title') as string | null;
  const author = formData.get('author') as string | null;
  const metaParsed = uploadMetaSchema.safeParse({ title, author });
  if (!metaParsed.success) {
    return fail(metaParsed.error.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR');
  }

  // Read file bytes
  const fileBytes = new Uint8Array(await file.arrayBuffer());

  // Step 3: Generate book ID and keys
  const bookId = crypto.randomUUID();
  const fileK = epubKey(bookId);
  const coverK = coverKey(bookId);

  // Step 4: Extract metadata
  let meta;
  try {
    meta = await activeExtractor.extract({
      fileBytes,
      filename: file.name,
      formTitle: metaParsed.data.title,
      formAuthor: metaParsed.data.author,
    });
  } catch (err) {
    console.error('[uploadBookAction] Metadata extraction failed:', err);

    // Map EPUB errors to user-friendly messages (ISD §7.X)
    if (err instanceof EpubInvalidError || err instanceof EpubEncryptedError) {
      return fail('This file is not a valid or supported EPUB', 'INVALID_FILE');
    }
    if (err instanceof EpubParseError) {
      return fail('Failed to parse EPUB metadata', 'INVALID_FILE');
    }

    // Unexpected error
    return fail('Failed to extract metadata from EPUB', 'INVALID_FILE');
  }

  // Step 5: Upload EPUB to R2
  try {
    await putObject({
      key: fileK,
      body: fileBytes,
      contentType: 'application/epub+zip',
    });
  } catch (err) {
    console.error('[uploadBookAction] R2 upload failed:', err);
    return fail('Failed to upload EPUB to storage', 'UPLOAD_FAILED');
  }

  // Step 6: Upload cover to R2 if extracted (Phase 7+ — Phase 6 fallback has no cover)
  let coverUploaded = false;
  if (meta.cover) {
    try {
      await putObject({
        key: coverK,
        body: meta.cover.bytes,
        contentType: meta.cover.contentType,
      });
      coverUploaded = true;
    } catch (err) {
      console.error('[uploadBookAction] Cover upload failed:', err);
      // Non-fatal: continue without cover
      // Rollback EPUB
      try {
        await deleteObject(fileK);
      } catch (rollbackErr) {
        console.error('[uploadBookAction] Rollback failed:', rollbackErr);
      }
      return fail('Failed to upload cover to storage', 'UPLOAD_FAILED');
    }
  }

  // Step 7: Insert book record into database
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('books').insert({
      id: bookId,
      title: meta.title,
      author: meta.author,
      file_key: fileK,
      cover_key: meta.cover && coverUploaded ? coverK : null,
      format: 'epub',
    });

    if (error) {
      throw error;
    }
  } catch (err) {
    console.error('[uploadBookAction] DB insert failed:', err);
    // Rollback R2 objects
    try {
      await deleteObject(fileK);
    } catch (rollbackErr) {
      console.error('[uploadBookAction] EPUB rollback failed:', rollbackErr);
    }
    if (coverUploaded) {
      try {
        await deleteObject(coverK);
      } catch (rollbackErr) {
        console.error('[uploadBookAction] Cover rollback failed:', rollbackErr);
      }
    }
    return fail('Failed to save book record', 'DB_FAILED');
  }

  // Step 8: Revalidate library cache tag
  revalidateTag('library');
  revalidatePath('/admin/books');

  return ok({ bookId });
}

/**
 * Deletes a book and its associated R2 objects.
 *
 * Pipeline:
 * 1. requireAdmin() — verify admin authorization
 * 2. Validate bookId
 * 3. Look up book to get file_key and cover_key
 * 4. Delete database record (service-role)
 * 5. Delete R2 objects (best-effort, idempotent on missing)
 * 6. Revalidate library cache tag
 *
 * @param input — { bookId: string }
 */
export async function deleteBookAction(input: unknown): Promise<ActionResult> {
  // Step 1: Authorization
  try {
    await requireAdmin();
  } catch (err) {
    if ((err as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw err;
    return fail('Unauthorized', 'FORBIDDEN');
  }

  // Step 2: Validate
  const parsed = deleteBookSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.errors.map((e) => e.message).join('; '), 'VALIDATION_ERROR');
  }

  const { bookId } = parsed.data;

  // Step 3: Look up book
  const admin = createAdminClient();
  const { data: book, error: lookupError } = await admin
    .from('books')
    .select('file_key, cover_key')
    .eq('id', bookId)
    .single();

  if (lookupError || !book) {
    return fail('Book not found', 'NOT_FOUND');
  }

  // Step 4: Delete database record
  const { error: deleteError } = await admin.from('books').delete().eq('id', bookId);

  if (deleteError) {
    console.error('[deleteBookAction] DB delete failed:', deleteError);
    return fail('Failed to delete book record', 'DB_FAILED');
  }

  // Step 5: Delete R2 objects (best-effort, idempotent)
  try {
    await deleteObject(book.file_key);
  } catch (err) {
    if (!(err instanceof R2NotFoundError)) {
      console.error('[deleteBookAction] EPUB delete failed:', err);
    }
    // Idempotent: missing object is OK
  }

  if (book.cover_key) {
    try {
      await deleteObject(book.cover_key);
    } catch (err) {
      if (!(err instanceof R2NotFoundError)) {
        console.error('[deleteBookAction] Cover delete failed:', err);
      }
      // Idempotent: missing object is OK
    }
  }

  // Step 6: Revalidate
  revalidateTag('library');
  revalidatePath('/admin/books');

  return ok();
}
