import { useEffect, useState } from 'react';
import {
  Link as LinkIcon,
  Copy,
  Check,
  Trash2,
  Eye,
  ExternalLink,
  Loader2,
  UserPlus,
  Mail,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { FieldLabel, TextInput } from '../ui/Field';
import { useApp } from '../../stores/appStore';
import { cn, relativeTime } from '../../lib/utils';
import {
  createShare,
  listShares,
  revokeShare,
  sendShareEmail,
  buildShareUrl,
  isShareActive,
  type Share,
  type ShareResourceType,
  type SharePermission,
} from '../../lib/shares';

interface Payload {
  resourceType: ShareResourceType;
  resourceId: string;
  resourceName?: string;
}

export function ShareModal({ payload, onClose }: { payload: Payload; onClose: () => void }) {
  const pushToast = useApp((s) => s.pushToast);
  const { resourceType, resourceId, resourceName } = payload;

  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<SharePermission>('contribute');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const resourceLabel = resourceType === 'project' ? 'ce projet' : 'cette tâche';

  const refresh = async () => {
    try {
      setShares(await listShares(resourceType, resourceId));
    } catch (e) {
      pushToast({ kind: 'error', title: 'Chargement des liens impossible', body: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceType, resourceId]);

  const create = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const trimmedEmail = email.trim();
      const { share, url } = await createShare({
        resourceType,
        resourceId,
        permission,
        label: label.trim() || undefined,
        email: trimmedEmail || undefined,
      });
      await navigator.clipboard?.writeText(url).catch(() => {});
      pushToast({ kind: 'success', title: 'Lien créé et copié', body: url });
      // Si un e-mail est renseigné, on l'envoie automatiquement.
      if (trimmedEmail) {
        try {
          const sent = await sendShareEmail(share.id, trimmedEmail);
          pushToast({
            kind: sent ? 'success' : 'info',
            title: sent ? 'Invitation envoyée par e-mail' : 'Lien prêt (envoi e-mail indisponible)',
            body: trimmedEmail,
          });
        } catch (mailErr) {
          pushToast({
            kind: 'warning',
            title: 'Lien créé, mais e-mail non envoyé',
            body: (mailErr as Error).message,
          });
        }
      }
      setLabel('');
      setEmail('');
      await refresh();
    } catch (e) {
      pushToast({ kind: 'error', title: 'Création du lien impossible', body: (e as Error).message });
    } finally {
      setCreating(false);
    }
  };

  const copy = (token: string) => {
    const url = buildShareUrl(token);
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopiedToken(token);
    setTimeout(() => setCopiedToken((t) => (t === token ? null : t)), 1800);
    pushToast({ kind: 'success', title: 'Lien copié' });
  };

  const revoke = async (s: Share) => {
    if (!confirm('Révoquer ce lien ? Le participant perdra immédiatement l’accès.')) return;
    try {
      await revokeShare(s.id);
      pushToast({ kind: 'info', title: 'Lien révoqué' });
      await refresh();
    } catch (e) {
      pushToast({ kind: 'error', title: 'Révocation impossible', body: (e as Error).message });
    }
  };

  const resend = async (s: Share) => {
    let target = s.inviteeEmail || '';
    if (!target) {
      const input = prompt('Adresse e-mail du destinataire :')?.trim();
      if (!input) return;
      target = input;
    }
    try {
      const sent = await sendShareEmail(s.id, target);
      pushToast({
        kind: sent ? 'success' : 'info',
        title: sent ? 'E-mail envoyé' : 'Envoi e-mail indisponible',
        body: target,
      });
      await refresh();
    } catch (e) {
      pushToast({ kind: 'error', title: 'Envoi impossible', body: (e as Error).message });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Partager — inviter un participant"
      description={resourceName ? `${resourceName} · ${resourceLabel}` : undefined}
      size="lg"
      footer={
        <button onClick={onClose} className="btn-ghost text-sm px-3 py-1.5">
          Fermer
        </button>
      }
    >
      <div className="space-y-5">
        {/* Création */}
        <div className="panel p-4 space-y-3">
          <div className="flex items-center gap-2 text-2xs uppercase tracking-[0.16em] font-medium text-atlas-fg-3">
            <UserPlus className="w-3.5 h-3.5" /> Nouveau lien de participation
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Nom du participant (optionnel)</FieldLabel>
              <TextInput
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ex. Prestataire graphiste"
              />
            </div>
            <div>
              <FieldLabel>E-mail (optionnel)</FieldLabel>
              <TextInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom@exemple.com"
              />
            </div>
          </div>

          <div>
            <FieldLabel>Niveau d’accès</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              <PermissionCard
                active={permission === 'contribute'}
                onClick={() => setPermission('contribute')}
                title="Contribuer"
                desc="Avancer le statut, cocher des sous-tâches, commenter"
              />
              <PermissionCard
                active={permission === 'view'}
                onClick={() => setPermission('view')}
                title="Lecture seule"
                desc="Consulter sans modifier"
              />
            </div>
          </div>

          <button
            onClick={create}
            disabled={creating}
            className="btn-primary text-sm px-3.5 py-2 w-full justify-center"
          >
            {creating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Création…
              </>
            ) : (
              <>
                <LinkIcon className="w-4 h-4" /> Créer le lien (copié automatiquement)
              </>
            )}
          </button>
          <p className="text-2xs text-atlas-fg-3 leading-relaxed">
            Toute personne disposant du lien pourra {permission === 'contribute' ? 'contribuer' : 'consulter'}{' '}
            {resourceLabel} jusqu’à ce que vous révoquiez le lien. Aucun compte requis.
          </p>
        </div>

        {/* Liste */}
        <div>
          <div className="text-2xs uppercase tracking-[0.16em] font-medium text-atlas-fg-3 mb-2">
            Liens existants · {shares.length}
          </div>
          {loading ? (
            <div className="text-center py-6 text-sm text-atlas-fg-3">
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            </div>
          ) : shares.length === 0 ? (
            <div className="panel p-6 text-center text-sm text-atlas-fg-3">Aucun lien pour l’instant.</div>
          ) : (
            <div className="space-y-2">
              {shares.map((s) => {
                const active = isShareActive(s);
                return (
                  <div
                    key={s.id}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-white',
                      active ? 'border-atlas-line' : 'border-atlas-line opacity-60'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-atlas-fg-1 truncate">
                          {s.label || s.inviteeEmail || 'Lien sans nom'}
                        </span>
                        <span
                          className={cn(
                            'chip text-[9px] px-1.5 py-0 border',
                            s.permission === 'contribute'
                              ? 'bg-atlas-amber/15 text-atlas-amber-deep border-atlas-amber/30'
                              : 'bg-black/[0.04] text-atlas-fg-3 border-atlas-line'
                          )}
                        >
                          {s.permission === 'contribute' ? 'Contribuer' : 'Lecture'}
                        </span>
                        {!active && (
                          <span className="chip text-[9px] px-1.5 py-0 border bg-signal-red/10 text-signal-red border-signal-red/30">
                            Révoqué
                          </span>
                        )}
                      </div>
                      <div className="text-2xs text-atlas-fg-3 mt-0.5">
                        Créé {relativeTime(s.createdAt)} · {s.accessCount} ouverture
                        {s.accessCount > 1 ? 's' : ''}
                      </div>
                    </div>
                    {active && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => resend(s)}
                          className="btn-ghost !p-1.5"
                          title={s.inviteeEmail ? `Renvoyer à ${s.inviteeEmail}` : 'Envoyer par e-mail'}
                        >
                          <Mail className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => copy(s.token)}
                          className="btn-ghost !p-1.5"
                          title="Copier le lien"
                        >
                          {copiedToken === s.token ? (
                            <Check className="w-4 h-4 text-signal-green" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        <a
                          href={buildShareUrl(s.token)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-ghost !p-1.5"
                          title="Prévisualiser l’interface participant"
                        >
                          <Eye className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => revoke(s)}
                          className="btn-ghost !p-1.5 hover:text-signal-red"
                          title="Révoquer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    {!active && (
                      <a
                        href={buildShareUrl(s.token)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-ghost !p-1.5 shrink-0"
                        title="Ouvrir (révoqué)"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
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

function PermissionCard({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-left rounded-xl border px-3 py-2.5 transition-colors',
        active
          ? 'border-atlas-amber bg-atlas-amber/[0.06]'
          : 'border-atlas-line bg-white hover:border-atlas-line-2'
      )}
    >
      <div className="text-sm font-medium text-atlas-fg-1">{title}</div>
      <div className="text-2xs text-atlas-fg-3 mt-0.5 leading-snug">{desc}</div>
    </button>
  );
}
