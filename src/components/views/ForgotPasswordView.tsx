import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Loader2, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { sendPasswordRecovery, SUPABASE_CONFIGURED } from '../../lib/supabase';
import { AuthLayout, AuthErrorBanner } from '../auth/AuthLayout';

/**
 * /forgot-password — déclenche l'envoi du mail Supabase Recovery.
 * Le lien dans le mail amène l'utilisateur sur /reset-password (avec
 * une session temporaire) où il saisit le nouveau mot de passe.
 */
export function ForgotPasswordView() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await sendPasswordRecovery(email);
      setSent(true);
    } catch (err) {
      // Pour la sécurité on ne révèle PAS si l'email existe ou non —
      // mais si c'est un rate limit, on le dit.
      const raw = err instanceof Error ? err.message : String(err);
      if (raw.toLowerCase().includes('rate') || raw.toLowerCase().includes('too many')) {
        setError('Trop de demandes. Réessayez dans 1–2 minutes.');
      } else {
        // Sinon on dit "ok envoyé" même si l'email n'existe pas (pas de fuite).
        setSent(true);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!SUPABASE_CONFIGURED) {
    return (
      <AuthLayout>
        <div className="text-center text-sm text-atlas-fg-2 font-light">Supabase non configuré.</div>
      </AuthLayout>
    );
  }

  if (sent) {
    return (
      <AuthLayout>
        <div className="text-center mb-5">
          <div className="w-12 h-12 rounded-2xl bg-atlas-sage/15 grid place-items-center mx-auto mb-4">
            <CheckCircle2 className="w-5 h-5 text-atlas-sage-deep" />
          </div>
          <h1 className="text-base font-light text-atlas-fg-1 mb-1.5">E-mail envoyé</h1>
          <p className="text-sm text-atlas-fg-2 font-light leading-relaxed">
            Si un compte existe pour <strong className="text-atlas-fg-1 font-normal">{email}</strong>, vous
            recevrez un lien pour définir un nouveau mot de passe d'ici quelques minutes.
          </p>
        </div>
        <p className="text-2xs text-atlas-fg-3 font-light text-center leading-relaxed mb-5">
          Pensez à vérifier vos <strong className="font-normal">spams</strong>. Le lien expire dans 1 heure.
        </p>
        <Link
          to="/login"
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-atlas-line bg-atlas-panel hover:border-atlas-sage-deep/40 hover:bg-atlas-sage/5 transition text-sm font-light text-atlas-fg-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour à la connexion
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="text-center text-base font-light text-atlas-fg-1 mb-1.5">Mot de passe oublié</h1>
      <p className="text-center text-2xs text-atlas-fg-3 font-light mb-6">
        Entrez votre e-mail, on vous envoie un lien pour le réinitialiser.
      </p>

      {error && <AuthErrorBanner message={error} onDismiss={() => setError(null)} />}

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="block text-2xs uppercase tracking-[0.18em] text-atlas-sage-deeper font-light mb-1.5">
            E-mail
          </span>
          <div className="relative">
            <Mail className="w-4 h-4 text-atlas-fg-3 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              required
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@entreprise.com"
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-atlas-cream border border-atlas-line focus:border-atlas-sage-deep focus:outline-none focus:ring-2 focus:ring-atlas-sage-deep/20 text-sm font-light text-atlas-fg-1 placeholder:text-atlas-fg-3 transition"
            />
          </div>
        </label>

        <button
          type="submit"
          disabled={loading || !email}
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-atlas-sage-deep text-white font-light tracking-wider hover:bg-atlas-sage-deeper transition shadow-amber-deep text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Envoi…
            </>
          ) : (
            <>
              Envoyer le lien
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <Link
        to="/login"
        className="mt-6 inline-flex items-center gap-1.5 text-xs text-atlas-fg-3 hover:text-atlas-sage-deep transition font-light"
      >
        <ArrowLeft className="w-3 h-3" />
        Retour à la connexion
      </Link>
    </AuthLayout>
  );
}
