// Post-login redirect target — keep an invitee on their original URL
// (e.g. /workspace/accept?token=…) through the login OR signup flow,
// not just hard-bounced to /dashboard.

const KEY = 'cj-post-login-redirect';

export function setPostLoginTarget(target: string): void {
  try {
    sessionStorage.setItem(KEY, target);
  } catch {
    /* sessionStorage may be unavailable (private mode, embedded webview) */
  }
}

/** Read without consuming — caller still needs the target later. */
export function peekPostLoginTarget(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function consumePostLoginTarget(fallback = '/dashboard'): string {
  try {
    const t = sessionStorage.getItem(KEY);
    if (t) {
      sessionStorage.removeItem(KEY);
      return safe(t, fallback);
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

/** Only allow same-origin relative paths — prevents open-redirect via crafted ?next=. */
export function safe(target: string, fallback = '/dashboard'): string {
  if (!target) return fallback;
  if (!target.startsWith('/') || target.startsWith('//')) return fallback;
  return target;
}
