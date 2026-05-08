/**
 * Goal / OKR tools — list / create / update_progress.
 *
 * `cj_goals` has indexed columns owner_id, level, status; the data jsonb
 * carries title, target_value, current_value, unit, due_date, key_results.
 */
import { pickRow, type ToolDefinition } from './common.js';
import { requireScope } from '../auth.js';

interface ListGoalsArgs {
  status?: 'active' | 'achieved' | 'missed' | 'cancelled';
  level?: 'personal' | 'team' | 'company';
  limit?: number;
}

interface CreateGoalArgs {
  title: string;
  target_value: number;
  unit: string;
  due_date: string;
  level?: 'personal' | 'team' | 'company';
  description?: string;
  start_value?: number;
}

interface UpdateGoalProgressArgs {
  goal_id: string;
  current_value: number;
  note?: string;
}

export const listGoals: ToolDefinition<ListGoalsArgs> = {
  name: 'cj_list_goals',
  description:
    "Liste les objectifs OKR du propriétaire du token, avec leur progression. Trié par due_date asc. Filtrable par statut et niveau (perso / équipe / entreprise).",
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['active', 'achieved', 'missed', 'cancelled'],
        description: 'Filtre par statut (défaut: actifs uniquement)',
      },
      level: {
        type: 'string',
        enum: ['personal', 'team', 'company'],
        description: 'Niveau hiérarchique',
      },
      limit: { type: 'number', minimum: 1, maximum: 100, description: 'Max résultats (défaut 50)' },
    },
    additionalProperties: false,
  },
  async handler(args, session) {
    let q = session.client.from('cj_goals').select('id, owner_id, level, status, data, updated_at');
    q = q.eq('status', args.status ?? 'active');
    if (args.level) q = q.eq('level', args.level);
    q = q.order('updated_at', { ascending: false }).limit(args.limit ?? 50);

    const { data, error } = await q;
    if (error) throw new Error(`cj_list_goals: ${error.message}`);

    const goals = (data ?? []).map((row) => {
      const g = pickRow(row as { id: string; data: unknown }) as Record<string, unknown>;
      const target = Number(g.target_value ?? 0);
      const current = Number(g.current_value ?? 0);
      const start = Number(g.start_value ?? 0);
      const denom = target - start || target || 1;
      const progress = Math.max(0, Math.min(100, ((current - start) / denom) * 100));
      return { ...g, progress_pct: Math.round(progress * 10) / 10 };
    });

    return { count: goals.length, goals };
  },
};

export const createGoal: ToolDefinition<CreateGoalArgs> = {
  name: 'cj_create_goal',
  description:
    "Définit un nouvel OKR. target_value est la valeur visée, current_value démarre à start_value (0 par défaut), unit est l'unité ('€', '%', 'tâches', 'leads'...), due_date est l'échéance.",
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 1 },
      target_value: { type: 'number', description: 'Valeur cible (ex: 100, 1000000)' },
      unit: { type: 'string', description: 'Unité (€, %, tâches, leads...)' },
      due_date: { type: 'string', description: 'Échéance ISO 8601' },
      level: { type: 'string', enum: ['personal', 'team', 'company'], description: 'Niveau (défaut personal)' },
      description: { type: 'string', description: 'Détails / pourquoi cet OKR' },
      start_value: { type: 'number', description: 'Valeur de départ (défaut 0)' },
    },
    required: ['title', 'target_value', 'unit', 'due_date'],
    additionalProperties: false,
  },
  async handler(args, session) {
    requireScope(session, 'write', 'admin');

    const userPrefix = session.userId.slice(0, 8);
    const id = `${userPrefix}_g_${cryptoRandomSuffix()}`;
    const now = new Date().toISOString();
    const start = args.start_value ?? 0;

    const data = {
      id,
      title: args.title,
      description: args.description ?? '',
      target_value: args.target_value,
      start_value: start,
      current_value: start,
      unit: args.unit,
      due_date: args.due_date,
      level: args.level ?? 'personal',
      status: 'active',
      owner_id: session.userId,
      progress_history: [{ at: now, value: start, note: 'OKR créé' }],
      created_at: now,
      updated_at: now,
      created_via: 'mcp',
    };

    const { error } = await session.client.from('cj_goals').insert({
      id,
      owner_id: session.userId,
      level: args.level ?? 'personal',
      status: 'active',
      data,
      auth_user_id: session.userId,
    });
    if (error) throw new Error(`cj_create_goal: ${error.message}`);
    return { ok: true, goal: data };
  },
};

export const updateGoalProgress: ToolDefinition<UpdateGoalProgressArgs> = {
  name: 'cj_update_goal_progress',
  description:
    "Met à jour la progression d'un OKR. Ajoute une entrée dans progress_history pour traçabilité. Si current_value atteint target_value, le statut bascule automatiquement à 'achieved'.",
  inputSchema: {
    type: 'object',
    properties: {
      goal_id: { type: 'string', description: 'ID de l\'OKR' },
      current_value: { type: 'number', description: 'Nouvelle valeur de progression' },
      note: { type: 'string', description: 'Commentaire optionnel sur la mise à jour' },
    },
    required: ['goal_id', 'current_value'],
    additionalProperties: false,
  },
  async handler(args, session) {
    requireScope(session, 'write', 'admin');

    const { data: row, error: readErr } = await session.client
      .from('cj_goals')
      .select('data, status')
      .eq('id', args.goal_id)
      .maybeSingle();
    if (readErr) throw new Error(`cj_update_goal_progress (read): ${readErr.message}`);
    if (!row) throw new Error(`OKR ${args.goal_id} introuvable`);

    const now = new Date().toISOString();
    const existing = (row.data ?? {}) as Record<string, unknown>;
    const history = Array.isArray(existing.progress_history) ? existing.progress_history : [];
    const target = Number(existing.target_value ?? 0);
    const reached = args.current_value >= target;

    const merged = {
      ...existing,
      current_value: args.current_value,
      status: reached ? 'achieved' : (existing.status ?? 'active'),
      progress_history: [...history, { at: now, value: args.current_value, note: args.note ?? null }],
      updated_at: now,
      ...(reached ? { achieved_at: now } : {}),
    };

    const { error } = await session.client
      .from('cj_goals')
      .update({ data: merged, status: reached ? 'achieved' : row.status })
      .eq('id', args.goal_id);
    if (error) throw new Error(`cj_update_goal_progress: ${error.message}`);

    return { ok: true, achieved: reached, goal: merged };
  },
};

function cryptoRandomSuffix(): string {
  return Math.random().toString(36).slice(2, 11);
}
