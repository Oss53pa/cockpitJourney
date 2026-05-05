import { useState } from 'react';
import { Mail, Loader2, ArrowRight, Sparkles } from 'lucide-react';
import { signInWithMagicLink, SUPABASE_CONFIGURED } from '../../lib/supabase';

export function LoginView() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('sending');
    setError(null);
    try {
      await signInWithMagicLink(email);
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
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
          {status !== 'sent' ? (
            <>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-atlas-sage-deep font-medium mb-4">
                <Sparkles className="w-3.5 h-3.5" />
                Connexion sécurisée
              </div>
              <h1 className="text-2xl text-atlas-fg-1 mb-2 leading-tight">
                Recevez un lien magique par e-mail
              </h1>
              <p className="text-sm text-atlas-fg-2 mb-6 leading-relaxed">
                Aucun mot de passe à retenir. Entrez votre adresse, ouvrez le lien dans votre boîte et vous
                serez connectée instantanément.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
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
                      disabled={status === 'sending'}
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
                  disabled={status === 'sending' || !email.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-atlas-sage-deep text-white font-medium hover:bg-atlas-sage-deeper transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === 'sending' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Envoi en cours…
                    </>
                  ) : (
                    <>
                      Recevoir le lien magique
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-atlas-sage/20 flex items-center justify-center">
                <Mail className="w-6 h-6 text-atlas-sage-deep" />
              </div>
              <h2 className="text-xl text-atlas-fg-1 mb-2">Vérifiez votre boîte</h2>
              <p className="text-sm text-atlas-fg-2 leading-relaxed">
                Un lien de connexion vient d'être envoyé à
                <br />
                <span className="font-medium text-atlas-fg-1">{email}</span>. Cliquez dessus pour entrer dans
                CockpitJourney.
              </p>
              <button
                onClick={() => setStatus('idle')}
                className="mt-6 text-xs uppercase tracking-wider text-atlas-sage-deep hover:text-atlas-sage-deeper transition font-medium"
              >
                ← Utiliser une autre adresse
              </button>
            </div>
          )}
        </div>

        <div className="text-center mt-6 text-xs text-atlas-fg-3">Atlas Studio · CockpitJourney v1.0</div>
      </div>
    </div>
  );
}
