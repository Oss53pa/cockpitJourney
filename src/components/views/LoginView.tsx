import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Loader2, ArrowRight, Lock } from 'lucide-react';
import { signInWithPassword, SUPABASE_CONFIGURED } from '../../lib/supabase';
import { AuthLayout, AuthErrorBanner } from '../auth/AuthLayout';

/**
 * Map raw Supabase auth errors to clear French messages. The default
 * Supabase responses are accurate but generic — we surface the underlying
 * cause so the user knows whether to retry, change e-mail, fix typo, or
 * use the recovery flow.
 */
function humanizeAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes('invalid login credentials') || lower.includes('invalid grant')) {
    return 'Email ou mot de passe incorrect.';
  }
  if (lower.includes('email not confirmed')) {
    return "Cliquez d'abord sur le lien de confirmation envoyé par e-mail.";
  }
  if (lower.includes('rate') || lower.includes('too many')) {
    return 'Trop de tentatives. Réessayez dans 1–2 minutes.';
  }
  if (lower.includes('invalid') && lower.includes('email')) {
    return 'Adresse e-mail invalide.';
  }
  return raw || 'Erreur inconnue';
}

export function LoginView() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      await signInWithPassword(email, password);
      // onAuthStateChange in appStore picks it up → /dashboard.
    } catch (err) {
      setError(humanizeAuthError(err));
      setLoading(false);
    }
  };

  if (!SUPABASE_CONFIGURED) {
    return (
      <AuthLayout>
        <div className="text-center">
          <div className="text-signal-red font-light mb-2 text-base">Supabase non configuré</div>
          <div className="text-sm text-atlas-fg-2 leading-relaxed">
            Cette installation n'a pas accès à la base de données. Copiez{' '}
            <code className="px-1.5 py-0.5 bg-atlas-cream rounded text-atlas-sage-deep font-mono text-2xs">
              .env.example
            </code>{' '}
            vers{' '}
            <code className="px-1.5 py-0.5 bg-atlas-cream rounded text-atlas-sage-deep font-mono text-2xs">
              .env.local
            </code>{' '}
            et renseignez vos clés Supabase, puis redémarrez le serveur.
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="text-center text-base font-light text-atlas-fg-1 mb-6">Connexion</h1>

      {error && <AuthErrorBanner message={error} onDismiss={() => setError(null)} />}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email */}
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

        {/* Password */}
        <label className="block">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-2xs uppercase tracking-[0.18em] text-atlas-sage-deeper font-light">
              Mot de passe
            </span>
            <Link
              to="/forgot-password"
              className="text-2xs text-atlas-fg-3 hover:text-atlas-sage-deep transition font-light"
            >
              Oublié ?
            </Link>
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 text-atlas-fg-3 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-atlas-cream border border-atlas-line focus:border-atlas-sage-deep focus:outline-none focus:ring-2 focus:ring-atlas-sage-deep/20 text-sm font-light text-atlas-fg-1 placeholder:text-atlas-fg-3 transition"
            />
          </div>
        </label>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !email || !password}
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-atlas-sage-deep text-white font-light tracking-wider hover:bg-atlas-sage-deeper transition shadow-amber-deep text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Connexion…
            </>
          ) : (
            <>
              Se connecter
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Sign-up link */}
      <p className="mt-6 text-center text-xs text-atlas-fg-3 font-light">
        Pas encore de compte ?{' '}
        <Link
          to="/signup"
          className="text-atlas-sage-deep hover:text-atlas-sage-deeper transition font-normal"
        >
          S'inscrire
        </Link>
      </p>
    </AuthLayout>
  );
}
