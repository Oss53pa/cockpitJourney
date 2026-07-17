/**
 * Rapport de performance VIVANT — progression de chaque objectif dérivée en
 * direct des actions qui y contribuent.
 *
 * Contrairement aux rapports archivés (snapshots figés), ce panneau ne lit
 * AUCUNE valeur stockée : il recalcule tout depuis le store à chaque rendu via
 * `computeGoalProgress`. Cocher une sous-action ou clôturer une tâche met donc
 * le rapport à jour instantanément, sans régénération.
 */
import { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, Target, CheckCircle2, AlertTriangle, Circle } from 'lucide-react';
import { useApp } from '../../stores/appStore';
import { computeGoalProgress } from '../../lib/goalProgress';
import { cn } from '../../lib/utils';
import type { Goal, Task } from '../../types';

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  done: { label: 'Terminé', cls: 'bg-signal-green/15 text-signal-green' },
  in_review: { label: 'En revue', cls: 'bg-signal-yellow/20 text-signal-yellow' },
  in_progress: { label: 'En cours', cls: 'bg-atlas-amber/20 text-atlas-amber-deep' },
  blocked: { label: 'Bloquée', cls: 'bg-signal-red/15 text-signal-red' },
  todo: { label: 'À faire', cls: 'bg-black/[0.05] text-atlas-fg-3' },
};

export function GoalPerformancePanel() {
  const goals = useApp((s) => s.goals);
  const tasks = useApp((s) => s.tasks);
  const subtasks = useApp((s) => s.subtasks);
  const [openId, setOpenId] = useState<string | null>(null);

  // Recalculé à chaque changement de goals / tasks / subtasks → rapport toujours à jour.
  const rows = useMemo(() => {
    return goals
      .map((g) => ({ goal: g, progress: computeGoalProgress(g, tasks, subtasks) }))
      .filter((r) => r.progress.total > 0)
      .sort((a, b) => b.progress.fraction - a.progress.fraction);
  }, [goals, tasks, subtasks]);

  const orphanCount = useMemo(() => tasks.filter((t) => !t.goalId).length, [tasks]);

  const totals = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.progress.total, 0);
    const done = rows.reduce((s, r) => s + r.progress.done, 0);
    // Moyenne pondérée par le nombre d'actions (et non par objectif) : reflète
    // l'effort réel plutôt que de donner le même poids à un OKR de 2 actions.
    const weighted =
      total > 0 ? rows.reduce((s, r) => s + r.progress.fraction * r.progress.total, 0) / total : 0;
    return { total, done, pct: Math.round(weighted * 100) };
  }, [rows]);

  if (rows.length === 0) return null;

  return (
    <div className="panel p-5 mb-7">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="inline-flex items-center gap-2 text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">
            <Target className="w-3.5 h-3.5 text-atlas-amber-deep" /> Performance par objectif · temps réel
          </div>
          <p className="text-2xs text-atlas-fg-3 mt-1">
            Calculée à partir des actions rattachées — se met à jour automatiquement à chaque modification.
          </p>
        </div>
        <div className="flex items-center gap-5 shrink-0">
          <Kpi value={`${totals.pct}%`} label="Avancement" />
          <Kpi value={`${totals.done}/${totals.total}`} label="Actions faites" />
          <Kpi value={String(orphanCount)} label="Orphelines" tone={orphanCount > 0 ? 'red' : 'green'} />
        </div>
      </div>

      {orphanCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-signal-yellow/30 bg-signal-yellow/[0.06] px-3 py-2 mb-3">
          <AlertTriangle className="w-3.5 h-3.5 text-signal-yellow shrink-0" />
          <span className="text-2xs text-atlas-fg-2">
            {orphanCount} action{orphanCount > 1 ? 's' : ''} sans objectif — elles ne comptent dans aucune
            progression (voir la vue Goals pour les rattacher).
          </span>
        </div>
      )}

      <div className="space-y-1.5">
        {rows.map(({ goal, progress }) => {
          const open = openId === goal.id;
          const color =
            progress.health === 'green' ? '#4D9A6A' : progress.health === 'yellow' ? '#B69248' : '#B85B4D';
          const contributing = tasks.filter((t) => t.goalId === goal.id);
          return (
            <div key={goal.id} className="rounded-xl border border-atlas-line overflow-hidden">
              <button
                onClick={() => setOpenId(open ? null : goal.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-black/[0.02] text-left"
              >
                {open ? (
                  <ChevronDown className="w-3.5 h-3.5 text-atlas-fg-3 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-atlas-fg-3 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-atlas-fg-1 truncate font-medium">{goal.title}</div>
                  <div className="text-2xs text-atlas-fg-3">
                    {progress.done} terminée{progress.done > 1 ? 's' : ''} · {progress.total} action
                    {progress.total > 1 ? 's' : ''} rattachée{progress.total > 1 ? 's' : ''}
                  </div>
                </div>
                <div className="w-28 sm:w-40 shrink-0">
                  <div className="h-2 rounded-full bg-black/[0.05] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, progress.fraction * 100)}%`, background: color }}
                    />
                  </div>
                </div>
                <span className="font-mono text-2xs font-medium text-atlas-fg-1 w-10 text-right shrink-0">
                  {Math.round(progress.fraction * 100)}%
                </span>
                <span className="font-mono text-2xs text-atlas-fg-3 w-14 text-right shrink-0">
                  {formatValue(goal, progress.currentValue)}
                </span>
              </button>

              {open && (
                <ul className="border-t border-atlas-line divide-y divide-atlas-line/60">
                  {contributing.map((t) => (
                    <ActionRow key={t.id} task={t} subtaskCount={countSubs(subtasks, t.id)} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function countSubs(subtasks: { taskId: string; done: boolean }[], taskId: string) {
  const own = subtasks.filter((s) => s.taskId === taskId);
  return own.length ? { done: own.filter((s) => s.done).length, total: own.length } : null;
}

function ActionRow({
  task,
  subtaskCount,
}: {
  task: Task;
  subtaskCount: { done: number; total: number } | null;
}) {
  const sl = STATUS_LABEL[task.status] ?? STATUS_LABEL.todo;
  const late = task.status !== 'done' && task.dueDate && new Date(task.dueDate) < new Date();
  return (
    <li className="flex items-center gap-2.5 px-3 py-2 bg-black/[0.01]">
      {task.status === 'done' ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-signal-green shrink-0" />
      ) : (
        <Circle className="w-3.5 h-3.5 text-atlas-fg-3 shrink-0" />
      )}
      <span
        className={cn(
          'flex-1 min-w-0 truncate text-2xs',
          task.status === 'done' ? 'text-atlas-fg-3 line-through' : 'text-atlas-fg-2'
        )}
      >
        {task.title}
      </span>
      {subtaskCount && (
        <span className="font-mono text-[10px] text-atlas-fg-3 shrink-0">
          {subtaskCount.done}/{subtaskCount.total}
        </span>
      )}
      <span className={cn('chip text-[9px] px-1.5 py-0 shrink-0', sl.cls)}>{sl.label}</span>
      <span
        className={cn(
          'font-mono text-[10px] w-20 text-right shrink-0',
          late ? 'text-signal-red font-medium' : 'text-atlas-fg-3'
        )}
      >
        {task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '—'}
      </span>
    </li>
  );
}

function Kpi({ value, label, tone }: { value: string; label: string; tone?: 'red' | 'green' }) {
  return (
    <div className="text-right">
      <div
        className={cn(
          'font-display text-xl font-medium',
          tone === 'red' ? 'text-signal-red' : tone === 'green' ? 'text-signal-green' : 'text-atlas-fg-1'
        )}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-atlas-fg-3">{label}</div>
    </div>
  );
}

function formatValue(goal: Goal, v: number) {
  if (goal.metricType === 'percentage') return `${v}%`;
  return `${v}${goal.unit ? ` ${goal.unit}` : ''}`;
}
