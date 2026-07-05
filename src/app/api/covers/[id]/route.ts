export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getClaims } from '@/features/auth/session';
import { getObjectStream, R2NotFoundError } from '@/lib/r2';
import { cacheHeaderFor } from '@/lib/cache/http';
import type { Book } from '@/types';

/**
 * GET /api/covers/[id] — Secure cover image delivery route handler.
 *
 * Defense-in-depth authorization:
 * 1. Check session (401 if not authenticated)
 * 2. Check is_approved claim (403 if not approved)
 * 3. Look up book (RLS restricts to approved users)
 * 4. Check cover_key exists (404 if null — no cover extracted)
 * 5. Stream cover from R2
 *
 * Response headers:
 * - Content-Type: image/jpeg
 * - Cache-Control: private, max-age=3600 (covers are static, safe to cache privately)
 *
 * Returns 404 if cover_key is null (Phase 6 fallback extracts no cover).
 * Phase 8 BookCard will render a placeholder on 404.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  // Steps 1 & 2: Authenticate + authorize via validated claims (getClaims uses
  // getUser() under the hood, which verifies the token with Supabase — unlike
  // getSession(), which trusts the raw cookie). Defense-in-depth beyond RLS.
  const claims = await getClaims();
  if (!claims) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  if (!claims.isApproved) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  // Step 3: Look up book
  const supabase = await createClient();
  const { data, error } = await supabase.from('books').select('*').eq('id', id).limit(1);

  const books = (data as Book[] | null) ?? [];

  if (error || books.length === 0) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const book = books[0]!;

  // Step 4: Check if cover exists
  if (!book.cover_key) {
    return new NextResponse('No cover available', { status: 404 });
  }

  // Step 5: Stream from R2
  try {
    const { body, contentLength } = await getObjectStream(book.cover_key);

    // Covers are always normalized to JPEG (coverKey → .jpg). Force the type
    // per ISD §6.T rather than trusting R2's stored content-type.
    const headers: Record<string, string> = {
      'Content-Type': 'image/jpeg',
      // Phase 14 (ISD §14.H): centralized cache policy. Covers are
      // `private, max-age=3600` — they are gated by auth, so a shared
      // cache would leak them. The CDN must not cache.
      'Cache-Control': cacheHeaderFor('private-short'),
      'X-Content-Type-Options': 'nosniff',
    };

    if (contentLength > 0) {
      headers['Content-Length'] = contentLength.toString();
    }

    return new Response(body, {
      status: 200,
      headers,
    });
  } catch (err) {
    if (err instanceof R2NotFoundError) {
      return new NextResponse('Cover not found in storage', { status: 404 });
    }
    console.error('[GET /api/covers/[id]] R2 error:', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
