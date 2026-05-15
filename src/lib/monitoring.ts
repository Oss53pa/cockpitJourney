/**
 * Sentry monitoring — production error reporting.
 *
 * Initialized once at the top of main.tsx with the DSN from `VITE_SENTRY_DSN`.
 * If the env var is missing (e.g. local dev without monitoring), the
 * module is a no-op — all functions become silent and the SDK is never
 * imported. The dynamic import means the ~70 KB Sentry payload is only
 * loaded in environments that actually use it.
 *
 * Why centralize here:
 *   - Single point to strip secrets (we cache the Groq API key in
 *     `settings.proph3t.apiKey`; we don't want it sent to Sentry).
 *   - Single point to filter noise (refresh-token churn, browser
 *     extension errors, etc.).
 *   - Single point to attach user context after auth resolves.
 */

import type * as SentryT from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const ENV = import.meta.env.MODE; // 'development' | 'production'
const RELEASE = (import.meta.env.VITE_RELEASE_SHA as string | undefined) || 'unreleased';

let sentry: typeof SentryT | null = null;
let initialized = false;

/**
 * Errors / log fragments we deliberately drop on the floor before they
 * reach Sentry — pure noise that pollutes the dashboard.
 */
const NOISE_PATTERNS: RegExp[] = [
  /Refresh Token Not Found/i,
  /Invalid Refresh Token/i,
  /AuthApiError.*refresh/i,
  /ResizeObserver loop limit exceeded/i, // Chrome internal, not a real bug
  /Non-Error promise rejection captured/i,
  /Failed to fetch dynamically imported module/i, // stale chunks during deploy — we already auto-recover
  /Load failed/i, // Safari's generic network blip
];

function isNoise(message: string | undefined): boolean {
  if (!message) return false;
  return NOISE_PATTERNS.some((re) => re.test(message));
}

/**
 * Initialize Sentry. Safe to call multiple times — only the first
 * invocation effective. Awaits the dynamic import so subsequent
 * setUser / captureException calls have a real client to talk to.
 */
export async function initMonitoring(): Promise<void> {
  if (initialized) return;
  initialized = true;
  if (!DSN) {
    console.info('[monitoring] VITE_SENTRY_DSN not set — Sentry disabled');
    return;
  }
  try {
    sentry = await import('@sentry/react');
    sentry.init({
      dsn: DSN,
      environment: ENV,
      release: RELEASE,
      // Tracing is off by default — we don't pay the perf cost yet.
      // Flip to 0.1 (10 % sampling) when we want to investigate slow paths.
      tracesSampleRate: 0,
      // Replay session video: same — off until we're confident it
      // doesn't capture the user's PROPH3T API key by accident.
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      // Don't send any PII automatically; we'll attach it explicitly via setUser.
      sendDefaultPii: false,
      beforeSend(event, hint) {
        const message =
          event.message ||
          (event.exception?.values?.[0]?.value as string | undefined) ||
          (hint?.originalException as Error)?.message;
        if (isNoise(message)) return null;
        // Defensive: scrub anything that smells like a token / key from
        // breadcrumbs and request data. The user's settings.proph3t.apiKey
        // is the realistic leak vector.
        scrubSecrets(event);
        return event;
      },
      // Ignore errors from browser extensions / cross-origin scripts.
      ignoreErrors: [
        /^ResizeObserver loop/,
        /^Non-Error promise rejection/,
        /chrome-extension:/,
        /moz-extension:/,
        /safari-extension:/,
      ],
    });
    console.info('[monitoring] Sentry initialized', { env: ENV, release: RELEASE });
  } catch (err) {
    console.warn('[monitoring] Sentry init failed (continuing without)', err);
    sentry = null;
  }
}

/**
 * Walk the event payload and replace anything looking like a secret
 * (gsk_*, sk-*, eyJ*, sbp_*) with [REDACTED]. Belt to the Sentry
 * `denyUrls` braces — covers cases where a stack trace string includes
 * a leaked token.
 */
const SECRET_PATTERN =
  /\b(gsk_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9-]{20,}|eyJ[A-Za-z0-9_\-.]{20,}|sbp_[A-Za-z0-9]{20,})\b/g;
function scrubSecrets(event: SentryT.ErrorEvent): void {
  const json = JSON.stringify(event);
  if (!SECRET_PATTERN.test(json)) return;
  const scrubbed = JSON.parse(json.replace(SECRET_PATTERN, '[REDACTED]'));
  Object.assign(event, scrubbed);
}

/* ───────────── User context ───────────── */

/**
 * Identify the current user on every Sentry event. Called after auth
 * resolves (hydrateFromSupabase) and reset on signOut.
 *
 * We send the auth_user_id (UUID, never the email) so we can correlate
 * crashes to a user in the Supabase dashboard, without putting PII in
 * the Sentry sink. Email is too rich a target for GDPR concerns.
 */
export function setMonitoringUser(authUserId: string | null): void {
  if (!sentry) return;
  if (authUserId) {
    sentry.setUser({ id: authUserId.slice(0, 8) }); // first 8 chars = our namespace prefix
  } else {
    sentry.setUser(null);
  }
}

/**
 * Tag the current Sentry scope with the app screen / module the user is
 * on. Helps slicing crash reports per feature.
 */
export function setMonitoringTag(key: string, value: string | undefined): void {
  if (!sentry) return;
  sentry.setTag(key, value ?? 'unknown');
}

/* ───────────── Explicit capture ───────────── */

/**
 * Send an exception to Sentry. Used by catch handlers that want the
 * stack to be reported even if the error was technically "handled".
 */
export function captureException(err: unknown, ctx?: Record<string, unknown>): void {
  if (!sentry) {
    console.error('[monitoring]', err, ctx);
    return;
  }
  sentry.captureException(err, ctx ? { extra: ctx } : undefined);
}

/**
 * Send a one-off message (severity = info/warning/error). Use for
 * "this should never happen, but if it does I want to know" code paths.
 */
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (!sentry) {
    if (level === 'error') console.error('[monitoring]', message);
    else if (level === 'warning') console.warn('[monitoring]', message);
    else console.info('[monitoring]', message);
    return;
  }
  sentry.captureMessage(message, level);
}

/* ───────────── React error boundary wrapper ───────────── */

/**
 * Returns the Sentry-enhanced ErrorBoundary component. Falls back to a
 * pass-through wrapper when Sentry isn't initialized — so the JSX
 * `<ErrorBoundary fallback={...}>...</ErrorBoundary>` works either way.
 */
export function getSentryErrorBoundary(): typeof SentryT.ErrorBoundary | null {
  return sentry?.ErrorBoundary ?? null;
}
