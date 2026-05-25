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
import { pickRow, type ToolDefinition } from './common.js';

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
    "Crée une nouvelle tâche dans CockpitJourney. Si project_id n'est pas fourni, la tâche est créée dans la boîte d'entrée (Inbox).",
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 1, description: 'Titre de la tâche (obligatoire)' },
      project_id: { type: 'string', description: 'ID du projet (omis = inbox)' },
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

    const data = {
      id,
      title: args.title,
      project_id: args.project_id ?? null,
      priority: args.priority ?? 3,
      status: args.status ?? 'todo',
      due_date: args.due_date ?? null,
      description: args.description ?? '',
      // Required arrays in the web-app Task type — set them so tasks created
      // via MCP are well-formed (DashboardView etc. read .assignees/.tags).
      assignees: [],
      tags: [],
      created_at: now,
      updated_at: now,
      created_via: 'mcp',
    };

    const { error } = await session.client.from('cj_tasks').insert({
      id,
      project_id: args.project_id ?? null,
      status: args.status ?? 'todo',
      priority: args.priority ?? 3,
      due_date: args.due_date ?? null,
      data,
      auth_user_id: session.userId,
    });
    if (error) throw new Error(`cj_create_task: ${error.message}`);
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

    const merged = { ...((row.data ?? {}) as Record<string, unknown>), status: 'done', completed_at: now, updated_at: now };

    const { error } = await session.client
      .from('cj_tasks')
      .update({ status: 'done', data: merged })
      .eq('id', args.task_id);
    if (error) throw new Error(`cj_complete_task: ${error.message}`);

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
    const merged = {
      ...((row.data ?? {}) as Record<string, unknown>),
      ...args.patch,
      updated_at: now,
    };

    // Mirror the indexed columns for any field that's also indexed.
    const update: Record<string, unknown> = { data: merged };
    if ('status' in args.patch) update.status = args.patch.status;
    if ('priority' in args.patch) update.priority = args.patch.priority;
    if ('due_date' in args.patch) update.due_date = args.patch.due_date;
    if ('project_id' in args.patch) update.project_id = args.patch.project_id;

    const { error } = await session.client.from('cj_tasks').update(update).eq('id', args.task_id);
    if (error) throw new Error(`cj_update_task: ${error.message}`);
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
    const now = new Date().toISOString();

    const rows = args.subtasks.map((s, i) => {
      const id = `${userPrefix}_st_${cryptoRandomSuffix()}_${i}`;
      const data = {
        id,
        task_id: args.task_id,
        title: s.title,
        status: s.status ?? 'todo',
        description: s.description ?? '',
        order: i,
        created_at: now,
        updated_at: now,
        created_via: 'mcp',
      };
      return { id, task_id: args.task_id, data, auth_user_id: session.userId };
    });

    const { error } = await session.client.from('cj_subtasks').insert(rows);
    if (error) throw new Error(`cj_add_subtasks: ${error.message}`);
    return { ok: true, count: rows.length, subtasks: rows.map((r) => r.data) };
  },
};

/** ~9 chars of base36 randomness — matches the web-app id-generator vibe. */
function cryptoRandomSuffix(): string {
  return Math.random().toString(36).slice(2, 11);
}
