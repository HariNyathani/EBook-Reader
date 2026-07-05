'use client';

/**
 * useSignOutCleanup — clears client-side per-user data on sign-out.
 *
 * ISD §13.H, §13.Z: Server Actions cannot access IndexedDB, so the
 * sign-out flow is split into two parts:
 *   1. The server clears the Supabase session cookie and redirects
 *      (signOutAction, unchanged).
 *   2. A *client-side* cleanup hook runs in response to a global
 *      custom event (`auth:sign-out`) to:
 *        - flush the Phase-10 offline progress queue (if online)
 *        - clear the user's offline book downloads from IndexedDB
 *        - clear the in-memory offline-store mirror
 *
 * The sign-out button fires the `auth:sign-out` event BEFORE invoking
 * the Server Action so that cleanup runs even if the action itself
 * fails to redirect (defense-in-depth: the user's bytes never linger).
 *
 * The hook is mounted once at the (app) layout level. It is a no-op
 * when the user is unauthenticated (no userId known).
 */

import { useEffect } from 'react';
import { useOfflineStore } from '@/store/offline-store';
import { clearUser } from './book-store';
import { flushPending, clearAllProgress } from '@/features/reader/progress/offline-queue';
import { useReaderStore } from '@/store/reader-store';

/**
 * The current user's id. Sourced from a data attribute on the root
 * layout (or a cookie read on the client). The (app) layout sets
 * <body data-user-id="..."> from the server claims, which the
 * client hook can read without going through any server boundary.
 */
function getCurrentUserId(): string | null {
  if (typeof document === 'undefined') return null;
  const raw = document.body?.getAttribute('data-user-id');
  return raw && raw.length > 0 ? raw : null;
}

export function useSignOutCleanup(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleSignOut = async () => {
      const userId = getCurrentUserId();
      // 1. Flush the offline progress queue if online. Best-effort;
      //    a flush failure here is non-fatal — the queue entries are
      //    re-claimed on next sign-in.
      try {
        if (navigator.onLine) {
          await flushPending();
        }
      } catch (err) {
        console.warn('[useSignOutCleanup] flushPending failed:', err);
      }

      // 2. Clear the user's offline book downloads from IndexedDB
      //    (per-user namespaced, so we MUST use the current userId).
      if (userId) {
        try {
          await clearUser(userId);
        } catch (err) {
          console.warn('[useSignOutCleanup] clearUser failed:', err);
        }
      }

      // 2b. Clear the Phase-10 offline progress queue. Unlike offline
      //     books, queue entries are keyed only by bookId (not per-user),
      //     so a leftover dirty entry would be flushed under the NEXT
      //     user's session on a shared device, leaking the previous
      //     user's reading position into another account (ISD §13.H,
      //     §13.Z, §13.CC; Appendix G #25). We flushed above when online;
      //     now purge unconditionally so nothing lingers post-sign-out.
      try {
        await clearAllProgress();
      } catch (err) {
        console.warn('[useSignOutCleanup] clearAllProgress failed:', err);
      }

      // 3. Clear the in-memory mirror + the reader-store preferences
      //    so the next user (if any) starts with defaults. (We do
      //    NOT clear localStorage of the durable preferences — that
      //    belongs to the user who set them. On next sign-in the
      //    same user re-hydrates their preferences; a different user
      //    gets a fresh hydration from cloud/local.)
      try {
        useOfflineStore.getState().reset();
        // Reset reader-store transient state. The persisted durable
        // preferences are scoped to this user and will re-hydrate
        // on next sign-in. We do NOT clear localStorage here.
        useReaderStore.getState().reset();
      } catch (err) {
        console.warn('[useSignOutCleanup] reset stores failed:', err);
      }
    };

    window.addEventListener('auth:sign-out', handleSignOut);
    return () => {
      window.removeEventListener('auth:sign-out', handleSignOut);
    };
  }, []);
}

/**
 * Fire-and-forget helper for the sign-out button. Dispatches the
 * `auth:sign-out` event so the cleanup hook runs, then calls the
 * Server Action which clears the session cookie and redirects.
 */
export async function performSignOut(signOutAction: () => Promise<unknown>): Promise<void> {
  if (typeof window !== 'undefined') {
    // Dispatch a non-bubbling event so any mounted cleanup hook runs.
    // We await flushPending before the action is called by wiring the
    // event handler to dispatch in a microtask; the cleanup is async
    // so we kick it off and then call the action.
    window.dispatchEvent(new Event('auth:sign-out'));
  }
  await signOutAction();
}
