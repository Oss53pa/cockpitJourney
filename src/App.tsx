import { Suspense, lazy, useEffect, useState } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { CommandMenu } from './components/layout/CommandMenu';
import { TodayView } from './components/views/TodayView';
import { TaskDetailDrawer } from './components/TaskDetailDrawer';
import { HomeView } from './components/views/HomeView';
import { LoginView } from './components/views/LoginView';
import { ModalRoot } from './components/modals/ModalRoot';
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

function App() {
  const [entered, setEntered] = useState(false);
  const [view, setView] = useState<ViewKey>('today');
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>(undefined);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);

  const ready = useApp((s) => s.ready);
  const authStatus = useApp((s) => s.authStatus);
  const bootstrap = useApp((s) => s.bootstrap);
  const projects = useApp((s) => s.projects);
  const openModal = useApp((s) => s.openModal);
  const tickFocus = useApp((s) => s.tickFocus);
  const focusRunning = useApp((s) => s.focus.running);
  const theme = useApp((s) => s.settings.theme);

  // Subscribe to Supabase auth + hydrate snapshot on session change
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Once snapshot is loaded, default the active project to the user's
  // first project (their namespace, no global hardcoded id).
  useEffect(() => {
    if (ready && !activeProjectId && projects.length > 0) {
      setActiveProjectId(projects[0].id);
    }
  }, [ready, projects, activeProjectId]);

  // Apply theme dark mode
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

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      // Ignore inputs/textareas
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

  // 1. Still resolving session → splash
  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-atlas-cream">
        <div className="text-center">
          <div className="font-logo text-5xl text-atlas-fg-1 mb-4">
            Cockpit<span className="text-atlas-sage-deep">Journey</span>
          </div>
          <div className="text-2xs uppercase tracking-[0.2em] text-atlas-fg-3 font-medium">
            Connexion à Supabase…
          </div>
          <div className="mt-5 mx-auto w-32 h-1 rounded-full bg-black/[0.05] overflow-hidden">
            <div className="h-full w-1/2 bg-atlas-sage-deep animate-pulse-soft rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  // 2. Not signed in → login screen
  if (authStatus === 'signed_out') {
    return (
      <ErrorBoundary>
        <LoginView />
        <Toaster />
      </ErrorBoundary>
    );
  }

  // 3. Signed in but snapshot not yet loaded → loading screen
  if (!ready) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-atlas-cream">
        <div className="text-center">
          <div className="font-logo text-5xl text-atlas-fg-1 mb-4">
            Cockpit<span className="text-atlas-sage-deep">Journey</span>
          </div>
          <div className="text-2xs uppercase tracking-[0.2em] text-atlas-fg-3 font-medium">
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
      <div className="flex h-screen w-screen overflow-hidden text-atlas-fg-1 bg-atlas-black bg-noise">
        {/* Mobile backdrop */}
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}
        {/* Sidebar (hidden on mobile unless open) */}
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
                {view === 'project' && project && <ProjectView project={project} onOpenTask={setOpenTask} />}
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>

        <CommandMenu open={cmdOpen} onClose={() => setCmdOpen(false)} onNavigate={onNavigate} />
        <TaskDetailDrawer task={openTask} onClose={() => setOpenTask(null)} />
        <ModalRoot />
        <Toaster />
      </div>
    </ErrorBoundary>
  );
}

export default App;
