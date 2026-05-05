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
 */
export async function sendEmailOtp(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      shouldCreateUser: true,
      // omit emailRedirectTo on purpose: the user enters the code in-app,
      // no browser redirect needed.
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

/**
 * Dev-only quick login: spawn an anonymous Supabase auth.users row to
 * skip the email roundtrip. Each anonymous session is isolated by RLS,
 * so this is safe even on a shared Supabase project.
 *
 * Requires Supabase Auth → "Enable anonymous sign-ins" toggled on
 * (Authentication → Sign In / Up → Allow anonymous sign-ins).
 */
export async function signInAsDevAnonymous() {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data;
}

export const DEV_MODE = import.meta.env.DEV;

export async function signOut() {
  await supabase.auth.signOut();
}
