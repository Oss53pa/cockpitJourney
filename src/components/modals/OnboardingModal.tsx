/**
 * OnboardingModal — 3-step first-boot wizard.
 *
 * Mounted automatically by App.tsx when `settings.onboardingDone !== true`
 * AND the user has at least one project (i.e. the seed has run). Cannot
 * be dismissed with the close button — only completed or "Plus tard"
 * (which still marks onboarding done, but with default values).
 *
 * Steps:
 *   1. Welcome + display name confirmation (default = current profile name)
 *   2. Working rhythm (daily-brief hour + weekly capacity hours)
 *   3. PROPH3T setup pointer (link to Settings → AI for the Groq API key)
 *
 * Saves on completion:
 *   - cj_profiles.data.name (via updateProfile → also auth.updateUser)
 *   - cj_settings: dailyBriefHour, weeklyCapacityHours, onboardingDone=true
 */
import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { FieldLabel, TextInput } from '../ui/Field';
import { useApp, useCurrentUser } from '../../stores/appStore';
import { Sparkles, Sunrise, Clock4, ArrowRight, Check, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';

type Step = 1 | 2 | 3;

export function OnboardingModal() {
  const me = useCurrentUser();
  const settings = useApp((s) => s.settings);
  const updateProfile = useApp((s) => s.updateProfile);
  const updateSettings = useApp((s) => s.updateSettings);
  const openModal = useApp((s) => s.openModal);

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState(me.name);
  const [briefHour, setBriefHour] = useState(settings.dailyBriefHour);
  const [weeklyCapacity, setWeeklyCapacity] = useState(settings.weeklyCapacityHours);
  const [saving, setSaving] = useState(false);

  const finish = async (mode: 'complete' | 'skip') => {
    setSaving(true);
    try {
      if (mode === 'complete' && name.trim() && name.trim() !== me.name) {
        await updateProfile({ name: name.trim() });
      }
      // Always persist the rhythm settings + the onboarding flag so the
      // wizard never reappears on subsequent boots.
      updateSettings({
        dailyBriefHour: briefHour,
        weeklyCapacityHours: weeklyCapacity,
        onboardingDone: true,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => {
        /* deliberately ignore — user must finish or click "Plus tard" */
      }}
      title="Bienvenue sur CockpitJourney"
      description="Trois questions rapides pour adapter le cockpit à votre rythme"
      size="md"
      hideCloseButton
      footer={
        <>
          <button
            onClick={() => void finish('skip')}
            disabled={saving}
            className="btn-ghost text-sm px-3 py-1.5 mr-auto"
          >
            Plus tard
          </button>
          {step > 1 && (
            <button
              onClick={() => setStep((s) => (s - 1) as Step)}
              disabled={saving}
              className="btn-secondary text-sm px-3 py-1.5"
            >
              Précédent
            </button>
          )}
          {step < 3 ? (
            <button
              onClick={() => setStep((s) => (s + 1) as Step)}
              disabled={saving || (step === 1 && !name.trim())}
              className="btn-primary text-sm px-3.5 py-1.5"
            >
              Suivant <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={() => void finish('complete')}
              disabled={saving}
              className="btn-primary text-sm px-3.5 py-1.5"
            >
              <Check className="w-3.5 h-3.5" /> Terminer
            </button>
          )}
        </>
      }
    >
      {/* Step indicator */}
      <div className="flex items-center gap-1.5 mb-5">
        {([1, 2, 3] as Step[]).map((n) => (
          <div
            key={n}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              n <= step ? 'bg-atlas-sage-deep' : 'bg-black/[0.08]'
            )}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-atlas-amber/15 grid place-items-center shrink-0">
              <Sparkles className="w-5 h-5 text-atlas-amber-deep" />
            </div>
            <div>
              <h3 className="font-display text-lg font-medium tracking-tight">Comment vous appelle-t-on ?</h3>
              <p className="text-sm text-atlas-fg-2 mt-1 leading-relaxed">
                Ce nom apparaîtra dans le Daily Brief, les notifications, et les rapports PROPH3T générés pour
                votre compte.
              </p>
            </div>
          </div>
          <div>
            <FieldLabel>Nom complet</FieldLabel>
            <TextInput
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Prénom Nom"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) setStep(2);
              }}
            />
            <p className="text-2xs text-atlas-fg-3 mt-1.5">
              E-mail : <span className="font-mono">{me.email}</span>
            </p>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-signal-blue/15 grid place-items-center shrink-0">
              <Clock4 className="w-5 h-5 text-signal-blue" />
            </div>
            <div>
              <h3 className="font-display text-lg font-medium tracking-tight">Votre rythme de travail</h3>
              <p className="text-sm text-atlas-fg-2 mt-1 leading-relaxed">
                On utilise ces deux valeurs pour calculer votre charge journalière cible et envoyer le Daily
                Brief à la bonne heure.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>
                <Sunrise className="inline w-3 h-3 mr-1" />
                Heure du Daily Brief
              </FieldLabel>
              <TextInput
                type="number"
                min={0}
                max={23}
                value={briefHour}
                onChange={(e) => setBriefHour(Math.max(0, Math.min(23, Number(e.target.value) || 0)))}
              />
              <p className="text-2xs text-atlas-fg-3 mt-1">PROPH3T génère votre brief à cette heure</p>
            </div>
            <div>
              <FieldLabel>
                <Zap className="inline w-3 h-3 mr-1" />
                Capacité hebdomadaire
              </FieldLabel>
              <div className="relative">
                <TextInput
                  type="number"
                  min={5}
                  max={80}
                  value={weeklyCapacity}
                  onChange={(e) => setWeeklyCapacity(Math.max(5, Math.min(80, Number(e.target.value) || 0)))}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-atlas-fg-3 pointer-events-none">
                  h / sem
                </span>
              </div>
              <p className="text-2xs text-atlas-fg-3 mt-1">
                Objectif Deep Work journalier : ≈ {Math.round((weeklyCapacity * 60) / 5 / 30) / 2}h
              </p>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-signal-violet/15 grid place-items-center shrink-0">
              <Sparkles className="w-5 h-5 text-signal-violet" />
            </div>
            <div>
              <h3 className="font-display text-lg font-medium tracking-tight">Activer PROPH3T</h3>
              <p className="text-sm text-atlas-fg-2 mt-1 leading-relaxed">
                PROPH3T génère votre Daily Brief, repère les risques, propose des fenêtres Deep Work. Il a
                besoin d'une clé Groq (gratuite, 30 req/min — largement assez pour 1 personne).
              </p>
            </div>
          </div>
          <div className="panel p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-sm text-atlas-fg-1">
              <span className="w-5 h-5 rounded-full bg-atlas-sage-deep text-white text-2xs grid place-items-center font-medium">
                1
              </span>
              <span>
                Ouvrir{' '}
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-atlas-sage-deep hover:underline font-medium"
                >
                  console.groq.com/keys
                </a>{' '}
                et créer une clé.
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-atlas-fg-1">
              <span className="w-5 h-5 rounded-full bg-atlas-sage-deep text-white text-2xs grid place-items-center font-medium">
                2
              </span>
              <span>
                Coller dans <strong>Paramètres → IA</strong>, choisir un modèle (
                <span className="font-mono text-xs">llama-3.3-70b-versatile</span> recommandé).
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-atlas-fg-1">
              <span className="w-5 h-5 rounded-full bg-atlas-sage-deep text-white text-2xs grid place-items-center font-medium">
                3
              </span>
              <span>Cliquer « Régénérer le brief » sur Aujourd'hui pour tester.</span>
            </div>
          </div>
          <button
            onClick={() => {
              void finish('complete').then(() => {
                openModal('settings');
              });
            }}
            className="btn-secondary text-sm w-full justify-center py-2"
          >
            Aller dans Paramètres → IA maintenant
          </button>
          <p className="text-2xs text-atlas-fg-3 text-center">
            Vous pouvez sauter cette étape. CockpitJourney fonctionne sans PROPH3T (briefs heuristiques).
          </p>
        </div>
      )}
    </Modal>
  );
}
