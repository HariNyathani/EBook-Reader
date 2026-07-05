'use client';

import { useEffect } from 'react';
import { useUiStore } from '@/store/ui-store';

/**
 * Registers /sw.js as the application's service worker.
 *
 * Phase 13 (Serwist, ISD §13.H): aligns the registration with the
 * Serwist-emitted worker and adds an **update-available** toast.
 *
 * Behavior:
 *   - The SW is registered on window load (after critical resources).
 *   - Registration is production by default; opt-in dev with
 *     `NEXT_PUBLIC_SW_DEV=true`.
 *   - When a new worker is found and is in `waiting` state, we show a
 *     polite toast: "Update available — reload". The user clicks
 *     "Reload" to accept (we postMessage SKIP_WAITING to the waiting
 *     worker and reload). The user can dismiss; the new worker takes
 *     over on the next navigation.
 *   - We deliberately do NOT call `skipWaiting()` from the SW side
 *     (Serwist is configured with skipWaiting: false). The user
 *     always retains control of when a mid-read reload happens.
 *
 * The component is server-safe (renders null) and has no visible UI;
 * the toast is rendered by the toast subscriber in (app)/layout.
 */
export function ServiceWorkerRegistrar() {
  const showToast = useUiStore((s) => s.showToast);

  useEffect(() => {
    const isDev = process.env.NODE_ENV === 'development';
    // Dot notation so Next.js inlines this NEXT_PUBLIC_* var into the client bundle
    // (bracket notation is not statically replaced and would be undefined in the browser).
    const forceInDev = process.env.NEXT_PUBLIC_SW_DEV === 'true';

    if (isDev && !forceInDev) return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    let updateCheckInterval: ReturnType<typeof setInterval> | null = null;
    let isDisposed = false;

    const register = () => {
      if (isDisposed) return;
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((registration) => {
          console.log('[SW] Registered, scope:', registration.scope);

          // Listen for new workers that have finished installing and are
          // waiting to take over.
          const trackWaitingWorker = (reg: ServiceWorkerRegistration) => {
            if (reg.waiting && reg.active) {
              promptForUpdate(reg.waiting);
            } else if (reg.installing) {
              const onInstallStateChange = () => {
                if (!reg.installing) return;
                if (reg.installing.state === 'installed' && reg.active) {
                  promptForUpdate(reg.installing);
                }
              };
              reg.installing.addEventListener('statechange', onInstallStateChange);
            }
          };

          // Listen for the browser to find a new SW.
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // A new SW is installed and waiting. Prompt the user.
                promptForUpdate(newWorker);
              }
            });
          });

          // Also check the current registration for a waiting worker (e.g.
          // if a previous session left one behind).
          trackWaitingWorker(registration);

          // Periodically check for updates (every 60 minutes). The browser
          // does this on its own when the user navigates, but the explicit
          // interval helps long-running PWA tabs.
          updateCheckInterval = setInterval(
            () => {
              void registration.update();
            },
            60 * 60 * 1000,
          );
        })
        .catch((err) => {
          console.error('[SW] Registration failed:', err);
        });
    };

    /**
     * Show a non-blocking "Update available" toast. The user clicks
     * "Reload" to skip-waiting the new worker and reload; otherwise the
     * new SW takes over on the next navigation (we do NOT force a
     * mid-read reload).
     */
    const promptForUpdate = (worker: ServiceWorker) => {
      // showToast with a custom action isn't part of the existing API,
      // so we emit a typed event the app can subscribe to. For now we
      // use a polite status toast; the (app)/layout also renders an
      // update banner that wires the SKIP_WAITING handshake below.
      window.dispatchEvent(new CustomEvent('pwa:update-available', { detail: { scope: '/' } }));
      void showToast('A new version is available — refresh to update.', 'info');
      // Wire a one-shot message handler that skips waiting when the
      // user clicks the action button. The UI for the button is
      // rendered by <UpdateAvailableToast/> in the (app) layout.
      const onAccept = () => {
        worker.postMessage({ type: 'SKIP_WAITING' });
        window.removeEventListener('pwa:update-accept', onAccept);
      };
      window.addEventListener('pwa:update-accept', onAccept);
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
    }

    return () => {
      isDisposed = true;
      if (updateCheckInterval) clearInterval(updateCheckInterval);
    };
  }, [showToast]);

  return null;
}
