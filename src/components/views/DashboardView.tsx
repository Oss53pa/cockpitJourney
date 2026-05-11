import { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Sparkles,
  ListChecks,
  Clock4,
  Users,
  Target,
  Plus,
  Settings2,
  Maximize2,
  MoreHorizontal,
  Filter,
  Calendar,
  Zap,
  Activity,
  Download,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../stores/appStore';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu';
import { cn } from '../../lib/utils';

const periods = ["Aujourd'hui", '7 jours', '30 jours', 'Trimestre', 'Année'] as const;
type Period = (typeof periods)[number];

interface Widget {
  id: string;
  kind: 'velocity' | 'donut' | 'heatmap' | 'workload' | 'burndown' | 'delays';
}

export function DashboardView() {
  const [period, setPeriod] = useState<Period>('Trimestre');
  const [widgets, setWidgets] = useState<Widget[]>([
    { id: 'w1', kind: 'velocity' },
    { id: 'w2', kind: 'donut' },
    { id: 'w3', kind: 'heatmap' },
    { id: 'w4', kind: 'workload' },
    { id: 'w5', kind: 'burndown' },
    { id: 'w6', kind: 'delays' },
  ]);
  const tasks = useApp((s) => s.tasks);
  const goals = useApp((s) => s.goals);
  const projects = useApp((s) => s.projects);
  const pushToast = useApp((s) => s.pushToast);

  const removeWidget = (id: string) => {
    setWidgets((w) => w.filter((x) => x.id !== id));
    pushToast({ kind: 'info', title: 'Widget retiré' });
  };
  const addWidget = (kind: Widget['kind']) => {
    setWidgets((w) => [...w, { id: 'w_' + Date.now(), kind }]);
    pushToast({ kind: 'success', title: 'Widget ajouté' });
  };

  const users = useApp((s) => s.users);

  const totalActualMinutes = tasks.reduce((sum, t) => sum + (t.actualMinutes || 0), 0);
  const kpis = {
    activeTasks: tasks.filter((t) => t.status !== 'done').length,
    timeTracked: Math.round(totalActualMinutes / 60),
    teamMembers: users.length,
    goalsOnTrack: goals.filter((g) => g.health === 'green').length,
    goalsTotal: goals.length,
    activeProjects: projects.filter((p) => p.status === 'active').length,
  };

  return (
    <div className="px-8 py-7">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-2xs uppercase tracking-[0.18em] text-atlas-fg-3 font-medium mb-1">
            Dashboard exécutif
          </div>
          <h1 className="font-display text-3xl font-medium tracking-tight">Vue 360 — Atlas Studio</h1>
          <p className="text-sm text-atlas-fg-3 mt-1">
            Mise à jour temps réel · {widgets.length} widgets configurables · {kpis.activeProjects} projets
            actifs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Menu
            trigger={
              <button className="btn-ghost text-sm px-3 py-1.5">
                <Calendar className="w-3.5 h-3.5" /> {period}
              </button>
            }
          >
            {(close) => (
              <>
                {periods.map((p) => (
                  <MenuItem
                    key={p}
                    onClick={() => {
                      close();
                      setPeriod(p);
                    }}
                  >
                    {p}
                    {period === p && <span className="text-atlas-amber ml-2">✓</span>}
                  </MenuItem>
                ))}
              </>
            )}
          </Menu>
          <button
            onClick={() => pushToast({ kind: 'info', title: 'Filtres avancés bientôt' })}
            className="btn-secondary text-sm px-3 py-1.5"
          >
            <Filter className="w-3.5 h-3.5" /> Filtres
          </button>
          <button
            onClick={() => pushToast({ kind: 'info', title: 'Configuration du dashboard' })}
            className="btn-secondary text-sm px-3 py-1.5"
          >
            <Settings2 className="w-3.5 h-3.5" /> Configurer
          </button>
          <Menu
            trigger={
              <button className="btn-primary text-sm px-3 py-1.5">
                <Plus className="w-3.5 h-3.5" /> Widget
              </button>
            }
          >
            {(close) => (
              <>
                <MenuLabel>Ajouter un widget</MenuLabel>
                <MenuItem
                  icon={Zap}
                  onClick={() => {
                    close();
                    addWidget('velocity');
                  }}
                >
                  Vélocité hebdomadaire
                </MenuItem>
                <MenuItem
                  icon={Activity}
                  onClick={() => {
                    close();
                    addWidget('donut');
                  }}
                >
                  Répartition par statut
                </MenuItem>
                <MenuItem
                  icon={Sparkles}
                  onClick={() => {
                    close();
                    addWidget('heatmap');
                  }}
                >
                  Heatmap activité
                </MenuItem>
                <MenuItem
                  icon={Users}
                  onClick={() => {
                    close();
                    addWidget('workload');
                  }}
                >
                  Charge équipe
                </MenuItem>
                <MenuItem
                  icon={TrendingDown}
                  onClick={() => {
                    close();
                    addWidget('burndown');
                  }}
                >
                  Burndown sprint
                </MenuItem>
                <MenuItem
                  icon={Clock4}
                  onClick={() => {
                    close();
                    addWidget('delays');
                  }}
                >
                  Top retards
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  icon={Download}
                  onClick={() => {
                    close();
                    pushToast({ kind: 'success', title: 'Export PDF en cours…' });
                  }}
                >
                  Exporter PDF
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <KpiCard
          label="Tâches actives"
          value={String(kpis.activeTasks)}
          sub={`période ${period.toLowerCase()}`}
          icon={ListChecks}
          accent="amber"
        />
        <KpiCard
          label="Time tracked"
          value={kpis.timeTracked > 0 ? `${kpis.timeTracked}h` : '—'}
          sub="total logué"
          icon={Clock4}
          accent="blue"
        />
        <KpiCard
          label="Membres équipe"
          value={String(kpis.teamMembers)}
          sub="collaborateurs actifs"
          icon={Users}
          accent="green"
        />
        <KpiCard
          label="Goals on-track"
          value={`${kpis.goalsOnTrack} / ${kpis.goalsTotal}`}
          sub={`${kpis.goalsTotal - kpis.goalsOnTrack} en zone jaune`}
          icon={Target}
          accent="violet"
        />
      </div>

      <div className="grid grid-cols-12 gap-4">
        {widgets.map((w) => {
          const span =
            w.kind === 'velocity' || w.kind === 'heatmap' || w.kind === 'burndown'
              ? 'col-span-12 lg:col-span-7'
              : w.kind === 'donut'
                ? 'col-span-12 lg:col-span-4'
                : 'col-span-12 lg:col-span-5';
          const titles: Record<Widget['kind'], { title: string; sub: string; icon: any }> = {
            velocity: { title: 'Vélocité hebdomadaire', sub: 'Tâches livrées par sprint', icon: Zap },
            donut: { title: 'Répartition par statut', sub: 'Cockpit v2.0', icon: Activity },
            heatmap: {
              title: 'Heatmap activité',
              sub: 'Productivité quotidienne · 12 dernières semaines',
              icon: Sparkles,
            },
            workload: { title: 'Charge équipe', sub: 'Heures planifiées cette semaine', icon: Users },
            burndown: { title: 'Burndown — Sprint 08', sub: 'Avancement vs idéal', icon: TrendingDown },
            delays: { title: 'Top tâches en retard', sub: 'Actions à arbitrer', icon: Clock4 },
          };
          const t = titles[w.kind];
          return (
            <Widget
              key={w.id}
              className={span}
              title={t.title}
              sub={t.sub}
              icon={t.icon}
              onRemove={() => removeWidget(w.id)}
              onMaximize={() => pushToast({ kind: 'info', title: 'Plein écran à venir' })}
            >
              {w.kind === 'velocity' && <Bars />}
              {w.kind === 'donut' && <DonutLegend />}
              {w.kind === 'heatmap' && <Heatmap />}
              {w.kind === 'workload' && <Workload />}
              {w.kind === 'burndown' && <Burndown />}
              {w.kind === 'delays' && <DelayedList />}
            </Widget>
          );
        })}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  icon: any;
  accent: 'amber' | 'blue' | 'green' | 'violet';
}) {
  const ringMap: Record<string, string> = {
    amber: 'border-atlas-amber/30 bg-atlas-amber/[0.05]',
    blue: 'border-signal-blue/30 bg-signal-blue/[0.05]',
    green: 'border-signal-green/30 bg-signal-green/[0.05]',
    violet: 'border-signal-violet/30 bg-signal-violet/[0.05]',
  };
  const textMap: Record<string, string> = {
    amber: 'text-atlas-amber-deep',
    blue: 'text-signal-blue',
    green: 'text-signal-green',
    violet: 'text-signal-violet',
  };
  return (
    <div className={cn('relative overflow-hidden rounded-2xl border p-5', ringMap[accent])}>
      <div className="relative flex items-start justify-between">
        <div className="space-y-1.5">
          <div className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">{label}</div>
          <div className={cn('font-display text-3xl font-medium tracking-tight', textMap[accent])}>
            {value}
          </div>
          <div className="text-2xs text-atlas-fg-3">{sub}</div>
        </div>
        <div
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center bg-white border border-atlas-line',
            textMap[accent]
          )}
        >
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function Widget({
  className,
  title,
  sub,
  icon: Icon,
  children,
  onRemove,
  onMaximize,
}: {
  className?: string;
  title: string;
  sub?: string;
  icon: any;
  children: React.ReactNode;
  onRemove: () => void;
  onMaximize: () => void;
}) {
  return (
    <section className={cn('panel p-5', className)}>
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-white border border-atlas-line flex items-center justify-center text-atlas-amber-deep">
            <Icon className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-atlas-fg-1">{title}</h3>
            {sub && <p className="text-2xs text-atlas-fg-3">{sub}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onMaximize}
            className="w-7 h-7 rounded-md hover:bg-black/[0.05] text-atlas-fg-3 hover:text-atlas-fg-1 flex items-center justify-center"
            title="Agrandir"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <Menu
            trigger={
              <button className="w-7 h-7 rounded-md hover:bg-black/[0.05] text-atlas-fg-3 hover:text-atlas-fg-1 flex items-center justify-center">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            }
          >
            {(close) => (
              <>
                <MenuItem
                  icon={Maximize2}
                  onClick={() => {
                    close();
                    onMaximize();
                  }}
                >
                  Agrandir
                </MenuItem>
                <MenuItem
                  icon={Download}
                  onClick={() => {
                    close();
                    useApp.getState().pushToast({ kind: 'info', title: 'Export PNG' });
                  }}
                >
                  Exporter
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  danger
                  icon={Trash2}
                  onClick={() => {
                    close();
                    onRemove();
                  }}
                >
                  Retirer
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </header>
      {children}
    </section>
  );
}

function Bars() {
  const tasks = useApp((s) => s.tasks);
  const now = Date.now();
  const weekMs = 7 * 86400000;
  const labels = Array.from({ length: 12 }, (_, i) => `S-${String(12 - i).padStart(2, '0')}`);
  const data = labels
    .map((_, i) => {
      const weekEnd = now - i * weekMs;
      const weekStart = weekEnd - weekMs;
      return tasks.filter((t) => {
        if (!t.completionDate) return false;
        const d = new Date(t.completionDate).getTime();
        return d >= weekStart && d < weekEnd;
      }).length;
    })
    .reverse();
  const max = Math.max(...data, 1);
  return (
    <div>
      <div className="flex items-end gap-2 h-44">
        {data.map((v, i) => {
          const h = (v / max) * 100;
          const isLast = i === data.length - 1;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center group"
              title={`${labels[i]} : ${v} tâches`}
            >
              <div className="relative w-full">
                <div
                  className={cn(
                    'w-full rounded-t-md transition-all duration-300 ease-out',
                    isLast
                      ? 'bg-amber-gradient shadow-amber-glow'
                      : 'bg-atlas-line group-hover:bg-atlas-amber/40'
                  )}
                  style={{ height: `${h * 1.6}px` }}
                />
              </div>
              <div className="text-2xs text-atlas-fg-3 mt-1.5 font-mono">{labels[i]}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-4">
        <span className="inline-flex items-center gap-2 text-2xs text-atlas-fg-3">
          <span className="w-2 h-2 rounded-sm bg-amber-gradient" /> Sprint en cours
        </span>
        <span className="inline-flex items-center gap-2 text-2xs text-atlas-fg-3">
          <span className="w-2 h-2 rounded-sm bg-atlas-line" /> Sprints précédents
        </span>
        {data.length >= 2 && data[data.length - 2] > 0 && (
          <span
            className={cn(
              'ml-auto text-2xs inline-flex items-center gap-1',
              data[data.length - 1] >= data[data.length - 2] ? 'text-signal-green' : 'text-signal-red'
            )}
          >
            {data[data.length - 1] >= data[data.length - 2] ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {data[data.length - 2] > 0
              ? `${Math.round(((data[data.length - 1] - data[data.length - 2]) / data[data.length - 2]) * 100)}%`
              : '—'}{' '}
            vs S-02
          </span>
        )}
      </div>
    </div>
  );
}

function DonutLegend() {
  const tasks = useApp((s) => s.tasks);
  const total = tasks.length || 1;
  const data = [
    {
      label: 'Terminé',
      value: Math.round((tasks.filter((t) => t.status === 'done').length / total) * 100),
      color: '#4D9A6A',
    },
    {
      label: 'En cours',
      value: Math.round((tasks.filter((t) => t.status === 'in_progress').length / total) * 100),
      color: '#6E8B58',
    },
    {
      label: 'En revue',
      value: Math.round((tasks.filter((t) => t.status === 'in_review').length / total) * 100),
      color: '#5C7BA1',
    },
    {
      label: 'À faire',
      value: Math.round((tasks.filter((t) => t.status === 'todo').length / total) * 100),
      color: '#A4A99B',
    },
  ];
  let acc = 0;
  const totalPct = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 120 120" className="w-36 h-36 -rotate-90">
        <circle cx="60" cy="60" r="48" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="14" />
        {data.map((d, i) => {
          const length = (d.value / totalPct) * (2 * Math.PI * 48);
          const offset = (acc / totalPct) * (2 * Math.PI * 48);
          acc += d.value;
          return (
            <circle
              key={i}
              cx="60"
              cy="60"
              r="48"
              fill="none"
              stroke={d.color}
              strokeWidth="14"
              strokeDasharray={`${length} ${2 * Math.PI * 48 - length}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
        })}
      </svg>
      <div className="flex-1 space-y-2">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm" style={{ background: d.color }} />
            <span className="text-xs text-atlas-fg-2 flex-1">{d.label}</span>
            <span className="text-xs font-mono font-medium text-atlas-fg-1">{d.value}%</span>
          </div>
        ))}
        <div className="pt-3 border-t border-atlas-line mt-3">
          <div className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">Score santé</div>
          {(() => {
            const done = data.find((d) => d.label === 'Terminé')?.value || 0;
            const score = Math.min(
              100,
              Math.round(done * 1.2 + (100 - (data.find((d) => d.label === 'À faire')?.value || 0)) * 0.3)
            );
            const color =
              score >= 70 ? 'text-signal-green' : score >= 40 ? 'text-signal-yellow' : 'text-signal-red';
            const dotColor =
              score >= 70 ? 'bg-signal-green' : score >= 40 ? 'bg-signal-yellow' : 'bg-signal-red';
            return (
              <div className={cn('font-display text-2xl font-medium mt-1 flex items-center gap-1.5', color)}>
                <span className={cn('w-2.5 h-2.5 rounded-full animate-pulse-soft', dotColor)} />
                {score} / 100
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function Heatmap() {
  const cols = 12,
    rows = 7;
  const cells = Array.from({ length: rows * cols }, () => Math.random());
  const palette = (v: number) => {
    if (v < 0.15) return 'rgba(0,0,0,0.04)';
    if (v < 0.35) return 'rgba(110,139,88,0.18)';
    if (v < 0.55) return 'rgba(110,139,88,0.35)';
    if (v < 0.78) return 'rgba(110,139,88,0.6)';
    return 'rgba(110,139,88,0.95)';
  };
  return (
    <div>
      <div className="grid grid-flow-col gap-1.5" style={{ gridTemplateRows: `repeat(${rows}, 14px)` }}>
        {cells.map((v, i) => (
          <div
            key={i}
            className="rounded-sm transition-transform hover:scale-125"
            style={{
              background: palette(v),
              width: 14,
              height: 14,
              animation: `fade-in 240ms ${i * 4}ms backwards`,
            }}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3 text-2xs text-atlas-fg-3">
        <span>Moins</span>
        <div className="flex items-center gap-1">
          {[
            'rgba(0,0,0,0.04)',
            'rgba(110,139,88,0.18)',
            'rgba(110,139,88,0.35)',
            'rgba(110,139,88,0.6)',
            'rgba(110,139,88,0.95)',
          ].map((c, i) => (
            <span key={i} className="w-3 h-3 rounded-sm" style={{ background: c }} />
          ))}
        </div>
        <span>Plus</span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-atlas-amber-deep" /> Pic mardi 10h-12h
        </span>
      </div>
    </div>
  );
}

function Workload() {
  const tasks = useApp((s) => s.tasks);
  const users = useApp((s) => s.users);
  const data = users.slice(0, 6).map((u) => {
    const open = tasks.filter((t) => t.assignees.includes(u.id) && t.status !== 'done');
    const planned = open.reduce((sum, t) => sum + (t.estimatedMinutes || 60), 0) / 60;
    const capacity = 40;
    return {
      name: u.name.split(' ')[0],
      initials: u.initials,
      color: u.color,
      planned: Math.round(planned),
      capacity,
    };
  });
  return (
    <div className="space-y-2.5">
      {data.map((d) => {
        const pct = (d.planned / d.capacity) * 100;
        const over = pct > 100;
        return (
          <div key={d.name} className="grid grid-cols-[110px_1fr_64px] items-center gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-6 h-6 rounded-full text-2xs font-medium flex items-center justify-center text-white shrink-0"
                style={{ background: `linear-gradient(135deg, ${d.color}, ${d.color}88)` }}
              >
                {d.initials}
              </span>
              <span className="text-xs text-atlas-fg-1 truncate">{d.name}</span>
            </div>
            <div className="relative h-2 rounded-full bg-black/[0.05] overflow-hidden">
              <div
                className={cn('h-full rounded-full', over ? 'bg-signal-red' : 'bg-amber-gradient')}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
              {over && <div className="absolute inset-0 ring-1 ring-inset ring-signal-red/40 rounded-full" />}
            </div>
            <div
              className={cn(
                'text-2xs font-mono text-right',
                over ? 'text-signal-red font-medium' : 'text-atlas-fg-3'
              )}
            >
              {d.planned}h / {d.capacity}h
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Burndown() {
  const tasks = useApp((s) => s.tasks);
  const doneTasks = tasks.filter((t) => t.status === 'done');
  const totalScope = tasks.length || 1;
  const steps = 11;
  const ideal = Array.from({ length: steps }, (_, i) => Math.round(totalScope * (1 - i / (steps - 1))));
  const now = Date.now();
  const sprintDays = 14;
  const dayMs = 86400000;
  const actual = Array.from({ length: steps }, (_, i) => {
    const dayOffset = Math.round((i / (steps - 1)) * sprintDays);
    const cutoff = now - (sprintDays - dayOffset) * dayMs;
    const doneByThen = doneTasks.filter(
      (t) => t.completionDate && new Date(t.completionDate).getTime() <= cutoff
    ).length;
    return Math.max(0, totalScope - doneByThen);
  });
  const max = totalScope;
  const w = 100,
    h = 100;
  const path = (vals: number[]) =>
    vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - (v / max) * h}`).join(' ');

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-44" preserveAspectRatio="none">
        <defs>
          <linearGradient id="grad-actual" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#6E8B58" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#6E8B58" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          fill="none"
          stroke="rgba(0,0,0,0.2)"
          strokeWidth="0.6"
          strokeDasharray="2 2"
          points={path(ideal)}
        />
        <polygon fill="url(#grad-actual)" points={`0,${h} ${path(actual)} ${w},${h}`} />
        <polyline fill="none" stroke="#6E8B58" strokeWidth="1.4" points={path(actual)} />
        {actual.map((v, i) => (
          <circle key={i} cx={(i / (actual.length - 1)) * w} cy={h - (v / max) * h} r="0.9" fill="#6E8B58" />
        ))}
      </svg>
      <div className="mt-3 flex items-center gap-4 text-2xs">
        <span className="inline-flex items-center gap-2 text-atlas-fg-3">
          <span className="w-3 h-px bg-atlas-amber" /> Réel
        </span>
        <span className="inline-flex items-center gap-2 text-atlas-fg-3">
          <span className="w-3 h-px border-t border-dashed border-atlas-line-2" /> Idéal
        </span>
        {(() => {
          const remaining = actual[actual.length - 1];
          const idealRemaining = ideal[ideal.length - 1];
          const diff = idealRemaining - remaining;
          if (diff > 0)
            return (
              <span className="ml-auto text-signal-green font-medium">
                {remaining === 0 ? 'Sprint terminé' : `${remaining} tâches restantes`}
              </span>
            );
          if (diff < 0)
            return <span className="ml-auto text-signal-red font-medium">{remaining} tâches restantes</span>;
          return <span className="ml-auto text-atlas-fg-3 font-medium">Dans les temps</span>;
        })()}
      </div>
    </div>
  );
}

function DelayedList() {
  const tasks = useApp((s) => s.tasks);
  const users = useApp((s) => s.users);
  const now = Date.now();
  const items = tasks
    .filter((t) => t.dueDate && new Date(t.dueDate).getTime() < now && t.status !== 'done')
    .slice(0, 6)
    .map((t) => {
      const days = Math.max(1, Math.floor((now - new Date(t.dueDate!).getTime()) / 86400000));
      const owner = users.find((u) => t.assignees.includes(u.id))?.initials || '—';
      const impact = ['Faible', 'Normale', 'Haute', 'Critique'][t.priority - 1];
      return { title: t.title, delay: days, owner, impact };
    });
  if (items.length === 0) {
    return <div className="text-2xs text-atlas-fg-3 italic text-center py-8">Aucune tâche en retard 🎉</div>;
  }
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white border border-atlas-line hover:border-atlas-amber/40"
        >
          <div
            className={cn(
              'w-9 h-9 rounded-xl flex flex-col items-center justify-center font-mono text-2xs font-medium',
              it.delay >= 5
                ? 'bg-signal-red/15 text-signal-red border border-signal-red/30'
                : it.delay >= 3
                  ? 'bg-signal-yellow/15 text-signal-yellow border border-signal-yellow/30'
                  : 'bg-black/[0.04] text-atlas-fg-2 border border-atlas-line'
            )}
          >
            <span>+{it.delay}</span>
            <span className="text-[8px] uppercase tracking-wider">jours</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-atlas-fg-1 font-medium truncate">{it.title}</div>
            <div className="text-2xs text-atlas-fg-3 mt-0.5">
              Responsable {it.owner} · Impact {it.impact}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
