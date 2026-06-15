import { useState } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Plus,
  Sparkles,
  Trophy,
  Calendar,
  MoreHorizontal,
  Edit3,
  Trash2,
  Minus,
  ListChecks,
  Circle,
} from 'lucide-react';
import { useApp } from '../../stores/appStore';
import { Avatar } from '../ui/Avatar';
import { ProgressBar } from '../ui/StatusBadge';
import { HealthDot } from '../ui/HealthDot';
import { Menu, MenuItem, MenuSeparator, MenuLabel } from '../ui/Menu';
import { cn, formatDate, formatNumber } from '../../lib/utils';
import type { Goal } from '../../types';

export function GoalsView() {
  const goals = useApp((s) => s.goals);
  const openModal = useApp((s) => s.openModal);
  const pushToast = useApp((s) => s.pushToast);
  const projects = useApp((s) => s.projects);
  const sections = useApp((s) => s.sections);
  const createTask = useApp((s) => s.createTask);

  const workspaceGoals = goals.filter((g) => g.level === 'workspace');
  const teamGoals = goals.filter((g) => g.level === 'team');
  const personalGoals = goals.filter((g) => g.level === 'personal');
  const avgProgress = goals.length
    ? Math.round(
        goals.reduce((s, g) => s + (g.currentValue / Math.max(1, g.targetValue)) * 100, 0) / goals.length
      )
    : 0;
  const achievedCount = goals.filter((g) => g.status === 'achieved').length;

  const onSuggest = async () => {
    const cfg = useApp.getState().settings.proph3t;
    if (!cfg.apiKey && cfg.provider !== 'ollama-cloud') {
      pushToast({ kind: 'warning', title: 'Clé PROPH3T manquante', body: 'Paramètres → IA' });
      return;
    }
    const target = goals[0];
    if (!target) return;
    pushToast({ kind: 'info', title: `PROPH3T génère des tâches pour "${target.title}"…`, duration: 1500 });
    try {
      const { ProphClient, suggestContributingTasks } = await import('../../lib/proph3t');
      const tasks = await suggestContributingTasks(new ProphClient(cfg), {
        title: target.title,
        targetValue: target.targetValue,
        currentValue: target.currentValue,
        unit: target.unit,
      });
      const project = projects[0];
      const section = sections.find((s) => s.projectId === project.id);
      if (!section) return;
      tasks.forEach((title) =>
        createTask({
          title,
          projectId: project.id,
          sectionId: section.id,
          priority: 3,
          tags: ['goal', target.id.slice(2)],
        })
      );
      pushToast({
        kind: 'success',
        title: `${tasks.length} tâches contributrices créées`,
        body: `Goal : ${target.title}`,
      });
    } catch (err: any) {
      pushToast({ kind: 'error', title: 'Échec génération', body: err?.message });
    }
  };

  return (
    <div className="px-8 py-7">
      <div className="flex items-end justify-between mb-7">
        <div>
          <div className="text-2xs uppercase tracking-[0.18em] text-atlas-fg-3 font-medium mb-1">
            Goals & OKRs
          </div>
          <h1 className="font-display text-3xl font-medium tracking-tight">
            Cap stratégique 2026 — CockpitJourney
          </h1>
          <p className="text-sm text-atlas-fg-3 mt-1">
            {goals.length} objectifs actifs · {goals.filter((g) => g.health === 'green').length} on-track ·{' '}
            {goals.filter((g) => g.health === 'yellow').length} à risque
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onSuggest} className="btn-secondary text-sm px-3 py-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Suggérer tâches (PROPH3T)
          </button>
          <button onClick={() => openModal('goal-create')} className="btn-primary text-sm px-3 py-1.5">
            <Plus className="w-3.5 h-3.5" /> Goal
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-7">
        <Glance
          label="On-track"
          value={String(goals.filter((g) => g.health === 'green').length)}
          total={goals.length}
          color="signal-green"
          icon={CheckCircle2}
        />
        <Glance
          label="À risque"
          value={String(goals.filter((g) => g.health !== 'green').length)}
          total={goals.length}
          color="signal-yellow"
          icon={AlertTriangle}
        />
        <Glance
          label="Avancement moyen"
          value={`${avgProgress}%`}
          subtitle="sur tous les objectifs"
          color="atlas-amber"
          icon={TrendingUp}
        />
        <Glance
          label="Goals atteints"
          value={String(achievedCount)}
          total={goals.length}
          color="signal-violet"
          icon={Trophy}
        />
      </div>

      <div className="space-y-4">
        {workspaceGoals.map((g) => (
          <GoalTree goal={g} key={g.id} />
        ))}
        {workspaceGoals.length === 0 && teamGoals.length === 0 && personalGoals.length === 0 && (
          <div className="panel p-10 text-center">
            <Trophy className="w-8 h-8 mx-auto text-atlas-fg-3 mb-2" />
            <h3 className="text-sm font-medium text-atlas-fg-1">Aucun goal</h3>
            <p className="text-2xs text-atlas-fg-3 mt-1">
              Créez le premier objectif stratégique pour votre workspace.
            </p>
            <button
              onClick={() => openModal('goal-create')}
              className="btn-primary text-sm px-3.5 py-1.5 mt-4 inline-flex"
            >
              <Plus className="w-3.5 h-3.5" /> Créer un goal
            </button>
          </div>
        )}
      </div>

      {teamGoals.length > 0 && (
        <div className="mt-10">
          <h2 className="font-display text-xl font-medium mb-4">
            Goals d'équipe <span className="text-atlas-fg-3 text-base">· {teamGoals.length}</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {teamGoals.map((g) => (
              <GoalCard goal={g} key={g.id} compact />
            ))}
          </div>
        </div>
      )}

      {personalGoals.length > 0 && (
        <div className="mt-10">
          <h2 className="font-display text-xl font-medium mb-4">
            Goals personnels <span className="text-atlas-fg-3 text-base">· {personalGoals.length}</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {personalGoals.map((g) => (
              <GoalCard goal={g} key={g.id} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Glance({
  label,
  value,
  total,
  subtitle,
  color,
  icon: Icon,
}: {
  label: string;
  value: string;
  total?: number;
  subtitle?: string;
  color: string;
  icon: any;
}) {
  return (
    <div className="panel p-5 relative overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">{label}</div>
        <Icon className={cn('w-4 h-4', `text-${color}`)} />
      </div>
      <div className={cn('font-display text-3xl font-medium', `text-${color}`)}>
        {value}
        {total !== undefined && <span className="text-base text-atlas-fg-3 font-normal"> / {total}</span>}
      </div>
      {subtitle && <div className="text-2xs text-atlas-fg-3 mt-1">{subtitle}</div>}
    </div>
  );
}

function GoalTree({ goal }: { goal: Goal }) {
  const goals = useApp((s) => s.goals);
  const [expanded, setExpanded] = useState(true);
  const children = goals.filter((g) => g.parentGoalId === goal.id);
  return (
    <div>
      <GoalCard
        goal={goal}
        expanded={expanded}
        onToggleExpand={children.length ? () => setExpanded((v) => !v) : undefined}
      />
      {expanded && children.length > 0 && (
        <div className="mt-3 ml-7 pl-6 border-l border-dashed border-black/[0.07] space-y-3">
          {children.map((c) => (
            <GoalCard key={c.id} goal={c} sub />
          ))}
        </div>
      )}
    </div>
  );
}

function GoalCard({
  goal,
  sub,
  compact,
  expanded,
  onToggleExpand,
}: {
  goal: Goal;
  sub?: boolean;
  compact?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const owner = useApp((s) => s.users.find((u) => u.id === goal.ownerId) || s.users[0]);
  const updateGoal = useApp((s) => s.updateGoal);
  const bumpGoalValue = useApp((s) => s.bumpGoalValue);
  const deleteGoal = useApp((s) => s.deleteGoal);
  const openModal = useApp((s) => s.openModal);
  const allTasks = useApp((s) => s.tasks);
  const [showTasks, setShowTasks] = useState(false);

  const contributingTasks = allTasks.filter((t) => t.goalId === goal.id);
  const doneCount = contributingTasks.filter((t) => t.status === 'done').length;
  const execPct = contributingTasks.length ? Math.round((doneCount / contributingTasks.length) * 100) : 0;

  const pct = (goal.currentValue / Math.max(1, goal.targetValue)) * 100;
  const formatVal = (v: number) =>
    goal.metricType === 'currency'
      ? `${formatNumber(v)} ${goal.unit || ''}`
      : goal.metricType === 'percentage'
        ? `${v}%`
        : `${formatNumber(v)} ${goal.unit || ''}`;
  const ringColor = goal.health === 'green' ? '#4D9A6A' : goal.health === 'yellow' ? '#B69248' : '#B85B4D';

  const recomputeHealth = (current: number) => {
    const p = (current / Math.max(1, goal.targetValue)) * 100;
    const expected = 60;
    if (p >= expected) updateGoal(goal.id, { health: 'green', status: 'on_track' });
    else if (p >= expected - 25) updateGoal(goal.id, { health: 'yellow', status: 'at_risk' });
    else updateGoal(goal.id, { health: 'red', status: 'off_track' });
  };

  const incr = (delta: number) => {
    const next = Math.max(0, goal.currentValue + delta);
    bumpGoalValue(goal.id, delta);
    recomputeHealth(next);
  };

  return (
    <div
      className={cn(
        'relative panel overflow-hidden p-5 hover:border-atlas-line-2 transition-colors',
        sub && 'before:absolute before:-left-7 before:top-7 before:w-7 before:h-px before:bg-black/[0.07]'
      )}
    >
      <div className="flex items-start gap-5">
        <div className="flex flex-col items-center gap-2">
          <RingProgress value={pct} color={ringColor} size={compact ? 60 : 80} />
          {!compact && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => incr(-Math.max(1, Math.round(goal.targetValue * 0.05)))}
                className="w-6 h-6 rounded-md hover:bg-black/[0.05] text-atlas-fg-3 hover:text-signal-red flex items-center justify-center"
                title="Diminuer"
              >
                <Minus className="w-3 h-3" />
              </button>
              <button
                onClick={() => incr(Math.max(1, Math.round(goal.targetValue * 0.05)))}
                className="w-6 h-6 rounded-md hover:bg-black/[0.05] text-atlas-fg-3 hover:text-signal-green flex items-center justify-center"
                title="Augmenter"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="chip border border-atlas-line bg-black/[0.04] text-atlas-fg-2">
                  {goal.level === 'workspace' ? 'Entreprise' : goal.level === 'team' ? 'Équipe' : 'Personnel'}
                </span>
                <span className="chip border border-atlas-line bg-black/[0.04] text-atlas-fg-2">
                  {goal.period}
                </span>
                <HealthDot health={goal.health} label />
              </div>
              <h3 className="font-display text-lg font-medium tracking-tight text-atlas-fg-1 leading-snug">
                {goal.title}
              </h3>
              {goal.description && <p className="text-sm text-atlas-fg-3 mt-1">{goal.description}</p>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {onToggleExpand && (
                <button onClick={onToggleExpand} className="btn-ghost !p-1.5">
                  {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              )}
              <Menu
                trigger={
                  <button className="btn-ghost !p-1.5">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                }
              >
                {(close) => (
                  <>
                    <MenuLabel>Goal</MenuLabel>
                    <MenuItem
                      icon={Edit3}
                      onClick={() => {
                        close();
                        openModal('goal-edit', goal);
                      }}
                    >
                      Modifier
                    </MenuItem>
                    <MenuItem
                      icon={CheckCircle2}
                      onClick={() => {
                        close();
                        updateGoal(goal.id, {
                          status: 'achieved',
                          currentValue: goal.targetValue,
                          health: 'green',
                        });
                      }}
                    >
                      Marquer comme atteint
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem
                      danger
                      icon={Trash2}
                      onClick={() => {
                        close();
                        if (confirm('Supprimer ce Goal ?')) deleteGoal(goal.id);
                      }}
                    >
                      Supprimer
                    </MenuItem>
                  </>
                )}
              </Menu>
            </div>
          </div>

          <div className="mt-4 flex items-end justify-between gap-6">
            <div>
              <div className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">Progression</div>
              <div className="font-display text-2xl font-medium text-atlas-fg-1 mt-0.5">
                {formatVal(goal.currentValue)}{' '}
                <span className="text-atlas-fg-3 text-base font-normal">/ {formatVal(goal.targetValue)}</span>
              </div>
            </div>
            <div className="flex-1 max-w-md">
              <div className="h-2 rounded-full bg-black/[0.05] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    background: `linear-gradient(90deg, ${ringColor}, ${ringColor}cc)`,
                  }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-2xs text-atlas-fg-3">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" /> jusqu'au {formatDate(goal.endDate)}
                </span>
                <span className="font-mono font-medium text-atlas-fg-1">{Math.round(pct)}%</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Avatar user={owner} size="md" />
            </div>
          </div>

          {contributingTasks.length > 0 && (
            <div className="mt-4 pt-3 border-t border-black/[0.05]">
              <button
                onClick={() => setShowTasks((v) => !v)}
                className="w-full flex items-center justify-between gap-3"
              >
                <span className="inline-flex items-center gap-1.5 text-2xs text-atlas-fg-3">
                  <ListChecks className="w-3.5 h-3.5" />
                  Tâches contributrices
                  <span className="font-mono font-medium text-atlas-fg-1">
                    {doneCount}/{contributingTasks.length}
                  </span>
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="w-20 sm:w-28">
                    <ProgressBar value={execPct} />
                  </span>
                  <span className="font-mono text-2xs text-atlas-fg-3 w-8 text-right">{execPct}%</span>
                  {showTasks ? (
                    <ChevronDown className="w-3.5 h-3.5 text-atlas-fg-3" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-atlas-fg-3" />
                  )}
                </span>
              </button>
              {showTasks && (
                <ul className="mt-2.5 space-y-1.5">
                  {contributingTasks.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-2xs">
                      {t.status === 'done' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-signal-green shrink-0" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 text-atlas-fg-3 shrink-0" />
                      )}
                      <span
                        className={cn(
                          'truncate',
                          t.status === 'done' ? 'text-atlas-fg-3 line-through' : 'text-atlas-fg-2'
                        )}
                      >
                        {t.title}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {(goal.metricType === 'percentage' || goal.metricType === 'boolean') && (
                <p className="mt-2 text-[10px] text-atlas-fg-3 italic">
                  Progression auto-pilotée par ces tâches.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RingProgress({ value, color, size }: { value: number; color: string; size: number }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const d = (Math.min(100, value) / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(0,0,0,0.07)" strokeWidth="6" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${d} ${c - d}`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-display font-medium text-atlas-fg-1" style={{ fontSize: size * 0.22 }}>
          {Math.round(value)}%
        </span>
      </div>
    </div>
  );
}
