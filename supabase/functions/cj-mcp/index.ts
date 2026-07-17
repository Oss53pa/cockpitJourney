// cj-mcp — Serveur MCP DISTANT (Streamable HTTP) pour CockpitJourney.
// =====================================================================
// Expose les 18 outils cj_* à Claude comme "connecteur personnalisé"
// (custom connector), utilisable sur Claude web / desktop / mobile,
// lié au compte Claude de l'utilisateur.
//
// Auth (approche A) : le Personal Access Token de l'utilisateur est passé
// dans l'URL du connecteur en query string :
//   https://<project>.supabase.co/functions/v1/cj-mcp?apikey=<anon>&token=cj_xxx
// (apikey = clé publishable, exigée par la passerelle Supabase ; token = le secret)
//
// Le PAT est échangé contre un JWT Supabase (via cj-auth-pat) puis MIS EN
// CACHE en mémoire (par isolate) pour éviter de régénérer un magic-link à
// chaque appel — important pour les imports en masse. RLS s'applique
// normalement sur chaque requête (le JWT porte auth.uid()).
//
// Déployé avec verify_jwt = false : l'auth se fait par le token dans l'URL.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "cockpit-journey", version: "1.0.0" };

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, mcp-session-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

// ─────────────────────────── Auth / session ───────────────────────────
interface CjSession {
  client: SupabaseClient;
  accessToken: string;
  userId: string;
  email: string;
  scopes: string[];
  tokenName: string;
  expiresAt: number;
}
interface CachedAuth {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
  scopes: string[];
  tokenName: string;
  expiresAt: number;
}

const REFRESH_MARGIN_MS = 5 * 60_000;
const authCache = new Map<string, CachedAuth>();

async function exchangePat(pat: string): Promise<CachedAuth> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/cj-auth-pat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ pat }),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const e = await res.json();
      if (e?.error) detail = e.error;
    } catch { /* not json */ }
    throw new Error(`Echec d'authentification du token : ${detail}`);
  }
  const d = await res.json();
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    userId: d.user_id,
    email: d.email,
    scopes: d.scopes ?? [],
    tokenName: d.token_name ?? "CockpitJourney PAT",
    expiresAt: Date.now() + (d.expires_in ?? 3600) * 1000,
  };
}

async function getSession(pat: string): Promise<CjSession> {
  let cached = authCache.get(pat);
  if (!cached || cached.expiresAt - Date.now() <= REFRESH_MARGIN_MS) {
    cached = await exchangePat(pat);
    authCache.set(pat, cached);
  }
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${cached.accessToken}` } },
  });
  return {
    client,
    accessToken: cached.accessToken,
    userId: cached.userId,
    email: cached.email,
    scopes: cached.scopes,
    tokenName: cached.tokenName,
    expiresAt: cached.expiresAt,
  };
}

function requireScope(session: CjSession, ...required: string[]): void {
  if (!required.some((r) => session.scopes.includes(r))) {
    throw new Error(
      `Token "${session.tokenName}" n'a pas les permissions requises (${required.join(" ou ")}). Scopes actuels : ${session.scopes.join(", ")}.`,
    );
  }
}

// Resolve the user's cj_profiles.id (text). Several indexed FK columns
// (cj_projects.owner_id, cj_goals.owner_id, cj_comments.author_id) reference
// cj_profiles(id) — NOT auth.users(id) — so we must map the auth uid to the
// profile id. Cached per user (stable). Returns null if no profile row.
const profileCache = new Map<string, string | null>();
async function getProfileId(session: CjSession): Promise<string | null> {
  if (profileCache.has(session.userId)) return profileCache.get(session.userId) ?? null;
  const { data } = await session.client.from("cj_profiles").select("id").eq("auth_user_id", session.userId).maybeSingle();
  const pid = (data?.id as string | undefined) ?? null;
  profileCache.set(session.userId, pid);
  return pid;
}

// ─────────────────────────── Helpers ───────────────────────────
// deno-lint-ignore no-explicit-any
function pickRow(row: any): Record<string, unknown> {
  const data = (row?.data ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...data };
  if (row?.id !== undefined) out.id = row.id;
  return out;
}
function rand(): string {
  return Math.random().toString(36).slice(2, 11);
}
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// The app reads `data` and expects camelCase keys. Incoming update patches
// may use snake_case (e.g. due_date, project_id) for convenience — convert
// the known indexed/foreign keys so the merged `data` stays camelCase.
const SNAKE_TO_CAMEL: Record<string, string> = {
  due_date: "dueDate",
  start_date: "startDate",
  end_date: "endDate",
  project_id: "projectId",
  section_id: "sectionId",
  parent_task_id: "parentTaskId",
  folder_id: "folderId",
  owner_id: "ownerId",
  author_id: "authorId",
  target_value: "targetValue",
  current_value: "currentValue",
  start_value: "startValue",
  metric_type: "metricType",
  created_at: "createdAt",
  updated_at: "updatedAt",
  completion_date: "completionDate",
  estimated_minutes: "estimatedMinutes",
  actual_minutes: "actualMinutes",
  goal_id: "goalId",
  task_id: "taskId",
};
function camelizePatch(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch ?? {})) {
    out[SNAKE_TO_CAMEL[k] ?? k] = v;
  }
  // Coerce any task status to the canonical app vocabulary (see normTaskStatus).
  if ("status" in out) out.status = normTaskStatus(out.status);
  return out;
}

// Canonical TaskStatus of the app (src/types/index.ts). The connector / Claude
// sometimes sends French or non-canonical values; if written through, the task
// matches NO Kanban column and never renders. We coerce at the write boundary.
const VALID_TASK_STATUS = ["todo", "in_progress", "in_review", "done", "blocked"];
const TASK_STATUS_ALIASES: Record<string, string> = {
  a_faire: "todo",
  "à_faire": "todo",
  afaire: "todo",
  en_cours: "in_progress",
  encours: "in_progress",
  en_validation: "in_review",
  en_revue: "in_review",
  revue: "in_review",
  termine: "done",
  "terminé": "done",
  fait: "done",
  acheve: "done",
  "achevé": "done",
  cancelled: "done",
  annule: "done",
  "annulé": "done",
  bloque: "blocked",
  "bloqué": "blocked",
};
function normTaskStatus(s: unknown): string {
  if (typeof s === "string") {
    if (VALID_TASK_STATUS.includes(s)) return s;
    const alias = TASK_STATUS_ALIASES[s.toLowerCase().trim()];
    if (alias) return alias;
  }
  return "todo";
}

/** Poids par axe — miroir de `AXIS_WEIGHTS` dans `src/lib/goalProgress.ts`. */
const AXIS_WEIGHTS: Record<string, number> = {
  axe1_rh: 15,
  axe2_commercial: 20,
  axe3_technique: 15,
  axe4_budget: 10,
  axe5_marketing: 10,
  axe6_exploitation: 5,
  axe7_construction: 25,
  axe8_divers: 0,
};

/**
 * Recalcul de la progression d'un goal depuis ses actions — miroir serveur de
 * `src/lib/goalProgress.ts` (app web). Sans lui, compléter une action via MCP
 * laissait l'OKR figé jusqu'au prochain passage dans le navigateur.
 *
 * Règles (identiques à l'app) : crédit partiel pondéré par les sous-actions ;
 * tous les types de métriques auto-pilotés (ratio d'exécution appliqué à la
 * cible pour number/currency) ; `progressMode: 'manual'` jamais écrasé ;
 * pondération par axe (`AXIS_WEIGHTS`) quand toutes les actions contributrices
 * ont un axe reconnu et qu'il y en a plus d'un.
 *
 * Best-effort : toute erreur est avalée — le recalcul ne doit jamais faire
 * échouer l'action de l'utilisateur.
 */
async function recomputeGoalFromTasks(session: CjSession, goalId: string): Promise<void> {
  try {
    const { data: goalRow } = await session.client
      .from("cj_goals").select("data").eq("id", goalId).maybeSingle();
    if (!goalRow) return;
    const g = (goalRow.data ?? {}) as Record<string, unknown>;
    if (g.progressMode === "manual") return;

    const { data: taskRows } = await session.client
      .from("cj_tasks").select("id, status, data").eq("data->>goalId", goalId);
    const tasks = (taskRows ?? []).map((r) => {
      const d = (r.data ?? {}) as Record<string, unknown>;
      const progressPct = typeof d.progressPct === "number" ? d.progressPct : undefined;
      const axeKey = typeof d.axeKey === "string" ? d.axeKey : undefined;
      return { id: String(r.id), status: String(r.status ?? d.status ?? "todo"), progressPct, axeKey };
    });
    const total = tasks.length;

    let subs: { taskId: string; done: boolean }[] = [];
    if (total > 0) {
      const { data: subRows } = await session.client
        .from("cj_subtasks").select("task_id, data").in("task_id", tasks.map((t) => t.id));
      subs = (subRows ?? []).map((r) => ({
        taskId: String(r.task_id),
        done: Boolean(((r.data ?? {}) as Record<string, unknown>).done),
      }));
    }

    // Poids par action : done = 1, sinon fraction des sous-actions cochées,
    // sinon progressPct connu (import externe / saisie manuelle) en repli.
    const weight = (t: { id: string; status: string; progressPct?: number }) => {
      if (t.status === "done") return 1;
      const own = subs.filter((s) => s.taskId === t.id);
      if (own.length > 0) return own.filter((s) => s.done).length / own.length;
      if (typeof t.progressPct === "number") return Math.max(0, Math.min(100, t.progressPct)) / 100;
      return 0;
    };

    const axeKeys = tasks.map((t) => t.axeKey);
    const allHaveAxis = total > 0 && axeKeys.every((a) => !!a && a in AXIS_WEIGHTS);
    const distinctAxes = new Set(axeKeys);
    let fraction: number;
    if (allHaveAxis && distinctAxes.size > 1) {
      let weightedSum = 0;
      let weightTotal = 0;
      for (const axe of distinctAxes) {
        const axeTasks = tasks.filter((t) => t.axeKey === axe);
        const axeAvg = axeTasks.reduce((s, t) => s + weight(t), 0) / axeTasks.length;
        const poids = AXIS_WEIGHTS[axe as string];
        weightedSum += axeAvg * poids;
        weightTotal += poids;
      }
      fraction = weightTotal > 0 ? weightedSum / weightTotal : 0;
    } else {
      fraction = total > 0 ? tasks.reduce((s, t) => s + weight(t), 0) / total : 0;
    }

    const target = Number(g.targetValue ?? 0);
    const metric = String(g.metricType ?? "number");
    const currentValue =
      metric === "percentage"
        ? Math.round(fraction * 100)
        : metric === "boolean"
          ? (total > 0 && fraction >= 1 ? target : 0)
          : Math.round(target * fraction);

    const pct = (currentValue / Math.max(1, target)) * 100;
    const health = pct >= 60 ? "green" : pct >= 35 ? "yellow" : "red";
    const status = pct >= 100 ? "achieved" : pct >= 60 ? "on_track" : pct >= 35 ? "at_risk" : "off_track";

    await session.client.from("cj_goals")
      .update({ data: { ...g, currentValue, health, status, updatedAt: new Date().toISOString() }, status })
      .eq("id", goalId);
  } catch (err) {
    console.error(`recomputeGoalFromTasks(${goalId}) failed:`, err);
  }
}

// ─────────────────────────── Tools (19) ───────────────────────────
interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  // deno-lint-ignore no-explicit-any
  handler: (args: any, session: CjSession) => Promise<unknown>;
}

const TOOLS: Tool[] = [
  // ── Projets (4) ──
  {
    name: "cj_list_projects",
    description:
      "Liste les projets CockpitJourney du propriétaire du token. Retourne id, nom, statut, et le data jsonb complet (slug, description, owner, couleur…). Trié du plus récemment modifié au plus ancien.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["active", "archived", "on_hold", "completed"], description: "Filtre par statut (défaut: tous)" },
        folder_id: { type: "string", description: "Filtre par dossier" },
        limit: { type: "number", minimum: 1, maximum: 100, description: "Max résultats (défaut 50)" },
      },
      additionalProperties: false,
    },
    async handler(args, session) {
      // deno-lint-ignore no-explicit-any
      let q: any = session.client.from("cj_projects").select("id, folder_id, owner_id, status, data, updated_at");
      if (args.status) q = q.eq("status", args.status);
      if (args.folder_id) q = q.eq("folder_id", args.folder_id);
      q = q.order("updated_at", { ascending: false }).limit(args.limit ?? 50);
      const { data, error } = await q;
      if (error) throw new Error(`cj_list_projects: ${error.message}`);
      return { count: data?.length ?? 0, projects: (data ?? []).map(pickRow) };
    },
  },
  {
    name: "cj_get_project",
    description:
      "Détails complets d'un projet : metadata + ses sections (colonnes kanban) + une synthèse des tâches (counts par statut). Utile pour répondre à 'qu'est-ce qu'il y a dans le projet X' en une seule requête.",
    inputSchema: {
      type: "object",
      properties: { project_id: { type: "string", description: "ID du projet" } },
      required: ["project_id"],
      additionalProperties: false,
    },
    async handler(args, session) {
      const [{ data: project, error: pErr }, { data: sections, error: sErr }, { data: tasks, error: tErr }] =
        await Promise.all([
          session.client.from("cj_projects").select("*").eq("id", args.project_id).maybeSingle(),
          session.client.from("cj_sections").select("*").eq("project_id", args.project_id).order("updated_at"),
          session.client.from("cj_tasks").select("id, status, priority, due_date, data").eq("project_id", args.project_id),
        ]);
      if (pErr) throw new Error(`cj_get_project (project): ${pErr.message}`);
      if (!project) throw new Error(`Projet ${args.project_id} introuvable`);
      if (sErr) throw new Error(`cj_get_project (sections): ${sErr.message}`);
      if (tErr) throw new Error(`cj_get_project (tasks): ${tErr.message}`);
      const tasksList = (tasks ?? []).map(pickRow);
      const counts = tasksList.reduce<Record<string, number>>((acc, t) => {
        const s = String((t as { status?: string }).status ?? "todo");
        acc[s] = (acc[s] ?? 0) + 1;
        return acc;
      }, {});
      return {
        project: pickRow(project),
        sections: (sections ?? []).map(pickRow),
        tasks: tasksList,
        summary: { total: tasksList.length, by_status: counts },
      };
    },
  },
  {
    name: "cj_create_project",
    description:
      "Crée un nouveau projet et l'amorce avec 4 sections kanban par défaut (À faire / En cours / En revue / Terminé), exactement comme l'app. Génère automatiquement un slug et un id namespaced.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, description: "Nom du projet" },
        description: { type: "string", description: "Description courte" },
        color: { type: "string", description: "Couleur hex (ex: #6E8B58). Défaut sage CockpitJourney." },
        icon: { type: "string", description: "Nom d'icône lucide (target, briefcase, etc.)" },
        folder_id: { type: "string", description: "Dossier parent" },
      },
      required: ["name"],
      additionalProperties: false,
    },
    async handler(args, session) {
      requireScope(session, "write", "admin");
      const ownerId = await getProfileId(session);
      const userPrefix = session.userId.slice(0, 8);
      const id = `${userPrefix}_p_${rand()}`;
      const now = new Date().toISOString();
      // camelCase entity matching src/types/index.ts `Project` (the app reads `data`).
      const data = {
        id,
        slug: slugify(args.name),
        name: args.name,
        description: args.description ?? "",
        status: "active",
        color: args.color ?? "#6E8B58",
        icon: args.icon ?? "briefcase",
        ownerId,
        folderId: args.folder_id ?? null,
        health: "green",
        progress: 0,
        taskCount: 0,
        membersIds: ownerId ? [ownerId] : [],
        createdAt: now,
        updatedAt: now,
      };
      const { error } = await session.client.from("cj_projects").insert({
        id, folder_id: args.folder_id ?? null, owner_id: ownerId, status: "active", data, auth_user_id: session.userId,
      });
      if (error) throw new Error(`cj_create_project: ${error.message}`);

      // Seed the 4 default sections like the app's createProject. Each
      // `data` is a camelCase `Section` (id, projectId, name, color, position, wipLimit?).
      const sectionDefs = [
        { name: "À faire", color: "#5A6055", position: 0 },
        { name: "En cours", color: "#95B07D", position: 1, wipLimit: 5 },
        { name: "En revue", color: "#8AA6C4", position: 2 },
        { name: "Terminé", color: "#7AC388", position: 3 },
      ];
      const sectionRows = sectionDefs.map((s) => {
        const sid = `${userPrefix}_s_${rand()}`;
        const sData: Record<string, unknown> = {
          id: sid, projectId: id, name: s.name, color: s.color, position: s.position,
        };
        if (s.wipLimit !== undefined) sData.wipLimit = s.wipLimit;
        return { id: sid, project_id: id, auth_user_id: session.userId, data: sData };
      });
      const { error: sErr } = await session.client.from("cj_sections").insert(sectionRows);
      if (sErr) throw new Error(`cj_create_project (sections): ${sErr.message}`);

      return { ok: true, project: data, sectionIds: sectionRows.map((r) => r.id) };
    },
  },
  {
    name: "cj_update_project",
    description:
      "Met à jour un projet existant. Le patch est mergé sur le `data` jsonb. Champs courants : name, description, status, color, icon.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "ID du projet" },
        patch: { type: "object", description: "Champs à modifier (name, description, status, color, icon, folder_id…). Les autres restent inchangés." },
      },
      required: ["project_id", "patch"],
      additionalProperties: false,
    },
    async handler(args, session) {
      requireScope(session, "write", "admin");
      const { data: row, error: readErr } = await session.client.from("cj_projects").select("data").eq("id", args.project_id).maybeSingle();
      if (readErr) throw new Error(`cj_update_project (read): ${readErr.message}`);
      if (!row) throw new Error(`Projet ${args.project_id} introuvable`);
      const now = new Date().toISOString();
      const patch = camelizePatch(args.patch as Record<string, unknown>);
      const merged = { ...((row.data ?? {}) as Record<string, unknown>), ...patch, updatedAt: now };
      const update: Record<string, unknown> = { data: merged };
      if ("status" in patch) update.status = patch.status;
      if ("folderId" in patch) update.folder_id = patch.folderId;
      const { error } = await session.client.from("cj_projects").update(update).eq("id", args.project_id);
      if (error) throw new Error(`cj_update_project: ${error.message}`);
      return { ok: true, project: merged };
    },
  },

  // ── Tâches (5) ──
  {
    name: "cj_list_tasks",
    description:
      "Liste les tâches CockpitJourney du propriétaire du token, avec filtres optionnels (statut, projet, échéance, priorité). Trié par due_date asc puis priority asc. Idéal pour 'qu'est-ce qui m'attend cette semaine'.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["todo", "in_progress", "in_review", "done", "cancelled"], description: "Filtre par statut" },
        project_id: { type: "string", description: "Filtre par projet" },
        due_before: { type: "string", description: "Échéance ≤ cette date (ISO 8601)" },
        due_after: { type: "string", description: "Échéance ≥ cette date (ISO 8601)" },
        priority_max: { type: "number", enum: [1, 2, 3, 4], description: "Priorité ≤ N (1 = P1 critique, 4 = P4 nice-to-have)" },
        limit: { type: "number", minimum: 1, maximum: 200, description: "Max résultats (défaut 50)" },
      },
      additionalProperties: false,
    },
    async handler(args, session) {
      // deno-lint-ignore no-explicit-any
      let q: any = session.client.from("cj_tasks").select("id, project_id, status, priority, due_date, data");
      if (args.status) q = q.eq("status", args.status);
      if (args.project_id) q = q.eq("project_id", args.project_id);
      if (args.due_before) q = q.lte("due_date", args.due_before);
      if (args.due_after) q = q.gte("due_date", args.due_after);
      if (args.priority_max) q = q.lte("priority", args.priority_max);
      q = q.order("due_date", { ascending: true, nullsFirst: false }).order("priority", { ascending: true }).limit(args.limit ?? 50);
      const { data, error } = await q;
      if (error) throw new Error(`cj_list_tasks: ${error.message}`);
      return { count: data?.length ?? 0, tasks: (data ?? []).map(pickRow) };
    },
  },
  {
    name: "cj_create_task",
    description:
      "Crée une nouvelle tâche dans CockpitJourney. Si project_id n'est pas fourni, la tâche est créée dans la boîte d'entrée (Inbox).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1, description: "Titre de la tâche (obligatoire)" },
        project_id: { type: "string", description: "ID du projet (omis = inbox)" },
        priority: { type: "number", enum: [1, 2, 3, 4], description: "Priorité 1-4 (défaut 2)" },
        due_date: { type: "string", description: "Échéance ISO 8601 (ex: 2026-05-15T17:00:00Z)" },
        description: { type: "string", description: "Description / notes" },
        status: { type: "string", enum: ["todo", "in_progress", "in_review", "done"], description: "Statut initial (défaut todo)" },
      },
      required: ["title"],
      additionalProperties: false,
    },
    async handler(args, session) {
      requireScope(session, "write", "admin");
      const userPrefix = session.userId.slice(0, 8);
      const id = `${userPrefix}_t_${rand()}`;
      const now = new Date().toISOString();
      const projectId = args.project_id ?? null;

      // A task MUST have a valid sectionId to render in the Kanban. Resolve
      // it to the project's lowest-position section (position read from
      // data->>'position'). No project / no sections → sectionId stays null.
      let sectionId: string | null = null;
      if (projectId) {
        const { data: secs, error: secErr } = await session.client
          .from("cj_sections").select("id, data").eq("project_id", projectId);
        if (secErr) throw new Error(`cj_create_task (sections): ${secErr.message}`);
        if (secs && secs.length > 0) {
          // deno-lint-ignore no-explicit-any
          const sorted = [...secs].sort((a: any, b: any) => {
            const pa = Number((a.data ?? {}).position ?? 0);
            const pb = Number((b.data ?? {}).position ?? 0);
            return pa - pb;
          });
          // deno-lint-ignore no-explicit-any
          sectionId = (sorted[0] as any).id as string;
        }
      }

      // camelCase entity matching src/types/index.ts `Task` (the app reads `data`).
      const status = normTaskStatus(args.status ?? "todo");
      const data = {
        id,
        projectId,
        sectionId,
        title: args.title,
        description: args.description ?? "",
        status,
        priority: args.priority ?? 2,
        dueDate: args.due_date ?? null,
        assignees: [],
        tags: [],
        source: "manual",
        commentCount: 0,
        attachmentCount: 0,
        createdAt: now,
      };
      const { error } = await session.client.from("cj_tasks").insert({
        id, project_id: projectId, section_id: sectionId, status,
        priority: args.priority ?? 2, due_date: args.due_date ?? null, data, auth_user_id: session.userId,
      });
      if (error) throw new Error(`cj_create_task: ${error.message}`);
      return { ok: true, task: data };
    },
  },
  {
    name: "cj_update_task",
    description:
      "Met à jour une ou plusieurs propriétés d'une tâche existante. Le patch est mergé sur le `data` jsonb. Utile pour changer le titre, la priorité, l'échéance, etc.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "ID de la tâche" },
        patch: { type: "object", description: "Champs à modifier (title, priority, status, due_date, description, project_id…). Les autres champs restent inchangés." },
      },
      required: ["task_id", "patch"],
      additionalProperties: false,
    },
    async handler(args, session) {
      requireScope(session, "write", "admin");
      const { data: row, error: readErr } = await session.client.from("cj_tasks").select("data").eq("id", args.task_id).maybeSingle();
      if (readErr) throw new Error(`cj_update_task (read): ${readErr.message}`);
      if (!row) throw new Error(`Tâche ${args.task_id} introuvable`);
      const now = new Date().toISOString();
      const before = (row.data ?? {}) as Record<string, unknown>;
      const patch = camelizePatch(args.patch as Record<string, unknown>);
      const merged = { ...before, ...patch, updatedAt: now };
      const update: Record<string, unknown> = { data: merged };
      if ("status" in patch) update.status = patch.status;
      if ("priority" in patch) update.priority = patch.priority;
      if ("dueDate" in patch) update.due_date = patch.dueDate;
      if ("projectId" in patch) update.project_id = patch.projectId;
      if ("sectionId" in patch) update.section_id = patch.sectionId;
      const { error } = await session.client.from("cj_tasks").update(update).eq("id", args.task_id);
      if (error) throw new Error(`cj_update_task: ${error.message}`);
      // Le lien, le statut ou l'avancement manuel a bougé → les deux OKR
      // concernés se recalculent (l'ancien perd une contribution, le
      // nouveau en gagne une ; ou le poids de la contribution a changé).
      if ("status" in patch || "goalId" in patch || "progressPct" in patch) {
        const affected = new Set<string>();
        const prev = before.goalId as string | undefined;
        const next = (merged as Record<string, unknown>).goalId as string | undefined;
        if (prev) affected.add(prev);
        if (next) affected.add(next);
        for (const gid of affected) await recomputeGoalFromTasks(session, gid);
      }
      return { ok: true, task: merged };
    },
  },
  {
    name: "cj_complete_task",
    description: "Marque une tâche comme terminée (status = 'done', completionDate = now).",
    inputSchema: {
      type: "object",
      properties: { task_id: { type: "string", description: "ID de la tâche à compléter" } },
      required: ["task_id"],
      additionalProperties: false,
    },
    async handler(args, session) {
      requireScope(session, "write", "admin");
      const now = new Date().toISOString();
      const { data: row, error: readErr } = await session.client.from("cj_tasks").select("data").eq("id", args.task_id).maybeSingle();
      if (readErr) throw new Error(`cj_complete_task (read): ${readErr.message}`);
      if (!row) throw new Error(`Tâche ${args.task_id} introuvable`);
      const merged = { ...((row.data ?? {}) as Record<string, unknown>), status: "done", completionDate: now, updatedAt: now };
      const { error } = await session.client.from("cj_tasks").update({ status: "done", data: merged }).eq("id", args.task_id);
      if (error) throw new Error(`cj_complete_task: ${error.message}`);
      // Fait progresser l'OKR rattaché côté base (sinon il resterait figé
      // jusqu'à la prochaine ouverture du navigateur).
      const doneGoalId = ((merged as Record<string, unknown>).goalId as string | undefined) ?? null;
      if (doneGoalId) await recomputeGoalFromTasks(session, doneGoalId);
      return { ok: true, task_id: args.task_id, completed_at: now, goal_id: doneGoalId };
    },
  },
  {
    name: "cj_delete_task",
    description:
      "Supprime DÉFINITIVEMENT une tâche, ses sous-tâches et ses commentaires, et décrémente le compteur du projet. Irréversible : à n'utiliser que sur demande explicite (ex. nettoyage de doublons). Pour clore une tâche faite, utiliser cj_complete_task.",
    inputSchema: {
      type: "object",
      properties: { task_id: { type: "string", description: "ID de la tâche à supprimer définitivement" } },
      required: ["task_id"],
      additionalProperties: false,
    },
    async handler(args, session) {
      requireScope(session, "write", "admin");
      // On lit d'abord : il faut le projectId pour recaler taskCount, et
      // l'absence de ligne doit remonter une erreur claire plutôt qu'un
      // silence (une suppression qui ne supprime rien est un piège).
      const { data: row, error: readErr } = await session.client
        .from("cj_tasks").select("data, project_id").eq("id", args.task_id).maybeSingle();
      if (readErr) throw new Error(`cj_delete_task (read): ${readErr.message}`);
      if (!row) throw new Error(`Tâche ${args.task_id} introuvable`);
      const data = (row.data ?? {}) as Record<string, unknown>;
      const projectId = (row.project_id as string | null) ?? (data.projectId as string | undefined) ?? null;
      const goalId = (data.goalId as string | undefined) ?? null;

      // Dépendances d'abord : sinon elles survivraient à leur parent.
      await session.client.from("cj_subtasks").delete().eq("task_id", args.task_id);
      await session.client.from("cj_comments").delete().eq("task_id", args.task_id);

      const { error } = await session.client.from("cj_tasks").delete().eq("id", args.task_id);
      if (error) throw new Error(`cj_delete_task: ${error.message}`);

      // taskCount du projet : miroir dénormalisé, il dérive si on l'oublie.
      if (projectId) {
        const { data: proj } = await session.client
          .from("cj_projects").select("data").eq("id", projectId).maybeSingle();
        if (proj) {
          const pd = (proj.data ?? {}) as Record<string, unknown>;
          const next = Math.max(0, Number(pd.taskCount ?? 0) - 1);
          await session.client.from("cj_projects")
            .update({ data: { ...pd, taskCount: next, updatedAt: new Date().toISOString() } })
            .eq("id", projectId);
        }
      }

      // La tâche ne contribue plus : le goal doit refléter sa disparition.
      if (goalId) await recomputeGoalFromTasks(session, goalId);

      return { ok: true, deleted: args.task_id, project_id: projectId, goal_id: goalId };
    },
  },
  {
    name: "cj_add_subtasks",
    description:
      "Ajoute plusieurs sous-tâches à une tâche existante en lot. Idéal après un brainstorm : 'décompose cette tâche en 5 sous-étapes'.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "ID de la tâche parente" },
        subtasks: {
          type: "array", minItems: 1, maxItems: 50,
          items: {
            type: "object",
            properties: {
              title: { type: "string", minLength: 1 },
              status: { type: "string", enum: ["todo", "done"] },
              description: { type: "string" },
            },
            required: ["title"],
          },
        },
      },
      required: ["task_id", "subtasks"],
      additionalProperties: false,
    },
    async handler(args, session) {
      requireScope(session, "write", "admin");
      const userPrefix = session.userId.slice(0, 8);
      // camelCase entity matching appStore `Subtask` (the app reads `data`):
      // it uses `done: boolean` and `position: number` — NOT status/order.
      // deno-lint-ignore no-explicit-any
      const rows = (args.subtasks as any[]).map((s, i) => {
        const id = `${userPrefix}_st_${rand()}_${i}`;
        const data = {
          id, taskId: args.task_id, title: s.title, done: s.status === "done", position: i,
        };
        return { id, task_id: args.task_id, data, auth_user_id: session.userId };
      });
      const { error } = await session.client.from("cj_subtasks").insert(rows);
      if (error) throw new Error(`cj_add_subtasks: ${error.message}`);
      return { ok: true, count: rows.length, subtasks: rows.map((r) => r.data) };
    },
  },

  // ── OKR (3) ──
  {
    name: "cj_list_goals",
    description:
      "Liste les objectifs OKR du propriétaire du token, avec leur progression. Trié par due_date asc. Filtrable par statut et niveau (perso / équipe / entreprise).",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["on_track", "at_risk", "off_track", "achieved", "missed"], description: "Filtre par statut (défaut: tous)" },
        level: { type: "string", enum: ["personal", "team", "company", "workspace"], description: "Niveau hiérarchique" },
        limit: { type: "number", minimum: 1, maximum: 100, description: "Max résultats (défaut 50)" },
      },
      additionalProperties: false,
    },
    async handler(args, session) {
      // deno-lint-ignore no-explicit-any
      let q: any = session.client.from("cj_goals").select("id, owner_id, level, status, data, updated_at");
      if (args.status) q = q.eq("status", args.status);
      if (args.level) q = q.eq("level", args.level === "company" ? "workspace" : args.level);
      q = q.order("updated_at", { ascending: false }).limit(args.limit ?? 50);
      const { data, error } = await q;
      if (error) throw new Error(`cj_list_goals: ${error.message}`);
      const goals = (data ?? []).map((row: unknown) => {
        const g = pickRow(row) as Record<string, unknown>;
        const target = Number(g.targetValue ?? 0);
        const current = Number(g.currentValue ?? 0);
        const start = Number(g.startValue ?? 0);
        const denom = target - start || target || 1;
        const progress = Math.max(0, Math.min(100, ((current - start) / denom) * 100));
        return { ...g, progress_pct: Math.round(progress * 10) / 10 };
      });
      return { count: goals.length, goals };
    },
  },
  {
    name: "cj_create_goal",
    description:
      "Définit un nouvel OKR. target_value est la valeur visée, current_value démarre à start_value (0 par défaut), unit est l'unité ('€', '%', 'tâches', 'leads'...), due_date est l'échéance.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1 },
        target_value: { type: "number", description: "Valeur cible (ex: 100, 1000000)" },
        unit: { type: "string", description: "Unité (€, %, tâches, leads...)" },
        due_date: { type: "string", description: "Échéance ISO 8601" },
        level: { type: "string", enum: ["personal", "team", "company"], description: "Niveau (défaut personal)" },
        description: { type: "string", description: "Détails / pourquoi cet OKR" },
        start_value: { type: "number", description: "Valeur de départ (défaut 0)" },
      },
      required: ["title", "target_value", "unit", "due_date"],
      additionalProperties: false,
    },
    async handler(args, session) {
      requireScope(session, "write", "admin");
      const ownerId = await getProfileId(session);
      const userPrefix = session.userId.slice(0, 8);
      const id = `${userPrefix}_g_${rand()}`;
      const now = new Date().toISOString();
      const start = args.start_value ?? 0;
      // The app's Goal.level is 'workspace'|'team'|'personal'. Map the MCP
      // 'company' alias to 'workspace' so GoalsView renders it.
      const level = args.level === "company" ? "workspace" : (args.level ?? "personal");
      // camelCase entity matching src/types/index.ts `Goal` (the app reads `data`).
      const data = {
        id,
        title: args.title,
        description: args.description ?? "",
        ownerId,
        level,
        metricType: "number",
        targetValue: args.target_value,
        currentValue: start,
        startValue: start,
        unit: args.unit,
        period: "quarterly",
        startDate: now,
        endDate: args.due_date,
        dueDate: args.due_date,
        status: "on_track",
        health: "green",
        progressHistory: [{ at: now, value: start, note: "OKR créé" }],
        createdAt: now,
      };
      const { error } = await session.client.from("cj_goals").insert({
        id, owner_id: ownerId, level, status: "on_track", data, auth_user_id: session.userId,
      });
      if (error) throw new Error(`cj_create_goal: ${error.message}`);
      return { ok: true, goal: data };
    },
  },
  {
    name: "cj_update_goal_progress",
    description:
      "Met à jour la progression d'un OKR. Ajoute une entrée dans progressHistory pour traçabilité. Si current_value atteint target_value, le statut bascule automatiquement à 'achieved'.",
    inputSchema: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "ID de l'OKR" },
        current_value: { type: "number", description: "Nouvelle valeur de progression" },
        note: { type: "string", description: "Commentaire optionnel sur la mise à jour" },
      },
      required: ["goal_id", "current_value"],
      additionalProperties: false,
    },
    async handler(args, session) {
      requireScope(session, "write", "admin");
      const { data: row, error: readErr } = await session.client.from("cj_goals").select("data, status").eq("id", args.goal_id).maybeSingle();
      if (readErr) throw new Error(`cj_update_goal_progress (read): ${readErr.message}`);
      if (!row) throw new Error(`OKR ${args.goal_id} introuvable`);
      const now = new Date().toISOString();
      const existing = (row.data ?? {}) as Record<string, unknown>;
      const history = Array.isArray(existing.progressHistory) ? existing.progressHistory : [];
      const target = Number(existing.targetValue ?? 0);
      const reached = args.current_value >= target;
      const merged = {
        ...existing, currentValue: args.current_value,
        status: reached ? "achieved" : (existing.status ?? "on_track"),
        progressHistory: [...history, { at: now, value: args.current_value, note: args.note ?? null }],
        updatedAt: now,
      };
      const { error } = await session.client.from("cj_goals").update({ data: merged, status: reached ? "achieved" : row.status }).eq("id", args.goal_id);
      if (error) throw new Error(`cj_update_goal_progress: ${error.message}`);
      return { ok: true, achieved: reached, goal: merged };
    },
  },

  // ── Communication (2) ──
  {
    name: "cj_add_comment",
    description:
      "Ajoute un commentaire sur une tâche. Mentions optionnelles : liste d'emails ou d'IDs utilisateur — déclenche les notifications dans CockpitJourney.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "ID de la tâche cible" },
        text: { type: "string", minLength: 1, description: "Contenu du commentaire (texte simple)" },
        mentions: { type: "array", items: { type: "string" }, description: "@mentions par email ou user_id (déclenche notifications)" },
      },
      required: ["task_id", "text"],
      additionalProperties: false,
    },
    async handler(args, session) {
      requireScope(session, "write", "admin");
      const authorId = await getProfileId(session);
      const userPrefix = session.userId.slice(0, 8);
      const id = `${userPrefix}_c_${rand()}`;
      const now = new Date().toISOString();
      // camelCase entity matching src/types/index.ts `Comment` (the app reads `data`).
      // The store's addComment uses `body`. Mentions kept as an extra field.
      const data = {
        id, taskId: args.task_id, authorId, body: args.text, createdAt: now,
        mentions: args.mentions ?? [],
      };
      const { error } = await session.client.from("cj_comments").insert({
        id, task_id: args.task_id, author_id: authorId, data, auth_user_id: session.userId,
      });
      if (error) throw new Error(`cj_add_comment: ${error.message}`);
      return { ok: true, comment: data };
    },
  },
  {
    name: "cj_add_note",
    description:
      "Ajoute une note libre (markdown) à une tâche. Différent d'un commentaire : la note est un contenu structuré (notes de réunion, décisions, références), affiché dans le panneau latéral de la tâche.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "ID de la tâche cible" },
        content: { type: "string", minLength: 1, description: "Contenu markdown de la note" },
      },
      required: ["task_id", "content"],
      additionalProperties: false,
    },
    async handler(args, session) {
      requireScope(session, "write", "admin");
      const now = new Date().toISOString();
      // camelCase entity matching appStore `TaskNote` (the app reads `data`):
      // { taskId, markdown, updatedAt }. PK is task_id (no `id` column).
      const data = {
        taskId: args.task_id, markdown: args.content, updatedAt: now,
      };
      const { error } = await session.client.from("cj_notes").upsert(
        { task_id: args.task_id, data, auth_user_id: session.userId },
        { onConflict: "task_id" },
      );
      if (error) throw new Error(`cj_add_note: ${error.message}`);
      return { ok: true, note: data };
    },
  },

  // ── Équipe (2) ──
  {
    name: "cj_list_team_members",
    description:
      "Liste les membres de l'équipe CockpitJourney (table partagée licence_seats). Renvoie email, nom complet, rôle, statut, et stats de connexion.",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string", enum: ["active", "pending", "suspended"], description: "Filtre par statut (défaut: tous)" } },
      additionalProperties: false,
    },
    async handler(args, session) {
      // deno-lint-ignore no-explicit-any
      let q: any = session.client.from("licence_seats").select(
        "id, email, full_name, role, status, user_id, invitation_sent_at, invitation_accepted_at, last_login, login_count, created_at",
      );
      if (args.status) q = q.eq("status", args.status);
      q = q.order("role", { ascending: true }).order("email", { ascending: true });
      const { data, error } = await q;
      if (error) throw new Error(`cj_list_team_members: ${error.message}`);
      // deno-lint-ignore no-explicit-any
      const members = ((data ?? []) as any[]).map((s) => {
        const isPending = !s.invitation_accepted_at && s.status === "active";
        return { ...s, display_status: s.status === "suspended" ? "suspended" : isPending ? "pending" : "active" };
      });
      return { count: members.length, members };
    },
  },
  {
    name: "cj_invite_member",
    description:
      "Invite un nouveau membre dans l'équipe CockpitJourney. Envoie l'e-mail d'invitation via la fonction partagée Atlas Studio. Le PAT doit avoir le scope 'admin'.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", format: "email", description: "E-mail de la personne à inviter" },
        full_name: { type: "string", description: "Nom complet (optionnel)" },
        role: { type: "string", enum: ["editor", "viewer", "app_admin"], description: "Rôle (défaut editor)." },
      },
      required: ["email"],
      additionalProperties: false,
    },
    async handler(args, session) {
      requireScope(session, "admin");
      const { data: mySeat, error: seatErr } = await session.client
        .from("licence_seats").select("licence_id, tenant_id, role").eq("user_id", session.userId).eq("status", "active").maybeSingle();
      if (seatErr) throw new Error(`cj_invite_member (seat): ${seatErr.message}`);
      if (!mySeat) throw new Error("Vous n'avez pas de seat actif dans cette licence — impossible d'inviter.");
      const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-user`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.accessToken}`, apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(args.email).trim().toLowerCase(), full_name: args.full_name ?? null,
          role: args.role ?? "editor", licence_id: mySeat.licence_id, tenant_id: mySeat.tenant_id,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(`cj_invite_member: ${json.error ?? `HTTP ${res.status}`}`);
      return { ok: true, invited: { email: args.email, role: args.role ?? "editor" } };
    },
  },

  // ── Vue d'ensemble (2) ──
  {
    name: "cj_get_dashboard",
    description:
      "Vue d'ensemble du cockpit : tâches en retard, dues aujourd'hui, OKR avancement, projets actifs. Ne prend aucun argument — répond avec une synthèse exécutive prête pour le Daily Brief.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
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
        session.client.from("cj_tasks").select("id, priority, due_date, data").lt("due_date", startOfDay).neq("status", "done").neq("status", "cancelled").order("due_date", { ascending: true }).limit(20),
        session.client.from("cj_tasks").select("id, priority, due_date, data").gte("due_date", startOfDay).lt("due_date", endOfDay).neq("status", "done").order("priority", { ascending: true }).limit(20),
        session.client.from("cj_tasks").select("id", { count: "exact", head: true }).neq("status", "done").neq("status", "cancelled"),
        session.client.from("cj_projects").select("id, data").eq("status", "active").order("updated_at", { ascending: false }).limit(10),
        session.client.from("cj_goals").select("id, data").not("status", "in", "(achieved,missed)").order("updated_at", { ascending: false }).limit(20),
      ]);
      if (e1) throw new Error(`dashboard.overdue: ${e1.message}`);
      if (e2) throw new Error(`dashboard.today: ${e2.message}`);
      if (e3) throw new Error(`dashboard.open: ${e3.message}`);
      if (e4) throw new Error(`dashboard.projects: ${e4.message}`);
      if (e5) throw new Error(`dashboard.goals: ${e5.message}`);
      const goalProgress = (activeGoals ?? []).map((row: unknown) => {
        const g = pickRow(row) as Record<string, unknown>;
        const target = Number(g.targetValue ?? 0);
        const current = Number(g.currentValue ?? 0);
        const start = Number(g.startValue ?? 0);
        const denom = target - start || target || 1;
        const pct = Math.max(0, Math.min(100, ((current - start) / denom) * 100));
        return { id: g.id, title: g.title, progress_pct: Math.round(pct * 10) / 10, on_track: pct >= 50, due_date: g.dueDate, due_date_iso: g.endDate };
      });
      return {
        generated_at: now.toISOString(),
        tasks: {
          overdue_count: overdue?.length ?? 0, overdue: (overdue ?? []).map(pickRow),
          today_count: today?.length ?? 0, today: (today ?? []).map(pickRow),
          open_total: openTasks?.length ?? 0,
        },
        projects: { active_count: activeProjects?.length ?? 0, active: (activeProjects ?? []).map(pickRow) },
        goals: { active_count: goalProgress.length, on_track_count: goalProgress.filter((g) => g.on_track).length, items: goalProgress },
      };
    },
  },
  {
    name: "cj_search",
    description:
      "Recherche globale dans les projets, tâches et notes du propriétaire du token. Match insensible à la casse sur le contenu jsonb (nom, titre, description, markdown).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, description: "Termes recherchés" },
        limit: { type: "number", minimum: 1, maximum: 100, description: "Max résultats par catégorie (défaut 20)" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    async handler(args, session) {
      const limit = args.limit ?? 20;
      const pattern = `%${args.query}%`;
      const [{ data: projects }, { data: tasks }, { data: notes }] = await Promise.all([
        session.client.from("cj_projects").select("id, status, data, updated_at").ilike("data->>name", pattern).limit(limit),
        session.client.from("cj_tasks").select("id, status, priority, due_date, data, updated_at").ilike("data->>title", pattern).limit(limit),
        session.client.from("cj_notes").select("task_id, data, updated_at").ilike("data->>markdown", pattern).limit(limit),
      ]);
      return {
        query: args.query,
        results: {
          projects: (projects ?? []).map(pickRow),
          tasks: (tasks ?? []).map(pickRow),
          // deno-lint-ignore no-explicit-any
          notes: (notes ?? []).map((row: any) => ({ ...((row.data ?? {}) as Record<string, unknown>), task_id: row.task_id })),
        },
      };
    },
  },
];

// ─────────────────────────── JSON-RPC (MCP) ───────────────────────────
// deno-lint-ignore no-explicit-any
async function handleRpc(msg: any, pat: string): Promise<any | null> {
  const id = msg?.id;
  const method = msg?.method;
  const params = msg?.params ?? {};

  // Notifications (no id) — acknowledge silently.
  if (typeof method === "string" && method.startsWith("notifications/")) return null;

  if (method === "initialize") {
    const pv = typeof params.protocolVersion === "string" ? params.protocolVersion : PROTOCOL_VERSION;
    return { jsonrpc: "2.0", id, result: { protocolVersion: pv, capabilities: { tools: {} }, serverInfo: SERVER_INFO } };
  }
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) } };
  }
  if (method === "tools/call") {
    const name = params?.name;
    const args = params?.arguments ?? {};
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) return { jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: `Outil inconnu: ${name}` }] } };
    if (!pat) return { jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: "Token manquant dans l'URL du connecteur (?token=cj_...)." }] } };
    try {
      const session = await getSession(pat);
      const result = await tool.handler(args, session);
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] } };
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      return { jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: `Erreur CockpitJourney : ${m}` }] } };
    }
  }
  if (id === undefined || id === null) return null;
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Méthode inconnue: ${method}` } };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  const pat = url.searchParams.get("token") ?? url.searchParams.get("t") ?? "";

  if (req.method === "GET") {
    // No server-initiated SSE stream offered → 405 per MCP Streamable HTTP spec.
    return new Response(JSON.stringify({ error: "Method Not Allowed — POST des messages JSON-RPC MCP sur ce endpoint." }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: cors });

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (Array.isArray(body)) {
    const out = [];
    for (const m of body) {
      const r = await handleRpc(m, pat);
      if (r) out.push(r);
    }
    if (out.length === 0) return new Response(null, { status: 202, headers: cors });
    return new Response(JSON.stringify(out), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  const r = await handleRpc(body, pat);
  if (!r) return new Response(null, { status: 202, headers: cors });
  return new Response(JSON.stringify(r), { headers: { ...cors, "Content-Type": "application/json" } });
});
