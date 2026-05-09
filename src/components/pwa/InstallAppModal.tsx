/**
 * InstallAppModal — guide pas-à-pas pour
 *
 *   1. installer CockpitJourney en PWA (icône bureau / dock / Start menu),
 *   2. activer le démarrage automatique au boot du PC.
 *
 * Le modal s'adapte à l'OS détecté : sur Windows on télécharge un .bat
 * qui pose un raccourci dans le dossier Startup ; sur macOS / Linux on
 * affiche les étapes manuelles (Apple n'expose pas d'API d'autostart
 * accessible depuis une PWA).
 */
import { useEffect, useState } from 'react';
import {
  Download,
  Check,
  ArrowRight,
  Monitor,
  ExternalLink,
  Loader2,
  Sparkles,
  Share,
  PlusSquare,
  MoreVertical,
  Smartphone,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { cn } from '../../lib/utils';
import {
  detectOS,
  downloadWindowsAutostart,
  isIosSafari,
  isStandalone,
  useInstallPrompt,
  MACOS_AUTOSTART_STEPS,
  LINUX_AUTOSTART_STEPS,
} from '../../lib/pwa';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Step = 'install' | 'autostart' | 'done';

export function InstallAppModal({ open, onClose }: Props) {
  const { canInstall, install, isInstalled } = useInstallPrompt();
  const [step, setStep] = useState<Step>(isInstalled ? 'autostart' : 'install');
  const [installing, setInstalling] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const os = detectOS();

  // Sync step when the install state flips externally.
  useEffect(() => {
    if (isInstalled && step === 'install') setStep('autostart');
  }, [isInstalled, step]);

  const handleInstall = async () => {
    setInstalling(true);
    const outcome = await install();
    setInstalling(false);
    if (outcome === 'accepted') {
      setStep('autostart');
    }
  };

  const handleDownload = () => {
    downloadWindowsAutostart();
    setDownloaded(true);
    // Auto-advance after the user has had time to read the next-step instructions.
    setTimeout(() => setStep('done'), 2500);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Installer CockpitJourney sur votre poste"
      description="Icône au bureau, démarrage automatique, ouverture comme une vraie application."
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost text-sm px-3 py-1.5">
            {step === 'done' ? 'Fermer' : 'Plus tard'}
          </button>
        </>
      }
    >
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-7">
        <Pill active={step === 'install'} done={step !== 'install'} num="1" label="Installer" />
        <Connector />
        <Pill active={step === 'autostart'} done={step === 'done'} num="2" label="Démarrage auto" />
        <Connector />
        <Pill active={step === 'done'} done={false} num="3" label="Terminé" />
      </div>

      {/* Step 1 — Install */}
      {step === 'install' && (
        <div>
          <h3 className="font-display text-xl font-medium text-atlas-fg-1 mb-2">Étape 1 · Installer l'app</h3>
          <p className="text-sm text-atlas-fg-2 leading-relaxed mb-5">
            Une fois installée, CockpitJourney apparaît comme une vraie application — icône au menu Démarrer
            (Windows), Dock (Mac), <strong>écran d'accueil de votre téléphone</strong>. Plus de barre d'URL,
            ouverture directe sur votre cockpit.
          </p>

          <div className="rounded-2xl border border-atlas-amber/25 bg-gradient-to-br from-atlas-amber/[0.06] to-transparent p-4 mb-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-atlas-amber/15 grid place-items-center shrink-0">
                <Sparkles className="w-4 h-4 text-atlas-amber-deep" />
              </div>
              <div className="text-sm text-atlas-fg-2 leading-relaxed">
                <strong className="text-atlas-fg-1 font-medium">Aucun téléchargement.</strong> C'est votre
                navigateur (Chrome, Edge, Safari) qui installe l'app. Mises à jour automatiques dès qu'on
                déploie une nouvelle version.
              </div>
            </div>
          </div>

          {/* iOS Safari : pas de beforeinstallprompt — guide manuel obligatoire */}
          {os === 'ios' && (
            <div>
              <div className="rounded-2xl border border-atlas-line bg-atlas-panel p-4 mb-3">
                <div className="text-2xs uppercase tracking-[0.2em] font-medium text-atlas-amber-deep mb-3">
                  iPhone / iPad — 3 étapes dans Safari
                </div>
                <ol className="space-y-3 text-sm text-atlas-fg-1">
                  <li className="flex items-start gap-3">
                    <NumPill n={1} />
                    <div className="flex-1">
                      Touche{' '}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-atlas-amber/15 text-atlas-amber-deep border border-atlas-amber/30">
                        <Share className="w-3.5 h-3.5" />
                        Partager
                      </span>{' '}
                      en bas de Safari
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <NumPill n={2} />
                    <div className="flex-1">
                      Choisis{' '}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-atlas-amber/15 text-atlas-amber-deep border border-atlas-amber/30">
                        <PlusSquare className="w-3.5 h-3.5" />
                        Sur l'écran d'accueil
                      </span>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <NumPill n={3} />
                    <div className="flex-1">
                      Confirme « Ajouter » — l'icône <strong>CJ</strong> apparaît sur ton écran d'accueil et
                      l'app s'ouvre en plein écran.
                    </div>
                  </li>
                </ol>
              </div>
              {!isIosSafari() && (
                <div className="text-2xs text-signal-yellow leading-relaxed bg-signal-yellow/[0.08] border border-signal-yellow/30 rounded-lg p-3">
                  ⚠ Tu sembles utiliser Chrome / Firefox sur iPhone. Pour installer la PWA tu dois ouvrir
                  cockpitjourney.app dans <strong>Safari</strong> (Apple ne permet pas l'install depuis les
                  autres navigateurs sur iOS).
                </div>
              )}
            </div>
          )}

          {/* Android : Chrome / Edge / Brave fournissent beforeinstallprompt */}
          {os === 'android' && (
            <>
              {canInstall ? (
                <button
                  onClick={handleInstall}
                  disabled={installing}
                  className="btn-primary text-sm px-4 py-2.5 inline-flex w-full justify-center"
                >
                  {installing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Installation…
                    </>
                  ) : (
                    <>
                      <Smartphone className="w-4 h-4" />
                      Installer sur mon téléphone
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              ) : (
                <div className="rounded-2xl border border-atlas-line bg-atlas-panel p-4">
                  <div className="text-2xs uppercase tracking-[0.2em] font-medium text-atlas-amber-deep mb-3">
                    Android — install manuel
                  </div>
                  <ol className="space-y-3 text-sm text-atlas-fg-1">
                    <li className="flex items-start gap-3">
                      <NumPill n={1} />
                      <div className="flex-1">
                        Touche{' '}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-atlas-amber/15 text-atlas-amber-deep border border-atlas-amber/30">
                          <MoreVertical className="w-3.5 h-3.5" />
                          Menu (3 points)
                        </span>{' '}
                        de Chrome
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <NumPill n={2} />
                      <div className="flex-1">
                        Choisis « Ajouter à l'écran d'accueil » ou « Installer l'application »
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <NumPill n={3} />
                      <div className="flex-1">
                        L'icône CJ apparaît dans ton tiroir d'apps + sur ton écran d'accueil.
                      </div>
                    </li>
                  </ol>
                </div>
              )}
            </>
          )}

          {/* Desktop : si beforeinstallprompt disponible → bouton direct */}
          {(os === 'windows' || os === 'macos' || os === 'linux' || os === 'unknown') && (
            <>
              {canInstall ? (
                <button
                  onClick={handleInstall}
                  disabled={installing}
                  className="btn-primary text-sm px-4 py-2.5 inline-flex w-full justify-center"
                >
                  {installing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Installation…
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Installer CockpitJourney
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              ) : (
                <div className="rounded-xl bg-atlas-panel-2 border border-atlas-line p-4 text-sm text-atlas-fg-2 leading-relaxed">
                  <strong className="text-atlas-fg-1 font-medium">
                    Le bouton d'installation n'est pas disponible.
                  </strong>{' '}
                  Cela peut arriver sur Safari Mac, Firefox, ou si l'app est déjà installée.
                  <ul className="mt-3 space-y-1.5 text-2xs">
                    <li>
                      • <strong>Mac (Safari)</strong> : menu « Fichier » → « Ajouter au Dock »
                    </li>
                    <li>
                      • <strong>Firefox</strong> : non supporté — utilisez Chrome ou Edge
                    </li>
                    <li>
                      • <strong>Déjà installée</strong> ? L'icône est dans votre menu Démarrer / Dock — l'app
                      s'ouvre directement de là.
                    </li>
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Step 2 — Autostart */}
      {step === 'autostart' && (
        <div>
          <div className="rounded-xl bg-signal-green/[0.08] border border-signal-green/30 p-3 mb-5 inline-flex items-center gap-2 text-sm text-signal-green">
            <Check className="w-4 h-4" />
            <strong className="font-medium">CockpitJourney installé sur votre poste.</strong>
          </div>

          <h3 className="font-display text-xl font-medium text-atlas-fg-1 mb-2">
            Étape 2 · Démarrer avec votre {os === 'macos' ? 'Mac' : os === 'linux' ? 'machine' : 'PC'}
          </h3>
          <p className="text-sm text-atlas-fg-2 leading-relaxed mb-5">
            Optionnel — ajoutez CockpitJourney aux applications qui s'ouvrent à chaque démarrage de votre
            poste. Vous arrivez sur votre Daily Brief sans clic.
          </p>

          {os === 'windows' && (
            <div>
              <button
                onClick={handleDownload}
                disabled={downloaded}
                className="btn-primary text-sm px-4 py-2.5 inline-flex w-full justify-center mb-4"
              >
                {downloaded ? (
                  <>
                    <Check className="w-4 h-4" />
                    Script téléchargé · ouvrez-le pour activer
                  </>
                ) : (
                  <>
                    <Monitor className="w-4 h-4" />
                    Télécharger le script Windows (.bat)
                    <Download className="w-4 h-4" />
                  </>
                )}
              </button>
              <div className="text-2xs text-atlas-fg-3 leading-relaxed">
                Le script <code className="font-mono">cockpitjourney-autostart.bat</code> crée un raccourci
                dans votre dossier Startup Windows. À ouvrir UNE fois — il est signé en clair, vous pouvez
                l'éditer dans Notepad pour vérifier.
              </div>
            </div>
          )}

          {os === 'macos' && (
            <ol className="space-y-2 text-sm text-atlas-fg-2 list-decimal pl-5 mb-4">
              {MACOS_AUTOSTART_STEPS.map((s, i) => (
                <li key={i} className="leading-relaxed">
                  {s}
                </li>
              ))}
            </ol>
          )}

          {os === 'linux' && (
            <pre className="text-2xs font-mono bg-atlas-fg-1 text-atlas-sage-glow rounded-xl p-4 overflow-x-auto leading-relaxed">
              {LINUX_AUTOSTART_STEPS.join('\n')}
            </pre>
          )}

          {(os === 'ios' || os === 'android') && (
            <div className="rounded-2xl border border-atlas-line bg-atlas-panel p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-atlas-sage/15 grid place-items-center shrink-0">
                  <Smartphone className="w-4 h-4 text-atlas-sage-deep" />
                </div>
                <div className="text-sm text-atlas-fg-2 leading-relaxed flex-1">
                  Sur {os === 'ios' ? 'iPhone' : 'Android'}, l'OS empêche les apps de démarrer toutes seules
                  au boot (sécurité + batterie). En revanche, CockpitJourney est désormais sur ton écran
                  d'accueil et s'ouvre en plein écran d'un seul tap.
                </div>
              </div>
              <div className="border-t border-atlas-line pt-3 mt-3">
                <div className="text-2xs uppercase tracking-[0.2em] font-medium text-atlas-amber-deep mb-2">
                  Astuce
                </div>
                <p className="text-2xs text-atlas-fg-2 leading-relaxed">
                  Déplace l'icône CockpitJourney sur la <strong>première page</strong> de ton écran d'accueil
                  (et idéalement dans le <strong>dock</strong>). Tu la vois à chaque déverrouillage du
                  téléphone — c'est le plus proche d'un autostart sur smartphone.
                  {os === 'ios' &&
                    " Sur iPhone : reste appuyé sur l'icône → \"Modifier l'écran d'accueil\" → glisse-la où tu veux."}
                  {os === 'android' &&
                    " Sur Android : reste appuyé sur l'icône, déplace-la, et ajoute-la au dock du bas."}
                </p>
              </div>
            </div>
          )}

          {os === 'unknown' && (
            <div className="rounded-xl bg-atlas-panel-2 border border-atlas-line p-4 text-sm text-atlas-fg-2 leading-relaxed">
              Système d'exploitation non reconnu — l'app est installée, lance-la depuis ton menu
              d'applications.
            </div>
          )}

          <div className="flex gap-2 mt-5">
            <button
              type="button"
              onClick={() => setStep('done')}
              className="btn-secondary text-sm px-4 py-2.5 flex-1"
            >
              {os === 'ios' || os === 'android' || os === 'unknown' ? 'Terminer' : 'Passer cette étape'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Done */}
      {step === 'done' && (
        <div className="text-center py-3">
          <div className="w-14 h-14 rounded-2xl bg-atlas-sage/15 grid place-items-center mx-auto mb-4">
            <Check className="w-6 h-6 text-atlas-sage-deep" strokeWidth={2.5} />
          </div>
          <h3 className="font-display text-xl font-medium text-atlas-fg-1 mb-2">Tout est prêt</h3>
          <p className="text-sm text-atlas-fg-2 leading-relaxed max-w-md mx-auto mb-6">
            CockpitJourney est désormais installé sur votre poste{' '}
            {os === 'windows' && downloaded ? 'et démarrera automatiquement au prochain redémarrage.' : '.'}
            <br />
            Bonne journée de pilotage.
          </p>
          <a
            href="https://atlas-studio.org"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-2xs uppercase tracking-wider text-atlas-fg-3 hover:text-atlas-amber-deep transition"
          >
            Découvrir les autres produits Atlas Studio
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </Modal>
  );
}

function Pill({ num, label, active, done }: { num: string; label: string; active: boolean; done: boolean }) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-2xs uppercase tracking-wider font-medium border transition',
        done
          ? 'border-atlas-sage-deep/30 bg-atlas-sage/15 text-atlas-sage-deeper'
          : active
            ? 'border-atlas-amber-deep bg-atlas-amber/15 text-atlas-amber-deep shadow-amber-deep'
            : 'border-atlas-line bg-atlas-panel text-atlas-fg-3'
      )}
    >
      <span
        className={cn(
          'w-5 h-5 rounded-full grid place-items-center text-2xs font-mono',
          done
            ? 'bg-atlas-sage-deep text-white'
            : active
              ? 'bg-atlas-amber-deep text-white'
              : 'bg-atlas-line text-atlas-fg-2'
        )}
      >
        {done ? <Check className="w-3 h-3" strokeWidth={3} /> : num}
      </span>
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}

function Connector() {
  return <div className="flex-1 h-px bg-atlas-line max-w-12" />;
}

function NumPill({ n }: { n: number }) {
  return (
    <span className="w-6 h-6 rounded-full bg-atlas-amber-deep text-white text-2xs font-mono font-medium grid place-items-center shrink-0 mt-0.5">
      {n}
    </span>
  );
}

/**
 * Helper export — `InstallAppButton` is a small button you can drop
 * anywhere (Nav, Settings…) that opens the modal when clicked. Hides
 * itself when the app is already running standalone.
 */
export function InstallAppButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const standalone = isStandalone();
  if (standalone) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          'inline-flex items-center gap-1.5 text-xs uppercase tracking-wider font-light text-atlas-fg-2 hover:text-atlas-fg-1 transition px-3 py-2'
        }
      >
        <Download className="w-3.5 h-3.5" />
        Installer
      </button>
      <InstallAppModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
