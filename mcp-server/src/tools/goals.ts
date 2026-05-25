/**
 * Goal / OKR tools — list / create / update_progress.
 *
 * `cj_goals` has indexed columns owner_id, level, status; the data jsonb
 * carries title, target_value, current_value, unit, due_date, key_results.
 */
import { pickRow, getProfileId, type ToolDefinition } from './common.js';
import { requireScope } from '../auth.js';

interface ListGoalsArgs {
  status?: 'on_track' | 'at_risk' | 'off_track' | 'achieved' | 'missed';
  level?: 'personal' | 'team' | 'company' | 'workspace';
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
        enum: ['on_track', 'at_risk', 'off_track', 'achieved', 'missed'],
        description: 'Filtre par statut (défaut: tous)',
      },
      level: {
        type: 'string',
        enum: ['personal', 'team', 'company', 'workspace'],
        description: 'Niveau hiérarchique',
      },
      limit: { type: 'number', minimum: 1, maximum: 100, description: 'Max résultats (défaut 50)' },
    },
    additionalProperties: false,
  },
  async handler(args, session) {
    let q = session.client.from('cj_goals').select('id, owner_id, level, status, data, updated_at');
    if (args.status) q = q.eq('status', args.status);
    if (args.level) q = q.eq('level', args.level === 'company' ? 'workspace' : args.level);
    q = q.order('updated_at', { ascending: false }).limit(args.limit ?? 50);

    const { data, error } = await q;
    if (error) throw new Error(`cj_list_goals: ${error.message}`);

    const goals = (data ?? []).map((row) => {
      const g = pickRow(row as { id: string; data: unknown }) as Record<string, unknown>;
      const target = Number(g.targetValue ?? 0);
      const current = Number(g.currentValue ?? 0);
      const start = Number(g.startValue ?? 0);
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

    const ownerId = await getProfileId(session);
    const userPrefix = session.userId.slice(0, 8);
    const id = `${userPrefix}_g_${cryptoRandomSuffix()}`;
    const now = new Date().toISOString();
    const start = args.start_value ?? 0;
    // The app's Goal.level is 'workspace'|'team'|'personal'. Map the MCP
    // 'company' alias to 'workspace' so GoalsView renders it.
    const level = args.level === 'company' ? 'workspace' : (args.level ?? 'personal');

    // camelCase entity matching src/types/index.ts `Goal` (the app reads `data`).
    const data = {
      id,
      title: args.title,
      description: args.description ?? '',
      ownerId,
      level,
      metricType: 'number',
      targetValue: args.target_value,
      currentValue: start,
      startValue: start,
      unit: args.unit,
      period: 'quarterly',
      startDate: now,
      endDate: args.due_date,
      dueDate: args.due_date,
      status: 'on_track',
      health: 'green',
      progressHistory: [{ at: now, value: start, note: 'OKR créé' }],
      createdAt: now,
    };

    const { error } = await session.client.from('cj_goals').insert({
      id,
      owner_id: ownerId,
      level,
      status: 'on_track',
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
    const history = Array.isArray(existing.progressHistory) ? existing.progressHistory : [];
    const target = Number(existing.targetValue ?? 0);
    const reached = args.current_value >= target;

    const merged = {
      ...existing,
      currentValue: args.current_value,
      status: reached ? 'achieved' : (existing.status ?? 'on_track'),
      progressHistory: [...history, { at: now, value: args.current_value, note: args.note ?? null }],
      updatedAt: now,
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
