import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { FieldLabel, NativeSelect, TextInput } from '../ui/Field';
import { useApp } from '../../stores/appStore';
import { supabase } from '../../lib/supabase';

// Roles allowed to invite others — kept aligned with the server-side
// `invite-user` edge function. Defense in depth: the edge re-validates,
// but hiding the action client-side prevents pointless API calls and a
// confusing error toast for reader/commenter accounts.
const CAN_INVITE = new Set(['owner', 'admin', 'app_super_admin', 'app_admin']);

export function InviteTeamModal({ onClose }: { onClose: () => void }) {
  const pushToast = useApp((s) => s.pushToast);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [sending, setSending] = useState(false);
  const [seatRole, setSeatRole] = useState<string | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);
  const canInvite = seatRole !== null && CAN_INVITE.has(seatRole);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setSeatRole('');
          return;
        }
        const { data: seat } = await supabase
          .from('licence_seats')
          .select('role')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!cancelled) setSeatRole((seat?.role as string) ?? '');
      } catch {
        if (!cancelled) setSeatRole('');
      } finally {
        if (!cancelled) setCheckingRole(false);
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
      } = await supabase.auth.getSession();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!session || !user) throw new Error('Session expirée — reconnectez-vous.');

      // Resolve the inviter's active seat → licence + tenant context.
      const { data: seat, error: seatErr } = await supabase
        .from('licence_seats')
        .select('licence_id, tenant_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
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

      pushToast({ kind: 'success', title: 'Invitation envoyée', body: `${email} · rôle ${role}` });
      setEmail('');
      onClose();
    } catch (e) {
      pushToast({ kind: 'error', title: "Échec de l'invitation", body: (e as Error).message });
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Inviter quelqu'un"
      description="Envoyez un lien magique par email · expire sous 7 jours"
      size="md"
      footer={
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
      }
    >
      {checkingRole ? (
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
