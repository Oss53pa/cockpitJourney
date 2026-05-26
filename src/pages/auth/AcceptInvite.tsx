/**
 * AcceptInvite — Set password page pour les utilisateurs invités via atlas-invite-seat.
 *
 * Flow :
 * 1. atlas-studio.org admin → atlas-invite-seat → email avec magic link
 * 2. User clique → Supabase auto-établit la session (SIGNED_IN)
 * 3. Redirige ici → /auth/accept-invite
 * 4. User définit son mot de passe → supabase.auth.updateUser({password})
 * 5. Redirige vers /dashboard (CockpitJourney) avec session active
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { EmailOtpType, User } from '@supabase/supabase-js';

export default function AcceptInvite() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const onReady = (user: User) => {
      if (cancelled) return;
      setUserEmail(user.email ?? null);
      setUserName(
        (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined) ??
          null
      );
      setSessionReady(true);
    };

    // GoTrue may redirect here with an error in the query OR the hash
    // (#error=access_denied&error_code=otp_expired). Surface it immediately.
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const errCode = search.get('error_code') ?? hash.get('error_code');
    const errDesc = search.get('error_description') ?? hash.get('error_description');
    if (errCode) {
      setError(
        errCode === 'otp_expired'
          ? "Ce lien d'invitation a expiré. Demandez à votre administrateur de vous le renvoyer."
          : errDesc
            ? decodeURIComponent(errDesc).replace(/\+/g, ' ')
            : errCode
      );
      return () => {
        cancelled = true;
      };
    }

    // Catch the session once it's established — covers the PKCE (?code) and
    // implicit (#access_token) flows that supabase-js resolves on its own,
    // plus the verifyOtp() call below.
    const sub = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (
        (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY' || event === 'USER_UPDATED') &&
        session?.user
      ) {
        onReady(session.user);
      }
    });

    void (async () => {
      try {
        // Anti-prefetch flow: the email link carries ?token_hash=…&type=… .
        // Email scanners (SafeLinks, Proofpoint, Gmail) can't execute JS, so
        // the token survives until the real click — we consume it here via
        // verifyOtp() instead of a GoTrue action_link (which scanners burn).
        const tokenHash = search.get('token_hash');
        if (tokenHash) {
          const otpType = (search.get('type') ?? 'invite') as EmailOtpType;
          const { data, error: vErr } = await supabase.auth.verifyOtp({
            type: otpType,
            token_hash: tokenHash,
          });
          if (cancelled) return;
          if (vErr) {
            setError(
              /expired|invalid|not found/i.test(vErr.message)
                ? "Ce lien d'invitation a expiré ou a déjà été utilisé. Demandez un nouveau lien à votre administrateur."
                : vErr.message
            );
            return;
          }
          if (data.user) onReady(data.user);
          return;
        }

        // No token_hash → a PKCE/implicit session may already be resolving.
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!cancelled && session?.user) onReady(session.user);
      } catch (e) {
        if (!cancelled) setError((e as Error)?.message ?? "Impossible de valider l'invitation.");
      }
    })();

    const t = setTimeout(() => {
      if (!cancelled && !sessionReady)
        setError("Lien invalide ou expiré. Réessayez depuis l'email d'invitation ou demandez un renvoi.");
    }, 7000);
    return () => {
      cancelled = true;
      clearTimeout(t);
      sub.data.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pwdStrength = (() => {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  })();
  const pwdLabel = ['', 'Très faible', 'Faible', 'Correct', 'Fort', 'Très fort'][pwdStrength];
  const pwdColor = [
    'bg-gray-300',
    'bg-red-500',
    'bg-orange-400',
    'bg-yellow-400',
    'bg-green-500',
    'bg-green-600',
  ][pwdStrength];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('licence_seats')
          .update({ user_id: user.id, invitation_accepted_at: new Date().toISOString() })
          .eq('email', user.email!)
          .is('user_id', null);
      }
      setTimeout(() => navigate('/dashboard', { replace: true }), 500);
    } catch (e: any) {
      setError(e?.message ?? 'Erreur lors de la définition du mot de passe.');
    } finally {
      setSubmitting(false);
    }
  };

  if (error && !sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h1 className="text-lg font-bold mb-2 text-gray-900">Lien invalide ou expiré</h1>
          <p className="text-sm text-gray-600 mb-5">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="inline-block px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
          >
            Aller à la connexion
          </button>
        </div>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-600">Validation de l'invitation…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-cyan-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-blue-900">CockpitJourney</h1>
          <p className="text-sm text-gray-600 mt-1">Définissez votre mot de passe</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-7">
          <div className="flex items-start gap-3 p-3 mb-5 rounded-lg bg-green-50 border border-green-200">
            <svg
              className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="text-xs text-gray-700 leading-relaxed">
              <p className="font-semibold mb-0.5 text-gray-900">
                Bienvenue{userName ? ' ' + userName : ''} !
              </p>
              <p>
                Pour finaliser votre compte <span className="font-medium">{userEmail}</span>, choisissez un
                mot de passe sécurisé ci-dessous.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 block mb-1.5">
                Nouveau mot de passe
              </label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 pr-10 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                  placeholder="Minimum 8 caractères"
                  autoFocus
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                >
                  {showPwd ? '🙈' : '👁'}
                </button>
              </div>
              {password && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <div
                        key={n}
                        className={`flex-1 h-1 rounded-full transition-colors ${n <= pwdStrength ? pwdColor : 'bg-gray-200'}`}
                      />
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1">{pwdLabel}</p>
                </div>
              )}
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 block mb-1.5">
                Confirmer le mot de passe
              </label>
              <input
                type={showPwd ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                placeholder="Retapez le mot de passe"
                required
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="text-[10px] text-red-600 mt-1">Les mots de passe ne correspondent pas.</p>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                <span>⚠️</span>
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || password.length < 8 || password !== confirmPassword}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
            >
              {submitting ? 'Validation…' : 'Définir mon mot de passe et continuer →'}
            </button>
          </form>

          <p className="text-[10px] text-gray-400 text-center mt-5 leading-relaxed">
            Utilisez au moins 12 caractères avec majuscules, chiffres et symboles. Atlas Studio ne voit jamais
            votre mot de passe (bcrypt local).
          </p>
        </div>
      </div>
    </div>
  );
}
