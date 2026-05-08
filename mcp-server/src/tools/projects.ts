/**
 * Project tools — list / get / create / update.
 *
 * `cj_projects` is the top-level container for tasks. It has indexed
 * columns (folder_id, owner_id, status) plus a `data` jsonb that holds
 * the in-app entity (name, slug, color, icon, description…).
 *
 * `cj_get_project` returns the project + its sections (kanban columns)
 * + a quick task summary so Claude can answer "what's in this project?"
 * in one call.
 */
import { pickRow, type ToolDefinition } from './common.js';
import { requireScope } from '../auth.js';

interface ListProjectsArgs {
  status?: 'active' | 'archived' | 'on_hold' | 'completed';
  folder_id?: string;
  limit?: number;
}

interface GetProjectArgs {
  project_id: string;
}

interface CreateProjectArgs {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  folder_id?: string;
}

interface UpdateProjectArgs {
  project_id: string;
  patch: Record<string, unknown>;
}

export const listProjects: ToolDefinition<ListProjectsArgs> = {
  name: 'cj_list_projects',
  description:
    "Liste les projets CockpitJourney du propriétaire du token. Retourne id, nom, statut, et le data jsonb complet (slug, description, owner, couleur…). Trié du plus récemment modifié au plus ancien.",
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['active', 'archived', 'on_hold', 'completed'],
        description: 'Filtre par statut (défaut: tous)',
      },
      folder_id: { type: 'string', description: 'Filtre par dossier' },
      limit: { type: 'number', minimum: 1, maximum: 100, description: 'Max résultats (défaut 50)' },
    },
    additionalProperties: false,
  },
  async handler(args, session) {
    let q = session.client.from('cj_projects').select('id, folder_id, owner_id, status, data, updated_at');
    if (args.status) q = q.eq('status', args.status);
    if (args.folder_id) q = q.eq('folder_id', args.folder_id);
    q = q.order('updated_at', { ascending: false }).limit(args.limit ?? 50);

    const { data, error } = await q;
    if (error) throw new Error(`cj_list_projects: ${error.message}`);

    return {
      count: data?.length ?? 0,
      projects: (data ?? []).map((row) => pickRow(row as { id: string; data: unknown })),
    };
  },
};

export const getProject: ToolDefinition<GetProjectArgs> = {
  name: 'cj_get_project',
  description:
    "Détails complets d'un projet : metadata + ses sections (colonnes kanban) + une synthèse des tâches (counts par statut). Utile pour répondre à 'qu'est-ce qu'il y a dans le projet X' en une seule requête.",
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'ID du projet' },
    },
    required: ['project_id'],
    additionalProperties: false,
  },
  async handler(args, session) {
    const [{ data: project, error: pErr }, { data: sections, error: sErr }, { data: tasks, error: tErr }] =
      await Promise.all([
        session.client.from('cj_projects').select('*').eq('id', args.project_id).maybeSingle(),
        session.client.from('cj_sections').select('*').eq('project_id', args.project_id).order('updated_at'),
        session.client
          .from('cj_tasks')
          .select('id, status, priority, due_date, data')
          .eq('project_id', args.project_id),
      ]);

    if (pErr) throw new Error(`cj_get_project (project): ${pErr.message}`);
    if (!project) throw new Error(`Projet ${args.project_id} introuvable`);
    if (sErr) throw new Error(`cj_get_project (sections): ${sErr.message}`);
    if (tErr) throw new Error(`cj_get_project (tasks): ${tErr.message}`);

    const tasksList = (tasks ?? []).map((row) => pickRow(row as { id: string; data: unknown }));
    const counts = tasksList.reduce<Record<string, number>>((acc, t) => {
      const s = String((t as { status?: string }).status ?? 'todo');
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    }, {});

    return {
      project: pickRow(project as { id: string; data: unknown }),
      sections: (sections ?? []).map((row) => pickRow(row as { id: string; data: unknown })),
      tasks: tasksList,
      summary: {
        total: tasksList.length,
        by_status: counts,
      },
    };
  },
};

export const createProject: ToolDefinition<CreateProjectArgs> = {
  name: 'cj_create_project',
  description:
    "Crée un nouveau projet. Génère automatiquement un slug et un id namespaced. Le projet est créé sans sections — utiliser cj_create_task pour ajouter du contenu.",
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, description: 'Nom du projet' },
      description: { type: 'string', description: 'Description courte' },
      color: { type: 'string', description: "Couleur hex (ex: #6E8B58). Défaut sage CockpitJourney." },
      icon: { type: 'string', description: 'Nom d\'icône lucide (target, briefcase, etc.)' },
      folder_id: { type: 'string', description: 'Dossier parent' },
    },
    required: ['name'],
    additionalProperties: false,
  },
  async handler(args, session) {
    requireScope(session, 'write', 'admin');

    const userPrefix = session.userId.slice(0, 8);
    const id = `${userPrefix}_p_${cryptoRandomSuffix()}`;
    const now = new Date().toISOString();
    const slug = slugify(args.name);

    const data = {
      id,
      name: args.name,
      slug,
      description: args.description ?? '',
      color: args.color ?? '#6E8B58',
      icon: args.icon ?? 'briefcase',
      status: 'active',
      folder_id: args.folder_id ?? null,
      owner_id: session.userId,
      created_at: now,
      updated_at: now,
      created_via: 'mcp',
    };

    const { error } = await session.client.from('cj_projects').insert({
      id,
      folder_id: args.folder_id ?? null,
      owner_id: session.userId,
      status: 'active',
      data,
      auth_user_id: session.userId,
    });
    if (error) throw new Error(`cj_create_project: ${error.message}`);
    return { ok: true, project: data };
  },
};

export const updateProject: ToolDefinition<UpdateProjectArgs> = {
  name: 'cj_update_project',
  description:
    "Met à jour un projet existant. Le patch est mergé sur le `data` jsonb. Champs courants : name, description, status, color, icon.",
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'ID du projet' },
      patch: {
        type: 'object',
        description:
          'Champs à modifier (name, description, status, color, icon, folder_id…). Les autres restent inchangés.',
      },
    },
    required: ['project_id', 'patch'],
    additionalProperties: false,
  },
  async handler(args, session) {
    requireScope(session, 'write', 'admin');

    const { data: row, error: readErr } = await session.client
      .from('cj_projects')
      .select('data')
      .eq('id', args.project_id)
      .maybeSingle();
    if (readErr) throw new Error(`cj_update_project (read): ${readErr.message}`);
    if (!row) throw new Error(`Projet ${args.project_id} introuvable`);

    const now = new Date().toISOString();
    const merged = {
      ...((row.data ?? {}) as Record<string, unknown>),
      ...args.patch,
      updated_at: now,
    };

    const update: Record<string, unknown> = { data: merged };
    if ('status' in args.patch) update.status = args.patch.status;
    if ('folder_id' in args.patch) update.folder_id = args.patch.folder_id;

    const { error } = await session.client.from('cj_projects').update(update).eq('id', args.project_id);
    if (error) throw new Error(`cj_update_project: ${error.message}`);
    return { ok: true, project: merged };
  },
};

function cryptoRandomSuffix(): string {
  return Math.random().toString(36).slice(2, 11);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
