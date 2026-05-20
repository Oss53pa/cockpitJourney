import {
  ArrowUpRight,
  Calendar,
  AlertTriangle,
  Sparkles,
  LogIn,
  ArrowRight,
  Compass,
  type LucideIcon,
} from 'lucide-react';
import { useApp, useCurrentUser, getCurrentSprint } from '../../stores/appStore';
import { cn } from '../../lib/utils';
import type { ViewKey } from '../../types';

interface Props {
  onEnter: (view?: ViewKey) => void;
}

export function HomeView({ onEnter }: Props) {
  const tasks = useApp((s) => s.tasks);
  const goals = useApp((s) => s.goals);
  const projects = useApp((s) => s.projects);
  const me = useCurrentUser();
  const notifications = useApp((s) => s.notifications);
  const openModal = useApp((s) => s.openModal);
  const pushToast = useApp((s) => s.pushToast);
  const alertsCount = notifications.filter((n) => !n.read).length;
  const month = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const monthShort = new Date().toLocaleDateString('fr-FR', { month: 'long' });
  const year = new Date().getFullYear();

  const users = useApp((s) => s.users);
  const activeTasks = tasks.filter((t) => t.status !== 'done').length;
  const completedTasks = tasks.filter((t) => t.status === 'done').length;
  const onTrack = goals.filter((g) => g.health === 'green').length;
  const atRisk = goals.filter((g) => g.health !== 'green').length;
  const totalActualMinutes = tasks.reduce((sum, t) => sum + (t.actualMinutes || 0), 0);
  const deepWorkHours = Math.round((totalActualMinutes / 60) * 10) / 10;
  const deepWorkTarget = Math.max(deepWorkHours, 20);
  const projectsCount = projects.filter((p) => p.status === 'active').length;
  const sprintLabel = getCurrentSprint(tasks);
  const mainProject = projects.find((p) => p.status === 'active');
  const totalTasks = tasks.length || 1;
  const sprintProgress = Math.round((completedTasks / totalTasks) * 100);

  // Real 14-day activity series for the KPI sparklines — derived from the
  // user's actual tasks (completion dates, deep-work minutes per day,
  // active task count). Replaces the previous fake `Math.sin + random()`
  // sparkline which was generating mock-looking trend lines on every
  // KPI card even for fresh accounts with no history.
  const DAYS = 14;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayKeys: string[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dayKeys.push(d.toISOString().slice(0, 10));
  }
  // Tasks completed per day (last 14 d)
  const completedSeries = dayKeys.map(
    (key) => tasks.filter((t) => t.completionDate && t.completionDate.slice(0, 10) === key).length
  );
  // Deep work minutes per day — uses task.completionDate as the day
  // anchor (we don't track time per day yet).
  const deepWorkSeries = dayKeys.map((key) =>
    tasks
      .filter((t) => t.completionDate && t.completionDate.slice(0, 10) === key)
      .reduce((sum, t) => sum + (t.actualMinutes || 0), 0)
  );
  // Active tasks "trajectory" — count of tasks that existed and weren't
  // done as of each day. Approximated by createdAt ≤ day < completionDate.
  const activeSeries = dayKeys.map((key) => {
    const dayMs = new Date(key).getTime();
    return tasks.filter((t) => {
      const created = t.createdAt ? new Date(t.createdAt).getTime() : 0;
      const done = t.completionDate ? new Date(t.completionDate).getTime() : Infinity;
      return created <= dayMs && dayMs < done;
    }).length;
  });
  // Projects active per day — same shape as activeSeries but on the
  // project collection (status active, with status changes not tracked
  // historically, we approximate with current value).
  const projectsSeries = dayKeys.map(() => projectsCount);

  return (
    <div className="min-h-screen w-full bg-atlas-black bg-noise overflow-x-hidden">
      {/* Top bar */}
      <header className="relative z-10 px-8 pt-7 flex items-start justify-between">
        <div>
          <div className="text-2xs uppercase tracking-[0.2em] text-atlas-fg-3 font-medium">
            {me.role.split('·')[1]?.trim() || 'Atlas Studio'}
          </div>
          <div className="mt-1 text-sm font-medium text-atlas-fg-2">
            CockpitJourney · Espace de {me.name.split(' ')[0]}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Pill icon={Calendar} label="Période" value={month} />
          <button onClick={() => onEnter('inbox')}>
            <Pill
              icon={AlertTriangle}
              label="alertes"
              value={String(alertsCount)}
              tone={alertsCount > 0 ? 'red' : 'neutral'}
            />
          </button>
          <button onClick={() => openModal('proph3t-brief')}>
            <Pill icon={Sparkles} label="PROPH3T" value="actif" tone="amber" />
          </button>
          <button onClick={() => onEnter('today')} className="btn-secondary text-sm h-9 px-3.5">
            <ArrowUpRight className="w-3.5 h-3.5" /> Découvrir
          </button>
          <button
            onClick={() => pushToast({ kind: 'info', title: 'Vous êtes déjà connectée', body: me.email })}
            className="btn-secondary text-sm h-9 px-3.5"
          >
            <LogIn className="w-3.5 h-3.5" /> Se connecter
          </button>
          <button onClick={() => onEnter('dashboards')} className="btn-primary text-sm h-9 px-4">
            Dashboard <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative px-8 pt-16 pb-10 text-center">
        <div className="absolute inset-x-0 top-0 h-[420px] bg-grid-fade pointer-events-none" />
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-[640px] h-[420px] rounded-full bg-atlas-amber/[0.10] blur-[140px] pointer-events-none" />

        <div className="relative inline-flex items-center gap-2 text-2xs uppercase tracking-[0.22em] font-medium text-atlas-fg-2">
          <span className="w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse-soft" />
          Bienvenue · {monthShort} {year}
        </div>

        <div className="relative mt-5 leading-[0.9]">
          <span className="font-logo text-[88px] md:text-[120px] text-atlas-fg-1">Cockpit</span>
          <span className="font-logo text-[88px] md:text-[120px] text-atlas-amber"> Journey</span>
        </div>

        <p className="relative mt-7 max-w-2xl mx-auto text-atlas-fg-2 text-pretty leading-relaxed">
          Compagnon quotidien IA pour dirigeants, freelances et équipes.
          <strong className="text-atlas-fg-1"> Daily Brief, auto-priorisation, coaching</strong> — propulsé
          par PROPH3T. Tâches, projets, Goals OKR, dashboards et mode Focus en un seul endroit.
        </p>
      </section>

      {/* KPIs */}
      <section className="px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <button onClick={() => onEnter('today')} className="text-left">
            <Kpi
              label="Tâches actives"
              value={String(activeTasks)}
              sub={`${completedTasks} complétées récemment`}
              sparklineColor="#6E8B58"
              series={activeSeries}
            />
          </button>
          <button onClick={() => onEnter('goals')} className="text-left">
            <Kpi
              label="Goals on-track"
              value={`${onTrack} / ${goals.length}`}
              sub={`${atRisk} à arbitrer`}
              sparklineColor="#5C7BA1"
              series={completedSeries}
              arrow
            />
          </button>
          <button onClick={() => onEnter('focus')} className="text-left">
            <Kpi
              label="Deep Work"
              value={`${deepWorkHours}h`}
              sub={`Objectif ${deepWorkTarget}h cette semaine`}
              sparklineColor="#7E6BA8"
              series={deepWorkSeries}
            />
          </button>
          <button onClick={() => onEnter('dashboards')} className="text-left">
            <Kpi
              label="Projets actifs"
              value={String(projectsCount)}
              sub={`${tasks.length} tâches · ${users.length} membre${users.length > 1 ? 's' : ''}`}
              sparklineColor="#B69248"
              series={projectsSeries}
              arrow
            />
          </button>
        </div>
      </section>

      {/* Sprint + PROPH3T */}
      <section className="px-8 mt-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 panel p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xs uppercase tracking-[0.18em] text-atlas-fg-3 font-medium">
                  Avancement du sprint
                </div>
                <div className="mt-1 text-base font-medium text-atlas-fg-1">
                  {sprintLabel ? `Sprint ${sprintLabel}` : 'Sprint en cours'}
                  {mainProject ? ` · ${mainProject.name}` : ''}
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-3xl font-medium text-atlas-fg-1 tabular-nums">
                  {sprintProgress}
                  <span className="text-atlas-fg-3 text-base font-normal"> %</span>
                </div>
                <div className="text-2xs text-atlas-fg-3">YTD</div>
              </div>
            </div>
            <div className="mt-4 h-2 rounded-full bg-black/[0.05] overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-gradient transition-all"
                style={{ width: `${sprintProgress}%`, boxShadow: '0 0 18px rgba(110,139,88,0.45)' }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-2xs text-atlas-fg-3">
              <span>
                {activeTasks} tâche{activeTasks > 1 ? 's' : ''} restante{activeTasks > 1 ? 's' : ''}
              </span>
              <span
                className={
                  sprintProgress >= 50 ? 'text-signal-green font-medium' : 'text-signal-yellow font-medium'
                }
              >
                {sprintProgress}% complété
              </span>
            </div>
          </div>

          <button
            onClick={() => onEnter('today')}
            className="text-left panel p-6 group hover:border-atlas-amber/40 transition-colors relative overflow-hidden"
          >
            <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-atlas-amber/15 blur-2xl pointer-events-none" />
            <div className="relative flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-gradient text-white flex items-center justify-center shadow-amber-deep shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-atlas-fg-1">PROPH3T · Assistant IA</div>
                <div className="text-2xs text-atlas-fg-3 mt-0.5">
                  Analyse, commente et anticipe votre activité.
                </div>
                <div className="mt-3 inline-flex items-center gap-1.5 text-2xs uppercase tracking-wider font-medium text-atlas-amber group-hover:gap-2.5 transition-all">
                  Ouvrir le brief <ArrowRight className="w-3 h-3" />
                </div>
              </div>
            </div>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-8 pt-12 pb-10 text-center">
        <div className="text-2xs text-atlas-fg-3">
          Une application <span className="text-atlas-fg-2 font-medium">Atlas Studio</span> · propulsée par{' '}
          <span className="text-atlas-amber font-medium">PROPH3T</span>
        </div>
      </footer>

      {/* Floating launcher (hint, like screenshot) */}
      <button
        onClick={() => onEnter('today')}
        className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-atlas-fg-1 text-atlas-black shadow-soft-pop flex items-center justify-center hover:scale-105 transition-transform"
        aria-label="Entrer dans l'application"
      >
        <Compass className="w-6 h-6" strokeWidth={1.6} />
        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-atlas-amber ring-2 ring-atlas-black" />
      </button>
    </div>
  );
}

function Pill({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: 'neutral' | 'amber' | 'red';
}) {
  const cls =
    tone === 'amber'
      ? 'border-atlas-amber/30 bg-atlas-amber/10 text-atlas-amber'
      : tone === 'red'
        ? 'border-signal-red/30 bg-signal-red/10 text-signal-red'
        : 'border-atlas-line bg-white text-atlas-fg-2';
  return (
    <div className={cn('inline-flex items-center gap-2 h-9 px-3 rounded-xl border', cls)}>
      <Icon className="w-3.5 h-3.5 opacity-70" />
      <span className="text-2xs uppercase tracking-wider opacity-80">{label}</span>
      <span className="text-xs font-medium tabular-nums">{value}</span>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  sparklineColor,
  series,
  arrow,
}: {
  label: string;
  value: string;
  sub: string;
  sparklineColor: string;
  /** Real time-series for the sparkline. One number per day, oldest → newest. */
  series: number[];
  arrow?: boolean;
}) {
  // Normalize the series to viewport coords. If the series is all zeros
  // (e.g. fresh account with no completion history yet), we render a
  // flat baseline instead of a fake curve — the goal is to avoid LIES
  // about the user's activity.
  const max = Math.max(...series, 0);
  const min = Math.min(...series, 0);
  const range = max - min || 1;
  const N = series.length || 1;
  const allZero = max === 0;
  const points = series.map((v, i) => {
    const x = (i / Math.max(1, N - 1)) * 100;
    // Top of card = 4, bottom of sparkline area = 32
    const y = allZero ? 30 : 32 - ((v - min) / range) * 28;
    return `${x},${y}`;
  });
  const gradId = 'grad-' + sparklineColor.slice(1);
  return (
    <article className="relative panel p-5 overflow-hidden hover:border-atlas-line-2 transition-colors group">
      <div className="flex items-start justify-between">
        <div className="text-2xs uppercase tracking-[0.18em] text-atlas-fg-3 font-medium">{label}</div>
        {arrow && (
          <ArrowUpRight className="w-3.5 h-3.5 text-atlas-fg-3 group-hover:text-atlas-amber transition-colors" />
        )}
      </div>
      <div className="mt-4 font-display text-3xl md:text-[34px] font-medium tracking-tight text-atlas-fg-1 tabular-nums leading-none">
        {value}
      </div>
      <div className="mt-2 text-2xs text-atlas-fg-3">{sub}</div>
      {allZero ? (
        // No real activity yet — show a subtle dashed baseline rather
        // than a fake trending curve. Honest empty state.
        <div className="mt-4 h-9 flex items-end">
          <div className="w-full h-px border-t border-dashed border-atlas-line" />
        </div>
      ) : (
        <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="mt-4 w-full h-9 opacity-90">
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={sparklineColor} stopOpacity="0.30" />
              <stop offset="100%" stopColor={sparklineColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon fill={`url(#${gradId})`} points={`0,36 ${points.join(' ')} 100,36`} />
          <polyline fill="none" stroke={sparklineColor} strokeWidth="1.2" points={points.join(' ')} />
        </svg>
      )}
    </article>
  );
}
