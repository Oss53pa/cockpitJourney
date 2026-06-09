import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { acceptWorkspaceInvite } from '../../lib/workspace';

/**
 * Route publique /workspace/accept?token=… — l'invité consomme le lien.
 * - Pas connecté → on mémorise le retour et on redirige vers /login.
 * - Connecté → on appelle cj-workspace-accept (lie le compte + crée le profil),
 *   puis on recharge /dashboard pour que le bootstrap charge l'espace partagé.
 */
export default function AcceptWorkspaceInvite() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<'working' | 'error' | 'done'>('working');
  const [message, setMessage] = useState('Validation de votre invitation…');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setStatus('error');
        setMessage('Lien d’invitation invalide.');
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        // Revenir ici après connexion.
        try {
          sessionStorage.setItem(
            'cj-post-login-redirect',
            `/workspace/accept?token=${encodeURIComponent(token)}`
          );
        } catch {
          /* ignore */
        }
        window.location.href = '/login';
        return;
      }
      try {
        await acceptWorkspaceInvite(token);
        if (cancelled) return;
        setStatus('done');
        setMessage('Invitation acceptée ! Ouverture du cockpit partagé…');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1200);
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
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
        {status === 'working' && (
          <div className="w-8 h-8 mx-auto mb-3 border-2 border-atlas-sage-deep border-t-transparent rounded-full animate-spin" />
        )}
        <p
          className={
            status === 'error'
              ? 'text-sm text-signal-red'
              : status === 'done'
                ? 'text-sm text-signal-green'
                : 'text-sm text-atlas-fg-2'
          }
        >
          {message}
        </p>
        {status === 'error' && (
          <a
            href="/dashboard"
            className="inline-block mt-5 text-xs text-atlas-sage-deep underline underline-offset-4"
          >
            Aller à mon cockpit
          </a>
        )}
      </div>
    </div>
  );
}
