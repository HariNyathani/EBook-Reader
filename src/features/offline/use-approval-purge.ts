'use client';

/**
 * useApprovalPurge — Phase 15 (ISD §15.H, §13.0.2 A, §13.Z).
 *
 * Implements the "approval-loss purge": when the user is signed in but
 * the `is_approved` claim becomes false (e.g. an admin revoked their
 * access while they were online), we must purge the user's offline
 * book downloads on the next authed load. The reader still works
 * ephemerally online only; previously-downloaded bytes must not be
 * accessible to a now-revoked user.
 *
 * The signal comes from the (app) layout's <body data-user-id> +
 * data-user-approved attributes (Phase 15 addition). When the hook
 * detects that `data-user-approved` is "false" (or missing) and the
 * in-memory mirror still contains entries, it calls `clearUser` and
 * resets the offline store.
 *
 * This is the client-side half of the purge. The server-side half
 * (refusing to serve /api/books/.../file for an unapproved user) is
 * already enforced by the route handler.
 */

import { useEffect, useRef } from 'react';
import { useOfflineStore } from '@/store/offline-store';
import { clearUser } from './book-store';
import { logger } from '@/lib/logging/logger';

const ENABLED_FLAG = 'epub-reader.approval-purge.enabled';

function getUserId(): string | null {
  if (typeof document === 'undefined') return null;
  const raw = document.body?.getAttribute('data-user-id');
  return raw && raw.length > 0 ? raw : null;
}

/**
 * Reads the data-user-approved attribute (set by the (app) layout
 * from the server claims). Returns true when the value is exactly
 * 'true' (string). Returns false for any other value (including
 * 'false', null, or missing).
 */
function getIsApproved(): boolean {
  if (typeof document === 'undefined') return false;
  const raw = document.body?.getAttribute('data-user-approved');
  return raw === 'true';
}

/**
 * Once a user has had their approval-loss purge performed in this
 * session, we mark it in localStorage so we do not run the purge
 * again for the same unapproved session. The flag is keyed by
 * userId so a re-approval does not skip the next revocation.
 */
function markPurgeCompleted(userId: string): void {
  try {
    if (typeof window === 'undefined') return;
    const key = `${ENABLED_FLAG}.${userId}`;
    window.localStorage.setItem(key, new Date().toISOString());
  } catch {
    /* localStorage may be unavailable (private mode); best-effort */
  }
}

function hasPurgeCompleted(userId: string): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(`${ENABLED_FLAG}.${userId}`) !== null;
  } catch {
    return false;
  }
}

/**
 * Mount inside the (app) layout. Performs the purge once per
 * (user, loss-of-approval) transition.
 */
export function useApprovalPurge(): void {
  // Avoid running the effect more than once per (user, approval)
  // transition. We use a ref to track the last-seen state.
  const lastUserId = useRef<string | null>(null);
  const lastApproved = useRef<boolean | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const userId = getUserId();
    const isApproved = getIsApproved();

    // No user / not signed in: nothing to purge.
    if (!userId) return;

    // User is approved: reset our tracking and clear the purge flag
    // so a future revocation fires correctly.
    if (isApproved) {
      lastUserId.current = userId;
      lastApproved.current = true;
      // If they were previously revoked and have been re-approved,
      // their downloads would already have been purged — they will
      // need to re-download books they want offline.
      return;
    }

    // User is NOT approved. If we've already purged in this session
    // for this user, do nothing.
    if (hasPurgeCompleted(userId)) {
      lastUserId.current = userId;
      lastApproved.current = false;
      return;
    }

    // If we just transitioned approved→unapproved (or the user is
    // unapproved and we've never seen them before this session), run
    // the purge.
    if (lastUserId.current === userId && lastApproved.current === true) {
      void runPurge(userId);
      return;
    }
    if (lastUserId.current !== userId && lastApproved.current === null) {
      // First read of an unapproved user in this session — purge.
      void runPurge(userId);
      return;
    }

    // Update tracking refs (best-effort).
    lastUserId.current = userId;
    lastApproved.current = false;
  }, []);
}

/** Run the actual purge; separated for testability. */
async function runPurge(userId: string): Promise<void> {
  try {
    const removed = await clearUser(userId);
    useOfflineStore.getState().reset();
    markPurgeCompleted(userId);
    logger.info('approval_loss.purged', { userId, removed });
  } catch (err) {
    logger.warn('approval_loss.purge_failed', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Test-only: reset the per-user purge flag. Used by tests that
 * simulate a revoke→re-approve→revoke sequence.
 */
export function _resetApprovalPurgeForTests(userId: string): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(`${ENABLED_FLAG}.${userId}`);
  } catch {
    /* ignore */
  }
}
