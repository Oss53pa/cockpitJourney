/**
 * CockpitJourney Service Worker — PWA v4 (2026-05-21)
 * ====================================================
 *
 * Strategy:
 *   - App shell (index.html) → network-first, fall back to cache.
 *     Critical: stale index = stale env vars = "Supabase non configuré"
 *     bug we hit before. Always try the network first; only use cache
 *     when offline.
 *   - Hashed Vite assets (/assets/*-[hash].js|css) → cache-first.
 *     Filenames are content-addressed so a cached asset is always
 *     valid; no risk of staleness.
 *   - Static brand assets (/cj-icon-*, /cj-wordmark*, /fonts/*)
 *     → cache-first, long-lived.
 *   - Supabase API calls → never intercepted (passthrough).
 *
 * Versioning:
 *   - CACHE_VERSION bumps on every meaningful SW change.
 *   - On activate, every cache that doesn't match the current version
 *     is deleted — guarantees no zombie caches.
 *   - skipWaiting + clients.claim → users get the new SW immediately
 *     without needing to close every tab.
 *
 * Update flow for users:
 *   - main.tsx registers /sw.js on every page load
 *   - When the bytes change, the browser installs the new SW in
 *     parallel; on activate it claims all clients and they switch
 *     to the new bundle on the next request.
 */

const CACHE_VERSION = 'cj-v6-2026-05-25';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;

/** Files we precache so the app boots offline on first visit after install. */
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/cj-icon.svg',
  '/cj-icon-192.png',
  '/cj-icon-512.png',
  '/cj-wordmark.png',
  '/cj-wordmark@2x.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_SHELL_CACHE);
      // Best-effort precache — if a single asset 404s we don't fail install.
      await Promise.all(
        APP_SHELL.map((url) =>
          fetch(url, { cache: 'reload' })
            .then((res) => (res.ok ? cache.put(url, res) : null))
            .catch(() => null)
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop stale caches but KEEP previous `-assets` caches: those hold
      // content-hashed Vite chunks that a still-open tab on the old
      // index.html may need to load before the user reloads to the new
      // build. Otherwise the user gets a white screen on next click.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION) && !k.endsWith('-assets'))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // POST/PUT/DELETE never cached
  const url = new URL(req.url);

  // Never intercept cross-origin (Supabase, jsDelivr, Google Fonts, etc.)
  if (url.origin !== self.location.origin) return;

  // Hashed Vite assets — cache-first (immutable filenames).
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(req, ASSET_CACHE));
    return;
  }

  // Static brand assets — cache-first.
  if (
    url.pathname.startsWith('/cj-icon') ||
    url.pathname.startsWith('/cj-wordmark') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/favicon.ico'
  ) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // SPA navigation (HTML) — network-first, fallback to cached index.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(networkFirstHtml(req));
    return;
  }

  // Default: try network, then cache.
  event.respondWith(networkFirstAny(req));
});

/* ───────── Strategy helpers ───────── */

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const fallback = await caches.match(request);
    if (fallback) return fallback;
    throw err;
  }
}

async function networkFirstHtml(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(APP_SHELL_CACHE);
    cache.put('/index.html', fresh.clone());
    return fresh;
  } catch {
    const cache = await caches.open(APP_SHELL_CACHE);
    return (
      (await cache.match(request)) ||
      (await cache.match('/index.html')) ||
      new Response(
        '<!doctype html><html><body style="font-family:sans-serif;padding:48px;text-align:center"><h1>Hors ligne</h1><p>CockpitJourney est inaccessible. Reconnectez-vous.</p></body></html>',
        { headers: { 'Content-Type': 'text/html' }, status: 503 }
      )
    );
  }
}

async function networkFirstAny(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error('offline');
  }
}

/* Allow the page to ask the SW to skip-waiting. */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
