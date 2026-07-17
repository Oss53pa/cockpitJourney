/**
 * Progression d'un goal dérivée de ses actions — VERSION SERVEUR (MCP).
 * ───────────────────────────────────────────────────────────────────
 * Miroir dépendance-libre de `src/lib/goalProgress.ts` (l'app web). On
 * duplique volontairement la logique : le mcp-server est un package séparé
 * qui ne partage pas le tsconfig de l'app. Toute évolution des règles de
 * calcul DOIT être répercutée dans les DEUX fichiers.
 *
 * Règles : crédit partiel pondéré par les sous-actions ; tous les types de
 * métriques auto-pilotés (ratio d'exécution appliqué à la cible pour
 * number/currency).
 */
export type MetricType = 'percentage' | 'number' | 'currency' | 'boolean';
export type Health = 'green' | 'yellow' | 'red';
export type GoalStatus = 'on_track' | 'at_risk' | 'off_track' | 'achieved' | 'missed';

export interface ProgressTask {
  id: string;
  status: string;
  goalId?: string | null;
}
export interface ProgressSubtask {
  taskId: string;
  done: boolean;
}

/** Poids d'avancement d'une action dans [0, 1]. */
export function taskWeight(task: ProgressTask, subtasks: ProgressSubtask[]): number {
  if (task.status === 'done') return 1;
  const own = subtasks.filter((s) => s.taskId === task.id);
  if (own.length === 0) return 0;
  const done = own.filter((s) => s.done).length;
  return done / own.length;
}

export interface GoalProgress {
  fraction: number;
  currentValue: number;
  health: Health;
  status: GoalStatus;
  total: number;
  done: number;
}

export function computeGoalProgress(
  goal: { id: string; metricType?: MetricType; targetValue?: number },
  allTasks: ProgressTask[],
  allSubtasks: ProgressSubtask[]
): GoalProgress {
  const contributing = allTasks.filter((t) => t.goalId === goal.id);
  const total = contributing.length;
  const done = contributing.filter((t) => t.status === 'done').length;
  const weightSum = contributing.reduce((sum, t) => sum + taskWeight(t, allSubtasks), 0);
  const fraction = total > 0 ? weightSum / total : 0;

  const target = Number(goal.targetValue ?? 0);
  const metricType = goal.metricType ?? 'number';
  let currentValue: number;
  switch (metricType) {
    case 'percentage':
      currentValue = Math.round(fraction * 100);
      break;
    case 'boolean':
      currentValue = total > 0 && fraction >= 1 ? target : 0;
      break;
    default: // number | currency
      currentValue = Math.round(target * fraction);
      break;
  }

  const pct = (currentValue / Math.max(1, target)) * 100;
  const health: Health = pct >= 60 ? 'green' : pct >= 35 ? 'yellow' : 'red';
  const status: GoalStatus =
    pct >= 100 ? 'achieved' : pct >= 60 ? 'on_track' : pct >= 35 ? 'at_risk' : 'off_track';

  return { fraction, currentValue, health, status, total, done };
}
