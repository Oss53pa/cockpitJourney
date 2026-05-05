import { useEffect, useRef, useState } from 'react';
import { Mail, Loader2, ArrowRight, Sparkles, KeyRound, Zap } from 'lucide-react';
import {
  sendEmailOtp,
  verifyEmailOtp,
  signInAsDev,
  DEV_MODE,
  DEV_USER_EMAIL,
  SUPABASE_CONFIGURED,
} from '../../lib/supabase';

type Step = 'email' | 'code' | 'verifying';

/**
 * Map raw Supabase auth errors to actionable French messages. The default
 * Supabase SMTP has a tight rate limit (~4 emails/hour) and gives a generic
 * "Error sending magic link email" — we surface the underlying cause and
 * always nudge the user toward the dev login fallback.
 */
function humanizeAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes('rate') || lower.includes('too many')) {
    return 'Limite d’envoi atteinte (Supabase). Réessayez dans 1–2 minutes ou utilisez la connexion développeur ci-dessous.';
  }
  if (lower.includes('error sending') || lower.includes('smtp') || lower.includes('email')) {
    return "Le service e-mail Supabase n'a pas pu envoyer le code (rate limit ou SMTP non configuré). Utilisez la connexion développeur ci-dessous, ou configurez un SMTP custom dans Supabase Auth.";
  }
  if (lower.includes('invalid') && lower.includes('email')) {
    return 'Adresse e-mail invalide.';
  }
  if (lower.includes('signup') && lower.includes('disable')) {
    return 'Les inscriptions par e-mail sont désactivées sur ce projet Supabase. Activez-les dans Auth → Providers → Email.';
  }
  return raw || 'Erreur inconnue';
}

export function LoginView() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [devLoading, setDevLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  // Autofocus the code input on step transition
  useEffect(() => {
    if (step === 'code') codeInputRef.current?.focus();
  }, [step]);

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setError(null);
    try {
      await sendEmailOtp(email);
      setStep('code');
    } catch (err) {
      setError(humanizeAuthError(err));
    } finally {
      setSending(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = code.replace(/\s+/g, '').trim();
    if (token.length < 6) {
      setError('Le code fait 6 chiffres.');
      return;
    }
    setStep('verifying');
    setError(null);
    try {
      await verifyEmailOtp(email, token);
      // onAuthStateChange in appStore will pick it up and hydrate the app.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Code invalide');
      setStep('code');
    }
  };

  const handleResend = async () => {
    setSending(true);
    setError(null);
    try {
      await sendEmailOtp(email);
    } catch (err) {
      setError(humanizeAuthError(err));
    } finally {
      setSending(false);
    }
  };

  const handleDevLogin = async () => {
    setDevLoading(true);
    setError(null);
    try {
      await signInAsDev();
      // onAuthStateChange takes over from here.
    } catch (err) {
      setError(humanizeAuthError(err));
      setDevLoading(false);
    }
  };

  if (!SUPABASE_CONFIGURED) {
    return (
      <div className="min-h-screen flex items-start justify-center bg-atlas-cream px-6 py-12">
        <div className="max-w-lg w-full bg-white rounded-2xl shadow-card-hover border border-black/5 p-8 mt-12">
          <div className="text-signal-red font-medium mb-2">Supabase non configuré</div>
          <div className="text-sm text-atlas-fg-2 leading-relaxed">
            Cette installation n'a pas accès à la base de données. Copiez{' '}
            <code className="px-1.5 py-0.5 bg-atlas-cream rounded text-atlas-sage-deep">.env.example</code>{' '}
            vers <code className="px-1.5 py-0.5 bg-atlas-cream rounded text-atlas-sage-deep">.env.local</code>{' '}
            et renseignez vos clés Supabase, puis redémarrez le serveur de dev.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full overflow-y-auto bg-gradient-to-br from-atlas-cream via-white to-atlas-sage/10">
      <div className="min-h-screen flex items-start sm:items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
        <div className="max-w-md w-full">
          {/* Brand mark */}
          <div className="text-center mb-6 sm:mb-8">
            <div className="font-logo text-4xl sm:text-5xl text-atlas-fg-1 leading-none mb-2 sm:mb-3">
              Cockpit<span className="text-atlas-sage-deep">Journey</span>
            </div>
            <div className="text-2xs sm:text-xs uppercase tracking-[0.22em] text-atlas-fg-3 font-medium">
              Pilotez votre journée · propulsé par PROPH3T
            </div>
          </div>

          {/* Login card */}
          <div className="bg-white rounded-2xl shadow-card-hover border border-black/5 p-6 sm:p-8">
            {step === 'email' && (
              <>
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-atlas-sage-deep font-medium mb-3">
                  <Sparkles className="w-3.5 h-3.5" />
                  Connexion sécurisée
                </div>
                <h1 className="text-xl sm:text-2xl text-atlas-fg-1 mb-2 leading-tight">
                  Recevez un code de connexion
                </h1>
                <p className="text-sm text-atlas-fg-2 mb-5 leading-relaxed">
                  Aucun mot de passe à retenir. Entrez votre adresse, recopiez le code à 6 chiffres reçu par
                  e-mail.
                </p>

                <form onSubmit={handleSendEmail} className="space-y-3">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-atlas-fg-3 font-medium mb-2">
                      Adresse e-mail
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-atlas-fg-3" />
                      <input
                        autoFocus
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="vous@example.com"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-black/10 bg-white focus:outline-none focus:ring-2 focus:ring-atlas-sage-deep/30 focus:border-atlas-sage-deep transition"
                        disabled={sending}
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="text-sm text-signal-red bg-signal-red/5 border border-signal-red/20 rounded-lg px-3 py-2">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={sending || !email.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-atlas-sage-deep text-white text-sm font-semibold tracking-wide hover:bg-atlas-sage-deeper transition disabled:opacity-50 disabled:cursor-not-allowed shadow-amber-deep"
                  >
                    {sending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Envoi en cours…
                      </>
                    ) : (
                      <>
                        Recevoir le code
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>

                {/* Dev-only quick login */}
                {DEV_MODE && (
                  <>
                    <div className="my-5 flex items-center gap-3 text-2xs uppercase tracking-[0.18em] text-atlas-fg-3">
                      <div className="flex-1 h-px bg-black/10" />
                      ou (dev)
                      <div className="flex-1 h-px bg-black/10" />
                    </div>
                    <button
                      type="button"
                      onClick={handleDevLogin}
                      disabled={devLoading}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-atlas-sage-deep/30 bg-atlas-sage/10 text-atlas-sage-deeper font-medium hover:bg-atlas-sage/20 transition disabled:opacity-50"
                    >
                      {devLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Connexion…
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4" />
                          Connexion développeur
                        </>
                      )}
                    </button>
                    <p className="mt-2 text-2xs text-atlas-fg-3 leading-relaxed">
                      Connexion instantanée comme <code className="font-mono">{DEV_USER_EMAIL}</code> —
                      cockpit isolé par RLS, parfait pour le dev local.
                    </p>
                  </>
                )}
              </>
            )}

            {(step === 'code' || step === 'verifying') && (
              <>
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-atlas-sage-deep font-medium mb-3">
                  <KeyRound className="w-3.5 h-3.5" />
                  Code de vérification
                </div>
                <h1 className="text-xl sm:text-2xl text-atlas-fg-1 mb-2 leading-tight">
                  Vérifiez votre boîte
                </h1>
                <p className="text-sm text-atlas-fg-2 mb-5 leading-relaxed">
                  Un code à 6 chiffres a été envoyé à{' '}
                  <span className="font-medium text-atlas-fg-1">{email}</span>. Recopiez-le ci-dessous.
                </p>

                <form onSubmit={handleVerifyCode} className="space-y-3">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-atlas-fg-3 font-medium mb-2">
                      Code à 6 chiffres
                    </label>
                    <input
                      ref={codeInputRef}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="••••••"
                      className="w-full px-4 py-3 rounded-xl border border-black/10 bg-white focus:outline-none focus:ring-2 focus:ring-atlas-sage-deep/30 focus:border-atlas-sage-deep transition text-center text-xl tracking-[0.5em] font-mono"
                      disabled={step === 'verifying'}
                    />
                  </div>

                  {error && (
                    <div className="text-sm text-signal-red bg-signal-red/5 border border-signal-red/20 rounded-lg px-3 py-2">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={step === 'verifying' || code.length < 6}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-atlas-sage-deep text-white text-sm font-semibold tracking-wide hover:bg-atlas-sage-deeper transition disabled:opacity-50 disabled:cursor-not-allowed shadow-amber-deep"
                  >
                    {step === 'verifying' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Vérification…
                      </>
                    ) : (
                      <>
                        Valider
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-between pt-1 text-2xs">
                    <button
                      type="button"
                      onClick={() => {
                        setStep('email');
                        setCode('');
                        setError(null);
                      }}
                      className="uppercase tracking-wider text-atlas-fg-3 hover:text-atlas-fg-1 transition font-medium"
                    >
                      ← Changer d'adresse
                    </button>
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={sending || step === 'verifying'}
                      className="uppercase tracking-wider text-atlas-sage-deep hover:text-atlas-sage-deeper transition font-medium disabled:opacity-50"
                    >
                      {sending ? 'Envoi…' : 'Renvoyer le code'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>

          <div className="text-center mt-5 text-2xs text-atlas-fg-3">Atlas Studio · CockpitJourney v1.0</div>
        </div>
      </div>
    </div>
  );
}
