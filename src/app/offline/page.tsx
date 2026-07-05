/**
 * /offline — offline fallback page (Phase 13, ISD §13.G).
 *
 * Rendered as the navigation fallback by the Serwist SW in src/app/sw.ts
 * (NetworkFirst handlerDidError redirects here when both the network
 * and the precache miss). Reachable at /offline when the user is
 * offline — Next.js still routes the request through App Router because
 * the page is a regular (non-private) segment.
 *
 * The page renders a friendly offline state + a list of the user's
 * downloaded books (client-side, via the offline-store mirror). When
 * the user is offline, this page is served from the precache so the
 * shell renders without a network round-trip.
 *
 * Phase 15 (ISD §15.H, Opus 4.8 deferred bug fix): the userId is
 * now derived from the URL (?u=<id>), from the in-memory offline
 * store's bookkeeping, or — as a final fallback — from a top-level
 * `<body data-user-id>` set by the (app) layout. The hardcoded 'me'
 * placeholder is GONE. Without a real userId we show an empty list
 * (the user can sign in to see their books).
 *
 * The page is reachable WITHOUT auth (the middleware exempts /offline),
 * so the userId may legitimately be unknown.
 */

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ROUTES } from '@/lib/routes';
import { useOfflineStore } from '@/store/offline-store';
import type { OfflineBookMeta } from '@/features/offline/book-store';
import { listOfflineMeta } from '@/features/offline/book-store';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Resolve the current userId from the best available signal.
 * Priority: query string > in-memory mirror > body data-attribute > null.
 *
 * The mirror is the most reliable signal (it was hydrated by the
 * (app) layout when the user was online), so we prefer it when
 * populated. The query string lets the SW route hand us the userId
 * even on a cold cold-start with no hydrated state.
 */
function resolveUserId(
  searchParams: URLSearchParams | null,
  mirrorHasData: boolean,
): string | null {
  if (typeof window === 'undefined') return null;
  if (searchParams) {
    const fromQuery = searchParams.get('u');
    if (fromQuery && fromQuery.length > 0) return fromQuery;
  }
  if (mirrorHasData) {
    // The mirror is per-user; if it has any entries we know we are
    // reading the right user's store. Use the body's data-user-id
    // attribute set by the (app) layout. (We can't recover the
    // userId from the IDB keys themselves without iterating the
    // entire keyspace, so the body attribute is the next-best signal.)
    const fromBody = document.body?.getAttribute('data-user-id');
    if (fromBody && fromBody.length > 0) return fromBody;
  }
  const fromBody = document.body?.getAttribute('data-user-id');
  if (fromBody && fromBody.length > 0) return fromBody;
  return null;
}

export default function OfflinePage() {
  // Read from the in-memory mirror first (zero-IO, instant render),
  // then refresh from IDB if needed.
  const inMemory = useOfflineStore((s) => s.offlineBooks);
  const hasHydrated = useOfflineStore((s) => s.hasHydrated);
  const [records, setRecords] = useState<OfflineBookMeta[]>([]);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Determine the real userId from the best available signal.
      // Phase 15 fix: no more 'me' hardcoding.
      const search =
        typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const mirrorHasData = Object.keys(inMemory).length > 0;
      const userId = resolveUserId(search, mirrorHasData);
      setResolvedUserId(userId);

      if (hasHydrated) {
        if (!cancelled) setRecords(Object.values(inMemory));
        return;
      }

      // Fall back to a direct IDB read if the (app) layout hasn't
      // hydrated yet. We only do this when we have a real userId.
      if (!userId) {
        if (!cancelled) setRecords([]);
        return;
      }
      try {
        const list = await listOfflineMeta(userId);
        if (!cancelled) {
          setRecords(list);
          const map: Record<string, OfflineBookMeta> = {};
          for (const m of list) map[m.bookId] = m;
          useOfflineStore.getState().setOfflineBooks(map);
        }
      } catch {
        // IDB unavailable — render the empty state.
        if (!cancelled) setRecords([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasHydrated, inMemory]);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <span aria-hidden="true" className="text-5xl">
        📚
      </span>
      <header>
        <h1 className="text-2xl font-bold text-gray-900">You&rsquo;re offline</h1>
        <p className="mt-2 text-sm text-gray-600">
          Don&rsquo;t worry — books you&rsquo;ve downloaded are still available below.
        </p>
      </header>

      <section
        aria-label="Available offline books"
        className="w-full rounded-lg border border-gray-200 bg-white p-5 text-left"
      >
        <h2 className="text-base font-semibold text-gray-900">
          {records.length > 0
            ? 'Available offline'
            : resolvedUserId
              ? 'No books downloaded yet'
              : 'Sign in to see your offline books'}
        </h2>

        {records.length > 0 ? (
          <ul className="mt-3 divide-y divide-gray-100">
            {records.map((book) => (
              <li key={book.bookId} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{book.title}</p>
                  {book.author && <p className="truncate text-xs text-gray-500">{book.author}</p>}
                </div>
                <Link
                  href={ROUTES.READER(book.bookId)}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                >
                  Read
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-gray-600">
            {resolvedUserId ? (
              <>
                When you&rsquo;re back online, open a book in the reader and tap
                <span className="mx-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">
                  Download for offline
                </span>
                to make it available without a connection.
              </>
            ) : (
              <>
                <Link
                  href={ROUTES.LOGIN}
                  className="font-medium text-indigo-600 underline-offset-2 hover:underline"
                >
                  Sign in
                </Link>{' '}
                to access your downloaded books.
              </>
            )}
          </p>
        )}
      </section>

      <div className="text-xs text-gray-500">
        {records.length > 0
          ? `Total size: ${formatBytes(records.reduce((acc, r) => acc + r.sizeBytes, 0))}`
          : ' '}
      </div>

      <Link
        href={ROUTES.DASHBOARD}
        className="text-sm font-medium text-indigo-600 underline-offset-2 hover:underline"
      >
        Try the dashboard
      </Link>
    </main>
  );
}
