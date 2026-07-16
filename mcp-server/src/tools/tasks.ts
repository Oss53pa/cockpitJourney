/**
 * Task tools — list / get / create / complete / update.
 *
 * The `cj_tasks` table is hybrid jsonb: `id`, `project_id`, `section_id`,
 * `parent_task_id`, `status`, `priority`, `due_date` are indexed columns
 * derived from the `data` jsonb (which holds the full entity). We always
 * read `data` for the response so the consumer sees the in-app shape.
 *
 * Writes go through .insert / .update with both indexed cols and `data`
 * staying in sync — same pattern as the web app's repo.ts adapter.
 */
import { requireScope } from '../auth.js';
import { pickRow, camelizePatch, type ToolDefinition } from './common.js';
import { recomputeGoal, goalIdOfTask } from './goalRecompute.js';

interface ListTasksArgs {
  status?: 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';
  project_id?: string;
  due_before?: string;
  due_after?: string;
  priority_max?: 1 | 2 | 3 | 4;
  limit?: number;
}

interface CreateTaskArgs {
  title: string;
  project_id?: string;
  goal_id?: string;
  priority?: 1 | 2 | 3 | 4;
  due_date?: string;
  description?: string;
  status?: 'todo' | 'in_progress' | 'in_review' | 'done';
}

interface CompleteTaskArgs {
  task_id: string;
}

interface UpdateTaskArgs {
  task_id: string;
  patch: Record<string, unknown>;
}

export const listTasks: ToolDefinition<ListTasksArgs> = {
  name: 'cj_list_tasks',
  description:
    "Liste les tâches CockpitJourney du propriétaire du token, avec filtres optionnels (statut, projet, échéance, priorité). Trié par due_date asc puis priority asc. Idéal pour 'qu'est-ce qui m'attend cette semaine'.",
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['todo', 'in_progress', 'in_review', 'done', 'cancelled'],
        description: 'Filtre par statut',
      },
      project_id: { type: 'string', description: 'Filtre par projet (ex: p_marketing-q4)' },
      due_before: { type: 'string', description: 'Échéance ≤ cette date (ISO 8601)' },
      due_after: { type: 'string', description: 'Échéance ≥ cette date (ISO 8601)' },
      priority_max: {
        type: 'number',
        enum: [1, 2, 3, 4],
        description: 'Priorité ≤ N (1 = P1 critique, 4 = P4 nice-to-have)',
      },
      limit: { type: 'number', minimum: 1, maximum: 200, description: 'Max résultats (défaut 50)' },
    },
    additionalProperties: false,
  },
  async handler(args, session) {
    let q = session.client.from('cj_tasks').select('id, project_id, status, priority, due_date, data');
    if (args.status) q = q.eq('status', args.status);
    if (args.project_id) q = q.eq('project_id', args.project_id);
    if (args.due_before) q = q.lte('due_date', args.due_before);
    if (args.due_after) q = q.gte('due_date', args.due_after);
    if (args.priority_max) q = q.lte('priority', args.priority_max);
    q = q.order('due_date', { ascending: true, nullsFirst: false }).order('priority', { ascending: true });
    q = q.limit(args.limit ?? 50);

    const { data, error } = await q;
    if (error) throw new Error(`cj_list_tasks: ${error.message}`);

    return {
      count: data?.length ?? 0,
      tasks: (data ?? []).map((row) => pickRow(row as { id: string; data: unknown })),
    };
  },
};

export const createTask: ToolDefinition<CreateTaskArgs> = {
  name: 'cj_create_task',
  description:
    "Crée une nouvelle tâche dans CockpitJourney. Si project_id n'est pas fourni, la tâche est créée dans la boîte d'entrée (Inbox). Fournir goal_id pour rattacher l'action à un OKR (fortement recommandé : les actions non rattachées restent orphelines et ne font progresser aucun goal).",
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 1, description: 'Titre de la tâche (obligatoire)' },
      project_id: { type: 'string', description: 'ID du projet (omis = inbox)' },
      goal_id: {
        type: 'string',
        description: "ID de l'OKR auquel rattacher l'action (recommandé — évite les actions orphelines).",
      },
      priority: {
        type: 'number',
        enum: [1, 2, 3, 4],
        description: 'Priorité 1-4 (défaut 3)',
      },
      due_date: { type: 'string', description: 'Échéance ISO 8601 (ex: 2026-05-15T17:00:00Z)' },
      description: { type: 'string', description: 'Description / notes' },
      status: {
        type: 'string',
        enum: ['todo', 'in_progress', 'in_review', 'done'],
        description: 'Statut initial (défaut todo)',
      },
    },
    required: ['title'],
    additionalProperties: false,
  },
  async handler(args, session) {
    requireScope(session, 'write', 'admin');

    // Generate a namespaced id matching the web-app convention:
    // <8-char-uuid-of-user>_t_<random>
    const userPrefix = session.userId.slice(0, 8);
    const id = `${userPrefix}_t_${cryptoRandomSuffix()}`;
    const now = new Date().toISOString();
    const projectId = args.project_id ?? null;

    // A task MUST have a valid sectionId to render in the Kanban. Resolve it
    // to the project's lowest-position section (position read from the
    // section's data jsonb). No project / no sections → sectionId stays null.
    let sectionId: string | null = null;
    if (projectId) {
      const { data: secs, error: secErr } = await session.client
        .from('cj_sections')
        .select('id, data')
        .eq('project_id', projectId);
      if (secErr) throw new Error(`cj_create_task (sections): ${secErr.message}`);
      if (secs && secs.length > 0) {
        const sorted = [...secs].sort((a, b) => {
          const pa = Number(((a as { data?: { position?: number } }).data ?? {}).position ?? 0);
          const pb = Number(((b as { data?: { position?: number } }).data ?? {}).position ?? 0);
          return pa - pb;
        });
        sectionId = (sorted[0] as { id: string }).id;
      }
    }

    // camelCase entity matching src/types/index.ts `Task` (the app reads `data`).
    const data = {
      id,
      projectId,
      sectionId,
      title: args.title,
      description: args.description ?? '',
      status: args.status ?? 'todo',
      priority: args.priority ?? 2,
      dueDate: args.due_date ?? null,
      goalId: args.goal_id ?? undefined,
      assignees: [],
      tags: [],
      source: 'manual',
      commentCount: 0,
      attachmentCount: 0,
      createdAt: now,
    };

    const { error } = await session.client.from('cj_tasks').insert({
      id,
      project_id: projectId,
      section_id: sectionId,
      status: args.status ?? 'todo',
      priority: args.priority ?? 2,
      due_date: args.due_date ?? null,
      data,
      auth_user_id: session.userId,
    });
    if (error) throw new Error(`cj_create_task: ${error.message}`);
    // Recale le goal si l'action y contribue (surtout si créée déjà 'done').
    if (args.goal_id) await recomputeGoal(session, args.goal_id);
    return { ok: true, task: data };
  },
};

export const completeTask: ToolDefinition<CompleteTaskArgs> = {
  name: 'cj_complete_task',
  description: "Marque une tâche comme terminée (status = 'done', completed_at = now).",
  inputSchema: {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: 'ID de la tâche à compléter' },
    },
    required: ['task_id'],
    additionalProperties: false,
  },
  async handler(args, session) {
    requireScope(session, 'write', 'admin');
    const now = new Date().toISOString();

    // Read existing data to preserve other fields
    const { data: row, error: readErr } = await session.client
      .from('cj_tasks')
      .select('data')
      .eq('id', args.task_id)
      .maybeSingle();
    if (readErr) throw new Error(`cj_complete_task (read): ${readErr.message}`);
    if (!row) throw new Error(`Tâche ${args.task_id} introuvable`);

    const merged = { ...((row.data ?? {}) as Record<string, unknown>), status: 'done', completionDate: now, updatedAt: now };

    const { error } = await session.client
      .from('cj_tasks')
      .update({ status: 'done', data: merged })
      .eq('id', args.task_id);
    if (error) throw new Error(`cj_complete_task: ${error.message}`);

    // Fait progresser le goal rattaché (auto), côté base.
    const goalId = ((merged as Record<string, unknown>).goalId as string | undefined) ?? null;
    if (goalId) await recomputeGoal(session, goalId);

    return { ok: true, task_id: args.task_id, completed_at: now };
  },
};

export const updateTask: ToolDefinition<UpdateTaskArgs> = {
  name: 'cj_update_task',
  description:
    "Met à jour une ou plusieurs propriétés d'une tâche existante. Le patch est mergé sur le `data` jsonb. Utile pour changer le titre, la priorité, l'échéance, etc.",
  inputSchema: {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: 'ID de la tâche' },
      patch: {
        type: 'object',
        description:
          'Champs à modifier (title, priority, status, due_date, description, project_id…). Les autres champs restent inchangés.',
      },
    },
    required: ['task_id', 'patch'],
    additionalProperties: false,
  },
  async handler(args, session) {
    requireScope(session, 'write', 'admin');

    const { data: row, error: readErr } = await session.client
      .from('cj_tasks')
      .select('data')
      .eq('id', args.task_id)
      .maybeSingle();
    if (readErr) throw new Error(`cj_update_task (read): ${readErr.message}`);
    if (!row) throw new Error(`Tâche ${args.task_id} introuvable`);

    const now = new Date().toISOString();
    const before = (row.data ?? {}) as Record<string, unknown>;
    const patch = camelizePatch(args.patch);
    const merged = {
      ...before,
      ...patch,
      updatedAt: now,
    };

    // Mirror the indexed columns for any field that's also indexed.
    const update: Record<string, unknown> = { data: merged };
    if ('status' in patch) update.status = patch.status;
    if ('priority' in patch) update.priority = patch.priority;
    if ('dueDate' in patch) update.due_date = patch.dueDate;
    if ('projectId' in patch) update.project_id = patch.projectId;
    if ('sectionId' in patch) update.section_id = patch.sectionId;

    const { error } = await session.client.from('cj_tasks').update(update).eq('id', args.task_id);
    if (error) throw new Error(`cj_update_task: ${error.message}`);

    // Roll up goal progress when a contribution changed (status or link),
    // recomputing both the previous and the new goal if the link moved.
    if ('status' in patch || 'goalId' in patch) {
      const affected = new Set<string>();
      const prevGoal = before.goalId as string | undefined;
      const nextGoal = (merged as Record<string, unknown>).goalId as string | undefined;
      if (prevGoal) affected.add(prevGoal);
      if (nextGoal) affected.add(nextGoal);
      for (const gid of affected) await recomputeGoal(session, gid);
    }
    return { ok: true, task: merged };
  },
};

interface AddSubtasksArgs {
  task_id: string;
  subtasks: Array<{ title: string; status?: 'todo' | 'done'; description?: string }>;
}

export const addSubtasks: ToolDefinition<AddSubtasksArgs> = {
  name: 'cj_add_subtasks',
  description:
    "Ajoute plusieurs sous-tâches à une tâche existante en lot. Idéal après un brainstorm : 'décompose cette tâche en 5 sous-étapes'.",
  inputSchema: {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: 'ID de la tâche parente' },
      subtasks: {
        type: 'array',
        minItems: 1,
        maxItems: 50,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 1 },
            status: { type: 'string', enum: ['todo', 'done'] },
            description: { type: 'string' },
          },
          required: ['title'],
        },
      },
    },
    required: ['task_id', 'subtasks'],
    additionalProperties: false,
  },
  async handler(args, session) {
    requireScope(session, 'write', 'admin');

    const userPrefix = session.userId.slice(0, 8);

    // camelCase entity matching appStore `Subtask` (the app reads `data`):
    // it uses `done: boolean` and `position: number` — NOT status/order.
    const rows = args.subtasks.map((s, i) => {
      const id = `${userPrefix}_st_${cryptoRandomSuffix()}_${i}`;
      const data = {
        id,
        taskId: args.task_id,
        title: s.title,
        done: s.status === 'done',
        position: i,
      };
      return { id, task_id: args.task_id, data, auth_user_id: session.userId };
    });

    const { error } = await session.client.from('cj_subtasks').insert(rows);
    if (error) throw new Error(`cj_add_subtasks: ${error.message}`);
    // Ajouter des sous-actions (faites ou non) change le crédit partiel de la
    // tâche → recale le goal rattaché.
    const goalId = await goalIdOfTask(session, args.task_id);
    if (goalId) await recomputeGoal(session, goalId);
    return { ok: true, count: rows.length, subtasks: rows.map((r) => r.data) };
  },
};

/** ~9 chars of base36 randomness — matches the web-app id-generator vibe. */
function cryptoRandomSuffix(): string {
  return Math.random().toString(36).slice(2, 11);
}
