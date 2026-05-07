import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';

// Global error capture (logged to console for now; can be wired to Sentry later)
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    console.error('[CockpitJourney] window error:', e.error || e.message, e.filename, e.lineno);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[CockpitJourney] unhandled promise:', e.reason);
  });
}

// Service Worker is currently DISABLED.
//
// We previously shipped an offline-first SW (precache + cache-first for
// static assets) that ended up trapping users on stale builds — most
// notably during the Supabase migration, when the cached bundle had
// undefined VITE_SUPABASE_URL and showed "Supabase non configuré"
// indefinitely until the user manually wiped service workers in DevTools.
//
// Until we ship a proper PWA strategy (cache versioning + skip-waiting
// with an in-app "update ready" banner), we actively unregister any SW
// that's still registered from a previous build. This rescues browsers
// that picked up the old SW and prevents new ones from being installed.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => {
      for (const reg of registrations) {
        reg.unregister().then((ok) => {
          if (ok) console.info('[CockpitJourney] unregistered stale service worker');
        });
      }
    })
    .catch(() => {
      /* ignore — older browsers, etc. */
    });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter
      // Opt-in to React Router v7 behaviors so we don't get console
      // deprecation warnings AND we're already aligned with the next
      // major. v7_startTransition wraps state updates in startTransition
      // for smoother UX; v7_relativeSplatPath aligns relative resolution
      // inside splat routes ("*").
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <App />
    </BrowserRouter>
  </StrictMode>
);
