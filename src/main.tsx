import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
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

// Register Service Worker (offline-first) — production only
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[CockpitJourney] SW registration failed', err);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
