import { useEffect, useState } from 'react';
import { Loader2, UserPlus, Trash2, RotateCcw, Mail, ShieldCheck } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { FieldLabel, TextInput, NativeSelect } from '../ui/Field';
import { useApp } from '../../stores/appStore';
import { cn, relativeTime } from '../../lib/utils';
import {
  listMembers,
  inviteMember,
  revokeMember,
  reactivateMember,
  changeMemberRole,
  type WorkspaceMember,
  type WorkspaceRole,
} from '../../lib/workspace';

const ROLE_LABEL: Record<WorkspaceRole, string> = {
  admin: 'Administrateur',
  editor: 'Éditeur',
  viewer: 'Lecteur',
};

export function WorkspaceMembersModal({ onClose }: { onClose: () => void }) {
  const pushToast = useApp((s) => s.pushToast);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('editor');
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setMembers(await listMembers());
    } catch (e) {
      pushToast({ kind: 'error', title: 'Chargement des membres impossible', body: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const invite = async () => {
    if (!email.trim() || inviting) return;
    setInviting(true);
    try {
      const { emailSent, link } = await inviteMember({
        email: email.trim(),
        fullName: fullName.trim() || undefined,
        role,
      });
      if (emailSent) {
        pushToast({ kind: 'success', title: 'Invitation envoyée', body: email.trim() });
      } else if (link) {
        await navigator.clipboard?.writeText(link).catch(() => {});
        pushToast({ kind: 'info', title: 'Lien copié (e-mail indisponible)', body: link });
      }
      setEmail('');
      setFullName('');
      await refresh();
    } catch (e) {
      pushToast({ kind: 'error', title: "Échec de l'invitation", body: (e as Error).message });
    } finally {
      setInviting(false);
    }
  };

  const withBusy = async (id: string, fn: () => Promise<void>, okTitle: string) => {
    setBusyId(id);
    try {
      await fn();
      pushToast({ kind: 'info', title: okTitle });
      await refresh();
    } catch (e) {
      pushToast({ kind: 'error', title: 'Action impossible', body: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Membres du cockpit"
      description="Donnez à un collaborateur un accès complet à votre cockpit (son propre compte)"
      size="lg"
      footer={
        <button onClick={onClose} className="btn-ghost text-sm px-3 py-1.5">
          Fermer
        </button>
      }
    >
      <div className="space-y-5">
        {/* Invitation */}
        <div className="panel p-4 space-y-3">
          <div className="flex items-center gap-2 text-2xs uppercase tracking-[0.16em] font-medium text-atlas-fg-3">
            <UserPlus className="w-3.5 h-3.5" /> Inviter un collaborateur
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <FieldLabel>Nom</FieldLabel>
              <TextInput
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jean Dupont"
              />
            </div>
            <div className="sm:col-span-1">
              <FieldLabel>E-mail</FieldLabel>
              <TextInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="collaborateur@entreprise.com"
              />
            </div>
            <div className="sm:col-span-1">
              <FieldLabel>Rôle</FieldLabel>
              <NativeSelect value={role} onChange={(e) => setRole(e.target.value as WorkspaceRole)}>
                <option value="admin">Administrateur</option>
                <option value="editor">Éditeur</option>
                <option value="viewer">Lecteur</option>
              </NativeSelect>
            </div>
          </div>
          <button
            onClick={invite}
            disabled={!email.trim() || inviting}
            className="btn-primary text-sm px-3.5 py-2 w-full justify-center disabled:opacity-50"
          >
            {inviting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Envoi…
              </>
            ) : (
              <>
                <Mail className="w-4 h-4" /> Envoyer l'invitation
              </>
            )}
          </button>
          <p className="text-2xs text-atlas-fg-3 leading-relaxed">
            Le collaborateur reçoit un lien, se connecte (ou crée son compte), et accède à{' '}
            <strong>tout votre cockpit</strong> (projets, tâches, budget…). Vous pouvez révoquer son accès à
            tout moment.
          </p>
        </div>

        {/* Liste */}
        <div>
          <div className="text-2xs uppercase tracking-[0.16em] font-medium text-atlas-fg-3 mb-2">
            Membres · {members.length}
          </div>
          {loading ? (
            <div className="text-center py-6 text-atlas-fg-3">
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            </div>
          ) : members.length === 0 ? (
            <div className="panel p-6 text-center text-sm text-atlas-fg-3">Aucun membre pour l'instant.</div>
          ) : (
            <div className="space-y-2">
              {members.map((m) => {
                const active = m.status === 'active';
                const pending = m.status === 'active' && !m.acceptedAt;
                return (
                  <div
                    key={m.id}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-white',
                      m.status === 'revoked' ? 'border-atlas-line opacity-60' : 'border-atlas-line'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-atlas-fg-1 truncate">{m.email}</div>
                      <div className="text-2xs text-atlas-fg-3">
                        Invité {relativeTime(m.createdAt)}
                        {m.acceptedAt ? ' · a rejoint' : pending ? ' · invitation en attente' : ''}
                      </div>
                    </div>
                    {m.status !== 'revoked' ? (
                      <select
                        value={m.role}
                        disabled={busyId === m.id}
                        onChange={(e) =>
                          void withBusy(
                            m.id,
                            () => changeMemberRole(m.id, e.target.value as WorkspaceRole),
                            'Rôle mis à jour'
                          )
                        }
                        className="text-2xs bg-white border border-atlas-line rounded-md px-2 py-1 outline-none focus:border-atlas-amber shrink-0"
                      >
                        <option value="admin">Admin</option>
                        <option value="editor">Éditeur</option>
                        <option value="viewer">Lecteur</option>
                      </select>
                    ) : (
                      <span className="chip text-[9px] px-1.5 py-0 border bg-signal-red/10 text-signal-red border-signal-red/30">
                        Révoqué
                      </span>
                    )}
                    <span className="hidden sm:inline-flex chip text-[9px] px-1.5 py-0 border bg-black/[0.04] text-atlas-fg-3 border-atlas-line">
                      {active ? <ShieldCheck className="w-3 h-3" /> : null} {ROLE_LABEL[m.role]}
                    </span>
                    {m.status === 'revoked' ? (
                      <button
                        onClick={() => void withBusy(m.id, () => reactivateMember(m.id), 'Membre réactivé')}
                        disabled={busyId === m.id}
                        className="btn-ghost !p-1.5"
                        title="Réactiver"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          if (confirm(`Révoquer l'accès de ${m.email} ?`))
                            void withBusy(m.id, () => revokeMember(m.id), 'Accès révoqué');
                        }}
                        disabled={busyId === m.id}
                        className="btn-ghost !p-1.5 hover:text-signal-red"
                        title="Révoquer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
