/**
 * Détection des actions en double.
 * ────────────────────────────────
 * Le portefeuille a subi plusieurs imports superposés du même WBS (`cc_*`,
 * `cc_act_*` source `cockpit-castel`, et `t_*` natifs) : la même action existe
 * en 2 exemplaires, parfois avec des avancements divergents. Chaque copie
 * fausse la progression des goals (elle compte comme une action de plus).
 *
 * Fonctions PURES : l'UI se contente d'afficher le résultat et de déclencher la
 * suppression — jamais automatique, toujours un geste de l'utilisateur.
 */
import type { Task } from '../types';

/** Sous-action, forme minimale (miroir du `Subtask` du store). */
export interface DupSubtask {
  taskId: string;
  done: boolean;
}

/**
 * Normalise un titre pour la comparaison : minuscules, accents retirés,
 * ponctuation et espaces multiples réduits. « Établir le planning macro » et
 * « etablir  le planning  macro ! » collident donc volontairement.
 */
export function normalizeTitle(title: string): string {
  return (title ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Score de « richesse » d'une action : plus elle porte d'information, plus elle
 * mérite d'être conservée. Sert à proposer laquelle garder — l'utilisateur
 * reste libre de choisir l'autre.
 */
export function richness(task: Task, subtaskCount = 0): number {
  let s = 0;
  if (task.status === 'done') s += 6;
  else if (task.status === 'in_review') s += 4;
  else if (task.status === 'in_progress') s += 3;
  if (task.goalId) s += 3;
  s += subtaskCount * 2;
  s += (task.commentCount ?? 0) * 2;
  s += (task.attachmentCount ?? 0) * 2;
  if (task.dueDate) s += 1;
  if (task.assignees?.length) s += 1;
  if (task.tags?.length) s += 1;
  s += Math.min(3, Math.floor((task.description?.length ?? 0) / 80));
  return s;
}

export interface DuplicateGroup {
  /** Clé de regroupement (titre normalisé + projet). */
  key: string;
  title: string;
  projectId: string;
  /** Copie recommandée à conserver (la plus riche). */
  keep: Task;
  /** Copies excédentaires proposées à la suppression. */
  remove: Task[];
  /** true si les copies ne racontent pas la même histoire (statut divergent). */
  conflicting: boolean;
}

/**
 * Regroupe les actions partageant titre normalisé ET projet. Le projet fait
 * partie de la clé : deux actions homonymes sur deux projets distincts sont
 * légitimes (ex. « Valider le budget » sur Angré et sur Yopougon).
 */
export function findDuplicateTasks(tasks: Task[], subtasks: DupSubtask[] = []): DuplicateGroup[] {
  const subCount = new Map<string, number>();
  for (const s of subtasks) subCount.set(s.taskId, (subCount.get(s.taskId) ?? 0) + 1);

  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    const title = normalizeTitle(t.title);
    if (!title) continue;
    const key = `${t.projectId}::${title}`;
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }

  const out: DuplicateGroup[] = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const ranked = [...list].sort(
      (a, b) => richness(b, subCount.get(b.id) ?? 0) - richness(a, subCount.get(a.id) ?? 0)
    );
    const [keep, ...remove] = ranked;
    out.push({
      key,
      title: keep.title,
      projectId: keep.projectId,
      keep,
      remove,
      conflicting: new Set(list.map((t) => t.status)).size > 1,
    });
  }
  // Les conflits d'abord (ils demandent un arbitrage), puis les plus gros groupes.
  return out.sort(
    (a, b) => Number(b.conflicting) - Number(a.conflicting) || b.remove.length - a.remove.length
  );
}
