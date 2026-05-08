import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Loader2, ArrowRight, CheckCircle2 } from 'lucide-react';
import { supabase, updatePassword } from '../../lib/supabase';
import { AuthLayout, AuthErrorBanner } from '../auth/AuthLayout';

/**
 * /reset-password — page d'atterrissage du lien dans l'e-mail Recovery.
 *
 * Quand l'utilisateur clique le lien dans le mail, Supabase pose une
 * session temporaire (event PASSWORD_RECOVERY) puis nous redirige ici.
 * On capture cet event, on demande le nouveau mot de passe, on l'envoie
 * via supabase.auth.updateUser, et on redirige vers /dashboard.
 *
 * Si la page est ouverte sans event de recovery (URL directe, link
 * expiré), on renvoie un message clair vers /forgot-password.
 */
export function ResetPasswordView() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<'unknown' | 'recovery' | 'invalid'>('unknown');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Listen for the PASSWORD_RECOVERY event Supabase fires after the
  // recovery link click. Also accept an existing session (in case the
  // event already fired before we mounted).
  useEffect(() => {
    let cancelled = false;

    const checkExistingSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        // We can't reliably distinguish a "recovery" session from a
        // normal one once mounted, so any session is treated as
        // sufficient to set a new password.
        setReady('recovery');
      } else {
        // Wait for onAuthStateChange below — Supabase may fire shortly.
        // After 2.5s without any event, mark as invalid.
        setTimeout(() => {
          if (!cancelled && ready === 'unknown') setReady('invalid');
        }, 2500);
      }
    };
    void checkExistingSession();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setReady('recovery');
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await updatePassword(password);
      setDone(true);
      // Brief beat so the user sees the success, then redirect.
      setTimeout(() => navigate('/dashboard', { replace: true }), 1500);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      setError(humanize(raw));
    } finally {
      setLoading(false);
    }
  };

  if (ready === 'unknown') {
    return (
      <AuthLayout>
        <div className="py-6 text-center">
          <Loader2 className="w-5 h-5 animate-spin text-atlas-sage-deep mx-auto mb-3" />
          <p className="text-sm text-atlas-fg-3 font-light">Vérification du lien…</p>
        </div>
      </AuthLayout>
    );
  }

  if (ready === 'invalid') {
    return (
      <AuthLayout>
        <div className="text-center mb-5">
          <h1 className="text-base font-light text-atlas-fg-1 mb-1.5">Lien expiré ou invalide</h1>
          <p className="text-sm text-atlas-fg-2 font-light leading-relaxed">
            Ce lien de réinitialisation n'est plus actif. Demandez-en un nouveau ci-dessous.
          </p>
        </div>
        <Link
          to="/forgot-password"
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-atlas-sage-deep text-white font-light tracking-wider hover:bg-atlas-sage-deeper transition shadow-amber-deep text-sm"
        >
          Demander un nouveau lien
          <ArrowRight className="w-4 h-4" />
        </Link>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout>
        <div className="text-center py-3">
          <div className="w-12 h-12 rounded-2xl bg-atlas-sage/15 grid place-items-center mx-auto mb-4">
            <CheckCircle2 className="w-5 h-5 text-atlas-sage-deep" />
          </div>
          <h1 className="text-base font-light text-atlas-fg-1 mb-1.5">Mot de passe mis à jour</h1>
          <p className="text-sm text-atlas-fg-2 font-light leading-relaxed">
            Redirection vers votre cockpit…
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="text-center text-base font-light text-atlas-fg-1 mb-1.5">Nouveau mot de passe</h1>
      <p className="text-center text-2xs text-atlas-fg-3 font-light mb-6">
        Choisissez un mot de passe robuste — il ouvre votre cockpit.
      </p>

      {error && <AuthErrorBanner message={error} onDismiss={() => setError(null)} />}

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="block text-2xs uppercase tracking-[0.18em] text-atlas-sage-deeper font-light mb-1.5">
            Nouveau mot de passe
          </span>
          <div className="relative">
            <Lock className="w-4 h-4 text-atlas-fg-3 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              required
              autoComplete="new-password"
              autoFocus
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8 caractères minimum"
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-atlas-cream border border-atlas-line focus:border-atlas-sage-deep focus:outline-none focus:ring-2 focus:ring-atlas-sage-deep/20 text-sm font-light text-atlas-fg-1 placeholder:text-atlas-fg-3 transition"
            />
          </div>
        </label>

        <label className="block">
          <span className="block text-2xs uppercase tracking-[0.18em] text-atlas-sage-deeper font-light mb-1.5">
            Confirmer
          </span>
          <div className="relative">
            <Lock className="w-4 h-4 text-atlas-fg-3 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-saisir le mot de passe"
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-atlas-cream border border-atlas-line focus:border-atlas-sage-deep focus:outline-none focus:ring-2 focus:ring-atlas-sage-deep/20 text-sm font-light text-atlas-fg-1 placeholder:text-atlas-fg-3 transition"
            />
          </div>
        </label>

        <button
          type="submit"
          disabled={loading || password.length < 8 || password !== confirm}
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-atlas-sage-deep text-white font-light tracking-wider hover:bg-atlas-sage-deeper transition shadow-amber-deep text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Mise à jour…
            </>
          ) : (
            <>
              Mettre à jour
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </AuthLayout>
  );
}

function humanize(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('password') && lower.includes('short')) {
    return 'Le mot de passe doit faire au moins 8 caractères.';
  }
  if (lower.includes('weak password') || lower.includes('password weak')) {
    return 'Mot de passe trop faible. Utilisez majuscules, chiffres et symboles.';
  }
  if (lower.includes('same') && lower.includes('password')) {
    return 'Le nouveau mot de passe doit être différent du précédent.';
  }
  if (lower.includes('expired') || lower.includes('jwt') || lower.includes('token')) {
    return 'Le lien a expiré. Redemandez-en un depuis "Mot de passe oublié".';
  }
  return raw || 'Erreur inconnue';
}
