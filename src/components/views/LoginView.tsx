import { useEffect, useRef, useState } from 'react';
import { Mail, Loader2, ArrowRight, Sparkles, KeyRound } from 'lucide-react';
import { sendEmailOtp, verifyEmailOtp, SUPABASE_CONFIGURED } from '../../lib/supabase';

type Step = 'email' | 'code' | 'verifying';

export function LoginView() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
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
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
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
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSending(false);
    }
  };

  if (!SUPABASE_CONFIGURED) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-atlas-cream px-6">
        <div className="max-w-lg w-full bg-white rounded-2xl shadow-card-hover border border-black/5 p-8">
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-atlas-cream via-white to-atlas-sage/10 px-6">
      <div className="max-w-md w-full">
        {/* Brand mark */}
        <div className="text-center mb-10">
          <div className="font-logo text-5xl text-atlas-fg-1 leading-none mb-3">
            Cockpit<span className="text-atlas-sage-deep">Journey</span>
          </div>
          <div className="text-xs uppercase tracking-[0.22em] text-atlas-fg-3 font-medium">
            Pilotez votre journée · propulsé par PROPH3T
          </div>
        </div>

        {/* Login card */}
        <div className="bg-white rounded-2xl shadow-card-hover border border-black/5 p-8">
          {step === 'email' && (
            <>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-atlas-sage-deep font-medium mb-4">
                <Sparkles className="w-3.5 h-3.5" />
                Connexion sécurisée
              </div>
              <h1 className="text-2xl text-atlas-fg-1 mb-2 leading-tight">Recevez un code de connexion</h1>
              <p className="text-sm text-atlas-fg-2 mb-6 leading-relaxed">
                Aucun mot de passe à retenir. Entrez votre adresse, recopiez le code à 6 chiffres reçu par
                e-mail.
              </p>

              <form onSubmit={handleSendEmail} className="space-y-4">
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
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-atlas-sage-deep text-white font-medium hover:bg-atlas-sage-deeper transition disabled:opacity-50 disabled:cursor-not-allowed"
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
            </>
          )}

          {(step === 'code' || step === 'verifying') && (
            <>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-atlas-sage-deep font-medium mb-4">
                <KeyRound className="w-3.5 h-3.5" />
                Code de vérification
              </div>
              <h1 className="text-2xl text-atlas-fg-1 mb-2 leading-tight">Vérifiez votre boîte</h1>
              <p className="text-sm text-atlas-fg-2 mb-6 leading-relaxed">
                Un code à 6 chiffres a été envoyé à{' '}
                <span className="font-medium text-atlas-fg-1">{email}</span>. Recopiez-le ci-dessous.
              </p>

              <form onSubmit={handleVerifyCode} className="space-y-4">
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
                    className="w-full px-4 py-4 rounded-xl border border-black/10 bg-white focus:outline-none focus:ring-2 focus:ring-atlas-sage-deep/30 focus:border-atlas-sage-deep transition text-center text-2xl tracking-[0.55em] font-mono"
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
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-atlas-sage-deep text-white font-medium hover:bg-atlas-sage-deeper transition disabled:opacity-50 disabled:cursor-not-allowed"
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

                <div className="flex items-center justify-between pt-2 text-xs">
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

        <div className="text-center mt-6 text-xs text-atlas-fg-3">Atlas Studio · CockpitJourney v1.0</div>
      </div>
    </div>
  );
}
