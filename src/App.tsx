import { Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { CommandMenu } from './components/layout/CommandMenu';
import { TodayView } from './components/views/TodayView';
import { TaskDetailDrawer } from './components/TaskDetailDrawer';
import { HomeView } from './components/views/HomeView';
import { LoginView } from './components/views/LoginView';
import { LandingPage } from './components/views/LandingPage';
import { AuthCallback } from './components/AuthCallback';
import { ModalRoot } from './components/modals/ModalRoot';
const TeamSettingsPage = lazy(() => import('./pages/settings/TeamSettingsPage'));
import { Toaster } from './components/ui/Toaster';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useApp } from './stores/appStore';
import { cn } from './lib/utils';
import type { Task, ViewKey } from './types';

// Lazy-load heavy views to keep initial bundle small
const ProjectView = lazy(() =>
  import('./components/views/ProjectView').then((m) => ({ default: m.ProjectView }))
);
const DashboardView = lazy(() =>
  import('./components/views/DashboardView').then((m) => ({ default: m.DashboardView }))
);
const GoalsView = lazy(() => import('./components/views/GoalsView').then((m) => ({ default: m.GoalsView })));
const FocusView = lazy(() => import('./components/views/FocusView').then((m) => ({ default: m.FocusView })));
const InboxView = lazy(() => import('./components/views/InboxView').then((m) => ({ default: m.InboxView })));
const AutomationsView = lazy(() =>
  import('./components/views/AutomationsView').then((m) => ({ default: m.AutomationsView }))
);
const FormsView = lazy(() => import('./components/views/FormsView').then((m) => ({ default: m.FormsView })));
const ReportsView = lazy(() =>
  import('./components/views/ReportsView').then((m) => ({ default: m.ReportsView }))
);

/**
 * Splash shown while we wait for Supabase auth to resolve. After 4s a
 * "ça met du temps" hint appears with a manual escape hatch (clear local
 * storage + reload) for the rare case where bootstrap genuinely hangs
 * (network fail, broken CORS, stale auth token, browser extension blocking
 * the auth iframe…).
 */
function ConnectingSplash() {
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
        <div className="text-2xs uppercase tracking-[0.2em] text-atlas-fg-3 font-light">
          Connexion à Supabase…
        </div>
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
      case 'project': {
        const p = activeProjectId ? projects.find((x) => x.id === activeProjectId) : undefined;
        return [
          { label: 'Projets', sub: 'Atlas Studio' },
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

  // Snapshot still loading → loading screen
  if (!ready) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-atlas-cream">
        <div className="text-center">
          <div className="font-logo text-5xl text-atlas-fg-1 mb-4">
            Cockpit<span className="text-atlas-sage-deep">Journey</span>
          </div>
          <div className="text-2xs uppercase tracking-[0.2em] text-atlas-fg-3 font-light">
            Chargement de votre cockpit…
          </div>
          <div className="mt-5 mx-auto w-32 h-1 rounded-full bg-black/[0.05] overflow-hidden">
            <div className="h-full w-1/2 bg-atlas-sage-deep animate-pulse-soft rounded-full" />
          </div>
        </div>
      </div>
    );
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
        <div className="flex flex-1 overflow-hidden">
          {mobileSidebarOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
          )}
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
                  {view === 'project' && project && (
                    <ProjectView project={project} onOpenTask={setOpenTask} />
                  )}
                </Suspense>
              </ErrorBoundary>
            </div>
          </main>

          <CommandMenu open={cmdOpen} onClose={() => setCmdOpen(false)} onNavigate={onNavigate} />
          <TaskDetailDrawer task={openTask} onClose={() => setOpenTask(null)} />
          <ModalRoot />
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
    return <ConnectingSplash />;
  }

  return (
    <Routes>
      {/* Public landing — ALWAYS shown at root URL, even for signed-in users.
          (Standard SaaS pattern: Linear, Notion, etc. — / is marketing, not
          the app shell. Signed-in users get a "Mon cockpit" CTA in the nav.) */}
      <Route path="/" element={<LandingPage />} />

      {/* SSO callback (Atlas Studio token handoff or magic-link redirect) */}
      <Route path="/auth" element={<AuthCallback />} />

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

      {/* Login (OTP code + dev login + Atlas Studio link) */}
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
      sessionStorage.setItem('cj-post-login-redirect', target);
    }
    navigate('/login', { replace: true });
  }, [navigate]);
  return null;
}

/** Read-then-clear the post-login redirect target. Defaults to /dashboard. */
function consumePostLoginTarget(): string {
  try {
    const target = sessionStorage.getItem('cj-post-login-redirect');
    if (target) {
      sessionStorage.removeItem('cj-post-login-redirect');
      return target;
    }
  } catch {
    /* sessionStorage may be unavailable */
  }
  return '/dashboard';
}

export default App;
