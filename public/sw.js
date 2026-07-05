/**
 * EPUB Reader — Minimal Service Worker (Shell Only)
 *
 * Phase 2: App shell / static asset caching only.
 * Phase 5+: SYNC_READING_PROGRESS message handler will be implemented here.
 *
 * SECURITY: This SW must NEVER cache:
 *   - /api/* routes (authenticated, private data)
 *   - Any EPUB file bytes (private, no-store)
 *   - Any user-specific content
 */

const CACHE_NAME = 'epub-reader-shell-v1';

/** Static shell assets to pre-cache on install. */
const SHELL_ASSETS = ['/', '/dashboard', '/manifest.webmanifest', '/icons/icon-192.png'];

// ---------------------------------------------------------------------------
// Install — pre-cache app shell
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

// ---------------------------------------------------------------------------
// Activate — clean up old caches
// ---------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

// ---------------------------------------------------------------------------
// Fetch — cache-first for shell, network-only for everything else
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept API routes — always go to network
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Only cache GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Cache-first strategy for shell assets
  event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request)));
});

// ---------------------------------------------------------------------------
// Message — Phase 10: Offline reading progress sync
// ---------------------------------------------------------------------------
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SYNC_READING_PROGRESS') {
    // Notify all clients to flush their offline progress queue
    // ISD §10.I: SW acts as a coordinator, clients perform the actual sync
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'FLUSH_PROGRESS_QUEUE' });
        });
      })
    );
  }
});
