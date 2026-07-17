/**
 * Détection des projets en double.
 * ─────────────────────────────────
 * `createProject` ne vérifie aucune unicité de nom : deux projets homonymes
 * peuvent coexister silencieusement (double-clic, import répété…). Chaque
 * copie fragmente les tâches et les rapports entre deux entités distinctes.
 *
 * Fonctions PURES : l'UI se contente d'afficher le résultat et de déclencher
 * la suppression — jamais automatique, toujours un geste de l'utilisateur.
 */
import type { Project, Task } from '../types';
import { normalizeTitle } from './duplicates';

export interface DuplicateProjectGroup {
  /** Clé de regroupement (dossier + nom normalisé). */
  key: string;
  name: string;
  folderId?: string;
  /** Copie recommandée à conserver (la plus riche). */
  keep: Project;
  /** Copies excédentaires proposées à la suppression. */
  remove: Project[];
  /** true si les copies ne racontent pas la même histoire (statut divergent). */
  conflicting: boolean;
}

/**
 * Score de « richesse » d'un projet : plus il porte d'information et
 * d'activité réelle, plus il mérite d'être conservé. Le nombre de tâches est
 * calculé depuis le store (pas `project.taskCount`, qui peut être obsolète).
 */
export function projectRichness(project: Project, taskCount: number): number {
  let s = 0;
  if (project.status === 'active') s += 4;
  else if (project.status === 'paused') s += 2;
  s += Math.min(6, taskCount);
  s += project.membersIds?.length ?? 0;
  if (project.description) s += 2;
  if (project.retroplan) s += 2;
  if (project.endDate) s += 1;
  return s;
}

/**
 * Regroupe les projets partageant nom normalisé ET dossier. Le dossier fait
 * partie de la clé : deux projets homonymes dans deux dossiers distincts sont
 * légitimes (ex. « Bilan » côté Personnel et côté Professionnel).
 */
export function findDuplicateProjects(projects: Project[], tasks: Task[]): DuplicateProjectGroup[] {
  const taskCountByProject = new Map<string, number>();
  for (const t of tasks) {
    taskCountByProject.set(t.projectId, (taskCountByProject.get(t.projectId) ?? 0) + 1);
  }

  const groups = new Map<string, Project[]>();
  for (const p of projects) {
    const name = normalizeTitle(p.name);
    if (!name) continue;
    const key = `${p.folderId ?? '__none__'}::${name}`;
    const list = groups.get(key);
    if (list) list.push(p);
    else groups.set(key, [p]);
  }

  const out: DuplicateProjectGroup[] = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const ranked = [...list].sort(
      (a, b) =>
        projectRichness(b, taskCountByProject.get(b.id) ?? 0) -
        projectRichness(a, taskCountByProject.get(a.id) ?? 0)
    );
    const [keep, ...remove] = ranked;
    out.push({
      key,
      name: keep.name,
      folderId: keep.folderId,
      keep,
      remove,
      conflicting: new Set(list.map((p) => p.status)).size > 1,
    });
  }
  // Les conflits d'abord (ils demandent un arbitrage), puis les plus gros groupes.
  return out.sort(
    (a, b) => Number(b.conflicting) - Number(a.conflicting) || b.remove.length - a.remove.length
  );
}
