/**
 * Recalcul serveur de la progression d'un goal après un changement d'action.
 * ──────────────────────────────────────────────────────────────────────────
 * Équivalent MCP de `recomputeGoalFromTasks` (appStore.ts) : quand une tâche
 * est créée / complétée / mise à jour, ou qu'une sous-tâche change via les
 * outils MCP, on recale la valeur du goal côté base — sinon la progression ne
 * bougeait qu'au prochain passage dans le navigateur.
 *
 * Respecte `progressMode === 'manual'` (jamais écrasé). `undefined` = auto.
 */
import type { CjSession } from '../auth.js';
import { computeGoalProgress, type ProgressTask, type ProgressSubtask, type MetricType } from './goalProgress.js';

/**
 * Recalcule un goal à partir de TOUTES ses actions contributrices
 * (data->>goalId) et de leurs sous-actions, puis persiste le résultat.
 * Best-effort : toute erreur est avalée (loggée) pour ne jamais faire échouer
 * l'action utilisateur (compléter une tâche doit réussir même si le recalcul
 * du goal échoue).
 */
export async function recomputeGoal(session: CjSession, goalId: string): Promise<void> {
  try {
    const { data: goalRow, error: goalErr } = await session.client
      .from('cj_goals')
      .select('data, status')
      .eq('id', goalId)
      .maybeSingle();
    if (goalErr || !goalRow) return;

    const goalData = (goalRow.data ?? {}) as Record<string, unknown>;
    // Mode manuel : ne jamais recalculer.
    if (goalData.progressMode === 'manual') return;

    // Actions contributrices — goalId vit dans le `data` jsonb (non indexé).
    const { data: taskRows, error: taskErr } = await session.client
      .from('cj_tasks')
      .select('id, status, data')
      .eq('data->>goalId', goalId);
    if (taskErr) return;

    const tasks: ProgressTask[] = (taskRows ?? []).map((r) => {
      const d = (r.data ?? {}) as Record<string, unknown>;
      return {
        id: (r as { id: string }).id,
        status: String((r as { status?: string }).status ?? d.status ?? 'todo'),
        goalId: (d.goalId as string | undefined) ?? null,
      };
    });

    // Sous-actions de ces tâches (task_id est indexé).
    let subtasks: ProgressSubtask[] = [];
    const taskIds = tasks.map((t) => t.id);
    if (taskIds.length > 0) {
      const { data: subRows } = await session.client
        .from('cj_subtasks')
        .select('task_id, data')
        .in('task_id', taskIds);
      subtasks = (subRows ?? []).map((r) => {
        const d = (r.data ?? {}) as Record<string, unknown>;
        return { taskId: String((r as { task_id: string }).task_id), done: Boolean(d.done) };
      });
    }

    const { currentValue, health, status } = computeGoalProgress(
      {
        id: goalId,
        metricType: (goalData.metricType as MetricType) ?? 'number',
        targetValue: Number(goalData.targetValue ?? 0),
      },
      tasks,
      subtasks
    );

    const now = new Date().toISOString();
    const merged = { ...goalData, currentValue, health, status, updatedAt: now };
    await session.client
      .from('cj_goals')
      .update({ data: merged, status })
      .eq('id', goalId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`recomputeGoal(${goalId}) failed:`, err);
  }
}

/** Lit le goalId courant d'une tâche depuis son `data` jsonb. */
export async function goalIdOfTask(session: CjSession, taskId: string): Promise<string | null> {
  const { data: row } = await session.client
    .from('cj_tasks')
    .select('data')
    .eq('id', taskId)
    .maybeSingle();
  const d = (row?.data ?? {}) as Record<string, unknown>;
  return (d.goalId as string | undefined) ?? null;
}
