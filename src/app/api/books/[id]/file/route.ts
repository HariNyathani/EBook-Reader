export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getClaims } from '@/features/auth/session';
import { getObjectStream, R2NotFoundError } from '@/lib/r2';
import { epubDeliveryHeaders } from '@/lib/http/headers';
import { cacheHeaderFor } from '@/lib/cache/http';
import type { Book } from '@/types';

/**
 * GET /api/books/[id]/file — Secure EPUB delivery route handler.
 *
 * Defense-in-depth authorization:
 * 1. Check session (401 if not authenticated)
 * 2. Check is_approved claim (403 if not approved)
 * 3. Look up book (RLS restricts to approved users)
 * 4. Stream EPUB from R2
 *
 * Response headers (SAD §2.1):
 * - Content-Type: application/epub+zip
 * - Content-Disposition: inline
 * - Cache-Control: no-store
 *
 * Never exposes R2 URLs — streams directly from R2 to client.
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

  // Step 3: Look up book (server client; RLS restricts to approved users)
  const supabase = await createClient();
  const { data, error } = await supabase.from('books').select('*').eq('id', id).limit(1);

  const books = (data as Book[] | null) ?? [];

  if (error || books.length === 0) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const book = books[0]!;

  // Step 4: Stream from R2
  try {
    const { body, contentLength } = await getObjectStream(book.file_key);

    const headers = epubDeliveryHeaders();
    // Phase 14 (ISD §14.H): re-affirm the no-store policy via the
    // centralized helper. epubDeliveryHeaders() already sets
    // `Cache-Control: no-store`, so this is defense-in-depth — the
    // value is sourced from the same CachePolicy enum that drives
    // other routes. A future change to the policy propagates here
    // automatically.
    headers['Cache-Control'] = cacheHeaderFor('no-store');
    if (contentLength > 0) {
      headers['Content-Length'] = contentLength.toString();
    }

    return new Response(body, {
      status: 200,
      headers,
    });
  } catch (err) {
    if (err instanceof R2NotFoundError) {
      return new NextResponse('File not found in storage', { status: 404 });
    }
    console.error('[GET /api/books/[id]/file] R2 error:', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
