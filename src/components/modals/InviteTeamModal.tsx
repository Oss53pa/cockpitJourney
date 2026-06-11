import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { FieldLabel, NativeSelect, TextInput } from '../ui/Field';
import { useApp } from '../../stores/appStore';
import { supabase } from '../../lib/supabase';
import { getCurrentAuthUserId } from '../../lib/repo';

// Roles allowed to invite others — kept aligned with the server-side
// `invite-user` edge function. Defense in depth: the edge re-validates,
// but hiding the action client-side prevents pointless API calls and a
// confusing error toast for reader/commenter accounts.
const CAN_INVITE = new Set(['owner', 'admin', 'app_super_admin', 'app_admin']);

// Every supabase-js call below (even REST, via its access-token lookup)
// waits on the cross-tab auth navigator lock. A frozen sibling tab or
// installed PWA holding that lock hangs the call forever — never let
// that pin the modal on "Vérification des droits…".
const AUTH_TIMEOUT_MS = 8_000;

function withTimeout<T>(p: PromiseLike<T>, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), AUTH_TIMEOUT_MS);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

const TIMEOUT_MSG = 'Délai dépassé — fermez les autres onglets CockpitJourney et réessayez.';

export function InviteTeamModal({ onClose }: { onClose: () => void }) {
  const pushToast = useApp((s) => s.pushToast);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [sending, setSending] = useState(false);
  const [seatRole, setSeatRole] = useState<string | null>(null);
  const [access, setAccess] = useState<'checking' | 'allowed' | 'denied'>('checking');
  const canInvite = access === 'allowed';
  // After a submit we keep the modal open if the seat was created but the
  // e-mail couldn't be sent (RESEND_API_KEY missing, domain not verified,
  // etc.) — the inviter needs the link to share it manually.
  const [result, setResult] = useState<{
    email: string;
    url: string;
    sent: boolean;
    warning?: string;
    error?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // The app already knows who is signed in — avoid getUser(): it
        // goes through the auth lock AND a network round-trip.
        const uid =
          getCurrentAuthUserId() ??
          (await withTimeout(supabase.auth.getSession(), TIMEOUT_MSG)).data.session?.user?.id;
        if (!uid) {
          if (!cancelled) setAccess('denied');
          return;
        }
        const { data: seat, error } = await withTimeout(
          supabase
            .from('licence_seats')
            .select('role')
            .eq('user_id', uid)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          TIMEOUT_MSG
        );
        if (error) throw error;
        if (!cancelled) {
          const r = (seat?.role as string) ?? '';
          setSeatRole(r);
          setAccess(CAN_INVITE.has(r) ? 'allowed' : 'denied');
        }
      } catch {
        // Fail-open: show the form anyway — the `invite-user` edge function
        // re-validates the role server-side. Failing closed on a network
        // hiccup or a held auth lock would lock out legitimate admins.
        if (!cancelled) setAccess('allowed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    if (!email.trim() || sending) return;
    setSending(true);
    try {
      const {
        data: { session },
      } = await withTimeout(supabase.auth.getSession(), TIMEOUT_MSG);
      if (!session) throw new Error('Session expirée — reconnectez-vous.');
      const uid = getCurrentAuthUserId() ?? session.user.id;

      // Resolve the inviter's active seat → licence + tenant context.
      const { data: seat, error: seatErr } = await withTimeout(
        supabase
          .from('licence_seats')
          .select('licence_id, tenant_id')
          .eq('user_id', uid)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        TIMEOUT_MSG
      );
      if (seatErr) throw seatErr;
      if (!seat) throw new Error('Aucune licence active — gérez l’équipe depuis Paramètres.');

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          licence_id: seat.licence_id,
          tenant_id: seat.tenant_id,
          email: email.trim(),
          full_name: email.trim().split('@')[0],
          role,
          send_email: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);

      const inviteUrl = (data.invite_url as string) || '';
      const emailSent = data.email_sent !== false; // legacy edge functions return success without this field
      const emailWarning = data.email_warning as string | undefined;
      const emailError = data.email_error as string | undefined;

      if (emailSent && !emailWarning && !emailError) {
        pushToast({ kind: 'success', title: 'Invitation envoyée', body: `${email} · rôle ${role}` });
        setEmail('');
        onClose();
        return;
      }

      // Seat created but e-mail didn't go out — surface the link so the
      // inviter can share it manually (WhatsApp, perso mail, …).
      pushToast({
        kind: 'warning',
        title: 'E-mail non envoyé',
        body: 'Le compte est créé. Partagez le lien manuellement.',
      });
      setResult({
        email: email.trim(),
        url: inviteUrl,
        sent: emailSent,
        warning: emailWarning,
        error: emailError,
      });
    } catch (e) {
      pushToast({ kind: 'error', title: "Échec de l'invitation", body: (e as Error).message });
    } finally {
      setSending(false);
    }
  };

  const copyLink = async () => {
    if (!result?.url) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      pushToast({ kind: 'error', title: 'Impossible de copier' });
    }
  };

  const resetForNext = () => {
    setResult(null);
    setEmail('');
    setCopied(false);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Inviter quelqu'un"
      description="Envoyez un lien magique par email · expire sous 7 jours"
      size="md"
      footer={
        result ? (
          <>
            <button onClick={onClose} className="btn-ghost text-sm px-3 py-1.5">
              Terminer
            </button>
            <button onClick={resetForNext} className="btn-primary text-sm px-3.5 py-1.5">
              Nouvelle invitation
            </button>
          </>
        ) : (
          <>
            <button onClick={onClose} className="btn-ghost text-sm px-3 py-1.5">
              Fermer
            </button>
            <button
              disabled={!email.trim() || sending || !canInvite}
              onClick={submit}
              className="btn-primary text-sm px-3.5 py-1.5"
            >
              {sending ? 'Envoi…' : "Envoyer l'invitation"}
            </button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          <div className="text-sm text-atlas-fg-2">
            Le compte de <strong>{result.email}</strong> est créé, mais l'e-mail d'invitation n'a pas pu
            partir.
          </div>
          {result.error && (
            <div className="text-2xs text-signal-red bg-signal-red/5 border border-signal-red/20 rounded-md px-3 py-2 font-mono break-words">
              {result.error}
            </div>
          )}
          {result.warning && !result.error && (
            <div className="text-2xs text-atlas-fg-3 bg-atlas-amber/5 border border-atlas-amber/20 rounded-md px-3 py-2">
              {result.warning}
            </div>
          )}
          <div>
            <FieldLabel hint="copiez et partagez via WhatsApp, e-mail perso, etc.">
              Lien à partager
            </FieldLabel>
            <div className="flex gap-2">
              <TextInput value={result.url} readOnly onFocus={(e) => e.currentTarget.select()} />
              <button onClick={copyLink} className="btn-secondary text-sm px-3 py-1.5 shrink-0" type="button">
                {copied ? 'Copié' : 'Copier'}
              </button>
            </div>
            <p className="text-2xs text-atlas-fg-3 mt-1.5">
              Lien valide 72 h. Toute personne avec ce lien pourra rejoindre le workspace.
            </p>
          </div>
        </div>
      ) : access === 'checking' ? (
        <div className="text-sm text-atlas-fg-3 py-6 text-center">Vérification des droits…</div>
      ) : !canInvite ? (
        <div className="text-sm text-atlas-fg-2 py-4">
          Seuls les propriétaires et administrateurs peuvent inviter de nouveaux membres.
          {seatRole && (
            <span className="block text-2xs text-atlas-fg-3 mt-1">
              Votre rôle actuel : <strong>{seatRole}</strong>
            </span>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <FieldLabel>Email</FieldLabel>
            <TextInput
              autoFocus
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom@entreprise.com"
            />
          </div>
          <div>
            <FieldLabel>Rôle</FieldLabel>
            <NativeSelect value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="owner">Propriétaire</option>
              <option value="editor">Éditeur</option>
              <option value="commenter">Commentateur</option>
              <option value="reader">Lecteur</option>
            </NativeSelect>
          </div>
        </div>
      )}
    </Modal>
  );
}
