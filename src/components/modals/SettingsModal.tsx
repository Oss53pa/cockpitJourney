import { Modal } from '../ui/Modal';
import { useApp } from '../../stores/appStore';
import { FieldLabel, NativeSelect, Switch, TextInput } from '../ui/Field';
import { Avatar } from '../ui/Avatar';
import { RotateCcw, Sparkles, ExternalLink, KeyRound } from 'lucide-react';
import { PROVIDERS, type ProphProvider } from '../../lib/proph3t';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const me = useApp((s) => s.users[0]);
  const resetSeed = useApp((s) => s.resetSeed);

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
          <div className="flex items-center gap-3 panel p-4">
            <Avatar user={me} size="lg" />
            <div className="flex-1">
              <div className="text-sm font-medium text-atlas-fg-1">{me.name}</div>
              <div className="text-2xs text-atlas-fg-3">
                {me.email} · {me.role}
              </div>
            </div>
            <button className="btn-secondary text-xs px-2.5 py-1.5">Changer la photo</button>
          </div>
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
          <h3 className="text-2xs uppercase tracking-wider font-medium text-atlas-fg-3 mb-3">Données</h3>
          <div className="panel p-4 flex items-center gap-3">
            <div className="flex-1">
              <div className="text-sm font-medium text-atlas-fg-1">Réinitialiser les données</div>
              <div className="text-2xs text-atlas-fg-3">
                Supprime tout le contenu local (localStorage) et recharge avec les seeds par défaut.
              </div>
            </div>
            <button
              onClick={() => {
                if (confirm('Effacer toutes les données et recharger ?')) resetSeed();
              }}
              className="btn-danger text-xs px-3 py-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Réinitialiser
            </button>
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
