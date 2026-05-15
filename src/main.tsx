import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { initMonitoring, captureException } from './lib/monitoring.ts';

// Initialize Sentry as early as possible so React render errors are
// caught. The init is async (dynamic import of @sentry/react) so we
// kick it off but don't block the app — render starts immediately.
void initMonitoring();

// Global error capture — forward to Sentry (with our noise filters)
// and keep the console log for local dev visibility.
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    console.error('[CockpitJourney] window error:', e.error || e.message, e.filename, e.lineno);
    captureException(e.error ?? new Error(e.message), { filename: e.filename, lineno: e.lineno });
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[CockpitJourney] unhandled promise:', e.reason);
    captureException(e.reason instanceof Error ? e.reason : new Error(String(e.reason)));
  });
}

// PWA Service Worker registration.
//
// Strategy: register only in production builds, after the page has
// finished loading (so the initial render isn't competing with the SW
// install for bandwidth). The SW itself uses network-first for the app
// shell and cache-first for hashed assets — see public/sw.js for the
// full strategy + the cache-versioning that prevents the "stale
// Supabase config" trap we hit before.
//
// In dev (vite serve) we explicitly UNREGISTER any SW left over from a
// previous prod visit on the same origin — otherwise the cached prod
// bundle would shadow the dev server's hot-reloaded modules.
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          // Periodically check for an updated SW (every 30 min) so a
          // long-lived tab eventually picks up new deploys.
          setInterval(() => void reg.update(), 30 * 60_000);
        })
        .catch((err) => console.warn('[CockpitJourney] SW registration failed:', err));
    });
  } else {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => void r.unregister()))
      .catch(() => {
        /* dev-only cleanup, ignore failures */
      });
  }
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
