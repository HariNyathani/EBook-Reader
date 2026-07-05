'use client';

import { useEffect } from 'react';

/**
 * Registers /sw.js as the application's service worker.
 *
 * Guards:
 * - Only runs if `navigator.serviceWorker` is supported.
 * - Runs on window `load` to avoid blocking the critical rendering path.
 * - Registers in production by default; enable in dev via NEXT_PUBLIC_SW_DEV=true.
 *
 * Rendered from the root layout (src/app/layout.tsx).
 * Has no visible UI — returns null.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    const isDev = process.env.NODE_ENV === 'development';
    const forceInDev = process.env['NEXT_PUBLIC_SW_DEV'] === 'true';

    if (isDev && !forceInDev) return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          console.log('[SW] Registered, scope:', registration.scope);
        })
        .catch((err) => {
          console.error('[SW] Registration failed:', err);
        });
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
    }
  }, []);

  return null;
}
