import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const ATLAS_SSO_URL = `${SUPABASE_URL ?? 'https://placeholder.invalid'}/functions/v1/atlas-sso`;

interface AtlasSsoResponse {
  token_hash: string;
  email: string;
  type: 'magiclink';
  appId?: string;
  appName?: string;
}

/**
 * SSO / magic-link / cookie-shared callback. Handles three flows in priority
 * order:
 *
 * 1. Atlas Studio token handoff (`?token=<JWT>` in URL).
 *    User arrives from atlas-studio.org with a JWT signed by Atlas Studio.
 *    We POST it to the `atlas-sso` Edge Function which validates the JWT
 *    and returns a Supabase `token_hash`. We then call
 *    `verifyOtp({ type: 'magiclink', token_hash })` to materialise the
 *    session locally.
 *
 * 2. Magic-link email click (`#access_token=…&refresh_token=…`).
 *    Supabase appends the tokens to /auth as a hash fragment;
 *    `detectSessionInUrl: true` on the client picks it up automatically
 *    and fires SIGNED_IN.
 *
 * 3. Cross-subdomain cookie session (`*.atlas-studio.org`).
 *    The Supabase auth cookie is already present from a sibling Atlas
 *    product, so `getSession()` returns a session immediately.
 *
 * In all three cases, the success path is the same: navigate to
 * /dashboard. A 6s timeout fail-safe bounces back to /login with a
 * readable error if the session never materialises.
 */
export function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const onSignedIn = () => {
      if (cancelled) return;
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      navigate('/dashboard', { replace: true });
    };

    const fail = (message: string) => {
      if (cancelled) return;
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      setError(message);
      // Give the user 3s to read the error then bounce to /login
      setTimeout(() => navigate('/login', { replace: true }), 3000);
    };

    /* ── 1. Atlas Studio token handoff ─────────────────────────── */
    const atlasToken = params.get('token');
    if (atlasToken) {
      void (async () => {
        try {
          const res = await fetch(ATLAS_SSO_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: SUPABASE_ANON_KEY ?? '',
            },
            body: JSON.stringify({ token: atlasToken }),
          });
          if (!res.ok) {
            const errBody = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(errBody.error || `SSO HTTP ${res.status}`);
          }
          const data = (await res.json()) as AtlasSsoResponse;
          const { error: otpErr } = await supabase.auth.verifyOtp({
            type: 'magiclink',
            token_hash: data.token_hash,
          });
          if (otpErr) throw otpErr;
          onSignedIn();
        } catch (e) {
          fail(e instanceof Error ? e.message : 'Erreur SSO inconnue');
        }
      })();
      // Even with the SSO branch active, we still arm the watchers below
      // as belt-and-suspenders (e.g. if the user already has a valid
      // session from a previous Atlas tab).
    }

    /* ── 2 + 3. Magic-link / cookie session detection ───────────── */
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        onSignedIn();
      }
    });

    void supabase.auth.getSession().then(({ data, error: sessErr }) => {
      if (cancelled) return;
      if (sessErr) {
        fail(sessErr.message);
        return;
      }
      if (data.session) onSignedIn();
    });

    /* ── Fail-safe timeout ──────────────────────────────────────── */
    timeoutId = setTimeout(() => {
      fail(
        atlasToken
          ? 'Le token Atlas Studio est invalide ou expiré.'
          : "Aucune session active. Reconnectez-vous depuis Atlas Studio ou via l'écran de connexion."
      );
    }, 6000);

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [params, navigate]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-atlas-cream px-6">
      <div className="text-center max-w-sm">
        <div className="font-logo text-5xl text-atlas-fg-1 mb-4">
          Cockpit<span className="text-atlas-sage-deep">Journey</span>
        </div>
        {error ? (
          <>
            <div className="inline-flex items-center gap-2 text-signal-red mb-3">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-2xs uppercase tracking-[0.2em] font-light">Connexion impossible</span>
            </div>
            <p className="text-sm text-atlas-fg-2 leading-relaxed">{error}</p>
            <p className="text-2xs text-atlas-fg-3 mt-4">Redirection vers la page de connexion…</p>
            <a
              href="https://atlas-studio.org"
              className="mt-4 inline-block text-xs uppercase tracking-wider text-atlas-sage-deep hover:text-atlas-sage-deeper transition font-light underline underline-offset-4"
            >
              ← Retour à Atlas Studio
            </a>
          </>
        ) : (
          <>
            <div className="text-2xs uppercase tracking-[0.2em] text-atlas-fg-3 font-light">
              Validation de votre session Atlas Studio…
            </div>
            <div className="mt-5 mx-auto inline-flex items-center gap-2 text-atlas-sage-deep">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs uppercase tracking-wider font-light">Connexion en cours</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
