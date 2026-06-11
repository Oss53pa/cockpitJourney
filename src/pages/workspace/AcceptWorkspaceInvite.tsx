import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { acceptWorkspaceInvite } from '../../lib/workspace';
import { setPostLoginTarget } from '../../lib/authRedirect';

/**
 * Route publique /workspace/accept?token=… — l'invité consomme le lien.
 * - Pas connecté → on lui montre un écran d'invitation clair avec DEUX
 *   chemins explicites : créer son compte OU se connecter (sans l'envoyer
 *   en silence sur /login où le lien « S'inscrire » est secondaire).
 * - Connecté → on appelle cj-workspace-accept (lie le compte + crée le
 *   profil), puis on bascule sur /dashboard.
 */
export default function AcceptWorkspaceInvite() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  type Phase = 'checking' | 'invite' | 'working' | 'error' | 'done';
  const [phase, setPhase] = useState<Phase>('checking');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setPhase('error');
        setMessage("Lien d'invitation invalide.");
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) {
        // On mémorise la cible pour QUE LA NAVIGATION (clic des boutons
        // ci-dessous) ramène ici après auth — et signUpWithPassword passe
        // aussi la cible en ?next=… pour survivre au nouvel onglet ouvert
        // par le client mail à la confirmation.
        setPostLoginTarget(`/workspace/accept?token=${encodeURIComponent(token)}`);
        setPhase('invite');
        return;
      }
      setPhase('working');
      setMessage('Activation de votre accès…');
      try {
        await acceptWorkspaceInvite(token);
        if (cancelled) return;
        setPhase('done');
        setMessage('Invitation acceptée ! Ouverture du cockpit partagé…');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1200);
      } catch (e) {
        if (cancelled) return;
        setPhase('error');
        setMessage((e as Error).message || 'Acceptation impossible.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-atlas-cream flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white border border-atlas-line rounded-2xl shadow-soft-pop p-8 text-center">
        <div className="font-logo text-3xl text-atlas-fg-1 mb-1">
          Cockpit<span className="text-atlas-sage-deep">Journey</span>
        </div>
        <div className="text-2xs uppercase tracking-[0.2em] text-atlas-fg-3 mb-5">Espace partagé</div>

        {phase === 'checking' && (
          <>
            <div className="w-8 h-8 mx-auto mb-3 border-2 border-atlas-sage-deep border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-atlas-fg-2">Validation de votre invitation…</p>
          </>
        )}

        {phase === 'invite' && (
          <>
            <h1 className="text-base font-light text-atlas-fg-1 mb-1.5">Vous êtes invité(e)</h1>
            <p className="text-sm text-atlas-fg-2 leading-relaxed mb-6">
              Quelqu'un vous donne accès à son cockpit. Créez votre compte (gratuit, 1 min) ou connectez-vous
              pour rejoindre l'espace.
            </p>
            <a
              href="/signup"
              className="block w-full px-5 py-2.5 rounded-xl bg-atlas-sage-deep text-white font-light text-sm hover:bg-atlas-sage-deeper transition mb-2.5"
            >
              Créer mon compte
            </a>
            <a
              href="/login"
              className="block w-full px-5 py-2.5 rounded-xl border border-atlas-line bg-atlas-panel hover:border-atlas-sage-deep/40 text-sm font-light text-atlas-fg-1 transition"
            >
              J'ai déjà un compte
            </a>
            <p className="mt-5 text-2xs text-atlas-fg-3 leading-relaxed">
              Une fois connecté(e), vous reviendrez automatiquement ici et rejoindrez l'espace partagé.
            </p>
          </>
        )}

        {phase === 'working' && (
          <>
            <div className="w-8 h-8 mx-auto mb-3 border-2 border-atlas-sage-deep border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-atlas-fg-2">{message}</p>
          </>
        )}

        {phase === 'done' && <p className="text-sm text-signal-green">{message}</p>}

        {phase === 'error' && (
          <>
            <p className="text-sm text-signal-red">{message}</p>
            <a
              href="/dashboard"
              className="inline-block mt-5 text-xs text-atlas-sage-deep underline underline-offset-4"
            >
              Aller à mon cockpit
            </a>
          </>
        )}
      </div>
    </div>
  );
}
