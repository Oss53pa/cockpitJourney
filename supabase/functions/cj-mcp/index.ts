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

// ─────────────────────────── Tools (18) ───────────────────────────
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
      "Crée un nouveau projet. Génère automatiquement un slug et un id namespaced. Le projet est créé sans sections — utiliser cj_create_task pour ajouter du contenu.",
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
      const data = {
        id,
        name: args.name,
        slug: slugify(args.name),
        description: args.description ?? "",
        color: args.color ?? "#6E8B58",
        icon: args.icon ?? "briefcase",
        status: "active",
        folder_id: args.folder_id ?? null,
        owner_id: ownerId,
        created_at: now,
        updated_at: now,
        created_via: "mcp",
      };
      const { error } = await session.client.from("cj_projects").insert({
        id, folder_id: args.folder_id ?? null, owner_id: ownerId, status: "active", data, auth_user_id: session.userId,
      });
      if (error) throw new Error(`cj_create_project: ${error.message}`);
      return { ok: true, project: data };
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
      const merged = { ...((row.data ?? {}) as Record<string, unknown>), ...args.patch, updated_at: now };
      const update: Record<string, unknown> = { data: merged };
      if ("status" in args.patch) update.status = args.patch.status;
      if ("folder_id" in args.patch) update.folder_id = args.patch.folder_id;
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
        priority: { type: "number", enum: [1, 2, 3, 4], description: "Priorité 1-4 (défaut 3)" },
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
      const data = {
        id, title: args.title, project_id: args.project_id ?? null, priority: args.priority ?? 3,
        status: args.status ?? "todo", due_date: args.due_date ?? null, description: args.description ?? "",
        assignees: [], tags: [], created_at: now, updated_at: now, created_via: "mcp",
      };
      const { error } = await session.client.from("cj_tasks").insert({
        id, project_id: args.project_id ?? null, status: args.status ?? "todo", priority: args.priority ?? 3,
        due_date: args.due_date ?? null, data, auth_user_id: session.userId,
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
      const merged = { ...((row.data ?? {}) as Record<string, unknown>), ...args.patch, updated_at: now };
      const update: Record<string, unknown> = { data: merged };
      if ("status" in args.patch) update.status = args.patch.status;
      if ("priority" in args.patch) update.priority = args.patch.priority;
      if ("due_date" in args.patch) update.due_date = args.patch.due_date;
      if ("project_id" in args.patch) update.project_id = args.patch.project_id;
      const { error } = await session.client.from("cj_tasks").update(update).eq("id", args.task_id);
      if (error) throw new Error(`cj_update_task: ${error.message}`);
      return { ok: true, task: merged };
    },
  },
  {
    name: "cj_complete_task",
    description: "Marque une tâche comme terminée (status = 'done', completed_at = now).",
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
      const merged = { ...((row.data ?? {}) as Record<string, unknown>), status: "done", completed_at: now, updated_at: now };
      const { error } = await session.client.from("cj_tasks").update({ status: "done", data: merged }).eq("id", args.task_id);
      if (error) throw new Error(`cj_complete_task: ${error.message}`);
      return { ok: true, task_id: args.task_id, completed_at: now };
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
      const now = new Date().toISOString();
      // deno-lint-ignore no-explicit-any
      const rows = (args.subtasks as any[]).map((s, i) => {
        const id = `${userPrefix}_st_${rand()}_${i}`;
        const data = {
          id, task_id: args.task_id, title: s.title, status: s.status ?? "todo",
          description: s.description ?? "", order: i, created_at: now, updated_at: now, created_via: "mcp",
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
        status: { type: "string", enum: ["active", "achieved", "missed", "cancelled"], description: "Filtre par statut (défaut: actifs uniquement)" },
        level: { type: "string", enum: ["personal", "team", "company"], description: "Niveau hiérarchique" },
        limit: { type: "number", minimum: 1, maximum: 100, description: "Max résultats (défaut 50)" },
      },
      additionalProperties: false,
    },
    async handler(args, session) {
      // deno-lint-ignore no-explicit-any
      let q: any = session.client.from("cj_goals").select("id, owner_id, level, status, data, updated_at");
      q = q.eq("status", args.status ?? "active");
      if (args.level) q = q.eq("level", args.level);
      q = q.order("updated_at", { ascending: false }).limit(args.limit ?? 50);
      const { data, error } = await q;
      if (error) throw new Error(`cj_list_goals: ${error.message}`);
      const goals = (data ?? []).map((row: unknown) => {
        const g = pickRow(row) as Record<string, unknown>;
        const target = Number(g.target_value ?? 0);
        const current = Number(g.current_value ?? 0);
        const start = Number(g.start_value ?? 0);
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
      const data = {
        id, title: args.title, description: args.description ?? "", target_value: args.target_value,
        start_value: start, current_value: start, unit: args.unit, due_date: args.due_date,
        level: args.level ?? "personal", status: "active", owner_id: ownerId,
        progress_history: [{ at: now, value: start, note: "OKR créé" }],
        created_at: now, updated_at: now, created_via: "mcp",
      };
      const { error } = await session.client.from("cj_goals").insert({
        id, owner_id: ownerId, level: args.level ?? "personal", status: "active", data, auth_user_id: session.userId,
      });
      if (error) throw new Error(`cj_create_goal: ${error.message}`);
      return { ok: true, goal: data };
    },
  },
  {
    name: "cj_update_goal_progress",
    description:
      "Met à jour la progression d'un OKR. Ajoute une entrée dans progress_history pour traçabilité. Si current_value atteint target_value, le statut bascule automatiquement à 'achieved'.",
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
      const history = Array.isArray(existing.progress_history) ? existing.progress_history : [];
      const target = Number(existing.target_value ?? 0);
      const reached = args.current_value >= target;
      const merged = {
        ...existing, current_value: args.current_value,
        status: reached ? "achieved" : (existing.status ?? "active"),
        progress_history: [...history, { at: now, value: args.current_value, note: args.note ?? null }],
        updated_at: now, ...(reached ? { achieved_at: now } : {}),
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
      const data = {
        id, task_id: args.task_id, author_id: authorId, author_email: session.email,
        text: args.text, mentions: args.mentions ?? [], created_at: now, updated_at: now, created_via: "mcp",
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
      const userPrefix = session.userId.slice(0, 8);
      const noteId = `${userPrefix}_n_${rand()}`;
      const data = {
        id: noteId, task_id: args.task_id, content: args.content, author_id: session.userId,
        author_email: session.email, created_at: now, updated_at: now, created_via: "mcp",
      };
      const { error } = await session.client.from("cj_notes").insert({ task_id: args.task_id, data, auth_user_id: session.userId });
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
        session.client.from("cj_goals").select("id, data").eq("status", "active").order("updated_at", { ascending: false }).limit(20),
      ]);
      if (e1) throw new Error(`dashboard.overdue: ${e1.message}`);
      if (e2) throw new Error(`dashboard.today: ${e2.message}`);
      if (e3) throw new Error(`dashboard.open: ${e3.message}`);
      if (e4) throw new Error(`dashboard.projects: ${e4.message}`);
      if (e5) throw new Error(`dashboard.goals: ${e5.message}`);
      const goalProgress = (activeGoals ?? []).map((row: unknown) => {
        const g = pickRow(row) as Record<string, unknown>;
        const target = Number(g.target_value ?? 0);
        const current = Number(g.current_value ?? 0);
        const start = Number(g.start_value ?? 0);
        const denom = target - start || target || 1;
        const pct = Math.max(0, Math.min(100, ((current - start) / denom) * 100));
        return { id: g.id, title: g.title, progress_pct: Math.round(pct * 10) / 10, on_track: pct >= 50, due_date: g.due_date };
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
      "Recherche globale dans les projets, tâches et notes du propriétaire du token. Match insensible à la casse sur le contenu jsonb (nom, titre, description, content).",
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
        session.client.from("cj_notes").select("task_id, data, updated_at").ilike("data->>content", pattern).limit(limit),
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
