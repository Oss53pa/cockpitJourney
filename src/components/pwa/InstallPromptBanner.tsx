/**
 * InstallPromptBanner — discrete bottom-right card that appears when
 * the browser fires `beforeinstallprompt` and the user hasn't already:
 *   - dismissed it in the last 7 days,
 *   - installed the app (already standalone),
 *   - or explicitly opened the full InstallAppModal.
 *
 * One-click install on supported browsers (Chrome / Edge / Brave / Arc
 * desktop + Android Chrome). Dismissable with "Plus tard" which writes
 * a timestamp to localStorage so we don't pester the user every page
 * load.
 *
 * For the deeper "install + autostart" wizard (Windows .bat script,
 * macOS Login Items steps, etc.), users can still reach it via the
 * "Installer" button in the LandingPage nav.
 */
import { useEffect, useState } from 'react';
import { Download, X, Loader2, Check } from 'lucide-react';
import { useInstallPrompt } from '../../lib/pwa';
import { captureException } from '../../lib/monitoring';

const DISMISS_KEY = 'cj-install-prompt-dismissed-at';
/** How long to stay quiet after a "Plus tard". 7 days = friendly pacing. */
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
/** Delay before showing the banner, so it doesn't compete with the first paint. */
const APPEAR_DELAY_MS = 3000;

function wasDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_DURATION_MS;
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* localStorage unavailable — fall through, user will see the banner again */
  }
}

export function InstallPromptBanner() {
  const { canInstall, install, isInstalled } = useInstallPrompt();
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [success, setSuccess] = useState(false);

  // Reveal after a short delay so the banner doesn't compete with
  // critical first-paint content (hero, splash). The delay also gives
  // beforeinstallprompt time to fire if it's going to.
  useEffect(() => {
    if (isInstalled || wasDismissedRecently()) return;
    if (!canInstall) return;
    const id = setTimeout(() => setVisible(true), APPEAR_DELAY_MS);
    return () => clearTimeout(id);
  }, [canInstall, isInstalled]);

  if (!visible || isInstalled) return null;

  const handleInstall = async () => {
    setInstalling(true);
    try {
      const outcome = await install();
      if (outcome === 'accepted') {
        setSuccess(true);
        // Hide after a short victory animation
        setTimeout(() => setVisible(false), 1800);
      } else if (outcome === 'dismissed') {
        // User said "no" to the browser prompt — equivalent to "Plus tard"
        markDismissed();
        setVisible(false);
      }
    } catch (err) {
      captureException(err, { scope: 'pwa:install-prompt' });
    } finally {
      setInstalling(false);
    }
  };

  const handleDismiss = () => {
    markDismissed();
    setVisible(false);
  };

  return (
    <div className="fixed bottom-4 right-4 z-[90] max-w-sm w-[calc(100vw-2rem)] sm:w-96 animate-fade-in-scale">
      <div className="panel shadow-soft-pop border border-atlas-line bg-white">
        <div className="flex items-start gap-3 p-4">
          {/* Icon block — same gradient as the brand */}
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-atlas-sage-deep to-atlas-sage-deeper grid place-items-center shrink-0 shadow-amber-deep">
            {success ? (
              <Check className="w-5 h-5 text-white" strokeWidth={2.5} />
            ) : (
              <Download className="w-5 h-5 text-white" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-display text-base font-medium text-atlas-fg-1 leading-tight">
                {success ? 'Installation lancée' : 'Installer CockpitJourney'}
              </h3>
              <button
                onClick={handleDismiss}
                aria-label="Fermer"
                className="w-6 h-6 -mr-1 -mt-1 rounded-md flex items-center justify-center text-atlas-fg-3 hover:text-atlas-fg-1 hover:bg-black/[0.04] shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="mt-1 text-xs text-atlas-fg-2 leading-relaxed">
              {success
                ? 'L’icône arrive sur votre bureau ou votre dock. Vous pouvez fermer cette fenêtre.'
                : 'Ajoutez l’app à votre barre des tâches pour un accès direct, comme une application native.'}
            </p>

            {!success && (
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => void handleInstall()}
                  disabled={installing}
                  className="btn-primary text-xs px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  {installing ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Installation…
                    </>
                  ) : (
                    <>
                      <Download className="w-3 h-3" />
                      Installer
                    </>
                  )}
                </button>
                <button
                  onClick={handleDismiss}
                  className="btn-ghost text-xs px-3 py-1.5 text-atlas-fg-3 hover:text-atlas-fg-1"
                >
                  Plus tard
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
