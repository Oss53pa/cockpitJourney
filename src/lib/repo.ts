// Supabase-backed repository for CockpitJourney.
//
// Public API mirrors the previous Dexie module so the rest of the app
// (and notably src/stores/appStore.ts) stays unchanged:
//   - loadSnapshot()
//   - persist.put / bulkPut / delete / bulkDelete / setSetting
//   - flushWrites()
//   - wipeDatabase()  // wipes only the current profile's cj_* rows
//
// All cj_* tables use a hybrid schema: indexed columns + a `data jsonb`
// column holding the full app entity. Reads always extract `data`.

import { supabase, SUPABASE_CONFIGURED } from './supabase';
import type {
  User,
  Folder,
  Project,
  Section,
  Task,
  Goal,
  Comment,
  Notification,
  PropheticInsight,
  BudgetLine,
  Expense,
} from '../types';
import type {
  AutomationRule,
  IntakeForm,
  Report,
  Attachment,
  TaskDependency,
  ActivityEvent,
  TaskNote,
  Subtask,
} from '../stores/appStore';

/* ───────────── Table mapping ───────────── */

export type AppTable =
  | 'users'
  | 'folders'
  | 'projects'
  | 'sections'
  | 'tasks'
  | 'subtasks'
  | 'goals'
  | 'comments'
  | 'notifications'
  | 'insights'
  | 'automations'
  | 'forms'
  | 'reports'
  | 'attachments'
  | 'dependencies'
  | 'activity'
  | 'notes'
  | 'budgetLines'
  | 'expenses';

const sqlTableFor: Record<AppTable, string> = {
  users: 'cj_profiles',
  folders: 'cj_folders',
  projects: 'cj_projects',
  sections: 'cj_sections',
  tasks: 'cj_tasks',
  subtasks: 'cj_subtasks',
  goals: 'cj_goals',
  comments: 'cj_comments',
  notifications: 'cj_notifications',
  insights: 'cj_insights',
  automations: 'cj_automations',
  forms: 'cj_forms',
  reports: 'cj_reports',
  attachments: 'cj_attachments',
  dependencies: 'cj_dependencies',
  activity: 'cj_activity',
  notes: 'cj_notes',
  budgetLines: 'cj_budget_lines',
  expenses: 'cj_expenses',
};

/**
 * Extract indexed columns out of an entity. The `data` jsonb always holds
 * the FULL entity; these are duplicated for filtering/RLS/joins later.
 */
type Indexed = Record<string, unknown>;

function indexedColsFor(table: AppTable, entity: Record<string, unknown>): Indexed {
  switch (table) {
    case 'projects':
      return {
        folder_id: entity.folderId ?? null,
        owner_id: entity.ownerId ?? null,
        status: entity.status ?? null,
      };
    case 'sections':
      return { project_id: entity.projectId ?? null };
    case 'tasks':
      return {
        project_id: entity.projectId ?? null,
        section_id: entity.sectionId ?? null,
        parent_task_id: entity.parentTaskId ?? null,
        status: entity.status ?? null,
        priority: entity.priority ?? null,
        due_date: entity.dueDate ?? null,
      };
    case 'subtasks':
      return { task_id: entity.taskId ?? null };
    case 'goals':
      return {
        owner_id: entity.ownerId ?? null,
        level: entity.level ?? null,
        status: entity.status ?? null,
      };
    case 'comments':
      return {
        task_id: entity.taskId ?? null,
        author_id: entity.authorId ?? null,
      };
    case 'notifications':
      return {
        // Notifications without an explicit recipient are scoped to the
        // current self-profile (defined at boot by linkAuthUserToProfile).
        // currentProfileId is always set when buildRow is called because
        // setCurrentAuthUserId throws otherwise.
        user_id: (entity.userId ?? currentProfileId ?? '') as string,
        read: !!entity.read,
      };
    case 'insights':
      return { kind: entity.kind ?? null };
    case 'automations':
      return { enabled: !!entity.enabled };
    case 'forms':
      return {
        project_id: entity.projectId ?? null,
        enabled: entity.enabled ?? true,
      };
    case 'reports':
      return {
        kind: entity.kind ?? null,
        generated_at: entity.generatedAt ?? new Date().toISOString(),
      };
    case 'attachments':
      return { task_id: entity.taskId ?? null };
    case 'dependencies':
      return {
        task_id: entity.taskId ?? null,
        related_task_id: entity.relatedTaskId ?? null,
      };
    case 'activity':
      return {
        task_id: entity.taskId ?? null,
        project_id: entity.projectId ?? null,
        actor_id: entity.actorId ?? null,
      };
    case 'budgetLines':
      return {
        project_id: entity.projectId,
        owner_id: entity.ownerId ?? null,
        name: entity.name,
        allocated_amount: entity.allocatedAmount ?? 0,
        currency: entity.currency ?? 'XOF',
        sort_order: entity.sortOrder ?? 0,
      };
    case 'expenses':
      return {
        project_id: entity.projectId,
        line_id: entity.lineId ?? null,
        task_id: entity.taskId ?? null,
        label: entity.label,
        amount: entity.amount ?? 0,
        currency: entity.currency ?? 'XOF',
        status: entity.status ?? 'paid',
        expense_date: entity.expenseDate ?? new Date().toISOString().slice(0, 10),
        vendor: entity.vendor ?? null,
      };
    default:
      return {};
  }
}

/**
 * Build the row to insert into Supabase. Always includes id + data + auth_user_id.
 * For cj_notes the PK is task_id (no `id` column).
 * For cj_settings the PK is (profile_id, key) — handled separately.
 */
function buildRow(table: AppTable, entity: Record<string, unknown>) {
  const authUserId = getCurrentAuthUserId();
  if (!authUserId) {
    throw new Error(`[repo] cannot write to ${table}: no authenticated user. Sign in first.`);
  }
  if (table === 'notes') {
    return {
      task_id: entity.taskId,
      auth_user_id: authUserId,
      data: entity,
    };
  }
  return {
    id: entity.id as string,
    auth_user_id: authUserId,
    ...indexedColsFor(table, entity),
    data: entity,
  };
}

/** Return the PK column name. */
function pkColumn(table: AppTable): string {
  return table === 'notes' ? 'task_id' : 'id';
}

/* ───────────── Read: snapshot ───────────── */

export interface Snapshot {
  users: User[];
  folders: Folder[];
  projects: Project[];
  sections: Section[];
  tasks: Task[];
  goals: Goal[];
  comments: Comment[];
  notifications: Notification[];
  insights: PropheticInsight[];
  automations: AutomationRule[];
  forms: IntakeForm[];
  reports: Report[];
  attachments: Attachment[];
  dependencies: TaskDependency[];
  activity: ActivityEvent[];
  notes: TaskNote[];
  subtasks: Subtask[];
  budgetLines: BudgetLine[];
  expenses: Expense[];
  settings: Record<string, unknown>;
}

async function fetchData<T>(sqlTable: string): Promise<T[]> {
  // Fetch in pages of 1000 to bypass the default REST limit.
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const to = from + PAGE - 1;
    const { data, error } = await supabase.from(sqlTable).select('data').range(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) out.push((row as { data: T }).data);
    if (data.length < PAGE) break;
  }
  return out;
}

/**
 * Backfill missing fields on rows loaded from Supabase so the UI never
 * crashes on `.map()` / `.toUpperCase()` / `${undefined}%`.
 *
 * Older seeds (and the freshly-fixed clean-starter before it shipped)
 * persisted rows without all required fields. Rather than running a
 * one-off migration on every user's data, we normalize at read-time —
 * the cache mirror picks up the normalized shape on next write, so the
 * defensive code only matters once per legacy row.
 */
export function normalizeProject(p: Project): Project {
  return {
    ...p,
    health: p.health ?? 'green',
    progress: typeof p.progress === 'number' ? p.progress : 0,
    taskCount: typeof p.taskCount === 'number' ? p.taskCount : 0,
    membersIds: Array.isArray(p.membersIds) && p.membersIds.length > 0 ? p.membersIds : [p.ownerId],
  };
}

export function normalizeFolder(f: Folder): Folder {
  // Sphere defaults to 'personnel' for any legacy row pre-2026-05-17
  // that hasn't been classified yet (SQL migration covers the prod row
  // set; this guard handles offline mocks, fresh dev seeds, etc.).
  const sphere = f.sphere ?? 'personnel';
  return {
    ...f,
    sphere,
    projectIds: Array.isArray(f.projectIds) ? f.projectIds : [],
  };
}

export function normalizeSection(s: Section): Section {
  // Older seeds wrote `order` instead of `position`, and skipped `color`.
  const legacyOrder = (s as unknown as { order?: number }).order;
  return {
    ...s,
    color: s.color ?? '#94A3B8',
    position: typeof s.position === 'number' ? s.position : typeof legacyOrder === 'number' ? legacyOrder : 0,
  };
}

export async function loadSnapshot(): Promise<Snapshot> {
  if (!SUPABASE_CONFIGURED) {
    return emptySnapshot();
  }

  // All 17 entity tables + cj_settings load in a single parallel wave.
  // The previous version awaited loadSettings() AFTER the 17 fetches
  // resolved, costing one extra serial round-trip (~200ms) for no
  // reason — settings live in their own table with its own PK and
  // don't depend on any entity row.
  const [
    users,
    folders,
    projects,
    sections,
    tasks,
    goals,
    comments,
    notifications,
    insights,
    automations,
    forms,
    reports,
    attachments,
    dependencies,
    activity,
    notes,
    subtasks,
    budgetLines,
    expenses,
    settings,
  ] = await Promise.all([
    fetchData<User>('cj_profiles'),
    fetchData<Folder>('cj_folders'),
    fetchData<Project>('cj_projects'),
    fetchData<Section>('cj_sections'),
    fetchData<Task>('cj_tasks'),
    fetchData<Goal>('cj_goals'),
    fetchData<Comment>('cj_comments'),
    fetchData<Notification>('cj_notifications'),
    fetchData<PropheticInsight>('cj_insights'),
    fetchData<AutomationRule>('cj_automations'),
    fetchData<IntakeForm>('cj_forms'),
    fetchData<Report>('cj_reports'),
    fetchData<Attachment>('cj_attachments'),
    fetchData<TaskDependency>('cj_dependencies'),
    fetchData<ActivityEvent>('cj_activity'),
    fetchData<TaskNote>('cj_notes'),
    fetchData<Subtask>('cj_subtasks'),
    fetchData<BudgetLine>('cj_budget_lines'),
    fetchData<Expense>('cj_expenses'),
    loadSettings(),
  ]);

  return {
    users,
    folders: folders.map(normalizeFolder),
    projects: projects.map(normalizeProject),
    sections: sections.map(normalizeSection),
    tasks,
    goals,
    comments,
    notifications,
    insights,
    automations,
    forms,
    reports,
    attachments,
    dependencies,
    activity,
    notes,
    subtasks,
    budgetLines,
    expenses,
    settings,
  };
}

function emptySnapshot(): Snapshot {
  return {
    users: [],
    folders: [],
    projects: [],
    sections: [],
    tasks: [],
    goals: [],
    comments: [],
    notifications: [],
    insights: [],
    automations: [],
    forms: [],
    reports: [],
    attachments: [],
    dependencies: [],
    activity: [],
    notes: [],
    subtasks: [],
    budgetLines: [],
    expenses: [],
    settings: {},
  };
}

/* ───────────── Auth context (set by appStore on session change) ───────────── */

let currentProfileId: string | null = null;
let currentAuthUserId: string | null = null;

/** Set by the auth bootstrap once we know which profile is active. */
export function setCurrentProfileId(id: string | null) {
  currentProfileId = id;
}

export function getCurrentProfileId(): string | null {
  return currentProfileId;
}

/** Set by appStore.bootstrap as soon as the auth session resolves. */
export function setCurrentAuthUserId(id: string | null) {
  currentAuthUserId = id;
}

export function getCurrentAuthUserId(): string | null {
  return currentAuthUserId;
}

async function loadSettings(): Promise<Record<string, unknown>> {
  if (!currentProfileId) return {};
  const { data, error } = await supabase
    .from('cj_settings')
    .select('key,value')
    .eq('profile_id', currentProfileId);
  if (error) {
    console.error('[repo] loadSettings failed', error);
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const row of data ?? []) {
    out[(row as { key: string }).key] = (row as { value: unknown }).value;
  }
  return out;
}

/* ───────────── Write: persist (write-through) ───────────── */

const writeQueue: Promise<unknown>[] = [];

function track<T>(p: Promise<T>): Promise<T> {
  writeQueue.push(p as unknown as Promise<unknown>);
  p.finally(() => {
    const i = writeQueue.indexOf(p as unknown as Promise<unknown>);
    if (i >= 0) writeQueue.splice(i, 1);
  });
  return p;
}

/** Wait for all pending writes (tests, before-unload). */
export async function flushWrites(): Promise<void> {
  while (writeQueue.length) {
    await Promise.allSettled([...writeQueue]);
  }
}

async function upsertOne(table: AppTable, entity: Record<string, unknown>): Promise<void> {
  if (!SUPABASE_CONFIGURED) return;
  const sqlTable = sqlTableFor[table];
  const row = buildRow(table, entity) as Record<string, unknown>;
  const onConflict = table === 'notes' ? 'task_id' : 'id';
  const { error } = await supabase.from(sqlTable).upsert(row as never, { onConflict });
  if (error) {
    console.error(`[repo] upsert ${table} failed`, error, row);
  }
}

async function upsertMany(table: AppTable, entities: Record<string, unknown>[]): Promise<void> {
  if (!SUPABASE_CONFIGURED || entities.length === 0) return;
  const sqlTable = sqlTableFor[table];
  const rows = entities.map((e) => buildRow(table, e) as Record<string, unknown>);
  const onConflict = table === 'notes' ? 'task_id' : 'id';
  const { error } = await supabase.from(sqlTable).upsert(rows as never, { onConflict });
  if (error) {
    console.error(`[repo] bulkUpsert ${table} failed`, error);
  }
}

async function deleteOne(table: AppTable, key: string): Promise<void> {
  if (!SUPABASE_CONFIGURED) return;
  const sqlTable = sqlTableFor[table];
  const pk = pkColumn(table);
  const { error } = await supabase.from(sqlTable).delete().eq(pk, key);
  if (error) {
    console.error(`[repo] delete ${table} failed`, error);
  }
}

async function deleteMany(table: AppTable, keys: string[]): Promise<void> {
  if (!SUPABASE_CONFIGURED || keys.length === 0) return;
  const sqlTable = sqlTableFor[table];
  const pk = pkColumn(table);
  const { error } = await supabase.from(sqlTable).delete().in(pk, keys);
  if (error) {
    console.error(`[repo] bulkDelete ${table} failed`, error);
  }
}

async function setSettingFn(key: string, value: unknown): Promise<void> {
  if (!SUPABASE_CONFIGURED || !currentProfileId || !currentAuthUserId) return;
  const { error } = await supabase.from('cj_settings').upsert(
    {
      profile_id: currentProfileId,
      auth_user_id: currentAuthUserId,
      key,
      value,
    },
    { onConflict: 'profile_id,key' }
  );
  if (error) {
    console.error('[repo] setSetting failed', error);
  }
}

export const persist = {
  put<T extends Record<string, unknown> | object>(table: AppTable, item: T) {
    return track(upsertOne(table, item as unknown as Record<string, unknown>));
  },
  bulkPut<T extends Record<string, unknown> | object>(table: AppTable, items: T[]) {
    return track(upsertMany(table, items as unknown as Record<string, unknown>[]));
  },
  delete(table: AppTable, key: string) {
    return track(deleteOne(table, key));
  },
  bulkDelete(table: AppTable, keys: string[]) {
    return track(deleteMany(table, keys));
  },
  setSetting(key: string, value: unknown) {
    return track(setSettingFn(key, value));
  },
};

/* ───────────── Bulk wipe (used by Settings → Réinitialiser) ───────────── */

const TABLE_ORDER_REVERSE: AppTable[] = [
  // FK-safe deletion order: leaves first, roots last.
  'notes',
  'subtasks',
  'attachments',
  'dependencies',
  'activity',
  'comments',
  // Budget: expenses reference budgetLines (and tasks); budgetLines
  // reference projects. Delete the leaf (expenses) before budgetLines,
  // and both before tasks/projects below.
  'expenses',
  'budgetLines',
  'tasks',
  'sections',
  'goals',
  'notifications',
  'insights',
  'automations',
  'forms',
  'reports',
  'projects',
  'folders',
  'users',
];

export async function wipeDatabase(): Promise<void> {
  if (!SUPABASE_CONFIGURED) return;
  for (const table of TABLE_ORDER_REVERSE) {
    const sqlTable = sqlTableFor[table];
    const pk = pkColumn(table);
    const { error } = await supabase.from(sqlTable).delete().not(pk, 'is', null);
    if (error) {
      console.error(`[repo] wipe ${table} failed`, error);
    }
  }
  // Settings (composite key, no `id`)
  if (currentProfileId) {
    await supabase.from('cj_settings').delete().eq('profile_id', currentProfileId);
  }
}

// (`isEmpty` was removed when `bootstrapUserData` collapsed the
// isEmpty + linkAuthUserToProfile + INSERT sequence into one SELECT.)
