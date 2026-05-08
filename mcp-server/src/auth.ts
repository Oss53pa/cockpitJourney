/**
 * PAT → Supabase JWT exchange.
 *
 * The user-supplied Personal Access Token (CJ_PAT) is not a Supabase JWT,
 * so we can't pass it directly to supabase-js. Instead we POST it to the
 * `cj-auth-pat` Edge Function which validates it (SHA-256 hash lookup,
 * not-revoked, not-expired) and returns a temporary Supabase session
 * (access_token + refresh_token + scopes + user_id + email).
 *
 * We cache the session in memory and refresh it ~5 minutes before expiry
 * so long-lived Claude Cowork sessions don't get auth errors mid-call.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

interface PatExchangeResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: string;
  email: string;
  scopes: string[];
  token_name?: string;
}

export interface CjSession {
  userId: string;
  email: string;
  scopes: string[];
  tokenName: string;
  client: SupabaseClient;
  /** Epoch ms when the access_token expires. */
  expiresAt: number;
}

const REFRESH_MARGIN_MS = 5 * 60_000; // refresh 5 min before expiry

let cached: CjSession | null = null;
let inflight: Promise<CjSession> | null = null;

/**
 * Get a valid session — exchange the PAT on first call, refresh
 * proactively before expiry on subsequent calls. Concurrent callers
 * share the same in-flight exchange so we don't burn the rate limit.
 */
export async function getSession(opts: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  pat: string;
}): Promise<CjSession> {
  if (cached && cached.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return cached;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    const session = await exchangePat(opts);
    cached = session;
    inflight = null;
    return session;
  })();

  try {
    return await inflight;
  } catch (err) {
    inflight = null;
    cached = null;
    throw err;
  }
}

async function exchangePat(opts: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  pat: string;
}): Promise<CjSession> {
  const { supabaseUrl, supabaseAnonKey, pat } = opts;

  const res = await fetch(`${supabaseUrl}/functions/v1/cj-auth-pat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ pat }),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const err = (await res.json()) as { error?: string };
      if (err.error) detail = err.error;
    } catch {
      /* response wasn't JSON */
    }
    throw new Error(`PAT exchange failed: ${detail}`);
  }

  const data = (await res.json()) as PatExchangeResponse;

  // Build a Supabase client pre-authenticated with the exchanged session.
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${data.access_token}` },
    },
  });
  // Also seed the auth state so .auth.getUser() works if any tool needs it.
  await client.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });

  return {
    userId: data.user_id,
    email: data.email,
    scopes: data.scopes,
    tokenName: data.token_name ?? 'CockpitJourney PAT',
    client,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

/**
 * Throw if the token doesn't have any of the required scopes. Used at
 * the entry point of write/admin tool handlers.
 */
export function requireScope(session: CjSession, ...required: string[]): void {
  if (!required.some((r) => session.scopes.includes(r))) {
    throw new Error(
      `Token "${session.tokenName}" n'a pas les permissions requises (${required.join(' ou ')}). Scopes actuels : ${session.scopes.join(', ')}.`
    );
  }
}
