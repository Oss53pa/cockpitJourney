import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Loader2, ArrowRight, Lock, User, CheckCircle2 } from 'lucide-react';
import { signUpWithPassword, signInWithGoogle, SUPABASE_CONFIGURED } from '../../lib/supabase';
import { AuthLayout, AuthErrorBanner, AuthSuccessBanner } from '../auth/AuthLayout';

function humanizeAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes('user already registered') || lower.includes('already exists')) {
    return 'Un compte existe déjà avec cet e-mail. Connectez-vous ou utilisez "Mot de passe oublié".';
  }
  if (lower.includes('password') && lower.includes('short')) {
    return 'Le mot de passe doit faire au moins 8 caractères.';
  }
  if (lower.includes('password') && lower.includes('weak')) {
    return 'Mot de passe trop faible. Utilisez majuscules, chiffres et symboles.';
  }
  if (lower.includes('rate') || lower.includes('too many')) {
    return 'Trop de tentatives. Réessayez dans 1–2 minutes.';
  }
  if (lower.includes('invalid') && lower.includes('email')) {
    return 'Adresse e-mail invalide.';
  }
  if (lower.includes('signup') && lower.includes('disable')) {
    return 'Les inscriptions sont désactivées sur ce projet.';
  }
  return raw || 'Erreur inconnue';
}

/**
 * /signup — création d'un compte avec mot de passe.
 *
 * À la soumission Supabase envoie l'e-mail de confirmation (template
 * `confirmation` premium déjà installé). L'utilisateur clique le lien,
 * arrive sur /auth qui pose la session puis redirige vers /dashboard.
 */
export function SignupView() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || password.length < 8) return;
    setLoading(true);
    setError(null);
    try {
      await signUpWithPassword({ email, password, fullName: fullName.trim() || undefined });
      setDone(true);
    } catch (err) {
      setError(humanizeAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(humanizeAuthError(err));
      setGoogleLoading(false);
    }
  };

  if (!SUPABASE_CONFIGURED) {
    return (
      <AuthLayout>
        <div className="text-center text-sm text-atlas-fg-2 font-light">
          Supabase non configuré — l'inscription est indisponible.
        </div>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout>
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-atlas-sage/15 grid place-items-center mx-auto mb-4">
            <CheckCircle2 className="w-5 h-5 text-atlas-sage-deep" />
          </div>
          <h1 className="text-base font-light text-atlas-fg-1 mb-1.5">Vérifiez votre boîte e-mail</h1>
          <p className="text-sm text-atlas-fg-2 font-light leading-relaxed">
            On vous a envoyé un lien de confirmation à{' '}
            <strong className="text-atlas-fg-1 font-normal">{email}</strong>. Cliquez dessus pour activer
            votre compte.
          </p>
        </div>

        <AuthSuccessBanner
          title="Astuce"
          body={
            <>
              Le mail peut prendre 1–2 minutes. Pensez à vérifier vos <strong>spams</strong> si rien n'arrive
              — sinon revenez ici et utilisez{' '}
              <Link
                to="/forgot-password"
                className="text-atlas-sage-deep hover:text-atlas-sage-deeper underline underline-offset-2"
              >
                Mot de passe oublié
              </Link>{' '}
              pour relancer un lien.
            </>
          }
        />

        <Link
          to="/login"
          className="mt-5 w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-atlas-line bg-atlas-panel hover:border-atlas-sage-deep/40 hover:bg-atlas-sage/5 transition text-sm font-light text-atlas-fg-1"
        >
          Retour à la connexion
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="text-center text-base font-light text-atlas-fg-1 mb-1.5">Créer un compte</h1>
      <p className="text-center text-2xs text-atlas-fg-3 font-light mb-6">
        13<sup>e</sup> produit Atlas Studio · Aucune carte bancaire requise.
      </p>

      {error && <AuthErrorBanner message={error} onDismiss={() => setError(null)} />}

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="block text-2xs uppercase tracking-[0.18em] text-atlas-sage-deeper font-light mb-1.5">
            Nom complet
          </span>
          <div className="relative">
            <User className="w-4 h-4 text-atlas-fg-3 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoComplete="name"
              autoFocus
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Pamela Atokouna"
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-atlas-cream border border-atlas-line focus:border-atlas-sage-deep focus:outline-none focus:ring-2 focus:ring-atlas-sage-deep/20 text-sm font-light text-atlas-fg-1 placeholder:text-atlas-fg-3 transition"
            />
          </div>
        </label>

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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@entreprise.com"
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-atlas-cream border border-atlas-line focus:border-atlas-sage-deep focus:outline-none focus:ring-2 focus:ring-atlas-sage-deep/20 text-sm font-light text-atlas-fg-1 placeholder:text-atlas-fg-3 transition"
            />
          </div>
        </label>

        <label className="block">
          <span className="block text-2xs uppercase tracking-[0.18em] text-atlas-sage-deeper font-light mb-1.5">
            Mot de passe
          </span>
          <div className="relative">
            <Lock className="w-4 h-4 text-atlas-fg-3 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8 caractères minimum"
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-atlas-cream border border-atlas-line focus:border-atlas-sage-deep focus:outline-none focus:ring-2 focus:ring-atlas-sage-deep/20 text-sm font-light text-atlas-fg-1 placeholder:text-atlas-fg-3 transition"
            />
          </div>
          <p className="mt-1.5 text-2xs text-atlas-fg-3 font-light">
            8 caractères minimum. Mélangez lettres, chiffres et symboles.
          </p>
        </label>

        <button
          type="submit"
          disabled={loading || !email || password.length < 8}
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-atlas-sage-deep text-white font-light tracking-wider hover:bg-atlas-sage-deeper transition shadow-amber-deep text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Création…
            </>
          ) : (
            <>
              Créer mon compte
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

      <button
        type="button"
        onClick={handleGoogle}
        disabled={googleLoading}
        className="w-full inline-flex items-center justify-center gap-3 px-5 py-2.5 rounded-xl border border-atlas-line bg-atlas-panel hover:border-atlas-sage-deep/40 hover:bg-atlas-sage/5 transition text-sm font-light text-atlas-fg-1 disabled:opacity-50"
      >
        {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleGlyph className="w-4 h-4" />}
        S'inscrire avec Google
      </button>

      <p className="mt-6 text-center text-xs text-atlas-fg-3 font-light">
        Déjà un compte ?{' '}
        <Link
          to="/login"
          className="text-atlas-sage-deep hover:text-atlas-sage-deeper transition font-normal"
        >
          Se connecter
        </Link>
      </p>

      <p className="mt-4 text-center text-2xs text-atlas-fg-3 font-light leading-relaxed">
        En créant un compte, vous acceptez les{' '}
        <a
          href="https://atlas-studio.org/portal/legal/cgu"
          className="text-atlas-fg-2 hover:text-atlas-sage-deep underline underline-offset-2"
        >
          CGU
        </a>{' '}
        et la{' '}
        <a
          href="https://atlas-studio.org/portal/legal/privacy"
          className="text-atlas-fg-2 hover:text-atlas-sage-deep underline underline-offset-2"
        >
          politique de confidentialité
        </a>{' '}
        d'Atlas Studio.
      </p>
    </AuthLayout>
  );
}

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
