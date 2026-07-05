'use client';

/**
 * UpdateAvailableToast — non-blocking banner for new SW availability.
 *
 * Listens for the `pwa:update-available` CustomEvent dispatched by the
 * ServiceWorkerRegistrar. When fired, it renders a polite (role=status,
 * aria-live=polite) banner with two actions:
 *   - "Reload" — dispatches `pwa:update-accept`, which the registrar
 *     translates into a SKIP_WAITING postMessage to the new worker,
 *     then reloads the page.
 *   - "Later" — dismisses the banner; the new SW takes over on the
 *     next navigation. We never force a mid-read reload.
 *
 * The banner is keyboard-operable, announced politely to screen
 * readers, and respects reduced-motion.
 */

import { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils/cn';

export function UpdateAvailableToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onAvailable = () => setVisible(true);
    window.addEventListener('pwa:update-available', onAvailable as EventListener);
    return () => {
      window.removeEventListener('pwa:update-available', onAvailable as EventListener);
    };
  }, []);

  const accept = useCallback(() => {
    // Tell the registrar to postMessage SKIP_WAITING + reload.
    window.dispatchEvent(new Event('pwa:update-accept'));
    setVisible(false);
  }, []);

  const dismiss = useCallback(() => setVisible(false), []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-auto fixed bottom-4 left-1/2 z-50 -translate-x-1/2 transform',
        'rounded-lg border border-indigo-200 bg-white px-4 py-3 shadow-lg',
        'flex items-center gap-3',
      )}
    >
      <span aria-hidden="true" className="text-indigo-500">
        ✨
      </span>
      <div className="text-sm text-gray-900">
        <strong className="font-semibold">Update available.</strong>
        <span className="ml-1 text-gray-600">A new version is ready.</span>
      </div>
      <button
        type="button"
        onClick={accept}
        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
      >
        Reload
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="rounded-md px-2 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-500"
      >
        Later
      </button>
    </div>
  );
}
