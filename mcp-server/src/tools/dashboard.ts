/**
 * Dashboard tools — get_dashboard / search.
 *
 * `cj_get_dashboard` is the "give me one number" tool: tasks overdue,
 * tasks due today, OKR progress, active project count. Built from
 * parallel reads of cj_tasks, cj_goals, cj_projects.
 *
 * `cj_search` does a simple ILIKE across project names, task titles,
 * and note content. The `data` jsonb is text-searched via Postgres
 * jsonb_text — fine for the small per-user dataset we expect here.
 */
import { pickRow, type ToolDefinition } from './common.js';

interface SearchArgs {
  query: string;
  limit?: number;
}

export const getDashboard: ToolDefinition<Record<string, never>> = {
  name: 'cj_get_dashboard',
  description:
    "Vue d'ensemble du cockpit : tâches en retard, dues aujourd'hui, OKR avancement, projets actifs. Ne prend aucun argument — répond avec une synthèse exécutive prête pour le Daily Brief PROPH3T.",
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  async handler(_args, session) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    const [
      { data: overdue, error: e1 },
      { data: today, error: e2 },
      { data: openTasks, error: e3 },
      { data: activeProjects, error: e4 },
      { data: activeGoals, error: e5 },
    ] = await Promise.all([
      session.client
        .from('cj_tasks')
        .select('id, priority, due_date, data')
        .lt('due_date', startOfDay)
        .neq('status', 'done')
        .neq('status', 'cancelled')
        .order('due_date', { ascending: true })
        .limit(20),
      session.client
        .from('cj_tasks')
        .select('id, priority, due_date, data')
        .gte('due_date', startOfDay)
        .lt('due_date', endOfDay)
        .neq('status', 'done')
        .order('priority', { ascending: true })
        .limit(20),
      session.client
        .from('cj_tasks')
        .select('id', { count: 'exact', head: true })
        .neq('status', 'done')
        .neq('status', 'cancelled'),
      session.client
        .from('cj_projects')
        .select('id, data')
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(10),
      session.client
        .from('cj_goals')
        .select('id, data')
        .not('status', 'in', '(achieved,missed)')
        .order('updated_at', { ascending: false })
        .limit(20),
    ]);
    if (e1) throw new Error(`dashboard.overdue: ${e1.message}`);
    if (e2) throw new Error(`dashboard.today: ${e2.message}`);
    if (e3) throw new Error(`dashboard.open: ${e3.message}`);
    if (e4) throw new Error(`dashboard.projects: ${e4.message}`);
    if (e5) throw new Error(`dashboard.goals: ${e5.message}`);

    const goalProgress = (activeGoals ?? []).map((row) => {
      const g = pickRow(row as { id: string; data: unknown }) as Record<string, unknown>;
      const target = Number(g.targetValue ?? 0);
      const current = Number(g.currentValue ?? 0);
      const start = Number(g.startValue ?? 0);
      const denom = target - start || target || 1;
      const pct = Math.max(0, Math.min(100, ((current - start) / denom) * 100));
      return {
        id: g.id,
        title: g.title,
        progress_pct: Math.round(pct * 10) / 10,
        on_track: pct >= 50,
        due_date: g.dueDate,
        due_date_iso: g.endDate,
      };
    });

    return {
      generated_at: now.toISOString(),
      tasks: {
        overdue_count: overdue?.length ?? 0,
        overdue: (overdue ?? []).map((row) => pickRow(row as { id: string; data: unknown })),
        today_count: today?.length ?? 0,
        today: (today ?? []).map((row) => pickRow(row as { id: string; data: unknown })),
        open_total: openTasks?.length ?? 0,
      },
      projects: {
        active_count: activeProjects?.length ?? 0,
        active: (activeProjects ?? []).map((row) => pickRow(row as { id: string; data: unknown })),
      },
      goals: {
        active_count: goalProgress.length,
        on_track_count: goalProgress.filter((g) => g.on_track).length,
        items: goalProgress,
      },
    };
  },
};

export const search: ToolDefinition<SearchArgs> = {
  name: 'cj_search',
  description:
    "Recherche globale dans les projets, tâches et notes du propriétaire du token. Match insensible à la casse sur le contenu jsonb (nom, titre, description, content).",
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', minLength: 1, description: 'Termes recherchés' },
      limit: { type: 'number', minimum: 1, maximum: 100, description: 'Max résultats par catégorie (défaut 20)' },
    },
    required: ['query'],
    additionalProperties: false,
  },
  async handler(args, session) {
    const limit = args.limit ?? 20;
    // Postgrest .ilike on `data::text` works thanks to jsonb's text cast —
    // good enough for typical CockpitJourney datasets (<10k entities/user).
    const pattern = `%${args.query}%`;

    const [{ data: projects }, { data: tasks }, { data: notes }] = await Promise.all([
      session.client
        .from('cj_projects')
        .select('id, status, data, updated_at')
        .ilike('data->>name', pattern)
        .limit(limit),
      session.client
        .from('cj_tasks')
        .select('id, status, priority, due_date, data, updated_at')
        .ilike('data->>title', pattern)
        .limit(limit),
      session.client
        .from('cj_notes')
        .select('task_id, data, updated_at')
        .ilike('data->>markdown', pattern)
        .limit(limit),
    ]);

    return {
      query: args.query,
      results: {
        projects: (projects ?? []).map((row) => pickRow(row as { id: string; data: unknown })),
        tasks: (tasks ?? []).map((row) => pickRow(row as { id: string; data: unknown })),
        notes: (notes ?? []).map((row) => {
          const r = (row.data ?? {}) as Record<string, unknown>;
          return { ...r, task_id: row.task_id };
        }),
      },
    };
  },
};
