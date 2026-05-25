import type { Task, TaskStatus } from '../types';

/**
 * Avancement d'un ensemble de tâches = % de tâches **terminées** (`done`) sur le
 * total. TOUJOURS calculé en direct depuis les statuts réels — jamais lu depuis
 * un champ stocké (`project.progress`), qui se désynchronise dès qu'une tâche
 * change de statut ou est créée hors de l'app (connecteur, import). Renvoie 0
 * quand il n'y a aucune tâche.
 */
export function completionPct(tasks: Pick<Task, 'status'>[]): number {
  if (tasks.length === 0) return 0;
  const done = tasks.filter((t) => t.status === 'done').length;
  return Math.round((done / tasks.length) * 100);
}

/** Décompte des tâches par statut canonique (toutes les clés présentes à 0). */
export function statusCounts(tasks: Pick<Task, 'status'>[]): Record<TaskStatus, number> {
  const counts: Record<TaskStatus, number> = {
    todo: 0,
    in_progress: 0,
    in_review: 0,
    done: 0,
    blocked: 0,
  };
  for (const t of tasks) {
    if (t.status in counts) counts[t.status] += 1;
  }
  return counts;
}
