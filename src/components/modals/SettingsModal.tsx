import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../ui/Modal';
import { useApp, useCurrentUser } from '../../stores/appStore';
import { FieldLabel, NativeSelect, Switch, TextInput } from '../ui/Field';
import { Avatar } from '../ui/Avatar';
import {
  RotateCcw,
  Sparkles,
  ExternalLink,
  KeyRound,
  LogOut,
  Pencil,
  Check,
  X,
  Plug,
  ChevronRight,
} from 'lucide-react';
import { PROVIDERS, type ProphProvider } from '../../lib/proph3t';
import { BillingSection } from './BillingSection';
import { SectionErrorBoundary } from '../SectionErrorBoundary';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const me = useCurrentUser();
  const resetSeed = useApp((s) => s.resetSeed);
  const signOut = useApp((s) => s.signOut);
  const authEmail = useApp((s) => s.authEmail);
  const updateProfile = useApp((s) => s.updateProfile);
  const navigate = useNavigate();

  const [editingProfile, setEditingProfile] = useState(false);
  const [draftName, setDraftName] = useState(me.name);
  const [draftRole, setDraftRole] = useState(me.role);
  const [savingProfile, setSavingProfile] = useState(false);

  const saveProfile = async () => {
    if (!draftName.trim()) return;
    setSavingProfile(true);
    try {
      await updateProfile({ name: draftName.trim(), role: draftRole });
      setEditingProfile(false);
    } finally {
      setSavingProfile(false);
    }
  };

  const cancelEdit = () => {
    setDraftName(me.name);
    setDraftRole(me.role);
    setEditingProfile(false);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Paramètres"
      description="Profil, préférences et notifications"
      size="lg"
      footer={
        <button onClick={onClose} className="btn-primary text-sm px-3.5 py-1.5">
          Terminé
        </button>
      }
    >
      <div className="space-y-6">
        <section>
          <h3 className="text-2xs uppercase tracking-wider font-medium text-atlas-fg-3 mb-3">Profil</h3>
          <div className="flex items-start gap-3 panel p-4">
            <Avatar user={me} size="lg" />
            {editingProfile ? (
              <div className="flex-1 space-y-2.5">
                <div>
                  <FieldLabel>Nom complet</FieldLabel>
                  <TextInput
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="Prénom Nom"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveProfile();
                      if (e.key === 'Escape') cancelEdit();
                    }}
                  />
                </div>
                <div>
                  <FieldLabel>Rôle / fonction</FieldLabel>
                  <TextInput
                    value={draftRole}
                    onChange={(e) => setDraftRole(e.target.value)}
                    placeholder="CEO · Atlas Studio"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveProfile();
                      if (e.key === 'Escape') cancelEdit();
                    }}
                  />
                </div>
                <div className="text-2xs text-atlas-fg-3">
                  E-mail : <span className="font-mono">{me.email}</span> · non modifiable ici (passe par
                  Supabase Auth)
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    onClick={() => void saveProfile()}
                    disabled={savingProfile || !draftName.trim()}
                    className="btn-primary text-xs px-2.5 py-1.5 disabled:opacity-50"
                  >
                    <Check className="w-3 h-3" /> Enregistrer
                  </button>
                  <button
                    onClick={cancelEdit}
                    disabled={savingProfile}
                    className="btn-ghost text-xs px-2.5 py-1.5"
                  >
                    <X className="w-3 h-3" /> Annuler
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1">
                  <div className="text-sm font-medium text-atlas-fg-1">{me.name}</div>
                  <div className="text-2xs text-atlas-fg-3">
                    {me.email} · {me.role}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setDraftName(me.name);
                    setDraftRole(me.role);
                    setEditingProfile(true);
                  }}
                  className="btn-secondary text-xs px-2.5 py-1.5"
                >
                  <Pencil className="w-3 h-3" /> Modifier
                </button>
              </>
            )}
          </div>
        </section>

        <section>
          <h3 className="text-2xs uppercase tracking-wider font-medium text-atlas-fg-3 mb-3">Facturation</h3>
          <SectionErrorBoundary section="La facturation" scope="settings:billing">
            <BillingSection />
          </SectionErrorBoundary>
        </section>

        <section>
          <h3 className="text-2xs uppercase tracking-wider font-medium text-atlas-fg-3 mb-3">Préférences</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Thème</FieldLabel>
              <NativeSelect value={settings.theme} onChange={(e) => update({ theme: e.target.value as any })}>
                <option value="light">Clair</option>
                <option value="dark">Sombre</option>
                <option value="auto">Automatique (système)</option>
              </NativeSelect>
            </div>
            <div>
              <FieldLabel>Langue</FieldLabel>
              <NativeSelect
                value={settings.locale}
                onChange={(e) => update({ locale: e.target.value as any })}
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
              </NativeSelect>
            </div>
            <div>
              <FieldLabel>Premier jour de la semaine</FieldLabel>
              <NativeSelect
                value={settings.weekStart}
                onChange={(e) => update({ weekStart: Number(e.target.value) as 1 | 7 })}
              >
                <option value={1}>Lundi</option>
                <option value={7}>Dimanche</option>
              </NativeSelect>
            </div>
            <div>
              <FieldLabel>Heure du Daily Brief</FieldLabel>
              <TextInput
                type="number"
                min={0}
                max={23}
                value={settings.dailyBriefHour}
                onChange={(e) => update({ dailyBriefHour: Number(e.target.value) })}
              />
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-2xs uppercase tracking-wider font-medium text-atlas-fg-3 mb-3">
            Notifications
          </h3>
          <div className="space-y-2">
            <Row
              label="E-mail"
              desc="Notifications, rapports et résumés"
              checked={settings.notificationsEmail}
              onChange={(v) => update({ notificationsEmail: v })}
            />
            <Row
              label="Push (web + mobile)"
              desc="Mentions, échéances et automations"
              checked={settings.notificationsPush}
              onChange={(v) => update({ notificationsPush: v })}
            />
            <Row
              label="WhatsApp Business"
              desc="Plan Pro+ uniquement"
              checked={settings.notificationsWhatsapp}
              onChange={(v) => update({ notificationsWhatsapp: v })}
            />
            <Row
              label="Sons d'interface"
              desc="Bip de complétion, alertes"
              checked={settings.soundsEnabled}
              onChange={(v) => update({ soundsEnabled: v })}
            />
          </div>
        </section>

        <section>
          <h3 className="text-2xs uppercase tracking-wider font-medium text-atlas-fg-3 mb-3 inline-flex items-center gap-2">
            <Sparkles className="w-3 h-3 text-atlas-amber-deep" /> PROPH3T · IA
          </h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Fournisseur</FieldLabel>
                <NativeSelect
                  value={settings.proph3t.provider}
                  onChange={(e) => {
                    const provider = e.target.value as ProphProvider;
                    update({
                      proph3t: { ...settings.proph3t, provider, model: PROVIDERS[provider].defaultModel },
                    });
                  }}
                >
                  {(Object.keys(PROVIDERS) as ProphProvider[]).map((p) => (
                    <option key={p} value={p}>
                      {PROVIDERS[p].label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div>
                <FieldLabel>Modèle</FieldLabel>
                <TextInput
                  value={settings.proph3t.model}
                  onChange={(e) => update({ proph3t: { ...settings.proph3t, model: e.target.value } })}
                  placeholder={PROVIDERS[settings.proph3t.provider].defaultModel}
                />
              </div>
            </div>
            <div>
              <FieldLabel hint={PROVIDERS[settings.proph3t.provider].doc}>Clé API</FieldLabel>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-atlas-fg-3" />
                <TextInput
                  type="password"
                  className="pl-9"
                  value={settings.proph3t.apiKey}
                  onChange={(e) => update({ proph3t: { ...settings.proph3t, apiKey: e.target.value } })}
                  placeholder={
                    settings.proph3t.provider === 'groq'
                      ? 'gsk_...'
                      : settings.proph3t.provider === 'openrouter'
                        ? 'sk-or-...'
                        : 'optionnel'
                  }
                />
              </div>
              <a
                href={
                  settings.proph3t.provider === 'groq'
                    ? 'https://console.groq.com/keys'
                    : settings.proph3t.provider === 'openrouter'
                      ? 'https://openrouter.ai/keys'
                      : 'https://github.com/ollama/ollama'
                }
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex items-center gap-1.5 text-2xs text-atlas-amber-deep hover:underline"
              >
                <ExternalLink className="w-3 h-3" /> Obtenir une clé gratuite
              </a>
            </div>
            <div
              className={
                settings.proph3t.apiKey
                  ? 'panel p-3 border-signal-green/30 bg-signal-green/[0.04]'
                  : 'panel p-3 border-signal-yellow/30 bg-signal-yellow/[0.04]'
              }
            >
              <div
                className={
                  settings.proph3t.apiKey ? 'text-2xs text-signal-green' : 'text-2xs text-signal-yellow'
                }
              >
                {settings.proph3t.apiKey ? (
                  <>
                    ✓ <strong>PROPH3T actif</strong> via {PROVIDERS[settings.proph3t.provider].label} · les
                    capacités IA appellent réellement le modèle.
                  </>
                ) : (
                  <>
                    ⚠ Aucune clé configurée — les capacités PROPH3T fonctionnent en mode <strong>mock</strong>{' '}
                    (toasts simulés).
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-2xs uppercase tracking-wider font-medium text-atlas-fg-3 mb-3 inline-flex items-center gap-2">
            <Plug className="w-3 h-3 text-atlas-sage-deep" /> Intégrations
          </h3>
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate('/settings/integrations');
            }}
            className="panel p-4 w-full flex items-center gap-3 text-left hover:border-atlas-sage-deep/40 transition"
          >
            <div className="w-9 h-9 rounded-xl bg-atlas-sage/12 grid place-items-center shrink-0">
              <KeyRound className="w-4 h-4 text-atlas-sage-deep" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-atlas-fg-1">Personal Access Tokens</div>
              <div className="text-2xs text-atlas-fg-3">
                Connectez Claude Cowork, Claude Code ou tout client MCP à votre cockpit.
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-atlas-fg-3 shrink-0" />
          </button>
        </section>

        <section>
          <h3 className="text-2xs uppercase tracking-wider font-medium text-atlas-fg-3 mb-3">
            Compte & données
          </h3>
          <div className="space-y-2">
            <div className="panel p-4 flex items-center gap-3">
              <div className="flex-1">
                <div className="text-sm font-medium text-atlas-fg-1">Session active</div>
                <div className="text-2xs text-atlas-fg-3">
                  Connecté{authEmail ? ` en tant que ${authEmail}` : ''}.
                </div>
              </div>
              <button
                onClick={() => {
                  if (confirm('Se déconnecter de CockpitJourney ?')) {
                    void signOut();
                    onClose();
                  }
                }}
                className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" /> Se déconnecter
              </button>
            </div>
            <div className="panel p-4 flex items-center gap-3">
              <div className="flex-1">
                <div className="text-sm font-medium text-atlas-fg-1">Réinitialiser les données</div>
                <div className="text-2xs text-atlas-fg-3">
                  Vide votre cockpit dans Supabase et relance le seed démo. Les autres utilisateurs ne sont
                  pas affectés.
                </div>
              </div>
              <button
                onClick={() => {
                  if (
                    confirm(
                      'Effacer TOUTES vos données dans Supabase et recharger ? Cette action est irréversible.'
                    )
                  )
                    resetSeed();
                }}
                className="btn-danger text-xs px-3 py-1.5 inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Réinitialiser
              </button>
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}

function Row({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 panel p-3">
      <div className="flex-1">
        <div className="text-sm text-atlas-fg-1">{label}</div>
        <div className="text-2xs text-atlas-fg-3">{desc}</div>
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
}
