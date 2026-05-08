// Supabase client singleton + minimal Database type for the cj_* schema.
// All cj_* tables use a hybrid pattern: indexed columns + a `data` jsonb column
// holding the full app entity (matches the original Dexie shape exactly).
//
// We intentionally do NOT import from a generated types file, because the
// Atlas Studio project hosts ~200 tables across multiple products. We only
// type the cj_* tables here (typing is per-product).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Don't throw at import-time — let the app boot and surface a clean
  // configuration banner instead.

  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing. ' +
      'Copy .env.example → .env.local and fill them in.'
  );
}

export const SUPABASE_CONFIGURED = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * App identity used by the shared Supabase Auth email templates to
 * branch the rendering (logo, tagline, copy, footer) per product.
 *
 * Atlas Studio runs several SaaS products on a single Supabase project,
 * so we tag every OTP request with `data.app` and the email template
 * uses {{ if eq .Data.app "CockpitJourney" }}…{{ end }} to swap the
 * brand block. See docs/email-templates/magic-link.html.
 */
export const APP_ID = 'CockpitJourney';
export const APP_TAGLINE = 'Pilotez votre journée. Compagnon quotidien de gestion de tâches et projets.';
export const APP_URL = 'https://cockpitjourney.app';

/**
 * Hybrid jsonb-backed row. Indexed columns are derived from `data`; we
 * always read the entity straight out of `data` to get full fidelity.
 */
export interface JsonRow {
  id: string;
  data: unknown;
  // any other indexed columns are ignored at read-time
}

export type CjTable =
  | 'cj_profiles'
  | 'cj_folders'
  | 'cj_projects'
  | 'cj_sections'
  | 'cj_tasks'
  | 'cj_subtasks'
  | 'cj_goals'
  | 'cj_comments'
  | 'cj_notifications'
  | 'cj_insights'
  | 'cj_automations'
  | 'cj_forms'
  | 'cj_reports'
  | 'cj_attachments'
  | 'cj_dependencies'
  | 'cj_activity'
  | 'cj_notes'
  | 'cj_settings';

// We intentionally do not provide a generic `Database` type here. Supabase's
// strict generics would require typing every column of every cj_* table, but
// since we use a hybrid jsonb schema (`id + data` per table), runtime shapes
// vary by entity. Instead, we keep the client untyped and rely on the
// repo.ts adapter to enforce shape.
/**
 * Custom fetch with a hard 15s timeout via AbortController. Any request
 * that hangs longer than that aborts and surfaces a normal AbortError —
 * MUCH preferable to a silent infinite hang. We hit this in production
 * when a corporate proxy / browser extension was selectively dropping
 * the response on /rest/v1 requests.
 */
const fetchWithTimeout: typeof fetch = (input, init) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  // If the caller already passed a signal, chain it.
  if (init?.signal) {
    init.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
};

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL ?? 'https://placeholder.invalid',
  SUPABASE_ANON_KEY ?? 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true, // magic link redirect handling
      flowType: 'pkce',
      storageKey: 'cj-supabase-auth',
    },
    global: {
      fetch: fetchWithTimeout,
    },
  }
);

/* ───────────── Auth helpers ───────────── */

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

/**
 * Send a 6-digit OTP code by email. Works on any host/port without
 * needing a redirect URL whitelist on the Supabase side.
 *
 * The default Supabase email template includes both `{{ .ConfirmationURL }}`
 * and `{{ .Token }}` — we instruct the user to copy the 6-digit token.
 *
 * `options.data` becomes the user's `raw_user_meta_data` and is exposed
 * in email templates as `{{ .Data }}`. We tag every request with
 * `app: APP_ID` so the shared Atlas-Supabase template can render
 * CockpitJourney branding for these emails (and Atlas Studio default
 * branding for emails coming from sibling products on the same project).
 */
export async function sendEmailOtp(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      shouldCreateUser: true,
      // We deliberately DO NOT pass emailRedirectTo: the user enters the
      // 6-digit code in-app, no clickable magic-link is needed and the
      // email template is configured to omit the link button entirely.
      // Removing this option also avoids hitting Supabase's redirect-URL
      // whitelist constraints when CockpitJourney is opened on tunnels,
      // alternate ports, or sub-domains we haven't whitelisted yet.
      data: {
        app: APP_ID,
        app_tagline: APP_TAGLINE,
        app_url: APP_URL,
      },
    },
  });
  if (error) throw error;
}

/** Verify the 6-digit OTP code received by email. */
export async function verifyEmailOtp(email: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: 'email',
  });
  if (error) throw error;
  return data;
}

/* ───────────── Password / OAuth flows ─────────────
 *
 * Sibling to the OTP flow above. Cockpit accounts are still primarily
 * OTP-driven (zero-password onboarding), but the new login/signup pages
 * also support classic email+password and Google OAuth so users coming
 * from Cockpit FnA / TableSmart / etc. don't have to learn a new ritual.
 */

/** Sign in with email + password (Supabase Auth password grant). */
export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw error;
  return data;
}

/**
 * Create a new account with email + password. Supabase sends the
 * `confirmation` template (premium CockpitJourney version is already
 * installed). The user must click the link in that e-mail before they
 * can sign in.
 *
 * Tags the request with `data: { app: APP_ID }` so the Atlas Studio
 * shared email template renders the CockpitJourney brand block.
 */
export async function signUpWithPassword(opts: { email: string; password: string; fullName?: string }) {
  const { data, error } = await supabase.auth.signUp({
    email: opts.email.trim().toLowerCase(),
    password: opts.password,
    options: {
      emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth` : undefined,
      data: {
        app: APP_ID,
        app_tagline: APP_TAGLINE,
        app_url: APP_URL,
        full_name: opts.fullName ?? null,
      },
    },
  });
  if (error) throw error;
  return data;
}

/**
 * Send the "Reset your password" email. The link lands the user on
 * /reset-password where they enter the new value.
 */
export async function sendPasswordRecovery(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined,
  });
  if (error) throw error;
}

/**
 * Set a new password for the currently-authenticated user. Used after
 * the recovery click-through, and reusable from Settings → Security.
 */
export async function updatePassword(newPassword: string) {
  const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return data;
}

export const DEV_MODE = import.meta.env.DEV;

/**
 * Dev convenience: previously this signed in as a fixed
 * `dev@cockpitjourney.local` SQL-provisioned user. That user has been
 * decommissioned to remove hardcoded credentials from production. To
 * test in local dev, use the OTP code flow with your real e-mail
 * (Resend SMTP works) — or re-provision a dev user under a separate
 * Supabase dev project.
 */
export const DEV_USER_EMAIL = '';
export async function signInAsDev() {
  throw new Error('Dev quick-login désactivé pour la prod. Utilisez le flow OTP par e-mail.');
}

export async function signOut() {
  await supabase.auth.signOut();
}
