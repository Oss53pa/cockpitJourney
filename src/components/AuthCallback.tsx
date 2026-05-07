import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

/**
 * SSO / magic-link callback.
 *
 * This route handles three different ways a user can land here with a
 * pending session to claim:
 *
 *   1. Cross-subdomain cookie sharing (production).
 *      User logged in on atlas-studio.org. The Supabase auth cookie is
 *      already present (scoped to .atlas-studio.org), so getSession()
 *      returns a session immediately on first call.
 *
 *   2. Magic-link redirect.
 *      User clicked a link in an OTP email; Supabase appended
 *      #access_token=…&refresh_token=… to /auth. The supabase-js client
 *      with detectSessionInUrl: true picks it up and fires SIGNED_IN.
 *
 *   3. PKCE / OAuth code exchange.
 *      ?code=… in the query string; supabase-js handles the exchange
 *      automatically when getSession() runs.
 *
 * In all three cases, our job is simply to wait briefly for the session
 * to materialise, then route to /dashboard. If after a few seconds we
 * still have no session, something went wrong (expired link, denied
 * scope) — bounce to /login with a hint.
 */
export function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    // Race: whichever resolves first wins.
    //   - getSession() — synchronous in cache, async with PKCE exchange
    //   - onAuthStateChange — fires when detectSessionInUrl finishes
    //   - 6s timeout — fail-safe so we never trap the user here
    const onSignedIn = () => {
      if (cancelled) return;
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      navigate('/dashboard', { replace: true });
    };

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        onSignedIn();
      }
    });

    void supabase.auth.getSession().then(({ data, error: sessErr }) => {
      if (cancelled) return;
      if (sessErr) {
        setError(sessErr.message);
        return;
      }
      if (data.session) onSignedIn();
    });

    timeoutId = setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      setError(
        "La session SSO n'a pas pu être récupérée. Le lien est peut-être expiré, ou les cookies Atlas Studio n'ont pas été partagés avec ce sous-domaine."
      );
      // Give the user 3s to read the error then bounce to /login
      setTimeout(() => navigate('/login', { replace: true }), 3000);
    }, 6000);

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [navigate]);

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
              <span className="text-2xs uppercase tracking-[0.2em] font-light">Échec de connexion SSO</span>
            </div>
            <p className="text-sm text-atlas-fg-2 leading-relaxed">{error}</p>
            <p className="text-2xs text-atlas-fg-3 mt-4">Redirection vers la page de connexion…</p>
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
