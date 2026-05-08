import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Loader2, ArrowRight, Lock } from 'lucide-react';
import { signInWithPassword, signInWithGoogle, SUPABASE_CONFIGURED } from '../../lib/supabase';
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
  if (lower.includes('provider is not enabled')) {
    return "Connexion Google non encore activée. Utilisez l'e-mail / mot de passe pour le moment.";
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
  const [googleLoading, setGoogleLoading] = useState(false);
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

  const handleGoogle = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      // Supabase redirects to Google then back to /auth — no further action here.
    } catch (err) {
      setError(humanizeAuthError(err));
      setGoogleLoading(false);
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

      {/* Divider */}
      <div className="my-6 flex items-center gap-3">
        <div className="flex-1 h-px bg-atlas-line" />
        <span className="text-2xs uppercase tracking-[0.2em] text-atlas-fg-3 font-light">ou</span>
        <div className="flex-1 h-px bg-atlas-line" />
      </div>

      {/* Google */}
      <button
        type="button"
        onClick={handleGoogle}
        disabled={googleLoading}
        className="w-full inline-flex items-center justify-center gap-3 px-5 py-2.5 rounded-xl border border-atlas-line bg-atlas-panel hover:border-atlas-sage-deep/40 hover:bg-atlas-sage/5 transition text-sm font-light text-atlas-fg-1 disabled:opacity-50"
      >
        {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleGlyph className="w-4 h-4" />}
        Continuer avec Google
      </button>

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

/**
 * Inline Google "G" glyph — official 4-color logo simplified to SVG so
 * we don't pull a separate icon dep just for one button.
 */
function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
