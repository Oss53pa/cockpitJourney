/**
 * PWA install + autostart helpers.
 *
 * Two distinct mechanisms:
 *   1. INSTALL — when the browser fires `beforeinstallprompt`, we
 *      stash the event so the app can show a "Installer l'app" CTA at
 *      the right moment. Calling `triggerInstall()` resolves the
 *      stashed prompt; once accepted, the PWA is added to the OS
 *      (Start menu on Windows, Dock on macOS, home-screen on iOS/Android).
 *
 *   2. AUTOSTART — for desktops, after install, we offer a downloadable
 *      script that places a shortcut in the user's Startup folder so
 *      the PWA opens automatically when they boot. Mac/Linux show
 *      copy-paste instructions instead.
 */
import { useEffect, useState } from 'react';

/** Chromium's BeforeInstallPromptEvent — not in lib.dom yet. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let pendingPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // don't show the default mini-infobar
    pendingPrompt = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    pendingPrompt = null;
    listeners.forEach((l) => l());
  });
}

/**
 * `true` when the page is currently running in standalone mode
 * (PWA already installed and launched as an app, not in a browser tab).
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari on iOS exposes a non-standard property
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Boolean((window.navigator as any).standalone)
  );
}

/**
 * Hook: returns `{ canInstall, install, isInstalled }`.
 * `canInstall` flips to true once the browser fires
 * `beforeinstallprompt`. The button should be hidden when the app is
 * already running standalone.
 */
export function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(() => Boolean(pendingPrompt));
  const [installed, setInstalled] = useState(() => isStandalone());

  useEffect(() => {
    const handler = () => {
      setCanInstall(Boolean(pendingPrompt));
      setInstalled(isStandalone());
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const install = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!pendingPrompt) return 'unavailable';
    await pendingPrompt.prompt();
    const choice = await pendingPrompt.userChoice;
    pendingPrompt = null;
    setCanInstall(false);
    return choice.outcome;
  };

  return { canInstall, install, isInstalled: installed };
}

/* ────────────────────── Autostart ────────────────────── */

const APP_URL = 'https://cockpit-journey.atlas-studio.org';

/**
 * Detect the user's OS from the user-agent. Used to choose the right
 * autostart instructions / download. Mobile is split between iOS and
 * Android so we can show the right per-platform install steps (iOS
 * Safari has no beforeinstallprompt — we have to walk the user
 * through the Share → "Sur l'écran d'accueil" path manually).
 */
export type OS = 'windows' | 'macos' | 'linux' | 'ios' | 'android' | 'unknown';

export function detectOS(): OS {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  // iPad on iPadOS 13+ reports as "Macintosh" — check for touch.
  if (/iphone|ipad|ipod/.test(ua) || (/macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/android/.test(ua)) return 'android';
  if (/windows/.test(ua)) return 'windows';
  if (/mac os|macintosh/.test(ua)) return 'macos';
  if (/linux/.test(ua)) return 'linux';
  return 'unknown';
}

/** True if the visitor is on iOS using Safari (the only browser on iOS
 * where "Add to Home Screen" actually creates a PWA — Chrome/Firefox
 * on iOS still use WebKit but don't expose the share-sheet shortcut). */
export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!isIos) return false;
  // Chrome on iOS contains "CriOS", Firefox "FxiOS", Edge "EdgiOS".
  // Pure Safari has none of those.
  return !/CriOS|FxiOS|EdgiOS|OPiOS|Mercury/.test(ua);
}

/**
 * Build a Windows .bat script the user runs ONCE. It creates a shortcut
 * in `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup` pointing
 * at the PWA URL — Edge / Chrome will open it as a standalone app at
 * each Windows login (because the PWA is installed).
 */
export function buildWindowsAutostartScript(): string {
  return `@echo off
:: CockpitJourney - autostart au demarrage Windows
:: ==================================================
:: Ce script cree un raccourci dans le dossier Startup de l'utilisateur
:: courant. Au prochain demarrage, CockpitJourney s'ouvrira automatiquement.
::
:: Pour annuler : supprimer le fichier
::   %APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\CockpitJourney.lnk

setlocal
set "APP_URL=${APP_URL}/dashboard"
set "STARTUP=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"
set "SHORTCUT=%STARTUP%\\CockpitJourney.lnk"

:: Detecter le navigateur prefere : Edge -> Chrome -> par defaut
set "BROWSER="
if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"
if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER=%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"
if "%BROWSER%"=="" if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"
if "%BROWSER%"=="" if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"

if "%BROWSER%"=="" (
  echo [KO] Aucun navigateur Chromium (Edge / Chrome) detecte.
  echo      Installe Edge ou Chrome puis relance ce script.
  pause
  exit /b 1
)

:: Generer le raccourci avec WScript (built-in Windows)
> "%TEMP%\\cj-shortcut.vbs" echo Set s = WScript.CreateObject("WScript.Shell")
>>"%TEMP%\\cj-shortcut.vbs" echo Set lnk = s.CreateShortcut("%SHORTCUT%")
>>"%TEMP%\\cj-shortcut.vbs" echo lnk.TargetPath = "%BROWSER%"
>>"%TEMP%\\cj-shortcut.vbs" echo lnk.Arguments = "--app=%APP_URL%"
>>"%TEMP%\\cj-shortcut.vbs" echo lnk.IconLocation = "%BROWSER%, 0"
>>"%TEMP%\\cj-shortcut.vbs" echo lnk.Description = "CockpitJourney - Pilotez votre journee"
>>"%TEMP%\\cj-shortcut.vbs" echo lnk.Save

cscript //nologo "%TEMP%\\cj-shortcut.vbs"
del "%TEMP%\\cj-shortcut.vbs"

echo.
echo [OK] CockpitJourney demarrera automatiquement a chaque ouverture de session.
echo      URL: %APP_URL%
echo      Navigateur: %BROWSER%
echo.
echo Pour desactiver, supprime simplement :
echo   %SHORTCUT%
echo.
pause
`;
}

/** Trigger a download of the autostart .bat. */
export function downloadWindowsAutostart() {
  const script = buildWindowsAutostartScript();
  const blob = new Blob([script], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cockpitjourney-autostart.bat';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

/**
 * Mac instructions — Mac doesn't have a Startup folder; users add
 * "Login Items" via System Settings. We can't programmatically add
 * a login item, but the Dock-pinned PWA opens with one click.
 */
export const MACOS_AUTOSTART_STEPS = [
  "Réglages Système → Général → Éléments d'ouverture",
  'Cliquez « + » sous « Ouvrir à la connexion »',
  "Sélectionnez l'app CockpitJourney (déjà installée via le navigateur)",
  "CockpitJourney s'ouvrira à chaque démarrage de votre Mac",
];

export const LINUX_AUTOSTART_STEPS = [
  'Crée un fichier ~/.config/autostart/cockpitjourney.desktop avec :',
  '[Desktop Entry]',
  'Type=Application',
  `Exec=xdg-open ${APP_URL}/dashboard`,
  'Hidden=false',
  'Name=CockpitJourney',
  'X-GNOME-Autostart-enabled=true',
];
