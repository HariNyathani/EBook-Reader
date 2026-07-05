'use client';

/**
 * AppShellProviders — client-side shell wiring for the (app) layout.
 *
 * Mounts the offline-related providers/hooks/listeners that need to
 * be active for the whole authenticated session:
 *   - useNetworkStatus: tracks online/offline + flushes progress on recovery
 *   - useSignOutCleanup: clears per-user IndexedDB on sign-out
 *   - useApprovalPurge: purges offline books on approval loss (Phase 15)
 *   - hydrateOfflineBooks(userId): one-shot IDB → store hydration
 *
 * Renders the visible offline affordances:
 *   - <OfflineIndicator/> — banner when offline
 *   - <InstallButton/>     — PWA install button in the header
 *   - <UpdateAvailableToast/> — new SW available (non-blocking)
 *
 * This component has no visible layout of its own — the parent layout
 * positions the children in the header/main. Slots are exported as
 * named pieces so the server layout can compose them.
 */

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useNetworkStatus } from '@/features/offline/use-network-status';
import { useSignOutCleanup } from '@/features/offline/use-sign-out-cleanup';
import { useApprovalPurge } from '@/features/offline/use-approval-purge';
import { hydrateOfflineBooks } from '@/features/offline/use-offline-book';
import { OfflineIndicator } from '@/features/offline/components/offline-indicator';
import { InstallButton } from '@/features/offline/components/install-button';
import { UpdateAvailableToast } from '@/components/pwa/update-available-toast';

interface AppShellProvidersProps {
  userId: string;
  /** Whether the user is currently approved (controls the approval-loss purge). */
  isApproved: boolean;
  children: ReactNode;
}

export function AppShellProviders({ userId, isApproved, children }: AppShellProvidersProps) {
  // Activate the network listener for the whole session.
  useNetworkStatus();
  // Activate the sign-out cleanup listener.
  useSignOutCleanup();
  // Phase 15: Activate the approval-loss purge listener.
  useApprovalPurge();

  // Sync the body's data-user-approved attribute so the purge hook can
  // detect transitions without crossing the server boundary.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.setAttribute('data-user-approved', isApproved ? 'true' : 'false');
  }, [isApproved]);

  // One-shot IDB → store hydration. We rebuild the in-memory mirror of
  // the user's offline downloads so the library can show "Available
  // offline" badges and the reader knows whether to prefer the local
  // copy. Errors are logged but not fatal — the UI just won't show
  // badges until a later hydrate succeeds.
  useEffect(() => {
    if (!userId) return;
    // Only hydrate if the user is currently approved (otherwise the
    // purge hook will have wiped the store and we don't want to
    // re-populate from a stale read).
    if (!isApproved) return;
    void hydrateOfflineBooks(userId).catch((err) => {
      console.warn('[AppShellProviders] hydrateOfflineBooks failed:', err);
    });
  }, [userId, isApproved]);

  return <>{children}</>;
}

/** Named slot for the header (install button). */
export function InstallSlot() {
  return <InstallButton />;
}

/** Named slot for the offline banner above the main content. */
export function OfflineSlot() {
  return <OfflineIndicator />;
}

/** Named slot for the floating update-available toast. */
export function UpdateSlot() {
  return <UpdateAvailableToast />;
}
