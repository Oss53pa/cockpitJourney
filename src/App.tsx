import { Suspense, lazy, useEffect, useState, type ComponentType } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Sidebar } from './components/layout/Sidebar';
import { NavRail } from './components/layout/NavRail';
import { TopBar } from './components/layout/TopBar';
import { CommandMenu } from './components/layout/CommandMenu';
import { TodayView } from './components/views/TodayView';
import { TaskDetailDrawer } from './components/TaskDetailDrawer';
import { HomeView } from './components/views/HomeView';
import { LoginView } from './components/views/LoginView';
import { SignupView } from './components/views/SignupView';
import { ForgotPasswordView } from './components/views/ForgotPasswordView';
import { ResetPasswordView } from './components/views/ResetPasswordView';
import { LandingPage } from './components/views/LandingPage';
import { AuthCallback } from './components/AuthCallback';
// Legal pages are lazy — they're crawler-visible static content but
// rarely loaded by signed-in users.
const CguPage = lazyWithReload(() =>
  import('./components/legal/CguPage').then((m) => ({ default: m.CguPage }))
);
const ConfidentialitePage = lazyWithReload(() =>
  import('./components/legal/ConfidentialitePage').then((m) => ({ default: m.ConfidentialitePage }))
);
const CookiesPage = lazyWithReload(() =>
  import('./components/legal/CookiesPage').then((m) => ({ default: m.CookiesPage }))
);
const MentionsPage = lazyWithReload(() =>
  import('./components/legal/MentionsPage').then((m) => ({ default: m.MentionsPage }))
);
const AcceptInvite = lazyWithReload(() => import('./pages/auth/AcceptInvite'));
const PublicFormPage = lazyWithReload(() => import('./pages/public/PublicFormPage'));
const ParticipantView = lazyWithReload(() => import('./pages/participant/ParticipantView'));
const AcceptWorkspaceInvite = lazyWithReload(() => import('./pages/workspace/AcceptWorkspaceInvite'));
import { ModalRoot } from './components/modals/ModalRoot';
import { OnboardingModal } from './components/modals/OnboardingModal';
import { InstallPromptBanner } from './components/pwa/InstallPromptBanner';
const TeamSettingsPage = lazyWithReload(() => import('./pages/settings/TeamSettingsPage'));
const IntegrationsSettingsPage = lazyWithReload(() => import('./pages/settings/IntegrationsSettingsPage'));
import { Toaster } from './components/ui/Toaster';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useApp } from './stores/appStore';
import { cn } from './lib/utils';
import { consumePostLoginTarget, setPostLoginTarget } from './lib/authRedirect';
import type { Task, ViewKey } from './types';

/**
 * `lazy()` wrapper that self-heals after a deploy. When a new version ships,
 * Vite renames the content-hashed chunks and deletes the old ones; a tab still
 * running the previous bundle then fails to import a now-missing chunk
 * ("Failed to fetch dynamically imported module") the moment the user navigates
 * to a lazy view (Reports, Budget…). We catch that exactly once and force a
 * single full reload to pull the fresh index.html + current chunk hashes. A
 * sessionStorage guard prevents an infinite reload loop when the failure is
 * genuine (truly offline / chunk really gone).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyWithReload<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    const RELOAD_KEY = 'cj-chunk-reload';
    try {
      const mod = await factory();
      try {
        sessionStorage.removeItem(RELOAD_KEY);
      } catch {
        /* sessionStorage unavailable (private mode) — ignore */
      }
      return mod;
    } catch (err) {
      let alreadyReloaded = true;
      try {
        alreadyReloaded = sessionStorage.getItem(RELOAD_KEY) === '1';
        if (!alreadyReloaded) sessionStorage.setItem(RELOAD_KEY, '1');
      } catch {
        alreadyReloaded = false;
      }
      if (!alreadyReloaded && typeof window !== 'undefined') {
        window.location.reload();
        // Never resolve: the reload is imminent — don't surface the error.
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}

// Lazy-load heavy views to keep initial bundle small
const ProjectView = lazyWithReload(() =>
  import('./components/views/ProjectView').then((m) => ({ default: m.ProjectView }))
);
const DashboardView = lazyWithReload(() =>
  import('./components/views/DashboardView').then((m) => ({ default: m.DashboardView }))
);
const GoalsView = lazyWithReload(() =>
  import('./components/views/GoalsView').then((m) => ({ default: m.GoalsView }))
);
const FocusView = lazyWithReload(() =>
  import('./components/views/FocusView').then((m) => ({ default: m.FocusView }))
);
const InboxView = lazyWithReload(() =>
  import('./components/views/InboxView').then((m) => ({ default: m.InboxView }))
);
const AutomationsView = lazyWithReload(() =>
  import('./components/views/AutomationsView').then((m) => ({ default: m.AutomationsView }))
);
const FormsView = lazyWithReload(() =>
  import('./components/views/FormsView').then((m) => ({ default: m.FormsView }))
);
const ReportsView = lazyWithReload(() =>
  import('./components/views/ReportsView').then((m) => ({ default: m.ReportsView }))
);
const ProjectsView = lazyWithReload(() =>
  import('./components/views/ProjectsView').then((m) => ({ default: m.ProjectsView }))
);
const BudgetOverview = lazyWithReload(() =>
  import('./components/budget/BudgetOverview').then((m) => ({ default: m.BudgetOverview }))
);

/**
 * Single unified splash used while the app is booting (auth resolving
 * or snapshot loading). We deliberately use ONE component for both
 * stages — previously the user saw "Connexion à Supabase…" then a
 * jarring switch to "Chargement de votre cockpit…", which read like
 * two separate slow operations instead of one continuous boot.
 *
 * After 4s an escape hatch appears in case bootstrap genuinely hangs
 * (network fail, broken CORS, stale auth token, browser extension
 * blocking the auth iframe…).
 */
function BootSplash() {
  const [showEscape, setShowEscape] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShowEscape(true), 4000);
    return () => clearTimeout(id);
  }, []);

  const hardReset = () => {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('cj-supabase-auth') || k.startsWith('sb-'))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* localStorage might be blocked */
    }
    window.location.reload();
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-atlas-cream px-6">
      <div className="text-center max-w-sm">
        <div className="font-logo text-5xl text-atlas-fg-1 mb-4">
          Cockpit<span className="text-atlas-sage-deep">Journey</span>
        </div>
        <div className="text-2xs uppercase tracking-[0.2em] text-atlas-fg-3 font-light">Chargement…</div>
        <div className="mt-5 mx-auto w-32 h-1 rounded-full bg-black/[0.05] overflow-hidden">
          <div className="h-full w-1/2 bg-atlas-sage-deep animate-pulse-soft rounded-full" />
        </div>
        {showEscape && (
          <div className="mt-8 space-y-3">
            <p className="text-xs text-atlas-fg-2 leading-relaxed">
              Ça prend plus longtemps que prévu. Vérifiez la console du navigateur (
              <span className="font-mono">F12</span>) pour les erreurs réseau, ou réinitialisez la session
              locale ci-dessous.
            </p>
            <button
              onClick={hardReset}
              className="text-xs uppercase tracking-wider text-atlas-sage-deep hover:text-atlas-sage-deeper transition font-light underline underline-offset-4"
            >
              Réinitialiser et réessayer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ViewSkeleton() {
  return (
    <div className="px-8 py-7 space-y-4 animate-pulse">
      <div className="h-8 w-72 rounded-lg bg-black/[0.06]" />
      <div className="h-4 w-96 rounded-md bg-black/[0.04]" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-black/[0.04]" />
        ))}
      </div>
    </div>
  );
}

/**
 * The authenticated cockpit shell. Mounted under the /dashboard route once
 * the user is signed in AND the snapshot has been loaded from Supabase.
 *
 * Internal navigation between views (Today, Inbox, Project Kanban, Goals,
 * Dashboards, Focus, Reports, Forms, Automations) stays state-based — we
 * intentionally don't push every view to a URL because:
 *   - cockpit views compose freely (drawer over project view + command menu
 *     over everything) and URL routing for that overhead-bloats the UX
 *   - the user lands on /dashboard and stays there — they don't bookmark
 *     individual cockpit views
 *
 * If we later want shareable URLs for specific tasks ("send your CEO a
 * link to task X"), we'll add nested routes here.
 */
function CockpitShell() {
  const [entered, setEntered] = useState(false);
  const [view, setView] = useState<ViewKey>('today');
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>(undefined);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);

  const ready = useApp((s) => s.ready);
  const degraded = useApp((s) => s.degraded);
  const projects = useApp((s) => s.projects);
  const openModal = useApp((s) => s.openModal);
  const tickFocus = useApp((s) => s.tickFocus);
  const focusRunning = useApp((s) => s.focus.running);
  const onboardingDone = useApp((s) => s.settings.onboardingDone);
  // Onboarding wizard: show when hydrate succeeded AND the user has a
  // project (seed has run) AND the wizard hasn't been completed yet.
  const showOnboarding = ready && projects.length > 0 && !onboardingDone;

  // Once snapshot is loaded, default the active project to the user's
  // first project (their namespace, no global hardcoded id).
  useEffect(() => {
    if (ready && !activeProjectId && projects.length > 0) {
      setActiveProjectId(projects[0].id);
    }
  }, [ready, projects, activeProjectId]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const inField =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (isMod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
        return;
      }
      if (isMod && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        openModal('task-create');
        return;
      }
      if (inField) return;
      if (e.key === '?') {
        e.preventDefault();
        openModal('shortcuts');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openModal]);

  // Focus tick
  useEffect(() => {
    if (!focusRunning) return;
    const id = setInterval(() => tickFocus(), 1000);
    return () => clearInterval(id);
  }, [focusRunning, tickFocus]);

  const onNavigate = (v: ViewKey, projectId?: string) => {
    setView(v);
    if (projectId) setActiveProjectId(projectId);
  };

  const breadcrumb = (() => {
    switch (view) {
      case 'today':
        return [{ label: 'Aujourd’hui', sub: 'Daily Brief PROPH3T' }];
      case 'inbox':
        return [{ label: 'Boîte d’entrée', sub: 'Capture brute' }];
      case 'goals':
        return [{ label: 'Goals & OKRs', sub: 'Cap stratégique' }];
      case 'dashboards':
        return [{ label: 'Dashboards', sub: 'Vue exécutive' }];
      case 'focus':
        return [{ label: 'Mode Focus', sub: 'Deep Work' }];
      case 'automations':
        return [{ label: 'Automatisations', sub: 'Moteur sans code' }];
      case 'forms':
        return [{ label: 'Forms', sub: 'Formulaires d’intake' }];
      case 'reports':
        return [{ label: 'Rapports', sub: 'PROPH3T génère' }];
      case 'projects':
        return [{ label: 'Projets', sub: 'Arborescence' }];
      case 'budget':
        return [{ label: 'Budget', sub: 'Vue portefeuille' }];
      case 'project': {
        const p = activeProjectId ? projects.find((x) => x.id === activeProjectId) : undefined;
        return [
          { label: 'Projets', sub: 'CockpitJourney' },
          { label: p?.name || 'Projet', sub: p?.slug },
        ];
      }
      default:
        return [{ label: 'CockpitJourney' }];
    }
  })();

  // Mobile sidebar toggle
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [view, activeProjectId]);

  // Snapshot still loading — show the same splash component as the auth-
  // resolve stage so the user perceives ONE continuous boot, not two.
  if (!ready) {
    return <BootSplash />;
  }

  if (!entered) {
    return (
      <ErrorBoundary>
        <HomeView
          onEnter={(v) => {
            if (v) setView(v);
            setEntered(true);
          }}
        />
        <ModalRoot />
        <Toaster />
      </ErrorBoundary>
    );
  }

  const project = activeProjectId ? projects.find((x) => x.id === activeProjectId) : undefined;

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen w-screen overflow-hidden text-atlas-fg-1 bg-atlas-black bg-noise">
        {degraded && <DegradedBanner />}
        <SharedWorkspaceBanner />
        <div className="flex flex-1 overflow-hidden">
          {mobileSidebarOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
          )}
          {/* Rail d'icônes — toujours visible en desktop, accès 1-click aux vues. */}
          <NavRail view={view} onNavigate={(v) => onNavigate(v)} />
          <div
            className={cn(
              'shrink-0 transition-transform z-50',
              mobileSidebarOpen ? 'fixed inset-y-0 left-0 translate-x-0' : 'hidden md:flex md:translate-x-0',
              mobileSidebarOpen && 'flex'
            )}
          >
            <Sidebar
              view={view}
              activeProjectId={activeProjectId}
              onNavigate={(v, p) => {
                onNavigate(v, p);
                setMobileSidebarOpen(false);
              }}
              onOpenCommand={() => setCmdOpen(true)}
              onExitToHome={() => setEntered(false)}
              onCloseMobile={() => setMobileSidebarOpen(false)}
            />
          </div>
          <main className="flex-1 flex flex-col overflow-hidden min-w-0">
            <TopBar
              breadcrumb={breadcrumb}
              onOpenCommand={() => setCmdOpen(true)}
              onToggleSidebar={() => setMobileSidebarOpen(true)}
            />
            <div className="flex-1 overflow-y-auto">
              <ErrorBoundary>
                <Suspense fallback={<ViewSkeleton />}>
                  {view === 'today' && <TodayView onOpenTask={setOpenTask} onNavigate={onNavigate} />}
                  {view === 'inbox' && <InboxView onOpenTask={setOpenTask} />}
                  {view === 'goals' && <GoalsView />}
                  {view === 'dashboards' && <DashboardView />}
                  {view === 'focus' && <FocusView onExit={() => setView('today')} />}
                  {view === 'automations' && <AutomationsView />}
                  {view === 'forms' && <FormsView />}
                  {view === 'reports' && <ReportsView />}
                  {view === 'projects' && <ProjectsView onNavigate={onNavigate} />}
                  {view === 'budget' && <BudgetOverview onNavigate={onNavigate} />}
                  {view === 'project' && project && (
                    <ProjectView
                      project={project}
                      onOpenTask={setOpenTask}
                      onBack={() => onNavigate('projects')}
                    />
                  )}
                </Suspense>
              </ErrorBoundary>
            </div>
          </main>

          <CommandMenu open={cmdOpen} onClose={() => setCmdOpen(false)} onNavigate={onNavigate} />
          <TaskDetailDrawer task={openTask} onClose={() => setOpenTask(null)} />
          <ModalRoot />
          {showOnboarding && <OnboardingModal />}
          <Toaster />
        </div>
      </div>
    </ErrorBoundary>
  );
}

/**
 * Banner shown when hydrate bailed to offline mock data because
 * Supabase REST is unreachable. The cockpit functions normally for
 * UI navigation but mutations don't persist.
 */
function DegradedBanner() {
  return (
    <div className="bg-signal-yellow/15 border-b border-signal-yellow/30 px-4 py-2 flex items-center justify-center gap-3 text-xs">
      <span className="inline-flex items-center gap-1.5 text-signal-yellow font-light tracking-wide uppercase text-2xs">
        <Sparkles className="w-3 h-3" />
        Mode démo · données en mémoire
      </span>
      <span className="text-atlas-fg-2 font-light hidden sm:inline">
        Supabase REST inaccessible depuis votre réseau. Vos modifications ne seront pas sauvegardées.
      </span>
      <button
        onClick={() => window.location.reload()}
        className="text-2xs uppercase tracking-wider text-atlas-sage-deep hover:text-atlas-sage-deeper font-light underline underline-offset-2"
      >
        Réessayer
      </button>
    </div>
  );
}

/**
 * Banner shown when the user is working inside a SHARED workspace (someone
 * else's cockpit they were invited to), with a one-click way back to their
 * own. Read-only (viewer) is surfaced too so silent write-blocks don't confuse.
 */
function SharedWorkspaceBanner() {
  const workspaces = useApp((s) => s.workspaces);
  const activeId = useApp((s) => s.activeWorkspaceId);
  const role = useApp((s) => s.myWorkspaceRole);
  const switchWorkspace = useApp((s) => s.switchWorkspace);
  const own = workspaces.find((w) => w.isOwn);
  const active = workspaces.find((w) => w.ownerId === activeId);
  if (!active || active.isOwn) return null; // own cockpit → no banner
  const isViewer = role === 'viewer';
  return (
    <div className="bg-atlas-sage-deep/15 border-b border-atlas-sage-deep/25 px-4 py-2 flex items-center justify-center gap-3 text-xs">
      <span className="inline-flex items-center gap-1.5 text-atlas-sage-deeper font-medium tracking-wide uppercase text-2xs">
        <Sparkles className="w-3 h-3" />
        Cockpit partagé · {active.label}
        {isViewer && ' · lecture seule'}
      </span>
      {own && (
        <button
          onClick={() => switchWorkspace(own.ownerId)}
          className="text-2xs uppercase tracking-wider text-atlas-sage-deep hover:text-atlas-sage-deeper font-medium underline underline-offset-2"
        >
          Revenir à mon cockpit
        </button>
      )}
    </div>
  );
}

/**
 * Routes dispatcher. Bootstraps Supabase auth once, applies global theme,
 * then delegates rendering to the right route:
 *
 *   /auth        → SSO / magic-link callback (claims session, → /dashboard)
 *   /login       → LoginView (OTP code, dev login, or "via Atlas Studio")
 *   /dashboard   → CockpitShell (the actual app, requires auth)
 *   /*           → redirects to /dashboard if signed in, else /login
 */
function App() {
  const authStatus = useApp((s) => s.authStatus);
  const bootstrap = useApp((s) => s.bootstrap);
  const theme = useApp((s) => s.settings.theme);

  // Subscribe to Supabase auth + hydrate snapshot on session change
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Apply theme dark mode (global)
  useEffect(() => {
    const apply = () => {
      const root = document.documentElement;
      const isDark =
        theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      root.classList.toggle('dark', isDark);
      root.style.colorScheme = isDark ? 'dark' : 'light';
    };
    apply();
    if (theme === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme]);

  // While auth is resolving, show splash regardless of which route the
  // user landed on (except /auth which has its own progress UI).
  if (authStatus === 'loading' && window.location.pathname !== '/auth') {
    return <BootSplash />;
  }

  return (
    <>
      {/* Global PWA install nudge — appears bottom-right ~3s after page
          load when `beforeinstallprompt` fires AND the user hasn't
          dismissed it in the last 7 days. Sits at z-90, below modals
          (z-100) and above all page content. Renders nothing if the
          app is already installed standalone, or on browsers that
          don't expose beforeinstallprompt (Safari, iOS). */}
      <InstallPromptBanner />
      <Routes>
        {/* Public landing — ALWAYS shown at root URL, even for signed-in users.
          (Standard SaaS pattern: Linear, Notion, etc. — / is marketing, not
          the app shell. Signed-in users get a "Mon cockpit" CTA in the nav.) */}
        <Route path="/" element={<LandingPage />} />

        {/* Legal — public, crawlable, no auth required */}
        <Route
          path="/legal/cgu"
          element={
            <Suspense fallback={<div />}>
              <CguPage />
            </Suspense>
          }
        />
        <Route
          path="/legal/confidentialite"
          element={
            <Suspense fallback={<div />}>
              <ConfidentialitePage />
            </Suspense>
          }
        />
        <Route
          path="/legal/cookies"
          element={
            <Suspense fallback={<div />}>
              <CookiesPage />
            </Suspense>
          }
        />
        <Route
          path="/legal/mentions"
          element={
            <Suspense fallback={<div />}>
              <MentionsPage />
            </Suspense>
          }
        />

        {/* Public intake form — no auth required */}
        <Route
          path="/f/:id"
          element={
            <Suspense fallback={<div />}>
              <PublicFormPage />
            </Suspense>
          }
        />

        {/* Participant share link — no auth required (scoped via cj-share token) */}
        <Route
          path="/p/:token"
          element={
            <Suspense fallback={<div />}>
              <ParticipantView />
            </Suspense>
          }
        />

        {/* Workspace invite acceptance — handles its own auth gate */}
        <Route
          path="/workspace/accept"
          element={
            <Suspense fallback={<div />}>
              <AcceptWorkspaceInvite />
            </Suspense>
          }
        />

        {/* SSO callback (Atlas Studio token handoff or magic-link redirect) */}
        <Route path="/auth" element={<AuthCallback />} />
        <Route
          path="/auth/accept-invite"
          element={
            <Suspense fallback={<div />}>
              <AcceptInvite />
            </Suspense>
          }
        />

        {/* Team settings — gestion equipe via licence_seats */}
        <Route
          path="/settings/team"
          element={
            authStatus === 'signed_in' ? (
              <Suspense fallback={<ViewSkeleton />}>
                <TeamSettingsPage />
              </Suspense>
            ) : (
              <SignedOutRedirect />
            )
          }
        />

        {/* Integrations settings — Personal Access Tokens for Claude Cowork & MCP clients */}
        <Route
          path="/settings/integrations"
          element={
            authStatus === 'signed_in' ? (
              <Suspense fallback={<ViewSkeleton />}>
                <IntegrationsSettingsPage />
              </Suspense>
            ) : (
              <SignedOutRedirect />
            )
          }
        />

        {/* Login (email + password OR Google OAuth). Magic-link OTP a
          été retiré au profit du flow password — la création de compte
          passe par /signup, le reset par /forgot-password. */}
        <Route
          path="/login"
          element={
            authStatus === 'signed_in' ? (
              <Navigate to={consumePostLoginTarget()} replace />
            ) : (
              <ErrorBoundary>
                <LoginView />
                <Toaster />
              </ErrorBoundary>
            )
          }
        />

        {/* Sign-up (création compte avec email + mot de passe + nom) */}
        <Route
          path="/signup"
          element={
            authStatus === 'signed_in' ? (
              <Navigate to={consumePostLoginTarget()} replace />
            ) : (
              <ErrorBoundary>
                <SignupView />
                <Toaster />
              </ErrorBoundary>
            )
          }
        />

        {/* Forgot password — déclenche l'envoi de l'e-mail de récupération */}
        <Route
          path="/forgot-password"
          element={
            authStatus === 'signed_in' ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <ErrorBoundary>
                <ForgotPasswordView />
                <Toaster />
              </ErrorBoundary>
            )
          }
        />

        {/* Reset password — landing page après clic du lien recovery */}
        <Route
          path="/reset-password"
          element={
            <ErrorBoundary>
              <ResetPasswordView />
              <Toaster />
            </ErrorBoundary>
          }
        />

        {/* Authenticated cockpit */}
        <Route
          path="/dashboard"
          element={authStatus === 'signed_in' ? <CockpitShell /> : <SignedOutRedirect />}
        />

        {/* Fallback: unknown URL → /dashboard if signed in, / (landing) otherwise */}
        <Route
          path="*"
          element={
            authStatus === 'signed_in' ? <Navigate to="/dashboard" replace /> : <Navigate to="/" replace />
          }
        />
      </Routes>
    </>
  );
}

/**
 * Redirect to /login while preserving the original target (so after login
 * the user lands back where they wanted to go, not always on /dashboard).
 */
function SignedOutRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    const target = window.location.pathname + window.location.search;
    if (target !== '/login' && target !== '/') {
      setPostLoginTarget(target);
    }
    navigate('/login', { replace: true });
  }, [navigate]);
  return null;
}

export default App;
