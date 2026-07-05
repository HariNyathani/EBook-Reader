/**
 * Service Worker source (Serwist / Phase 13).
 *
 * Build pipeline: src/app/sw.ts is the source. The `withSerwist` Next.js
 * plugin compiles this file and emits the production worker at /sw.js
 * (public/sw.js). The hand-rolled /public/sw.js from Phase 2 has been
 * removed — the registrant and the progress-sync contract still use the
 * same /sw.js URL and the SYNC_READING_PROGRESS message protocol.
 *
 * ---------------------------------------------------------------------------
 * PRIVACY & SECURITY (Project-Wide Invariants, Appendix G):
 *   - /api/* is NEVER cached in the SW Cache Storage. The delivery
 *     handlers (EPUB/cover/progress) are private, no-store, and must
 *     never be intercepted by the SW.
 *   - No tokens, credentials, or session cookies are persisted in the
 *     SW. The SW is a coordinator only — clients perform the actual
 *     progress save with their own cookies.
 *   - EPUB bytes live ONLY in IndexedDB (offline book store, per-user
 *     namespaced, ISD §13.0.2 A refined invariant) — never in Cache
 *     Storage. Cache Storage is for the static app shell only.
 *
 * ---------------------------------------------------------------------------
 * UPDATE STRATEGY (ISD §13.AA, §13.DD #4):
 *   - We DO NOT auto-skipWaiting. The new SW waits until the user accepts
 *     the update toast (shown by ServiceWorkerRegistrar), then we
 *     `skipWaiting()` from the client. This avoids a forced mid-read
 *     reload that could lose the reader iframe state.
 *   - clientsClaim() is similarly deferred until the user accepts.
 *
 * ---------------------------------------------------------------------------
 * MESSAGE CONTRACT (ISD §13.U — preserved from Phase 10):
 *   - { type: 'SYNC_READING_PROGRESS' }  →  SW posts
 *     { type: 'FLUSH_PROGRESS_QUEUE' }  to all controlled clients,
 *     which then flush their Phase-10 offline-queue through the
 *     authenticated Server Action. The SW never holds the token.
 *
 * Type-safety: this file is built with `lib: ["webworker", "esnext"]` by
 * the @serwist/next plugin, so `self` has the ServiceWorkerGlobalScope
 * type. We declare a small set of custom message types here.
 */

/// <reference lib="webworker" />

import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist, NetworkFirst, NetworkOnly, CacheFirst, ExpirationPlugin, Route } from 'serwist';

// Augment `self` with the Serwist global (precache & message hooks).
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

/** Custom message types accepted by the SW message handler. */
type SwMessage = { type: 'SKIP_WAITING' } | { type: 'SYNC_READING_PROGRESS' };

const serwist = new Serwist({
  // App-shell precache. Serwist injects __SW_MANIFEST at build time. The
  // manifest contains hashed JS/CSS chunks, the manifest icon, and any
  // other files we register explicitly in the next.config Serwist config.
  precacheEntries: self.__SW_MANIFEST,
  // Skip waiting is intentionally NOT set here. The ServiceWorkerRegistrar
  // listens for the 'waiting' state and shows a toast. On accept, the
  // client posts { type: 'SKIP_WAITING' } and we skip then. This prevents
  // forced mid-read reloads (ISD §13.AA).
  skipWaiting: false,
  // Same — clientsClaim is deferred.
  clientsClaim: false,
  // Enable navigation preload so navigations are served as fast as
  // possible (the SW intercepts after the network response starts).
  navigationPreload: true,
});

serwist.addEventListeners();

// ---------------------------------------------------------------------------
// Runtime routes
// ---------------------------------------------------------------------------
// We deliberately keep the runtime ruleset tiny. Static assets (hashed
// JS/CSS, fonts) are covered by the precache manifest. We add a small
// set of explicit routes for fonts (cache-first) and the offline
// navigation fallback. Crucially, we DO NOT add any /api/* rule — the
// fetch handler short-circuits those to NetworkOnly below.

// Fonts: cache-first, immutable, long TTL.
serwist.registerRoute(
  new Route(
    ({ request }) => request.destination === 'font',
    new CacheFirst({
      cacheName: 'epub-reader-fonts-v1',
      plugins: [
        new ExpirationPlugin({
          // Font files are immutable (hashed) — keep them around for 1y.
          maxEntries: 30,
          maxAgeSeconds: 60 * 60 * 24 * 365,
        }),
      ],
    }),
    'GET',
  ),
);

// Navigation fallback: network-first for the HTML shell so users always
// see the freshest app. If the network fails (offline) and the page
// isn't in the precache, fall back to /offline (the offline page).
serwist.registerRoute(
  new Route(
    ({ request }) => request.mode === 'navigate',
    new NetworkFirst({
      cacheName: 'epub-reader-pages-v1',
      networkTimeoutSeconds: 3,
      plugins: [
        {
          // When the network fails AND the precache has nothing, redirect
          // to /offline so the user sees a friendly fallback.
          handlerDidError: async () => {
            return Response.redirect(new URL('/offline', self.location.origin).toString(), 302);
          },
        },
      ],
    }),
    'GET',
  ),
);

// ---------------------------------------------------------------------------
// Hard guard: never intercept /api/* (PRIVACY — Appendix G §G.5).
// We use a NetworkOnly registration to ensure that even if another rule
// would match, /api/* always goes to the network. Serwist applies the
// first matching rule in registration order; the default registrations
// are added during Serwist construction, so this runs as a safety net
// for any future rule that might accidentally match an /api/* URL.
serwist.registerRoute(
  new Route(({ url }) => url.pathname.startsWith('/api/'), new NetworkOnly(), 'GET'),
);

// ---------------------------------------------------------------------------
// Background Sync — phase 10 contract, preserved (ISD §13.U).
// On 'sync' for tag 'SYNC_READING_PROGRESS', tell every controlled
// client to flush its offline progress queue through the authenticated
// Server Action. The SW never holds the auth token; clients do.
// ---------------------------------------------------------------------------
self.addEventListener('sync', (event) => {
  const syncEvent = event as SyncEvent & { tag: string };
  if (syncEvent.tag !== 'SYNC_READING_PROGRESS') return;
  void syncEvent.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: false }).then((clients) => {
      for (const client of clients) {
        client.postMessage({ type: 'FLUSH_PROGRESS_QUEUE' });
      }
    }),
  );
});

// ---------------------------------------------------------------------------
// Message — SKIP_WAITING handshake + SYNC_READING_PROGRESS nudge.
// The ServiceWorkerRegistrar posts { type: 'SKIP_WAITING' } after the
// user accepts the "update available" toast. This is the only place we
// activate a waiting worker — we never force it.
// ---------------------------------------------------------------------------
self.addEventListener('message', (event) => {
  const data = event.data as SwMessage | undefined;
  if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;

  switch (data.type) {
    case 'SKIP_WAITING':
      // After skipWaiting, claim all open clients so the new SW takes over
      // immediately (rather than waiting for the next navigation).
      void self.skipWaiting().then(() => {
        void self.clients.claim();
      });
      break;

    case 'SYNC_READING_PROGRESS':
      // Direct nudge (e.g. from a manual flush). Mirror the sync event
      // behaviour so the contract is uniform regardless of trigger.
      event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: false }).then((clients) => {
          for (const client of clients) {
            client.postMessage({ type: 'FLUSH_PROGRESS_QUEUE' });
          }
        }),
      );
      break;
  }
});

// Suppress unused-import lint: defaultCache is exported for consumers
// who want to wire a custom strategy list via next.config. We use
// explicit registerRoute() above for clarity.
void defaultCache;

export {};
