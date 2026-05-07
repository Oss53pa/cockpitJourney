// CockpitJourney Service Worker — KILL SWITCH (v2026-05-07)
//
// We previously shipped an offline-first cache SW that, in practice,
// trapped users on a stale build whenever the bundle changed (especially
// during the multi-tenant Supabase migration where stale env vars meant
// "Supabase non configuré" even after the new build was deployed).
//
// This version unregisters itself, drops every cache it owns, and tells
// every controlled tab to reload. It runs ONCE per browser per user, then
// becomes inert. PWA / offline support will be re-introduced later with a
// proper versioning + skip-waiting strategy and an in-app "update ready"
// banner — see README "PWA roadmap".
//
// Note: main.tsx still registers `/sw.js` in production builds. That's
// intentional — once registered, this SW immediately self-destructs, so
// browsers that picked up the old bad SW get cleaned up the next time
// they visit the app.

self.addEventListener('install', (event) => {
  // Activate immediately; don't wait for old controlled pages to close.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 1. Wipe every cache this origin owns.
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((k) => caches.delete(k)));

      // 2. Take control so the unregister + reload affects all open tabs.
      await self.clients.claim();

      // 3. Unregister this SW. After this, the page is no longer SW-controlled.
      await self.registration.unregister();

      // 4. Reload every controlled client so they re-fetch from the
      //    network (and from now on, never go through a SW).
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.navigate(client.url);
      }
    })()
  );
});

// Pass-through: if any fetch event sneaks in before unregister completes,
// just go straight to the network — no caching, no offline fallback.
self.addEventListener('fetch', () => {
  // intentional no-op — let the browser do its default network fetch
});
