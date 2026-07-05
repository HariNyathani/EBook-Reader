'use client';

/**
 * OfflineIndicator — top banner shown when the browser is offline.
 *
 * Renders a polite (aria-live="polite") status banner above the page
 * content. Hidden when online. No interactive controls — just
 * information. Color: amber for visibility without alarming the user.
 *
 * Uses the useNetworkStatus hook to ensure the listener is active
 * for the whole authenticated session; the hook also flushes the
 * offline progress queue on reconnect.
 */

import { useNetworkStatus } from '../use-network-status';

export function OfflineIndicator() {
  const { isOnline } = useNetworkStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-30 w-full bg-amber-100 px-4 py-2 text-center text-sm text-amber-900 shadow-sm"
    >
      <span aria-hidden="true" className="mr-1">
        ⚠️
      </span>
      You&rsquo;re offline. Books you&rsquo;ve downloaded are still available.
    </div>
  );
}
