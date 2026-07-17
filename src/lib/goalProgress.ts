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
 *  - PONDÉRATION PAR AXE : quand un goal regroupe des actions provenant de
 *    plusieurs axes stratégiques Cockpit-Castel (`task.axeKey`), sa fraction
 *    n'est plus une moyenne plate des actions mais une moyenne pondérée par
 *    axe (`AXIS_WEIGHTS`) — les axes eux-mêmes ne sont jamais des Goals, ils
 *    ne servent qu'à pondérer le calcul d'un goal qui les contient.
 */
import type { Goal, Task } from '../types';

/**
 * Poids (sur 100) de chaque axe stratégique, tels que configurés dans
 * Cockpit-Castel (écran « Répartition des poids »). L'axe « Divers &
 * Transverse » est à 0 par convention — présent pour rester exhaustif, mais
 * il ne contribue jamais à la moyenne pondérée.
 */
export const AXIS_WEIGHTS: Record<string, number> = {
  axe1_rh: 15,
  axe2_commercial: 20,
  axe3_technique: 15,
  axe4_budget: 10,
  axe5_marketing: 10,
  axe6_exploitation: 5,
  axe7_construction: 25,
  axe8_divers: 0,
};

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
  allTasks: Pick<Task, 'id' | 'status' | 'goalId' | 'progressPct' | 'axeKey'>[],
  allSubtasks: GoalProgressSubtask[]
): GoalProgress {
  const contributing = allTasks.filter((t) => t.goalId === goal.id);
  const total = contributing.length;
  const done = contributing.filter((t) => t.status === 'done').length;

  // Pondération par axe : seulement quand TOUTES les actions contributrices
  // ont un axe reconnu et qu'il y en a plus d'un — sinon on retombe sur la
  // moyenne plate (comportement inchangé pour les goals sans axes Castel).
  const axeKeys = contributing.map((t) => t.axeKey);
  const allHaveAxis = total > 0 && axeKeys.every((a): a is string => !!a && a in AXIS_WEIGHTS);
  const distinctAxes = new Set(axeKeys);

  let fraction: number;
  if (allHaveAxis && distinctAxes.size > 1) {
    let weightedSum = 0;
    let weightTotal = 0;
    for (const axe of distinctAxes) {
      const axeTasks = contributing.filter((t) => t.axeKey === axe);
      const axeAvg = axeTasks.reduce((sum, t) => sum + taskWeight(t, allSubtasks), 0) / axeTasks.length;
      const poids = AXIS_WEIGHTS[axe as string];
      weightedSum += axeAvg * poids;
      weightTotal += poids;
    }
    fraction = weightTotal > 0 ? weightedSum / weightTotal : 0;
  } else {
    const weightSum = contributing.reduce((sum, t) => sum + taskWeight(t, allSubtasks), 0);
    fraction = total > 0 ? weightSum / total : 0;
  }

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
