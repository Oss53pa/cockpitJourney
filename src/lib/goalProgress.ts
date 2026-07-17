/**
 * Progression d'un goal dérivée de ses actions.
 * ────────────────────────────────────────────
 * Fonctions PURES et testables : le store (`recomputeGoalFromTasks`) se contente
 * d'appliquer le résultat via `updateGoal`. On ne lit jamais un champ
 * `currentValue` stocké pour calculer — on le recalcule toujours depuis les
 * actions contributrices (`Task.goalId === goal.id`) et leurs sous-actions.
 *
 * Règles (choix produit) :
 *  - Crédit PARTIEL PONDÉRÉ : une action vaut sa fraction de sous-actions faites
 *    (2/4 sous-tâches → 0,5). Une action sans sous-action vaut 1 si `done`, 0 sinon.
 *  - Tous les types de goals sont AUTO-PILOTÉS quand `progressMode !== 'manual'` :
 *    `currentValue = targetValue × fraction` (ratio d'exécution) pour number /
 *    currency, `round(fraction × 100)` pour percentage, tout-ou-rien pour boolean.
 */
import type { Goal, Task } from '../types';

/** Forme minimale d'une sous-action (miroir du `Subtask` du store). */
export interface GoalProgressSubtask {
  taskId: string;
  done: boolean;
}

/**
 * Poids d'avancement d'une action, dans [0, 1].
 * - `done` → 1 (crédit plein, même sans sous-actions).
 * - sinon avec sous-actions → fraction des sous-actions cochées.
 * - sinon avec `progressPct` connu (import externe, saisie manuelle) → ce %.
 * - sinon → 0.
 */
export function taskWeight(
  task: Pick<Task, 'id' | 'status' | 'progressPct'>,
  subtasks: GoalProgressSubtask[]
): number {
  if (task.status === 'done') return 1;
  const own = subtasks.filter((s) => s.taskId === task.id);
  if (own.length > 0) {
    const done = own.filter((s) => s.done).length;
    return done / own.length;
  }
  if (typeof task.progressPct === 'number') {
    return Math.max(0, Math.min(100, task.progressPct)) / 100;
  }
  return 0;
}

export interface GoalProgress {
  /** Avancement global dans [0, 1], pondéré par les sous-actions. */
  fraction: number;
  /** Valeur métier dérivée, cohérente avec `goal.metricType`. */
  currentValue: number;
  health: Goal['health'];
  status: Goal['status'];
  /** Nb d'actions contributrices. */
  total: number;
  /** Nb d'actions au statut `done` (crédit plein) — pour l'affichage. */
  done: number;
}

/**
 * Calcule la progression d'un goal à partir de TOUTES les actions et sous-actions
 * du workspace (le filtrage sur `goal.id` est fait ici, pour rester une fonction
 * autonome et facile à tester).
 */
export function computeGoalProgress(
  goal: Pick<Goal, 'id' | 'metricType' | 'targetValue'>,
  allTasks: Pick<Task, 'id' | 'status' | 'goalId' | 'progressPct'>[],
  allSubtasks: GoalProgressSubtask[]
): GoalProgress {
  const contributing = allTasks.filter((t) => t.goalId === goal.id);
  const total = contributing.length;
  const done = contributing.filter((t) => t.status === 'done').length;
  const weightSum = contributing.reduce((sum, t) => sum + taskWeight(t, allSubtasks), 0);
  const fraction = total > 0 ? weightSum / total : 0;

  const target = goal.targetValue;
  let currentValue: number;
  switch (goal.metricType) {
    case 'percentage':
      currentValue = Math.round(fraction * 100);
      break;
    case 'boolean':
      // Tout-ou-rien : le goal ne "vaut" sa cible qu'une fois tout terminé.
      currentValue = total > 0 && fraction >= 1 ? target : 0;
      break;
    case 'number':
    case 'currency':
    default:
      // Ratio d'exécution : la cible chiffrée avance au rythme des actions.
      currentValue = Math.round(target * fraction);
      break;
  }

  const pct = (currentValue / Math.max(1, target)) * 100;
  const health: Goal['health'] = pct >= 60 ? 'green' : pct >= 35 ? 'yellow' : 'red';
  const status: Goal['status'] =
    pct >= 100 ? 'achieved' : pct >= 60 ? 'on_track' : pct >= 35 ? 'at_risk' : 'off_track';

  return { fraction, currentValue, health, status, total, done };
}
