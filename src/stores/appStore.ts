import { create } from 'zustand';
import {
  persist as dbPersist,
  loadSnapshot,
  wipeDatabase,
  setCurrentAuthUserId,
  getCurrentAuthUserId,
  setCurrentProfileId,
  setActiveWorkspaceOwnerId,
} from '../lib/repo';
import { bootstrapUserData, buildOfflineSnapshot } from '../lib/seed';
import { computeGoalProgress } from '../lib/goalProgress';
import { supabase, SUPABASE_CONFIGURED } from '../lib/supabase';
import {
  peekSupabaseSession,
  readSnapshotCache,
  writeSnapshotCache,
  clearSnapshotCache,
} from '../lib/snapshotCache';
import { setMonitoringUser, captureException } from '../lib/monitoring';
// Type-only — the runtime code (vendored Proph3t core client) is lazy-imported
// inside the action so it stays code-split, like the local agent in ./proph3t.
import type { AskResult, Sensitivity } from '../lib/proph3tCore';
import type {
  User,
  Project,
  Folder,
  Section,
  Task,
  Goal,
  Comment,
  Notification,
  PropheticInsight,
  Priority,
  TaskStatus,
  TaskTemplate,
  BudgetLine,
  Expense,
  BudgetNote,
  BudgetAttachment,
  ExpenseStatus,
} from '../types';

// Module-level guards: React StrictMode runs effects twice in dev, which
// would subscribe to onAuthStateChange twice and run hydrateFromSupabase
// concurrently. We guard at the module level (NOT in store state) so the
// second invocation literally cannot start.
let bootstrapStarted = false;

// Module-level set of goalIds currently scheduled for a microtask-deferred
// recompute. Used by `recomputeGoalFromTasks` to coalesce bursts of updates
// on the same goal (e.g. toggling multiple subtasks at once) into a single
// `updateGoal` write — otherwise concurrent upserts on the same row would
// race and the goal value persisted to Supabase could lag behind memory.
const _pendingGoalRecomputes = new Set<string>();

// Reset the guard on Vite HMR so a hot-reloaded store module re-subscribes
// to auth changes — otherwise dev iteration freezes on the splash forever.
// `import.meta.hot` is undefined in prod, so this branch tree-shakes away.
const hmr = (import.meta as { hot?: { dispose: (cb: () => void) => void } }).hot;
if (hmr) {
  hmr.dispose(() => {
    bootstrapStarted = false;
    hydrateInFlight = null;
    teardownRealtime();
  });
}

// ─── Supabase Realtime ───
// Un seul canal par utilisateur, abonné aux changements de SON namespace
// (auth_user_id = soi). Sert à refléter en direct les contributions des
// participants externes (edge function cj-share) sans rechargement.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let realtimeChannel: any = null;
type RealtimeKey = 'tasks' | 'comments' | 'subtasks' | 'activity' | 'notifications';
const RT_TABLES: { table: string; key: RealtimeKey }[] = [
  { table: 'cj_tasks', key: 'tasks' },
  { table: 'cj_comments', key: 'comments' },
  { table: 'cj_subtasks', key: 'subtasks' },
  { table: 'cj_activity', key: 'activity' },
  { table: 'cj_notifications', key: 'notifications' },
];

function teardownRealtime() {
  if (realtimeChannel) {
    try {
      supabase.removeChannel(realtimeChannel);
    } catch {
      /* ignore */
    }
    realtimeChannel = null;
  }
}

function setupRealtime(authUserId: string, set: SetFn, get: GetFn) {
  if (!SUPABASE_CONFIGURED) return;
  teardownRealtime();
  let ch = supabase.channel(`cj-rt-${authUserId}`);
  for (const { table, key } of RT_TABLES) {
    ch = ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `auth_user_id=eq.${authUserId}` },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload: any) => applyRealtime(key, payload, set, get)
    );
  }
  ch.subscribe();
  realtimeChannel = ch;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyRealtime(key: RealtimeKey, payload: any, set: SetFn, get: GetFn) {
  if (payload.eventType === 'DELETE') {
    const id = payload.old?.id;
    if (!id) return;
    set({ [key]: (get()[key] as { id: string }[]).filter((x) => x.id !== id) } as Partial<State>);
    return;
  }
  const entity = payload.new?.data;
  if (!entity || !entity.id) return;
  const arr = get()[key] as { id: string }[];
  const i = arr.findIndex((x) => x.id === entity.id);
  if (i >= 0) {
    const copy = arr.slice();
    copy[i] = entity;
    set({ [key]: copy } as Partial<State>);
  } else {
    set({ [key]: [entity, ...arr] } as Partial<State>);
  }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Après un boot dégradé (cache local servi car le REST était lent), on retente
 * le snapshot en arrière-plan. En cas de succès on remplace par les données
 * fraîches et on lève `degraded` ; sinon on reste sur le cache (la page peut
 * toujours être rechargée). Quelques tentatives espacées, puis on abandonne.
 */
async function revalidateSnapshotInBackground(authUserId: string, set: SetFn, get: GetFn) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await wait(15_000);
    // L'utilisateur a changé / s'est reconnecté / a déjà récupéré → on stoppe.
    if (getCurrentAuthUserId() !== authUserId || !get().degraded) return;
    try {
      const snap = await loadSnapshot();
      if (snap.users.length === 0 && snap.projects.length === 0 && snap.tasks.length === 0) continue;
      if (getCurrentAuthUserId() !== authUserId) return;
      set({
        users: snap.users,
        folders: snap.folders,
        projects: snap.projects,
        sections: snap.sections,
        tasks: snap.tasks,
        goals: snap.goals,
        comments: snap.comments,
        notifications: snap.notifications,
        insights: snap.insights,
        automations: snap.automations,
        forms: snap.forms,
        reports: snap.reports,
        attachments: snap.attachments,
        dependencies: snap.dependencies,
        activity: snap.activity,
        subtasks: snap.subtasks,
        notes: snap.notes,
        budgetLines: snap.budgetLines,
        expenses: snap.expenses,
        settings: { ...get().settings, ...(snap.settings as Partial<State['settings']>) },
        ready: true,
        degraded: false,
        revalidating: false,
      });
      const profileId = get().currentProfileId;
      if (profileId) writeSnapshotCache(authUserId, snap, profileId);
      setupRealtime(authUserId, set, get);
      console.info('[hydrate] revalidation en arrière-plan réussie — mode dégradé levé');
      return;
    } catch (e) {
      console.warn('[hydrate] revalidation arrière-plan, tentative', attempt, 'échouée', e);
    }
  }
}

/* ─────────── Espaces partagés (multi-utilisateurs) ─────────── */

export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface WorkspaceInfo {
  ownerId: string;
  label: string;
  role: WorkspaceRole;
  isOwn: boolean;
}

interface Membership {
  ownerId: string;
  role: WorkspaceRole;
  memberProfileId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
}

/** Espaces partagés actifs dont l'utilisateur courant est membre. */
async function resolveMemberships(authUserId: string): Promise<Membership[]> {
  if (!SUPABASE_CONFIGURED) return [];
  const { data, error } = await supabase
    .from('cj_workspace_members')
    .select('owner_auth_user_id, role, member_profile_id, owner_name, owner_email')
    .eq('member_auth_user_id', authUserId)
    .eq('status', 'active');
  if (error) {
    console.warn('[hydrate] resolveMemberships failed', error.message);
    return [];
  }
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      ownerId: String(row.owner_auth_user_id),
      role: (row.role as WorkspaceRole) ?? 'editor',
      memberProfileId: (row.member_profile_id as string) ?? null,
      ownerName: (row.owner_name as string) ?? null,
      ownerEmail: (row.owner_email as string) ?? null,
    };
  });
}

/** Liste des espaces accessibles : le sien + ceux partagés. */
function buildWorkspaces(authUserId: string, memberships: Membership[]): WorkspaceInfo[] {
  return [
    { ownerId: authUserId, label: 'Mon cockpit', role: 'owner', isOwn: true },
    ...memberships.map((m) => ({
      ownerId: m.ownerId,
      label: m.ownerName || m.ownerEmail || 'Cockpit partagé',
      role: m.role,
      isOwn: false,
    })),
  ];
}

const activeWsKey = (authUserId: string) => `cj-active-ws-${authUserId}`;

function readActiveWsPref(authUserId: string): string | null {
  try {
    return localStorage.getItem(activeWsKey(authUserId));
  } catch {
    return null;
  }
}

function writeActiveWsPref(authUserId: string, ownerId: string) {
  try {
    if (ownerId === authUserId) localStorage.removeItem(activeWsKey(authUserId));
    else localStorage.setItem(activeWsKey(authUserId), ownerId);
  } catch {
    /* ignore */
  }
}

/**
 * Décide l'espace actif : préférence persistée si valide, sinon — un
 * propriétaire (0 appartenance) → son propre cockpit ; un collaborateur
 * (≥1 appartenance) → le 1er espace partagé.
 */
function pickActiveWorkspace(authUserId: string, memberships: Membership[]): string {
  const candidates = new Set<string>([authUserId, ...memberships.map((m) => m.ownerId)]);
  const pref = readActiveWsPref(authUserId);
  if (pref && candidates.has(pref)) return pref;
  if (memberships.length > 0) return memberships[0].ownerId;
  return authUserId;
}

/** Profil de repli dans un namespace propriétaire (si member_profile_id absent). */
async function firstProfileIdOf(ownerId: string): Promise<string | null> {
  const { data } = await supabase
    .from('cj_profiles')
    .select('id')
    .eq('auth_user_id', ownerId)
    .limit(1)
    .maybeSingle();
  return data ? String((data as { id: string }).id) : null;
}

/** Derive the current sprint label from non-done tasks' customFields.Sprint */
export function getCurrentSprint(tasks: Task[]): string {
  const counts: Record<string, number> = {};
  for (const t of tasks) {
    if (t.status === 'done') continue;
    const s = t.customFields?.['Sprint'];
    if (typeof s === 'string' && s) counts[s] = (counts[s] || 0) + 1;
  }
  let best = '';
  let max = 0;
  for (const [k, v] of Object.entries(counts)) {
    if (v > max) {
      best = k;
      max = v;
    }
  }
  return best;
}
let hydrateInFlight: Promise<void> | null = null;

export type ToastKind = 'success' | 'info' | 'warning' | 'error';
export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  body?: string;
  duration?: number;
}

export interface FocusSession {
  running: boolean;
  preset: 'pomodoro' | 'pomodoro-long' | 'deep' | 'sprint' | 'time-block';
  totalSeconds: number;
  remainingSeconds: number;
  sound: string;
  taskId?: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  desc: string;
  enabled: boolean;
  runs: number;
  success: number;
  triggerKey: 'status_changed' | 'task_created' | 'due_overdue' | 'recurrence';
  conditions: number;
  actions: { kind: 'whatsapp' | 'push' | 'email' | 'tag' | 'subtasks' | 'report'; label: string }[];
}

export type FormFieldType =
  | 'short_text'
  | 'long_text'
  | 'number'
  | 'email'
  | 'phone'
  | 'url'
  | 'date'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'file';

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

export interface IntakeForm {
  id: string;
  name: string;
  description?: string;
  projectId: string;
  fields: FormField[];
  enabled: boolean;
  submissions: number;
  createdAt: string;
  publicUrl: string;
}

export type ReportKind = 'weekly' | 'monthly' | 'quarterly' | 'annual';
export interface Report {
  id: string;
  kind: ReportKind;
  title: string;
  period: string;
  /** ISO date — start of the reporting window (inclusive). */
  periodStart?: string;
  /** ISO date — end of the reporting window (inclusive). */
  periodEnd?: string;
  generatedAt: string;
  authorId: string;
  narrative?: string; // PROPH3T-generated executive narration (markdown)
  highlights: string[];
  metrics: { label: string; value: string; delta?: number }[];
  blockers?: string[];
  nextSteps?: string[];
  // Detailed sections
  projects?: ReportProjectBreakdown[];
  attentionPoints?: AttentionPoint[];
  workload?: ReportWorkloadEntry[];
  goalsProgress?: ReportGoalEntry[];
  topRetards?: ReportRetard[];
  topAchievements?: string[];
}

export interface ReportProjectBreakdown {
  projectId: string;
  name: string;
  color: string;
  health: 'green' | 'yellow' | 'red';
  progress: number;
  tasksTotal: number;
  tasksDone: number;
  tasksInProgress: number;
  tasksOverdue: number;
  tasksCritical: number;
  velocityDelta?: number;
  endDate?: string;
  members: number;
  summary?: string; // 2-3 lines per project
  riskNote?: string;
}

export interface AttentionPoint {
  severity: 'critical' | 'high' | 'medium';
  title: string;
  detail: string;
  scope: string; // project name or area concerned (e.g. "Q3 marketing")
  recommendation?: string;
}

export interface ReportWorkloadEntry {
  userId: string;
  name: string;
  initials: string;
  color: string;
  plannedHours: number;
  capacityHours: number;
  tasksOpen: number;
  status: 'overloaded' | 'optimal' | 'available';
}

export interface ReportGoalEntry {
  id: string;
  title: string;
  pct: number;
  delta: number;
  health: 'green' | 'yellow' | 'red';
  ownerInitials: string;
  ownerColor: string;
}

export interface ReportRetard {
  taskId: string;
  title: string;
  daysLate: number;
  projectName: string;
  ownerInitials: string;
  priority: 1 | 2 | 3 | 4;
}

export interface Attachment {
  id: string;
  taskId: string;
  name: string;
  size: string;
  kind: 'pdf' | 'img' | 'doc' | 'csv' | 'link';
  uploadedAt: string;
  /** Storage path in the `cj-attachments` bucket (real uploads only). */
  path?: string;
}
export interface TaskDependency {
  id: string;
  taskId: string;
  relatedTaskId: string;
  relation: 'blocks' | 'blocked_by' | 'related';
}
export interface ActivityEvent {
  id: string;
  taskId?: string;
  projectId?: string;
  actorId: string;
  verb: string;
  target?: string;
  at: string;
}
export interface TaskNote {
  taskId: string;
  markdown: string;
  updatedAt: string;
}
export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  assigneeId?: string;
  position: number;
}

interface State {
  // entities
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

  // hydration flag — true once Supabase snapshot has been loaded (or
  // optimistically hydrated from the localStorage cache pending the real
  // Supabase round-trip).
  ready: boolean;
  // true while a background snapshot revalidation is in flight after an
  // optimistic cache-hydrate. Used by the UI for a subtle indicator.
  revalidating?: boolean;
  // auth state
  authStatus: 'loading' | 'signed_out' | 'signed_in';
  authEmail?: string;
  currentProfileId?: string;
  // true if hydrate fell back to offline mockData (Supabase unreachable)
  degraded?: boolean;

  // Espaces partagés : la liste accessible, l'espace actif, et mon rôle dedans.
  workspaces: WorkspaceInfo[];
  activeWorkspaceId?: string; // owner id de l'espace affiché
  myWorkspaceRole: WorkspaceRole; // 'owner' | 'admin' | 'editor' | 'viewer'

  // UI state
  toasts: Toast[];
  modal: { kind: ModalKind; payload?: any } | null;
  focus: FocusSession;

  // settings
  settings: {
    theme: 'light' | 'dark' | 'auto';
    locale: 'fr' | 'en';
    weekStart: 1 | 7;
    dailyBriefHour: number;
    soundsEnabled: boolean;
    notificationsEmail: boolean;
    notificationsPush: boolean;
    notificationsWhatsapp: boolean;
    weeklyCapacityHours: number;
    /** Set to true after the user finishes the first-boot onboarding wizard. */
    onboardingDone?: boolean;
    /**
     * PROPH3T-generated day plan, cached for the date it was generated for.
     * Cleared / regenerated when the local date rolls over or the user
     * clicks "Regénérer le planning" on Today.
     */
    timeBlocks?: {
      date: string; // YYYY-MM-DD local
      blocks: import('../lib/proph3t').GeneratedTimeBlock[];
      generatedAt: string; // ISO timestamp
    };
    proph3t: {
      provider: 'groq' | 'openrouter' | 'ollama-cloud';
      apiKey: string;
      model: string;
    };
    /** Personal reusable task templates (persisted as a settings key — no extra table). */
    taskTemplates?: TaskTemplate[];
  };

  // === actions ===
  // bootstrap (subscribe to auth + hydrate from Supabase)
  bootstrap: () => Promise<void>;
  // sign out from Supabase + reset in-memory state
  signOut: () => Promise<void>;
  /** Basculer vers un autre espace (recharge pour ré-hydrater proprement). */
  switchWorkspace: (ownerId: string) => void;

  // toasts
  pushToast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;

  // modals
  openModal: (kind: ModalKind, payload?: any) => void;
  closeModal: () => void;

  // tasks
  createTask: (input: Partial<Task> & { title: string; projectId: string; sectionId: string }) => Task;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  toggleTaskDone: (id: string) => void;
  setTaskApproval: (id: string, status: NonNullable<Task['approvalStatus']>) => void;
  moveTask: (id: string, sectionId: string) => void;
  changeTaskPriority: (id: string, priority: Priority) => void;

  // comments
  addComment: (taskId: string, body: string, authorId?: string) => void;
  deleteComment: (id: string) => void;
  reactToComment: (id: string, emoji: string) => void;

  // notifications
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;

  // goals
  createGoal: (g: Omit<Goal, 'id'>) => void;
  updateGoal: (id: string, patch: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
  bumpGoalValue: (id: string, delta: number) => void;
  /**
   * Recompute a goal's value from its contributing tasks + sub-actions
   * (weighted partial credit). Auto-pilots every metric type unless the goal
   * is in `progressMode: 'manual'`. Coalesced per goal via a microtask.
   */
  recomputeGoalFromTasks: (goalId: string) => void;
  /**
   * Réconcilie TOUS les goals auto en une passe — appelé après hydratation
   * pour recaler les progressions modifiées ailleurs (MCP, autre client).
   * Idempotent : n'écrit que les goals dont la valeur a réellement changé.
   */
  reconcileAutoGoals: () => void;

  // projects
  createProject: (p: Partial<Project> & { name: string; folderId?: string }) => Project;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;

  // folders
  createFolder: (input: {
    name: string;
    color?: string;
    icon?: string;
    sphere?: 'personnel' | 'professionnel';
  }) => Folder;
  updateFolder: (id: string, patch: Partial<Folder>) => void;
  deleteFolder: (id: string) => void;
  /** Reorder folders by passing the new full ordering as an array of ids. */
  reorderFolders: (orderedIds: string[]) => void;
  /** Move a folder from one sphere to the other. */
  moveFolderToSphere: (folderId: string, sphere: 'personnel' | 'professionnel') => void;
  /** Move a project to a different folder (drag-and-drop in the sidebar). */
  moveProjectToFolder: (projectId: string, targetFolderId: string) => void;

  // automations
  toggleAutomation: (id: string) => void;
  deleteAutomation: (id: string) => void;
  createAutomation: (a: Omit<AutomationRule, 'id' | 'runs' | 'success'>) => void;
  updateAutomation: (id: string, patch: Partial<AutomationRule>) => void;
  /** Evaluate the trigger against current tasks (no side effects); returns match count and logs a run. */
  dryRunAutomation: (id: string) => number;

  // forms
  createForm: (f: Omit<IntakeForm, 'id' | 'submissions' | 'createdAt' | 'publicUrl'>) => IntakeForm;
  updateForm: (id: string, patch: Partial<IntakeForm>) => void;
  deleteForm: (id: string) => void;
  toggleFormEnabled: (id: string) => void;
  addFormField: (formId: string, field: Omit<FormField, 'id'>) => void;
  updateFormField: (formId: string, fieldId: string, patch: Partial<FormField>) => void;
  removeFormField: (formId: string, fieldId: string) => void;
  simulateFormSubmission: (formId: string) => void;

  // reports
  generateReport: (kind: ReportKind) => Report;
  generateReportNarrative: (id: string) => Promise<void>;
  deleteReport: (id: string) => void;

  // attachments / dependencies / notes / activity
  addAttachment: (
    taskId: string,
    name: string,
    kind: Attachment['kind'],
    size?: string,
    path?: string
  ) => void;
  removeAttachment: (id: string) => void;
  addDependency: (taskId: string, relatedTaskId: string, relation: TaskDependency['relation']) => void;
  removeDependency: (id: string) => void;
  toggleWatcher: (taskId: string, userId: string) => void;
  setNote: (taskId: string, markdown: string) => void;
  logActivity: (e: Omit<ActivityEvent, 'id' | 'at'>) => void;
  addSubtask: (taskId: string, title: string) => void;
  toggleSubtask: (id: string) => void;
  removeSubtask: (id: string) => void;
  reorderSubtasks: (taskId: string, ids: string[]) => void;

  // budget (per-project) — lines + expenses + notes. Allocated / spent /
  // remaining / % are NEVER stored; they're derived from these arrays.
  createBudgetLine: (
    projectId: string,
    input: { name: string; allocatedAmount: number; parentLineId?: string | null }
  ) => BudgetLine;
  updateBudgetLine: (id: string, patch: Partial<BudgetLine>) => void;
  deleteBudgetLine: (id: string) => void;
  createExpense: (
    projectId: string,
    lineId: string | null,
    input: {
      label: string;
      amount: number;
      status?: ExpenseStatus;
      expenseDate?: string;
      vendor?: string | null;
    }
  ) => Expense;
  updateExpense: (id: string, patch: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;
  addBudgetNote: (target: { kind: 'line' | 'expense'; id: string }, text: string) => void;
  addBudgetAttachment: (target: { kind: 'line' | 'expense'; id: string }, att: BudgetAttachment) => void;
  removeBudgetAttachment: (target: { kind: 'line' | 'expense'; id: string }, attachmentId: string) => void;

  resetSeed: () => void;

  // insights
  dismissInsight: (id: string) => void;
  regenerateBrief: () => void;

  /**
   * MODE B (Proph3t core hébergé) — délègue un tour complet à l'orchestrateur
   * Atlas Studio via `proph3t-ask`. À utiliser pour « pose une question /
   * analyse ce document ». `sensitivity` gouverne les providers autorisés côté
   * core ("confidential" ⇒ Ollama/Claude uniquement, jamais un tier gratuit).
   * Défaut "internal" (données de gestion CockpitJourney).
   *
   * Résout sur `null` si le core n'est pas configuré (toast d'info affiché).
   * Ne retombe JAMAIS sur l'agent local free-tier — aucune fuite confidentielle.
   */
  askProph3tCore: (params: { message: string; sensitivity?: Sensitivity }) => Promise<AskResult | null>;

  /**
   * Ask PROPH3T to generate the day's time-blocking plan from the user's
   * actual due-today tasks, capacity, and brief hour. Resolves with the
   * fresh blocks (also written to settings.timeBlocks so the next reload
   * skips the regeneration cost).
   *
   * Falls back to a heuristic plan (just Daily Brief + tasks ordered by
   * dueDate) if PROPH3T isn't configured.
   */
  regenerateTimeBlocks: () => Promise<void>;

  // focus
  startFocusSession: (preset: FocusSession['preset'], taskId?: string) => void;
  pauseFocus: () => void;
  resumeFocus: () => void;
  stopFocus: () => void;
  setFocusSound: (s: string) => void;
  tickFocus: () => void;

  // settings
  updateSettings: (patch: Partial<State['settings']>) => void;
  saveTaskTemplate: (tpl: Omit<TaskTemplate, 'id'>) => void;
  deleteTaskTemplate: (id: string) => void;
  /**
   * Edit the current user's profile (name / color / avatarUrl). Recomputes
   * initials when `name` changes, syncs the in-memory User row, persists
   * to cj_profiles, and mirrors `full_name` to Supabase `auth.users.
   * raw_user_meta_data` so sibling Atlas Studio apps see the new name too.
   */
  updateProfile: (patch: Partial<Pick<User, 'name' | 'color' | 'avatarUrl' | 'role'>>) => Promise<void>;
}

export type ModalKind =
  | 'task-create'
  | 'task-edit'
  | 'task-delete'
  | 'project-create'
  | 'project-edit'
  | 'project-delete'
  | 'folder-create'
  | 'folder-edit'
  | 'goal-create'
  | 'goal-edit'
  | 'goal-bump'
  | 'automation-create'
  | 'automation-edit'
  | 'workspace-switch'
  | 'settings'
  | 'members'
  | 'share'
  | 'retroplan'
  | 'import-tasks'
  | 'proph3t-brief'
  | 'widget-add'
  | 'export'
  | 'help'
  | 'shortcuts'
  | 'form-create'
  | 'form-edit'
  | 'form-preview'
  | 'report-view';

const uid = (prefix = 'id') => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

/** Escape a string for safe insertion into a RegExp (mention matching). */
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Shared hydration: claim/create the user's profile, run seed if needed,
 * load the snapshot from Supabase into the Zustand cache.
 */
async function hydrateFromSupabase(authUserId: string, email: string, set: SetFn, get: GetFn) {
  // De-dupe concurrent calls (onAuthStateChange + explicit getSession()
  // can both fire SIGNED_IN for the same session). Whoever starts first
  // owns the work; subsequent callers share the same in-flight promise.
  if (hydrateInFlight) {
    console.info('[hydrate] already in flight, awaiting existing promise');
    return hydrateInFlight;
  }
  // Idempotent: already hydrated for this user.
  if (get().ready && get().currentProfileId) {
    console.info('[hydrate] already ready, skipping');
    return;
  }

  // Offline fallback: ONLY in development mode.
  // In prod, if Supabase REST is unreachable we DO NOT silently load
  // mockData (that would mean showing fake data to a real user).
  // Instead, we sign the user out and let them retry via the login flow.
  const goOffline = async (reason: string) => {
    if (!import.meta.env.DEV) {
      // ── Première ligne de défense : le cache local ──
      // Le projet Supabase est mutualisé entre plusieurs apps et peut être
      // transitoirement lent. Plutôt que de déconnecter brutalement un
      // utilisateur de retour (qui a déjà ses vraies données en cache local),
      // on RESTE sur ce cache en mode dégradé et on retente en arrière-plan.
      const cached = readSnapshotCache(authUserId);
      if (cached && cached.users.length > 0) {
        console.warn('[hydrate] REST lent/injoignable — on garde le snapshot en cache (dégradé).', reason);
        captureException(new Error(`hydrate-degraded-cache: ${reason}`));
        setCurrentAuthUserId(authUserId);
        set({
          users: cached.users,
          folders: cached.folders,
          projects: cached.projects,
          sections: cached.sections,
          tasks: cached.tasks,
          goals: cached.goals,
          comments: cached.comments,
          notifications: cached.notifications,
          insights: cached.insights,
          automations: cached.automations,
          forms: cached.forms,
          reports: cached.reports,
          attachments: cached.attachments,
          dependencies: cached.dependencies,
          activity: cached.activity,
          subtasks: cached.subtasks,
          notes: cached.notes,
          budgetLines: cached.budgetLines ?? [],
          expenses: cached.expenses ?? [],
          settings: { ...get().settings, ...(cached.settings as Partial<State['settings']>) },
          currentProfileId: cached.profileId,
          authStatus: 'signed_in',
          authEmail: email,
          ready: true,
          degraded: true,
          revalidating: true,
        });
        void revalidateSnapshotInBackground(authUserId, set, get);
        return;
      }
      // Pas de cache → on ne peut pas montrer de vraies données : on déconnecte
      // pour que l'utilisateur puisse réessayer via le flow de connexion.
      console.warn('[hydrate] Supabase unreachable in production —', reason);
      console.warn('[hydrate] falling back to signed_out (no cache available).');
      captureException(new Error(`hydrate-offline-fallback: ${reason}`));
      setCurrentAuthUserId(null);
      setMonitoringUser(null);
      set({
        authStatus: 'signed_out',
        ready: false,
        authEmail: undefined,
        currentProfileId: undefined,
        degraded: false,
      });
      return;
    }
    console.warn('[hydrate] entering OFFLINE/DEV mode —', reason);
    const offline = await buildOfflineSnapshot(authUserId);
    set({
      users: offline.users,
      folders: offline.folders,
      projects: offline.projects,
      sections: offline.sections,
      tasks: offline.tasks,
      goals: offline.goals,
      comments: offline.comments,
      notifications: offline.notifications,
      insights: offline.insights,
      automations: offline.automations,
      forms: offline.forms,
      reports: offline.reports,
      attachments: offline.attachments,
      dependencies: offline.dependencies,
      activity: offline.activity,
      subtasks: offline.subtasks,
      notes: offline.notes,
      budgetLines: offline.budgetLines,
      expenses: offline.expenses,
      settings: { ...get().settings, ...(offline.settings as Partial<State['settings']>) },
      currentProfileId: offline.selfProfileId,
      authStatus: 'signed_in',
      authEmail: email,
      ready: true,
      degraded: true,
    });
    console.info('[hydrate] DONE (offline/DEV) — ready=true, degraded=true');
  };

  hydrateInFlight = (async () => {
    // Hard 30s overall watchdog: regardless of where the cascade hangs
    // (seed, link, snapshot), we never trap the user beyond ~30s. The shared
    // Supabase project can be transiently slow, so the bound is generous; a
    // warm local cache lets goOffline stay degraded rather than sign out.
    let bailed = false;
    const overallTimeout = setTimeout(() => {
      bailed = true;
      void goOffline('hydrate exceeded 30s — Supabase REST slow/unreachable');
    }, 30_000);

    try {
      console.info('[hydrate] start for user', authUserId.slice(0, 8));
      set({ authStatus: 'signed_in', authEmail: email });
      setCurrentAuthUserId(authUserId);
      // Attach the user's namespace to every subsequent Sentry event so
      // we can group crashes per-user without leaking PII.
      setMonitoringUser(authUserId);

      // ── Espace actif : son propre cockpit OU membre d'un cockpit partagé ──
      const memberships = await resolveMemberships(authUserId);
      const activeOwner = pickActiveWorkspace(authUserId, memberships);
      const isMemberWorkspace = activeOwner !== authUserId;
      setActiveWorkspaceOwnerId(isMemberWorkspace ? activeOwner : null);
      writeActiveWsPref(authUserId, activeOwner);
      const workspaces = buildWorkspaces(authUserId, memberships);
      const myWorkspaceRole: WorkspaceRole =
        workspaces.find((w) => w.ownerId === activeOwner)?.role ?? 'owner';
      set({ workspaces, activeWorkspaceId: activeOwner, myWorkspaceRole });
      console.info(
        `[hydrate] workspace = ${isMemberWorkspace ? `partagé (${activeOwner.slice(0, 8)})` : 'propre'} · ${memberships.length} appartenance(s)`
      );

      let profileId: string;
      if (isMemberWorkspace) {
        // Membre : aucun seed de son propre namespace ; on agit avec le profil
        // créé pour lui dans le namespace du propriétaire (à l'acceptation).
        const m = memberships.find((x) => x.ownerId === activeOwner);
        profileId = m?.memberProfileId || (await firstProfileIdOf(activeOwner)) || '';
        setCurrentProfileId(profileId);
        console.info('[hydrate] member profile', profileId);
      } else {
        // Propriétaire : flux normal (résout/seed son profil).
        console.info('[hydrate] step 1/2 — bootstrapUserData');
        const sessionUser = (await supabase.auth.getSession()).data.session?.user;
        const r = await bootstrapUserData(authUserId, {
          email: sessionUser?.email ?? email,
          user_metadata: sessionUser?.user_metadata,
        });
        profileId = r.profileId;
        setCurrentProfileId(profileId);
        if (bailed) return;
        console.info(
          r.seeded
            ? `[hydrate] bootstrap: seeded new profile ${profileId}`
            : `[hydrate] bootstrap: existing profile ${profileId}`
        );
      }

      console.info('[hydrate] step 2/2 — loadSnapshot');
      const snap = await loadSnapshot();
      if (bailed) return;
      console.info(
        '[hydrate] snapshot loaded:',
        `${snap.users.length} users, ${snap.projects.length} projects, ${snap.tasks.length} tasks`
      );

      // If snapshot came back EMPTY (Supabase silently no-op'd because seed
      // was skipped via watchdog), use offline data so the cockpit is usable.
      if (snap.users.length === 0 && snap.projects.length === 0 && snap.tasks.length === 0) {
        clearTimeout(overallTimeout);
        await goOffline('snapshot empty — seed never landed in Supabase');
        return;
      }

      clearTimeout(overallTimeout);
      set({
        users: snap.users,
        folders: snap.folders,
        projects: snap.projects,
        sections: snap.sections,
        tasks: snap.tasks,
        goals: snap.goals,
        comments: snap.comments,
        notifications: snap.notifications,
        insights: snap.insights,
        automations: snap.automations,
        forms: snap.forms,
        reports: snap.reports,
        attachments: snap.attachments,
        dependencies: snap.dependencies,
        activity: snap.activity,
        subtasks: snap.subtasks,
        notes: snap.notes,
        budgetLines: snap.budgetLines,
        expenses: snap.expenses,
        settings: { ...get().settings, ...(snap.settings as Partial<State['settings']>) },
        currentProfileId: profileId,
        ready: true,
        revalidating: false,
        degraded: false,
      });
      // Mirror to localStorage for instant-boot on the next page load
      // (cache keyed by the logged-in user; content = the active workspace).
      writeSnapshotCache(authUserId, snap, profileId);
      // Subscribe to live changes in the ACTIVE workspace's namespace (other
      // members' edits + participant contributions land here without reload).
      setupRealtime(activeOwner, set, get);
      console.info('[hydrate] DONE — ready=true');
    } catch (err) {
      clearTimeout(overallTimeout);
      console.error('[hydrate] threw — falling back to offline', err);
      await goOffline(err instanceof Error ? err.message : 'unknown error');
    } finally {
      hydrateInFlight = null;
    }
  })();

  return hydrateInFlight;
}

const focusPresets: Record<FocusSession['preset'], { total: number; label: string }> = {
  pomodoro: { total: 25 * 60, label: 'Pomodoro 25/5' },
  'pomodoro-long': { total: 50 * 60, label: 'Pomodoro 50/10' },
  deep: { total: 90 * 60, label: 'Deep Work 90/15' },
  sprint: { total: 45 * 60, label: 'Sprint 45 min' },
  'time-block': { total: 120 * 60, label: 'Time-block 2h' },
};

type SetFn = (partial: Partial<State> | ((s: State) => Partial<State>), replace?: false) => void;
type GetFn = () => State;

const initialState = (set: SetFn, get: GetFn): State => ({
  // All entity arrays start EMPTY — populated from Dexie via bootstrap()
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
  subtasks: [],
  notes: [],
  budgetLines: [],
  expenses: [],

  ready: false,
  authStatus: 'loading',
  authEmail: undefined,
  currentProfileId: undefined,
  workspaces: [],
  activeWorkspaceId: undefined,
  myWorkspaceRole: 'owner',

  toasts: [],
  modal: null,
  focus: {
    running: false,
    preset: 'pomodoro-long',
    totalSeconds: focusPresets['pomodoro-long'].total,
    remainingSeconds: focusPresets['pomodoro-long'].total,
    sound: 'Pluie tropicale',
  },

  settings: {
    theme: 'light',
    locale: 'fr',
    weekStart: 1,
    dailyBriefHour: 7,
    soundsEnabled: true,
    notificationsEmail: true,
    notificationsPush: true,
    notificationsWhatsapp: true,
    weeklyCapacityHours: 40,
    proph3t: {
      provider: 'groq',
      apiKey: '',
      model: 'llama-3.3-70b-versatile',
    },
  },

  bootstrap: async () => {
    // StrictMode-safe: only run once per page load even though useEffect
    // fires bootstrap() twice in development.
    if (bootstrapStarted) {
      console.info('[bootstrap] already started, skipping duplicate call');
      return;
    }
    bootstrapStarted = true;

    if (!SUPABASE_CONFIGURED) {
      console.warn('[bootstrap] Supabase not configured — going to signed_out');
      set({ authStatus: 'signed_out', ready: false });
      return;
    }

    // ─── OPTIMISTIC HYDRATE FROM LOCAL CACHE ───
    // If Supabase has a persisted session in localStorage AND we have a
    // snapshot cache for that user, hydrate the store IMMEDIATELY (before
    // any network round-trip). The real Supabase handshake runs in
    // parallel below — when it completes, the snapshot is overwritten
    // with server-side truth. Boot perceived as ~0 ms on warm returns.
    const cachedSession = peekSupabaseSession();
    if (cachedSession) {
      const cached = readSnapshotCache(cachedSession.authUserId);
      if (cached && cached.users.length > 0) {
        console.info(
          '[bootstrap] ⚡ instant-hydrate from localStorage cache (cachedAt=' + cached.cachedAt + ')'
        );
        setCurrentAuthUserId(cachedSession.authUserId);
        // Restore the last active workspace so any early write goes to the
        // right namespace (corrected by the real hydrate moments later).
        const wsPref = readActiveWsPref(cachedSession.authUserId);
        setActiveWorkspaceOwnerId(wsPref && wsPref !== cachedSession.authUserId ? wsPref : null);
        set({
          authStatus: 'signed_in',
          authEmail: cachedSession.email,
          currentProfileId: cached.profileId,
          users: cached.users,
          folders: cached.folders,
          projects: cached.projects,
          sections: cached.sections,
          tasks: cached.tasks,
          goals: cached.goals,
          comments: cached.comments,
          notifications: cached.notifications,
          insights: cached.insights,
          automations: cached.automations,
          forms: cached.forms,
          reports: cached.reports,
          attachments: cached.attachments,
          dependencies: cached.dependencies,
          activity: cached.activity,
          subtasks: cached.subtasks,
          notes: cached.notes,
          budgetLines: cached.budgetLines ?? [],
          expenses: cached.expenses ?? [],
          settings: { ...get().settings, ...(cached.settings as Partial<State['settings']>) },
          ready: true,
          revalidating: true,
          degraded: false,
        });
      }
    }

    // Hard timeout: if Supabase auth hasn't resolved within 6s (network
    // hung, broken token, CORS issue…), fall through to signed_out so
    // the user can at least try to log in instead of seeing a frozen splash.
    const timeoutId = setTimeout(() => {
      if (get().authStatus === 'loading') {
        console.warn('[bootstrap] auth resolution timed out after 6s — falling back to signed_out');
        set({ authStatus: 'signed_out' });
      }
    }, 6000);

    // Subscribe to auth state changes (single subscription per app lifecycle).
    // Cross-tab signOut propagation: a sibling tab signing out posts on
    // this channel; we mirror the signOut locally so the user isn't left
    // with a stale "signed in" UI that keeps writing under a dead token.
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const ch = new BroadcastChannel('cj-auth');
        ch.addEventListener('message', (e) => {
          if (e.data?.type === 'signout' && get().authStatus !== 'signed_out') {
            supabase.auth.signOut().catch(() => {});
          }
        });
      }
    } catch {
      /* BroadcastChannel not supported — fall back to per-tab signOut only */
    }

    // INITIAL_SESSION fires once on subscribe with the cached session (if any),
    // SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED fire on subsequent changes.
    supabase.auth.onAuthStateChange(async (event, session) => {
      console.info('[auth]', event, session ? `(user ${session.user.id.slice(0, 8)})` : '(no session)');
      try {
        if (event === 'SIGNED_OUT' || !session) {
          // Drop the snapshot mirror for the previous user. They might
          // come back as a different account; we don't want to flash
          // someone else's data even momentarily.
          const prevUserId = getCurrentAuthUserId();
          if (prevUserId) clearSnapshotCache(prevUserId);
          teardownRealtime();
          setActiveWorkspaceOwnerId(null);
          setCurrentAuthUserId(null);
          // Untag the Sentry scope so subsequent crashes don't get
          // attributed to the previous user.
          setMonitoringUser(null);
          set({
            authStatus: 'signed_out',
            authEmail: undefined,
            currentProfileId: undefined,
            workspaces: [],
            activeWorkspaceId: undefined,
            myWorkspaceRole: 'owner',
            ready: false,
            revalidating: false,
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
            subtasks: [],
            notes: [],
            budgetLines: [],
            expenses: [],
          });
          return;
        }
        // Signed in / refreshed / initial session with valid creds → hydrate
        await hydrateFromSupabase(session.user.id, session.user.email ?? '', set, get);
      } catch (err: any) {
        console.error('[bootstrap] auth state change handler failed', err);
        const msg = err?.message || '';
        if (msg.includes('Refresh Token') || msg.includes('Invalid Refresh Token')) {
          console.warn('[auth] Refresh token invalid — signing out');
          await supabase.auth.signOut();
        }
        set({ authStatus: 'signed_out' });
      } finally {
        clearTimeout(timeoutId);
      }
    });

    // Belt-and-suspenders: also call getSession() ourselves in case
    // INITIAL_SESSION isn't dispatched promptly (some browser extensions
    // block the auth iframe).
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (data.session) {
        // onAuthStateChange will likely already have fired with the same
        // session, but hydrateFromSupabase short-circuits when ready=true.
        await hydrateFromSupabase(data.session.user.id, data.session.user.email ?? '', set, get);
      } else if (get().authStatus === 'loading') {
        set({ authStatus: 'signed_out' });
      }
    } catch (err: any) {
      console.error('[bootstrap] getSession failed', err);
      const msg = err?.message || '';
      if (msg.includes('Refresh Token') || msg.includes('Invalid Refresh Token')) {
        console.warn('[auth] Refresh token invalid — signing out');
        await supabase.auth.signOut();
      }
      set({ authStatus: 'signed_out' });
    } finally {
      clearTimeout(timeoutId);
    }
  },

  pushToast: (t) => {
    const id = uid('toast');
    const toast: Toast = { id, duration: 3500, ...t };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    if (toast.duration) {
      setTimeout(() => get().dismissToast(id), toast.duration);
    }
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  openModal: (kind, payload) => set({ modal: { kind, payload } }),
  closeModal: () => set({ modal: null }),

  createTask: (input) => {
    const t: Task = {
      id: uid('t'),
      projectId: input.projectId,
      sectionId: input.sectionId,
      title: input.title,
      description: input.description,
      status: input.status ?? 'todo',
      priority: input.priority ?? 2,
      dueDate: input.dueDate,
      startDate: input.startDate,
      estimatedMinutes: input.estimatedMinutes,
      actualMinutes: input.actualMinutes,
      assignees: input.assignees ?? [],
      watchers: input.watchers,
      tags: input.tags ?? [],
      customFields: input.customFields,
      commentCount: 0,
      attachmentCount: 0,
      source: input.source ?? 'manual',
      goalId: input.goalId,
      requiresApproval: input.requiresApproval,
      approvalStatus: input.requiresApproval ? (input.approvalStatus ?? 'pending') : undefined,
      alsoInProjectIds: input.alsoInProjectIds,
      createdAt: new Date().toISOString(),
    };
    set((s: any) => ({ tasks: [t, ...s.tasks] }));
    dbPersist.put('tasks', t);
    // Keep the owning project's taskCount in sync so counts shown in the
    // command palette and the task drawer reflect reality.
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === t.projectId ? { ...p, taskCount: (p.taskCount ?? 0) + 1 } : p
      ),
    }));
    const projAfterCreate = get().projects.find((p) => p.id === t.projectId);
    if (projAfterCreate) dbPersist.put('projects', projAfterCreate);
    get().logActivity({
      taskId: t.id,
      projectId: t.projectId,
      actorId: get().currentProfileId || 'u_pame',
      verb: 'a créé la tâche',
      target: t.title,
    });
    get().pushToast({ kind: 'success', title: 'Tâche créée', body: t.title });
    if (t.goalId) get().recomputeGoalFromTasks(t.goalId);
    return t;
  },
  updateTask: (id, patch) => {
    const before = get().tasks.find((t) => t.id === id);
    set((s: any) => ({ tasks: s.tasks.map((t: any) => (t.id === id ? { ...t, ...patch } : t)) }));
    const updated = get().tasks.find((t) => t.id === id);
    if (updated) dbPersist.put('tasks', updated);
    // Roll up goal progress when a contribution changes (status or link).
    if (before && ('status' in patch || 'goalId' in patch)) {
      const affected = new Set<string>();
      if (before.goalId) affected.add(before.goalId);
      if (updated?.goalId) affected.add(updated.goalId);
      affected.forEach((gid) => get().recomputeGoalFromTasks(gid));
    }
  },
  deleteTask: (id) => {
    const t = get().tasks.find((x) => x.id === id);
    set((s: any) => ({ tasks: s.tasks.filter((x: any) => x.id !== id) }));
    dbPersist.delete('tasks', id);
    if (t) {
      set((s) => ({
        projects: s.projects.map((p) =>
          p.id === t.projectId ? { ...p, taskCount: Math.max(0, (p.taskCount ?? 0) - 1) } : p
        ),
      }));
      const projAfterDelete = get().projects.find((p) => p.id === t.projectId);
      if (projAfterDelete) dbPersist.put('projects', projAfterDelete);
      get().logActivity({
        projectId: t.projectId,
        actorId: get().currentProfileId || 'u_pame',
        verb: 'a supprimé la tâche',
        target: t.title,
      });
      get().pushToast({ kind: 'info', title: 'Tâche supprimée', body: t.title });
      if (t.goalId) get().recomputeGoalFromTasks(t.goalId);
    }
  },
  toggleTaskDone: (id) => {
    const t = get().tasks.find((x) => x.id === id);
    if (!t) return;
    const isDone = t.status === 'done';
    // Approval gate: a task flagged as needing approval can only be moved
    // to "done" once it has been explicitly approved. Reopening (done→todo)
    // is always allowed.
    if (!isDone && t.requiresApproval && t.approvalStatus !== 'approved') {
      get().pushToast({
        kind: 'warning',
        title: 'Approbation requise',
        body: 'Cette tâche doit être approuvée avant clôture (onglet Détails).',
      });
      return;
    }
    get().updateTask(id, {
      status: isDone ? 'todo' : 'done',
      completionDate: isDone ? undefined : new Date().toISOString(),
    });
    get().logActivity({
      taskId: t.id,
      projectId: t.projectId,
      actorId: get().currentProfileId || 'u_pame',
      verb: isDone ? 'a rouvert' : 'a terminé',
      target: t.title,
    });
    get().pushToast({
      kind: isDone ? 'info' : 'success',
      title: isDone ? 'Tâche rouverte' : 'Tâche terminée',
      body: t.title,
    });
  },
  setTaskApproval: (id, status) => {
    const t = get().tasks.find((x) => x.id === id);
    if (!t) return;
    get().updateTask(id, { approvalStatus: status });
    const labels: Record<NonNullable<Task['approvalStatus']>, string> = {
      pending: 'remise en attente',
      approved: 'approuvée',
      rejected: 'rejetée',
      changes_requested: 'modifications demandées',
    };
    get().logActivity({
      taskId: id,
      projectId: t.projectId,
      actorId: get().currentProfileId || 'u_pame',
      verb: 'a marqué l’approbation :',
      target: labels[status],
    });
    get().pushToast({
      kind: status === 'approved' ? 'success' : status === 'rejected' ? 'error' : 'info',
      title: `Approbation ${labels[status]}`,
      body: t.title,
    });
  },
  moveTask: (id, sectionId) => {
    const sec = get().sections.find((s) => s.id === sectionId);
    let status: TaskStatus | undefined;
    if (sec) {
      const n = sec.name.toLowerCase();
      if (n.includes('terminé') || n.includes('livré')) status = 'done';
      else if (n.includes('revue')) status = 'in_review';
      else if (n.includes('cours')) status = 'in_progress';
      else status = 'todo';
    }
    const t = get().tasks.find((x) => x.id === id);
    // Approval gate: dropping a non-approved task into a "Terminé"-ish
    // column would silently bypass the approval flow. Move the card but
    // do NOT flip the status to 'done' — surface a clear toast so the
    // user knows to approve it first.
    if (status === 'done' && t?.requiresApproval && t.approvalStatus !== 'approved' && t.status !== 'done') {
      get().updateTask(id, { sectionId });
      get().pushToast({
        kind: 'warning',
        title: 'Approbation requise',
        body: 'La tâche a été déplacée mais reste à approuver avant clôture.',
      });
      return;
    }
    get().updateTask(id, { sectionId, ...(status ? { status } : {}) });
    if (t && sec)
      get().logActivity({
        taskId: id,
        projectId: t.projectId,
        actorId: get().currentProfileId || 'u_pame',
        verb: 'a déplacé vers',
        target: sec.name,
      });
  },
  changeTaskPriority: (id, priority) => {
    const t = get().tasks.find((x) => x.id === id);
    get().updateTask(id, { priority });
    if (t)
      get().logActivity({
        taskId: id,
        projectId: t.projectId,
        actorId: get().currentProfileId || 'u_pame',
        verb: 'a changé la priorité en',
        target: ['Faible', 'Normale', 'Haute', 'Critique'][priority - 1],
      });
  },

  addComment: (taskId, body, authorId) => {
    authorId = authorId || get().currentProfileId || 'u_pame';
    const c: Comment = { id: uid('c'), taskId, authorId, body, createdAt: new Date().toISOString() };
    set((s) => ({ comments: [...s.comments, c] }));
    dbPersist.put('comments', c);
    get().updateTask(taskId, {
      commentCount: (get().tasks.find((t) => t.id === taskId)?.commentCount || 0) + 1,
    });
    // @mentions → notifications. On cible chaque membre dont le nom apparaît
    // précédé d'un « @ » dans le commentaire (hors l'auteur).
    const author = get().users.find((u) => u.id === authorId);
    const task = get().tasks.find((t) => t.id === taskId);
    const mentioned = get().users.filter(
      (u) => u.id !== authorId && new RegExp(`@${escapeRegExp(u.name)}\\b`, 'i').test(body)
    );
    for (const u of mentioned) {
      const note: Notification = {
        id: uid('n'),
        type: 'mention',
        title: `${author?.name ?? 'Quelqu’un'} vous a mentionné`,
        body: `${task ? `« ${task.title} » — ` : ''}${body.slice(0, 120)}`,
        createdAt: new Date().toISOString(),
        read: false,
        actorId: authorId,
        taskId,
        userId: u.id,
      };
      set((s) => ({ notifications: [note, ...s.notifications] }));
      dbPersist.put('notifications', note);
    }
  },
  deleteComment: (id) => {
    const c = get().comments.find((x) => x.id === id);
    if (!c) return;
    set((s) => ({ comments: s.comments.filter((x) => x.id !== id) }));
    dbPersist.delete('comments', id);
    const t = get().tasks.find((x) => x.id === c.taskId);
    if (t) get().updateTask(t.id, { commentCount: Math.max(0, (t.commentCount || 1) - 1) });
  },
  reactToComment: (id, emoji) => {
    set((s) => ({
      comments: s.comments.map((c) => {
        if (c.id !== id) return c;
        const list = c.reactions ?? [];
        const existing = list.find((r) => r.emoji === emoji);
        const next = existing
          ? list.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1 } : r))
          : [...list, { emoji, count: 1 }];
        return { ...c, reactions: next };
      }),
    }));
    const updated = get().comments.find((c) => c.id === id);
    if (updated) dbPersist.put('comments', updated);
  },

  markNotificationRead: (id) => {
    set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }));
    const updated = get().notifications.find((n) => n.id === id);
    if (updated) dbPersist.put('notifications', updated);
  },
  markAllNotificationsRead: () => {
    set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) }));
    dbPersist.bulkPut('notifications', get().notifications);
  },
  clearNotifications: () => {
    const ids = get().notifications.map((n) => n.id);
    set({ notifications: [] });
    dbPersist.bulkDelete('notifications', ids);
  },

  createGoal: (g) => {
    // Auto-piloté par défaut : la progression suivra les actions liées.
    const goal: Goal = { id: uid('g'), progressMode: 'auto', ...g };
    set((s) => ({ goals: [...s.goals, goal] }));
    dbPersist.put('goals', goal);
    get().pushToast({ kind: 'success', title: 'Goal créé', body: goal.title });
    // Reflète immédiatement d'éventuelles actions déjà liées (ex. depuis un
    // goal parent) sans attendre le prochain changement de tâche.
    if (goal.progressMode !== 'manual') get().recomputeGoalFromTasks(goal.id);
  },
  updateGoal: (id, patch) => {
    set((s) => ({ goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
    const updated = get().goals.find((g) => g.id === id);
    if (updated) dbPersist.put('goals', updated);
  },
  deleteGoal: (id) => {
    // Null out the link on any task that contributed to this goal — otherwise
    // those tasks would carry a dangling goalId that the drawer "Contribue à"
    // panel would try to look up.
    const affectedTaskIds = get()
      .tasks.filter((t) => t.goalId === id)
      .map((t) => t.id);
    if (affectedTaskIds.length) {
      set((s) => ({
        tasks: s.tasks.map((t) => (t.goalId === id ? { ...t, goalId: undefined } : t)),
      }));
      const after = get().tasks;
      for (const tid of affectedTaskIds) {
        const t = after.find((x) => x.id === tid);
        if (t) dbPersist.put('tasks', t);
      }
    }
    set((s) => ({ goals: s.goals.filter((g) => g.id !== id) }));
    dbPersist.delete('goals', id);
    get().pushToast({ kind: 'info', title: 'Goal supprimé' });
  },
  bumpGoalValue: (id, delta) => {
    const g = get().goals.find((x) => x.id === id);
    if (!g) return;
    const next = Math.max(0, g.currentValue + delta);
    get().updateGoal(id, { currentValue: next });
  },
  recomputeGoalFromTasks: (goalId) => {
    // Coalesce bursts of recomputes on the same goal (e.g. cocher 5
    // sous-tâches d'affilée) into a single microtask-deferred run. Without
    // this, each toggle fires its own updateGoal → 5 concurrent upserts
    // on the same row, and the last one to land on the server wins —
    // which may not be the latest in-memory value.
    if (_pendingGoalRecomputes.has(goalId)) return;
    _pendingGoalRecomputes.add(goalId);
    queueMicrotask(() => {
      _pendingGoalRecomputes.delete(goalId);
      const goal = get().goals.find((g) => g.id === goalId);
      if (!goal) return;
      // Mode manuel : l'utilisateur pilote `currentValue` à la main — on ne
      // l'écrase jamais. `undefined` vaut 'auto' (données existantes).
      if (goal.progressMode === 'manual') return;
      // Progression pondérée par les sous-actions, pour TOUS les types de
      // métriques (ratio d'exécution appliqué à la cible pour number/currency).
      const { currentValue, health, status } = computeGoalProgress(
        goal,
        get().tasks,
        get().subtasks
      );
      get().updateGoal(goalId, { currentValue, health, status });
    });
  },
  reconcileAutoGoals: () => {
    const { goals, tasks, subtasks } = get();
    for (const goal of goals) {
      if (goal.progressMode === 'manual') continue;
      const { currentValue, health, status } = computeGoalProgress(goal, tasks, subtasks);
      // N'écrit (et ne persiste) que si quelque chose a bougé — évite un flot
      // d'upserts inutiles à chaque chargement.
      if (goal.currentValue !== currentValue || goal.health !== health || goal.status !== status) {
        get().updateGoal(goal.id, { currentValue, health, status });
      }
    }
  },

  createProject: (p) => {
    const project: Project = {
      id: uid('p'),
      slug: (p.name || 'projet').toLowerCase().replace(/\s+/g, '-'),
      name: p.name,
      folderId: p.folderId,
      description: p.description,
      status: p.status ?? 'active',
      color: p.color ?? '#95B07D',
      icon: p.icon ?? 'Compass',
      ownerId: p.ownerId ?? get().currentProfileId ?? 'u_pame',
      health: p.health ?? 'green',
      progress: p.progress ?? 0,
      taskCount: 0,
      membersIds: p.membersIds ?? [get().currentProfileId ?? 'u_pame'],
      startDate: p.startDate,
      endDate: p.endDate,
    };
    set((s) => ({ projects: [...s.projects, project] }));
    dbPersist.put('projects', project);
    // Mirror the membership onto the parent folder's projectIds so the
    // project shows up under its folder in the sidebar immediately and
    // the mirror stays consistent with moveProjectToFolder / deleteProject.
    if (project.folderId) {
      set((s) => ({
        folders: s.folders.map((f) =>
          f.id === project.folderId
            ? {
                ...f,
                projectIds: (f.projectIds ?? []).includes(project.id)
                  ? (f.projectIds ?? [])
                  : [...(f.projectIds ?? []), project.id],
              }
            : f
        ),
      }));
      const parentFolder = get().folders.find((f) => f.id === project.folderId);
      if (parentFolder) dbPersist.put('folders', parentFolder);
    }
    // seed sections
    const baseSections: Section[] = [
      { id: uid('s'), projectId: project.id, name: 'À faire', color: '#5A6055', position: 0 },
      { id: uid('s'), projectId: project.id, name: 'En cours', color: '#95B07D', position: 1, wipLimit: 5 },
      { id: uid('s'), projectId: project.id, name: 'En revue', color: '#8AA6C4', position: 2 },
      { id: uid('s'), projectId: project.id, name: 'Terminé', color: '#7AC388', position: 3 },
    ];
    set((s) => ({ sections: [...s.sections, ...baseSections] }));
    dbPersist.bulkPut('sections', baseSections);
    get().pushToast({ kind: 'success', title: 'Projet créé', body: project.name });
    return project;
  },
  updateProject: (id, patch) => {
    const prevFolderId = get().projects.find((p) => p.id === id)?.folderId;
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
    const updated = get().projects.find((p) => p.id === id);
    if (updated) dbPersist.put('projects', updated);
    // When the edit modal reassigns the project to another folder, keep
    // both folders' projectIds mirrors consistent with the new folderId.
    if ('folderId' in patch && patch.folderId !== prevFolderId) {
      set((s) => ({
        folders: s.folders.map((f) => {
          if (f.id === prevFolderId) {
            return { ...f, projectIds: (f.projectIds ?? []).filter((pid) => pid !== id) };
          }
          if (f.id === patch.folderId) {
            const ids = f.projectIds ?? [];
            return ids.includes(id) ? f : { ...f, projectIds: [...ids, id] };
          }
          return f;
        }),
      }));
      for (const fid of [prevFolderId, patch.folderId]) {
        if (!fid) continue;
        const f = get().folders.find((x) => x.id === fid);
        if (f) dbPersist.put('folders', f);
      }
    }
  },
  deleteProject: (id) => {
    const beforeTasks = get().tasks;
    const allSections = get().sections;

    // Pass 1: primary-project tasks. If a task is also shared into another
    // project (alsoInProjectIds), promote it there instead of deleting it
    // outright — otherwise the user would see it silently vanish from the
    // secondary project where it was visible.
    const tasksOfPrimary = beforeTasks.filter((t) => t.projectId === id);
    const promotions: { taskId: string; toProjectId: string; toSectionId: string }[] = [];
    const tasksToDelete: string[] = [];
    for (const t of tasksOfPrimary) {
      const candidates = (t.alsoInProjectIds ?? []).filter((pid) => pid !== id);
      let promoted = false;
      for (const target of candidates) {
        const sec = allSections
          .filter((s) => s.projectId === target)
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0];
        if (sec) {
          promotions.push({ taskId: t.id, toProjectId: target, toSectionId: sec.id });
          promoted = true;
          break;
        }
      }
      if (!promoted) tasksToDelete.push(t.id);
    }

    // Tasks that referenced the deleted project via alsoInProjectIds (not
    // primary). We strip the dead reference and persist them.
    const stripTaskIds = beforeTasks
      .filter((t) => t.projectId !== id && t.alsoInProjectIds?.includes(id))
      .map((t) => t.id);

    // Cascade indexes for everything that points at the truly-deleted tasks.
    const sectionIds = allSections.filter((s) => s.projectId === id).map((s) => s.id);
    const formIds = get()
      .forms.filter((f) => f.projectId === id)
      .map((f) => f.id);
    const commentIds = get()
      .comments.filter((c) => tasksToDelete.includes(c.taskId))
      .map((c) => c.id);
    const subtaskIds = get()
      .subtasks.filter((s) => tasksToDelete.includes(s.taskId))
      .map((s) => s.id);
    const attachmentIds = get()
      .attachments.filter((a) => tasksToDelete.includes(a.taskId))
      .map((a) => a.id);
    const dependencyIds = get()
      .dependencies.filter((d) => tasksToDelete.includes(d.taskId) || tasksToDelete.includes(d.relatedTaskId))
      .map((d) => d.id);
    const activityIds = get()
      .activity.filter((a) => (a.taskId && tasksToDelete.includes(a.taskId)) || a.projectId === id)
      .map((a) => a.id);
    const noteTaskIds = get()
      .notes.filter((n) => tasksToDelete.includes(n.taskId))
      .map((n) => n.taskId);

    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      sections: s.sections.filter((sec) => sec.projectId !== id),
      forms: s.forms.filter((f) => f.projectId !== id),
      comments: s.comments.filter((c) => !commentIds.includes(c.id)),
      subtasks: s.subtasks.filter((sub) => !subtaskIds.includes(sub.id)),
      attachments: s.attachments.filter((a) => !attachmentIds.includes(a.id)),
      dependencies: s.dependencies.filter((d) => !dependencyIds.includes(d.id)),
      activity: s.activity.filter((a) => !activityIds.includes(a.id)),
      notes: s.notes.filter((n) => !noteTaskIds.includes(n.taskId)),
      tasks: s.tasks
        .filter((t) => !tasksToDelete.includes(t.id))
        .map((t) => {
          const promo = promotions.find((p) => p.taskId === t.id);
          if (promo) {
            const remaining = (t.alsoInProjectIds ?? []).filter(
              (pid) => pid !== id && pid !== promo.toProjectId
            );
            return {
              ...t,
              projectId: promo.toProjectId,
              sectionId: promo.toSectionId,
              alsoInProjectIds: remaining.length ? remaining : undefined,
            };
          }
          if (t.alsoInProjectIds?.includes(id)) {
            const filtered = t.alsoInProjectIds.filter((pid) => pid !== id);
            return { ...t, alsoInProjectIds: filtered.length ? filtered : undefined };
          }
          return t;
        }),
      folders: s.folders.map((f) =>
        f.projectIds?.includes(id) ? { ...f, projectIds: f.projectIds.filter((pid) => pid !== id) } : f
      ),
    }));

    // Persist: deletions are bulk; updated tasks (promotions + alsoIn strips)
    // are persisted individually with their fresh state.
    dbPersist.delete('projects', id);
    dbPersist.bulkDelete('tasks', tasksToDelete);
    dbPersist.bulkDelete('sections', sectionIds);
    dbPersist.bulkDelete('forms', formIds);
    if (commentIds.length) dbPersist.bulkDelete('comments', commentIds);
    if (subtaskIds.length) dbPersist.bulkDelete('subtasks', subtaskIds);
    if (attachmentIds.length) dbPersist.bulkDelete('attachments', attachmentIds);
    if (dependencyIds.length) dbPersist.bulkDelete('dependencies', dependencyIds);
    if (activityIds.length) dbPersist.bulkDelete('activity', activityIds);
    if (noteTaskIds.length) dbPersist.bulkDelete('notes', noteTaskIds);
    const after = get().tasks;
    const idsToRepersist = new Set<string>([...promotions.map((p) => p.taskId), ...stripTaskIds]);
    for (const tid of idsToRepersist) {
      const t = after.find((x) => x.id === tid);
      if (t) dbPersist.put('tasks', t);
    }
    for (const folder of get().folders) {
      if (folder.projectIds && !folder.projectIds.includes(id)) dbPersist.put('folders', folder);
    }
    get().pushToast({ kind: 'info', title: 'Projet supprimé' });
  },

  createFolder: ({ name, color, icon, sphere }) => {
    // Compute the next `order` rank within the target sphere so the new
    // folder lands at the bottom of its group instead of overlapping
    // existing rows in a non-deterministic way.
    const targetSphere: 'personnel' | 'professionnel' = sphere ?? 'personnel';
    const existing = get().folders.filter((f) => (f.sphere ?? 'personnel') === targetSphere);
    const nextOrder = existing.length;
    const folder: Folder = {
      id: uid('f'),
      name: name.trim(),
      color: color ?? '#6E8B58',
      icon: icon ?? 'briefcase',
      sphere: targetSphere,
      order: nextOrder,
      projectIds: [],
    };
    set((s) => ({ folders: [...s.folders, folder] }));
    dbPersist.put('folders', folder);
    get().pushToast({ kind: 'success', title: 'Dossier créé', body: folder.name });
    return folder;
  },
  updateFolder: (id, patch) => {
    set((s) => ({ folders: s.folders.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
    const updated = get().folders.find((f) => f.id === id);
    if (updated) dbPersist.put('folders', updated);
  },
  deleteFolder: (id) => {
    // Folder removal does NOT delete projects — those move back to the
    // "ungrouped" pool (folderId becomes undefined). Safer default than
    // cascading a project tree the user may not have meant to nuke.
    const orphanedProjects = get().projects.filter((p) => p.folderId === id);
    set((s) => ({
      folders: s.folders.filter((f) => f.id !== id),
      projects: s.projects.map((p) => (p.folderId === id ? { ...p, folderId: undefined } : p)),
    }));
    dbPersist.delete('folders', id);
    for (const p of orphanedProjects) {
      const updated = get().projects.find((x) => x.id === p.id);
      if (updated) dbPersist.put('projects', updated);
    }
    get().pushToast({
      kind: 'info',
      title: 'Dossier supprimé',
      body:
        orphanedProjects.length > 0
          ? `${orphanedProjects.length} projet${orphanedProjects.length > 1 ? 's déplacés' : ' déplacé'} hors dossier`
          : undefined,
    });
  },

  reorderFolders: (orderedIds) => {
    // Re-order in-memory by mapping the passed id list back to folder
    // objects (skipping unknown ids defensively), then write each folder
    // back with its new `order` so subsequent reloads keep the layout.
    set((s) => {
      const byId = new Map(s.folders.map((f) => [f.id, f]));
      const reordered: typeof s.folders = [];
      orderedIds.forEach((id, idx) => {
        const f = byId.get(id);
        if (f) reordered.push({ ...f, order: idx });
      });
      // Append any folders not present in orderedIds (shouldn't happen
      // but keeps the operation non-destructive).
      for (const f of s.folders) if (!orderedIds.includes(f.id)) reordered.push(f);
      return { folders: reordered };
    });
    // Persist the new order on every affected row.
    for (const f of get().folders) dbPersist.put('folders', f);
  },

  moveFolderToSphere: (folderId, sphere) => {
    const folder = get().folders.find((f) => f.id === folderId);
    if (!folder) return;
    if ((folder.sphere ?? 'personnel') === sphere) return;
    // Append to the end of the target sphere group.
    const sphereSize = get().folders.filter((f) => (f.sphere ?? 'personnel') === sphere).length;
    set((s) => ({
      folders: s.folders.map((f) => (f.id === folderId ? { ...f, sphere, order: sphereSize } : f)),
    }));
    const updated = get().folders.find((f) => f.id === folderId);
    if (updated) dbPersist.put('folders', updated);
    get().pushToast({
      kind: 'info',
      title: 'Dossier déplacé',
      body: `Vers la sphère ${sphere === 'personnel' ? 'Personnel' : 'Professionnel'}`,
    });
  },

  moveProjectToFolder: (projectId, targetFolderId) => {
    const project = get().projects.find((p) => p.id === projectId);
    if (!project) return;
    if (project.folderId === targetFolderId) return;
    const prevFolderId = project.folderId;
    set((s) => ({
      projects: s.projects.map((p) => (p.id === projectId ? { ...p, folderId: targetFolderId } : p)),
      folders: s.folders.map((f) => {
        // Remove the project from the previous folder's projectIds list
        if (f.id === prevFolderId) {
          return { ...f, projectIds: (f.projectIds ?? []).filter((id) => id !== projectId) };
        }
        // Append it to the target folder's projectIds (avoid duplicates)
        if (f.id === targetFolderId) {
          const ids = f.projectIds ?? [];
          return ids.includes(projectId) ? f : { ...f, projectIds: [...ids, projectId] };
        }
        return f;
      }),
    }));
    // Persist the moved project + both impacted folders.
    const updatedProject = get().projects.find((p) => p.id === projectId);
    if (updatedProject) dbPersist.put('projects', updatedProject);
    for (const fid of [prevFolderId, targetFolderId]) {
      if (!fid) continue;
      const f = get().folders.find((x) => x.id === fid);
      if (f) dbPersist.put('folders', f);
    }
  },

  toggleAutomation: (id) => {
    set((s) => ({
      automations: s.automations.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)),
    }));
    const a = get().automations.find((x) => x.id === id);
    if (a) dbPersist.put('automations', a);
    get().pushToast({
      kind: 'info',
      title: a?.enabled ? 'Automation activée' : 'Automation désactivée',
      body: a?.name,
    });
  },
  deleteAutomation: (id) => {
    set((s) => ({ automations: s.automations.filter((a) => a.id !== id) }));
    dbPersist.delete('automations', id);
    get().pushToast({ kind: 'info', title: 'Automation supprimée' });
  },
  createAutomation: (a) => {
    const newA: AutomationRule = { id: uid('a'), runs: 0, success: 100, ...a };
    set((s) => ({ automations: [newA, ...s.automations] }));
    dbPersist.put('automations', newA);
    get().pushToast({ kind: 'success', title: 'Automation créée', body: a.name });
  },
  updateAutomation: (id, patch) => {
    set((s) => ({ automations: s.automations.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
    const a = get().automations.find((x) => x.id === id);
    if (a) dbPersist.put('automations', a);
    get().pushToast({ kind: 'success', title: 'Automation mise à jour', body: a?.name });
  },
  dryRunAutomation: (id) => {
    const a = get().automations.find((x) => x.id === id);
    if (!a) return 0;
    const now = Date.now();
    const tasks = get().tasks;
    // Count tasks the trigger would currently match — no side effects.
    const matches =
      a.triggerKey === 'due_overdue'
        ? tasks.filter((t) => t.dueDate && new Date(t.dueDate).getTime() < now && t.status !== 'done').length
        : a.triggerKey === 'status_changed'
          ? tasks.filter((t) => t.status !== 'done').length
          : a.triggerKey === 'recurrence'
            ? tasks.filter((t) => t.customFields?.['Récurrence']).length
            : tasks.length; // task_created
    set((s) => ({
      automations: s.automations.map((x) => (x.id === id ? { ...x, runs: x.runs + 1 } : x)),
    }));
    const updated = get().automations.find((x) => x.id === id);
    if (updated) dbPersist.put('automations', updated);
    return matches;
  },

  // === Forms ===
  createForm: (f) => {
    const id = uid('f');
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'https://cockpit-journey.atlas-studio.org';
    const form: IntakeForm = {
      id,
      submissions: 0,
      createdAt: new Date().toISOString(),
      publicUrl: `${origin}/f/${id}`,
      ...f,
    };
    set((s) => ({ forms: [form, ...s.forms] }));
    dbPersist.put('forms', form);
    get().pushToast({ kind: 'success', title: 'Form créé', body: form.name });
    return form;
  },
  updateForm: (id, patch) => {
    set((s) => ({ forms: s.forms.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
    const updated = get().forms.find((f) => f.id === id);
    if (updated) dbPersist.put('forms', updated);
  },
  deleteForm: (id) => {
    set((s) => ({ forms: s.forms.filter((f) => f.id !== id) }));
    dbPersist.delete('forms', id);
    get().pushToast({ kind: 'info', title: 'Form supprimé' });
  },
  toggleFormEnabled: (id) => {
    set((s) => ({ forms: s.forms.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f)) }));
    const updated = get().forms.find((f) => f.id === id);
    if (updated) dbPersist.put('forms', updated);
  },
  addFormField: (formId, field) => {
    set((s) => ({
      forms: s.forms.map((f) =>
        f.id === formId ? { ...f, fields: [...f.fields, { id: uid('ff'), ...field }] } : f
      ),
    }));
    const updated = get().forms.find((f) => f.id === formId);
    if (updated) dbPersist.put('forms', updated);
  },
  updateFormField: (formId, fieldId, patch) => {
    set((s) => ({
      forms: s.forms.map((f) =>
        f.id === formId
          ? { ...f, fields: f.fields.map((x) => (x.id === fieldId ? { ...x, ...patch } : x)) }
          : f
      ),
    }));
    const updated = get().forms.find((f) => f.id === formId);
    if (updated) dbPersist.put('forms', updated);
  },
  removeFormField: (formId, fieldId) => {
    set((s) => ({
      forms: s.forms.map((f) =>
        f.id === formId ? { ...f, fields: f.fields.filter((x) => x.id !== fieldId) } : f
      ),
    }));
    const updated = get().forms.find((f) => f.id === formId);
    if (updated) dbPersist.put('forms', updated);
  },
  simulateFormSubmission: (formId) => {
    set((s: any) => ({
      forms: s.forms.map((f: any) => (f.id === formId ? { ...f, submissions: f.submissions + 1 } : f)),
    }));
    const updated = get().forms.find((x) => x.id === formId);
    if (updated) dbPersist.put('forms', updated);
    const f = get().forms.find((x) => x.id === formId);
    if (!f) return;
    const project = get().projects.find((p) => p.id === f.projectId);
    const section = get().sections.find((s) => s.projectId === f.projectId);
    if (!project || !section) return;
    // Generate a realistic task title from the form
    // Generic placeholder text for the simulated submission — no fake
    // person names that could be mistaken for real teammates. Real
    // submissions populate the title from the form payload itself.
    const samples = [
      'Demande de support · ticket #',
      'Inscription · ',
      'Soumission · ',
      'Demande externe · ',
    ];
    const ref =
      'ext-' + Math.random().toString(36).slice(2, 6).toUpperCase() + '-' + String(Date.now()).slice(-4);
    const subject = samples[Math.floor(Math.random() * samples.length)] + ref;
    get().createTask({
      title: `[${f.name}] ${subject}`,
      description: `Soumission reçue via le formulaire "${f.name}" (${f.publicUrl})`,
      projectId: f.projectId,
      sectionId: section.id,
      priority: 2,
      tags: ['form', 'externe'],
      source: 'form' as any,
      assignees: [project.ownerId],
    });
    get().logActivity({
      projectId: f.projectId,
      actorId: project.ownerId,
      verb: 'a reçu une soumission via',
      target: f.name,
    });
  },

  // === Reports ===
  generateReport: (kind) => {
    const titles: Record<ReportKind, string> = {
      weekly: 'Rapport hebdomadaire',
      monthly: 'Bilan mensuel',
      quarterly: 'Bilan trimestriel',
      annual: 'Bilan annuel',
    };

    // Compute structured period bounds (inclusive) in addition to the
    // human-readable `period` label. Exporters and the Reports table use
    // periodStart/End for the "DD/MM/YYYY → DD/MM/YYYY" display.
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const startOfDay = (d: Date) => {
      const c = new Date(d);
      c.setHours(0, 0, 0, 0);
      return c;
    };
    let periodStart: Date;
    let periodEnd: Date;
    if (kind === 'weekly') {
      periodEnd = startOfDay(today);
      periodEnd.setHours(23, 59, 59, 999);
      periodStart = startOfDay(new Date(today.getTime() - 6 * 86_400_000));
    } else if (kind === 'monthly') {
      periodStart = new Date(today.getFullYear(), today.getMonth(), 1);
      periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (kind === 'quarterly') {
      const q = Math.floor(today.getMonth() / 3);
      periodStart = new Date(today.getFullYear(), q * 3, 1);
      periodEnd = new Date(today.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999);
    } else {
      periodStart = new Date(today.getFullYear(), 0, 1);
      periodEnd = new Date(today.getFullYear(), 11, 31, 23, 59, 59, 999);
    }
    const period =
      kind === 'weekly'
        ? `Semaine du ${periodStart.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} au ${periodEnd.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}`
        : kind === 'monthly'
          ? today.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
          : kind === 'quarterly'
            ? `T${Math.floor(today.getMonth() / 3) + 1} ${today.getFullYear()}`
            : `${today.getFullYear()}`;
    const tasks = get().tasks;
    const projects = get().projects;
    const users = get().users;
    const goals = get().goals;
    const automations = get().automations;
    const now = Date.now();

    // Per-project breakdown
    const projectsBreakdown: ReportProjectBreakdown[] = projects
      .filter((p) => p.status !== 'archived')
      .map((p) => {
        const pTasks = tasks.filter((t) => t.projectId === p.id);
        const done = pTasks.filter((t) => t.status === 'done').length;
        const overdue = pTasks.filter(
          (t) => t.dueDate && new Date(t.dueDate).getTime() < now && t.status !== 'done'
        ).length;
        const critical = pTasks.filter((t) => t.priority === 4 && t.status !== 'done').length;
        const inProg = pTasks.filter((t) => t.status === 'in_progress').length;
        const summary =
          p.health === 'red'
            ? `Le projet est en alerte rouge avec ${critical} tâche(s) critique(s) et ${overdue} en retard. Recadrage à prévoir.`
            : p.health === 'yellow'
              ? `Le projet montre des signes de tension : ${overdue} retard(s), ${critical} critique(s). À surveiller.`
              : `Le projet avance sereinement (${done}/${pTasks.length} livrées, ${inProg} en cours).`;
        const riskNote =
          overdue > 2
            ? `${overdue} tâches en retard accumulent un risque de glissement de jalon.`
            : critical > 0 && p.health !== 'green'
              ? `${critical} tâche(s) critique(s) non livrée(s) — escalade recommandée.`
              : undefined;
        return {
          projectId: p.id,
          name: p.name,
          color: p.color,
          health: p.health,
          progress: p.progress,
          tasksTotal: pTasks.length,
          tasksDone: done,
          tasksInProgress: inProg,
          tasksOverdue: overdue,
          tasksCritical: critical,
          // Real weekly velocity: tasks completed in the last 7 days minus
          // the 7 days before that (by completionDate). Deterministic.
          velocityDelta: (() => {
            const wk = 7 * 86400000;
            const doneIn = (lo: number, hi: number) =>
              pTasks.filter(
                (t) =>
                  t.status === 'done' &&
                  t.completionDate &&
                  now - new Date(t.completionDate).getTime() > lo &&
                  now - new Date(t.completionDate).getTime() <= hi
              ).length;
            return doneIn(0, wk) - doneIn(wk, 2 * wk);
          })(),
          endDate: p.endDate,
          members: p.membersIds.length,
          summary,
          riskNote,
        };
      });

    // Attention points
    const attentionPoints: AttentionPoint[] = [];
    projectsBreakdown.forEach((p) => {
      if (p.health === 'red') {
        attentionPoints.push({
          severity: 'critical',
          title: `${p.name} en zone rouge`,
          detail: `${p.tasksCritical} tâche(s) critique(s), ${p.tasksOverdue} en retard, avancement ${p.progress}%.`,
          scope: p.name,
          recommendation: "Convoquer un point d'arbitrage cette semaine et redéfinir les priorités.",
        });
      }
      if (p.tasksOverdue >= 3) {
        attentionPoints.push({
          severity: 'high',
          title: `${p.tasksOverdue} retards sur ${p.name}`,
          detail: `Plusieurs échéances dépassées. Risque de glissement du jalon final.`,
          scope: p.name,
          recommendation: 'Reprogrammer ou réduire le scope. Désigner un référent unique.',
        });
      }
    });
    const overdueTotal = tasks.filter(
      (t) => t.dueDate && new Date(t.dueDate).getTime() < now && t.status !== 'done'
    ).length;
    if (overdueTotal >= 5) {
      attentionPoints.push({
        severity: 'high',
        title: `Charge globale en retard (${overdueTotal} tâches)`,
        detail: "L'accumulation de retards traverse plusieurs projets, signe d'une sur-allocation.",
        scope: 'Workspace',
        recommendation: 'Faire une revue de charge équipe et déprioriser 20% du backlog.',
      });
    }
    goals
      .filter((g) => g.health === 'red' || g.health === 'yellow')
      .forEach((g) => {
        attentionPoints.push({
          severity: g.health === 'red' ? 'critical' : 'medium',
          title: `Goal "${g.title}" ${g.health === 'red' ? 'off-track' : 'à risque'}`,
          detail: `Avancement ${Math.round((g.currentValue / Math.max(1, g.targetValue)) * 100)}% (${g.currentValue}/${g.targetValue}${g.unit ? ' ' + g.unit : ''}).`,
          scope: 'Goals & OKRs',
          recommendation:
            g.health === 'red'
              ? 'Re-baseliner ou réallouer des ressources.'
              : 'Revue hebdomadaire pour surveiller la trajectoire.',
        });
      });

    // Workload
    const workload: ReportWorkloadEntry[] = users.slice(0, 7).map((u) => {
      const open = tasks.filter((t) => t.assignees.includes(u.id) && t.status !== 'done');
      const planned = Math.round(open.reduce((sum, t) => sum + (t.estimatedMinutes || 60), 0) / 60);
      const capacity = get().settings.weeklyCapacityHours;
      const status: ReportWorkloadEntry['status'] =
        planned > capacity ? 'overloaded' : planned < capacity * 0.6 ? 'available' : 'optimal';
      return {
        userId: u.id,
        name: u.name,
        initials: u.initials,
        color: u.color,
        plannedHours: planned,
        capacityHours: capacity,
        tasksOpen: open.length,
        status,
      };
    });

    // Goals progress
    const goalsProgress: ReportGoalEntry[] = goals.map((g) => {
      const owner = users.find((u) => u.id === g.ownerId) || users[0];
      return {
        id: g.id,
        title: g.title,
        pct: Math.round((g.currentValue / Math.max(1, g.targetValue)) * 100),
        // Real weekly movement: contributing tasks completed in the last 7 days.
        delta: tasks.filter(
          (t) =>
            t.goalId === g.id &&
            t.status === 'done' &&
            t.completionDate &&
            now - new Date(t.completionDate).getTime() <= 7 * 86400000
        ).length,
        health: g.health,
        ownerInitials: owner.initials,
        ownerColor: owner.color,
      };
    });

    // Top retards
    const topRetards: ReportRetard[] = tasks
      .filter((t) => t.dueDate && new Date(t.dueDate).getTime() < now && t.status !== 'done')
      .map((t) => {
        const project = projects.find((p) => p.id === t.projectId);
        const owner = users.find((u) => t.assignees.includes(u.id));
        return {
          taskId: t.id,
          title: t.title,
          daysLate: Math.max(1, Math.floor((now - new Date(t.dueDate!).getTime()) / 86400000)),
          projectName: project?.name || '—',
          ownerInitials: owner?.initials || '—',
          priority: t.priority,
        };
      })
      .sort((a, b) => b.daysLate - a.daysLate)
      .slice(0, 8);

    // Top achievements
    const recentDone = tasks.filter((t) => t.status === 'done').slice(0, 5);
    const topAchievements = recentDone.map(
      (t) => `${t.title} (${projects.find((p) => p.id === t.projectId)?.name || '—'})`
    );

    const tasksDone = tasks.filter((t) => t.status === 'done').length;
    const automationsRun = automations.reduce((s, a) => s + a.runs, 0);

    const report: Report = {
      id: uid('r'),
      kind,
      title: `${titles[kind]} — ${period}`,
      period,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      generatedAt: new Date().toISOString(),
      authorId: get().currentProfileId || 'u_pame',
      highlights: [
        `${tasksDone} tâches livrées sur la période (toutes périodes confondues)`,
        `${goalsProgress.filter((g) => g.health === 'green').length} goals on-track sur ${goals.length}`,
        `${automationsRun} exécutions d'automations enregistrées`,
        topAchievements[0] && `Faits marquants : ${topAchievements[0]}`,
      ].filter(Boolean) as string[],
      metrics: [
        { label: 'Tâches actives', value: String(tasks.filter((t) => t.status !== 'done').length), delta: 8 },
        { label: 'Tâches livrées', value: String(tasksDone), delta: 12 },
        {
          label: 'Projets actifs',
          value: String(projects.filter((p) => p.status === 'active').length),
          delta: 0,
        },
        { label: 'En retard', value: String(overdueTotal), delta: overdueTotal > 5 ? 18 : -3 },
        { label: 'Automations', value: String(automationsRun), delta: 5 },
        {
          label: 'Goals on-track',
          value: `${goalsProgress.filter((g) => g.health === 'green').length}/${goals.length}`,
        },
      ],
      blockers: attentionPoints
        .filter((a) => a.severity === 'critical')
        .map((a) => `${a.scope} — ${a.title}`),
      nextSteps: [
        attentionPoints[0]?.recommendation,
        attentionPoints[1]?.recommendation,
        'Préparer la revue de pipeline en début de semaine prochaine.',
      ].filter(Boolean) as string[],
      projects: projectsBreakdown,
      attentionPoints,
      workload,
      goalsProgress,
      topRetards,
      topAchievements,
    };
    set((s) => ({ reports: [report, ...s.reports] }));
    dbPersist.put('reports', report);
    get().pushToast({
      kind: 'success',
      title: `${titles[kind]} généré`,
      body: `${projectsBreakdown.length} projets analysés · ${attentionPoints.length} points d'attention`,
    });
    return report;
  },

  generateReportNarrative: async (id) => {
    const report = get().reports.find((r) => r.id === id);
    if (!report) return;
    const cfg = get().settings.proph3t;
    if (!cfg.apiKey && cfg.provider !== 'ollama-cloud') {
      get().pushToast({
        kind: 'warning',
        title: 'Clé PROPH3T manquante',
        body: 'Paramètres → IA → coller votre clé Groq',
      });
      return;
    }
    get().pushToast({ kind: 'info', title: 'PROPH3T rédige le rapport…', duration: 1500 });
    try {
      const { ProphClient } = await import('../lib/proph3t');
      const client = new ProphClient(cfg);
      const projectsSummary = (report.projects || [])
        .map(
          (p) =>
            `- ${p.name} (santé ${p.health}, ${p.tasksDone}/${p.tasksTotal} livrées, ${p.tasksOverdue} retard, ${p.tasksCritical} critique)`
        )
        .join('\n');
      const attention = (report.attentionPoints || [])
        .map((a) => `- [${a.severity}] ${a.title} — ${a.detail}`)
        .join('\n');
      const narrative = await client.chat(
        [
          {
            role: 'user',
            content: `Rédige une narration exécutive structurée pour le rapport "${report.title}" (${report.period}).

Données disponibles :
${projectsSummary}

Points d'attention :
${attention}

Format markdown attendu :
## Synthèse exécutive
2-3 phrases.

## Avancement par projet
Pour chaque projet, 1-2 phrases d'analyse.

## Points d'attention prioritaires
Liste classée par sévérité avec recommandation actionnable.

## Recommandations stratégiques
3 actions concrètes à mener cette période.

Reste sous 400 mots, ton factuel et engagé.`,
          },
        ],
        { temperature: 0.4, maxTokens: 800 }
      );
      set((s) => ({ reports: s.reports.map((r) => (r.id === id ? { ...r, narrative } : r)) }));
      const updated = get().reports.find((r) => r.id === id);
      if (updated) dbPersist.put('reports', updated);
      get().pushToast({ kind: 'success', title: 'Narration PROPH3T ajoutée', body: cfg.model });
    } catch (err: any) {
      get().pushToast({
        kind: 'error',
        title: 'Échec génération PROPH3T',
        body: err?.message || 'Vérifiez votre clé API',
      });
    }
  },

  deleteReport: (id) => {
    set((s) => ({ reports: s.reports.filter((r) => r.id !== id) }));
    dbPersist.delete('reports', id);
    get().pushToast({ kind: 'info', title: 'Rapport supprimé' });
  },

  // === Attachments / Dependencies / Notes / Activity ===
  addAttachment: (taskId, name, kind, size = '–', path) => {
    const at: Attachment = {
      id: uid('at'),
      taskId,
      name,
      kind,
      size,
      uploadedAt: new Date().toISOString(),
      ...(path ? { path } : {}),
    };
    set((s) => ({ attachments: [...s.attachments, at] }));
    dbPersist.put('attachments', at);
    const t = get().tasks.find((x) => x.id === taskId);
    if (t) get().updateTask(taskId, { attachmentCount: (t.attachmentCount || 0) + 1 });
    get().logActivity({
      taskId,
      actorId: get().currentProfileId || 'u_pame',
      verb: 'a ajouté la pièce jointe',
      target: name,
    });
    get().pushToast({ kind: 'success', title: 'Pièce jointe ajoutée', body: name });
  },
  removeAttachment: (id) => {
    const at = get().attachments.find((a) => a.id === id);
    set((s) => ({ attachments: s.attachments.filter((a) => a.id !== id) }));
    dbPersist.delete('attachments', id);
    if (at) {
      const t = get().tasks.find((x) => x.id === at.taskId);
      if (t) get().updateTask(at.taskId, { attachmentCount: Math.max(0, (t.attachmentCount || 1) - 1) });
    }
  },
  addDependency: (taskId, relatedTaskId, relation) => {
    const dep = { id: uid('d'), taskId, relatedTaskId, relation };
    set((s) => ({ dependencies: [...s.dependencies, dep] }));
    dbPersist.put('dependencies', dep);
    get().pushToast({ kind: 'success', title: 'Lien ajouté' });
  },
  removeDependency: (id) => {
    set((s) => ({ dependencies: s.dependencies.filter((d) => d.id !== id) }));
    dbPersist.delete('dependencies', id);
  },
  toggleWatcher: (taskId, userId) => {
    const t = get().tasks.find((x) => x.id === taskId);
    if (!t) return;
    const w = t.watchers ?? [];
    const next = w.includes(userId) ? w.filter((x) => x !== userId) : [...w, userId];
    get().updateTask(taskId, { watchers: next });
  },
  setNote: (taskId, markdown) => {
    const updatedAt = new Date().toISOString();
    const note = { taskId, markdown, updatedAt };
    set((s) => {
      const idx = s.notes.findIndex((n) => n.taskId === taskId);
      if (idx === -1) return { notes: [...s.notes, note] };
      const next = s.notes.slice();
      next[idx] = note;
      return { notes: next };
    });
    dbPersist.put('notes', note);
  },
  logActivity: (e) => {
    const ev = { id: uid('av'), at: new Date().toISOString(), ...e };
    set((s) => ({ activity: [ev, ...s.activity] }));
    dbPersist.put('activity', ev);
  },

  dismissInsight: (id) => {
    set((s) => ({ insights: s.insights.filter((i) => i.id !== id) }));
    dbPersist.delete('insights', id);
  },
  regenerateBrief: async () => {
    const cfg = get().settings.proph3t;
    if (!cfg.apiKey && cfg.provider !== 'ollama-cloud') {
      get().pushToast({
        kind: 'info',
        title: 'Daily Brief (mock)',
        body: 'Configurez votre clé Groq dans Paramètres → IA pour une vraie génération',
      });
      return;
    }
    get().pushToast({ kind: 'info', title: 'PROPH3T génère votre Daily Brief…', duration: 1500 });
    try {
      const { ProphClient, generateDailyBrief } = await import('../lib/proph3t');
      const client = new ProphClient(cfg);
      const today = new Date();
      const todayStr = today.toDateString();
      const dueToday = get().tasks.filter(
        (t) => t.dueDate && new Date(t.dueDate).toDateString() === todayStr && t.status !== 'done'
      );
      const projects = get().projects;
      const text = await generateDailyBrief(client, {
        user: get().users[0].name,
        date: today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
        tasks: dueToday.map((t) => ({
          title: t.title,
          priority: t.priority,
          project: projects.find((p) => p.id === t.projectId)?.name || '—',
          due: t.dueDate
            ? new Date(t.dueDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
            : undefined,
        })),
        goalsCount: get().goals.length,
        insights: get()
          .insights.slice(0, 3)
          .map((i) => ({ kind: i.kind, title: i.title })),
      });
      // Append the generated brief as an insight card
      const newInsight = {
        id: 'i_brief_' + Date.now(),
        kind: 'tip' as const,
        title: 'Daily Brief PROPH3T (généré)',
        body: text.slice(0, 240) + '…',
        confidence: 0.95,
      };
      set((s: any) => ({ insights: [newInsight, ...s.insights] }));
      dbPersist.put('insights', newInsight);
      get().pushToast({ kind: 'success', title: 'Daily Brief généré', body: cfg.model });

      // MODE A (Proph3t core) — trace la génération IA dans l'audit chaîné
      // SHA-256 du cœur Atlas Studio. Best-effort, fire-and-forget : n'altère
      // ni le flux ni la latence si le core est injoignable.
      void import('../lib/proph3tCore').then(({ logProph3tAudit }) =>
        logProph3tAudit({
          action: 'ai_daily_brief',
          subjectType: 'user',
          subjectId: get().currentProfileId ?? undefined,
          content: {
            provider: cfg.provider,
            model: cfg.model,
            tasks_count: dueToday.length,
            generated_at: new Date().toISOString(),
          },
        })
      );
    } catch (err: any) {
      get().pushToast({
        kind: 'error',
        title: 'Échec génération',
        body: err?.message || 'Vérifiez votre clé API',
      });
    }
  },

  askProph3tCore: async ({ message, sensitivity }) => {
    const trimmed = message.trim();
    if (!trimmed) return null;
    let mod: typeof import('../lib/proph3tCore');
    try {
      mod = await import('../lib/proph3tCore');
    } catch {
      return null;
    }
    if (!mod.PROPH3T_CORE_CONFIGURED) {
      get().pushToast({
        kind: 'info',
        title: 'Proph3t core non configuré',
        body: 'Définissez VITE_ATLAS_SUPABASE_URL / VITE_ATLAS_SUPABASE_ANON_KEY (.env.local).',
      });
      return null;
    }
    const level: Sensitivity = sensitivity ?? mod.DEFAULT_SENSITIVITY;
    get().pushToast({
      kind: 'info',
      title: 'PROPH3T (cœur Atlas Studio) réfléchit…',
      body: level === 'confidential' ? 'Confidentiel — Ollama/Claude uniquement' : undefined,
      duration: 1500,
    });
    try {
      const result = await mod.askProph3t({ message: trimmed, sensitivity: level });
      get().pushToast({
        kind: 'success',
        title: 'Réponse PROPH3T',
        body: `Confiance ${Math.round((result.confidence ?? 0) * 100)}%`,
      });
      return result;
    } catch (err: any) {
      // GARDE-FOU : on NE retombe PAS sur l'agent local free-tier. Si le core
      // refuse une demande confidentielle (pas de clé Ollama/Claude), on
      // remonte l'erreur telle quelle — aucune fuite vers un tier à rétention.
      get().pushToast({
        kind: 'error',
        title: 'PROPH3T (cœur) indisponible',
        body:
          level === 'confidential'
            ? 'Refus propre : aucun provider sans-rétention dispo. Donnée non envoyée.'
            : err?.message || 'Réessayez plus tard',
      });
      return null;
    }
  },

  regenerateTimeBlocks: async () => {
    const cfg = get().settings.proph3t;
    const todayLocal = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const todayStr = new Date().toDateString();
    const dueToday = get().tasks.filter(
      (t) => t.dueDate && new Date(t.dueDate).toDateString() === todayStr && t.status !== 'done'
    );
    const projects = get().projects;
    const profileId = get().currentProfileId;
    const me = profileId ? get().users.find((u) => u.id === profileId) : undefined;

    // Heuristic fallback when PROPH3T isn't configured: Daily Brief +
    // tasks ordered by dueDate, padded with default durations.
    const heuristic = (): import('../lib/proph3t').GeneratedTimeBlock[] => {
      const briefHour = get().settings.dailyBriefHour ?? 7;
      const blocks: import('../lib/proph3t').GeneratedTimeBlock[] = [
        {
          startTime: `${String(briefHour).padStart(2, '0')}:00`,
          durationMinutes: 15,
          label: 'Daily Brief PROPH3T',
          kind: 'brief',
        },
      ];
      // Cursor starts at briefHour + 30 min (15 min brief + 15 min buffer).
      let cursorMin = briefHour * 60 + 30;
      const sorted = [...dueToday].sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
      for (const t of sorted) {
        const duration = t.estimatedMinutes ?? 60;
        const hh = Math.floor(cursorMin / 60);
        const mm = cursorMin % 60;
        if (hh >= 19) break; // don't schedule after 7pm
        blocks.push({
          startTime: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
          durationMinutes: duration,
          label: t.title.slice(0, 60),
          kind: 'focus',
          taskId: t.id,
        });
        cursorMin += duration + 10; // 10 min buffer between tasks
      }
      return blocks;
    };

    let blocks: import('../lib/proph3t').GeneratedTimeBlock[] = [];

    if (cfg.apiKey || cfg.provider === 'ollama-cloud') {
      get().pushToast({ kind: 'info', title: 'PROPH3T planifie votre journée…', duration: 1500 });
      try {
        const { ProphClient, generateTimeBlocks } = await import('../lib/proph3t');
        const client = new ProphClient(cfg);
        const dailyCapacity = Math.round((get().settings.weeklyCapacityHours * 60) / 5);
        blocks = await generateTimeBlocks(client, {
          user: me?.name ?? 'Vous',
          date: new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
          briefHour: get().settings.dailyBriefHour ?? 7,
          dailyCapacityMinutes: dailyCapacity,
          tasks: dueToday.map((t) => ({
            id: t.id,
            title: t.title,
            priority: t.priority,
            project: projects.find((p) => p.id === t.projectId)?.name || '—',
            estimateMinutes: t.estimatedMinutes,
            due: t.dueDate
              ? new Date(t.dueDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
              : undefined,
          })),
        });
        if (blocks.length === 0) {
          // LLM returned nothing parseable — fall back to heuristic.
          blocks = heuristic();
          get().pushToast({
            kind: 'warning',
            title: "PROPH3T n'a rien renvoyé — plan heuristique appliqué",
          });
        } else {
          get().pushToast({
            kind: 'success',
            title: `${blocks.length} bloc${blocks.length > 1 ? 's' : ''} planifié${blocks.length > 1 ? 's' : ''}`,
            body: cfg.model,
          });
        }
      } catch (err: any) {
        console.warn('[regenerateTimeBlocks] PROPH3T failed, using heuristic', err);
        blocks = heuristic();
        get().pushToast({ kind: 'warning', title: 'PROPH3T indisponible — plan heuristique' });
      }
    } else {
      // No API key — silent heuristic plan (no toast spam on every reload).
      blocks = heuristic();
    }

    const payload = {
      date: todayLocal,
      blocks,
      generatedAt: new Date().toISOString(),
    };
    set((s) => ({ settings: { ...s.settings, timeBlocks: payload } }));
    dbPersist.setSetting('timeBlocks', payload);
  },

  startFocusSession: (preset, taskId) => {
    const total = focusPresets[preset].total;
    set({
      focus: {
        running: true,
        preset,
        totalSeconds: total,
        remainingSeconds: total,
        sound: get().focus.sound,
        taskId,
      },
    });
    get().pushToast({ kind: 'success', title: 'Session démarrée', body: focusPresets[preset].label });
  },
  pauseFocus: () => set((s) => ({ focus: { ...s.focus, running: false } })),
  resumeFocus: () => set((s) => ({ focus: { ...s.focus, running: true } })),
  stopFocus: () =>
    set((s) => ({ focus: { ...s.focus, running: false, remainingSeconds: s.focus.totalSeconds } })),
  setFocusSound: (sound) => set((s) => ({ focus: { ...s.focus, sound } })),
  tickFocus: () => {
    const { focus } = get();
    if (!focus.running) return;
    if (focus.remainingSeconds <= 1) {
      set({ focus: { ...focus, running: false, remainingSeconds: 0 } });
      get().pushToast({
        kind: 'success',
        title: 'Session terminée',
        body: 'Bravo, prenez 10 minutes de pause.',
      });
      return;
    }
    set({ focus: { ...focus, remainingSeconds: focus.remainingSeconds - 1 } });
  },

  updateSettings: (patch) => {
    set((s: any) => ({ settings: { ...s.settings, ...patch } }));
    // Write each setting key to its own row (so partial updates don't require full snapshot)
    Object.entries(patch).forEach(([k, v]) => dbPersist.setSetting(k, v));
    get().pushToast({ kind: 'success', title: 'Préférences enregistrées', duration: 2000 });
  },
  saveTaskTemplate: (tpl) => {
    const t: TaskTemplate = { id: uid('tpl'), ...tpl };
    const next = [t, ...(get().settings.taskTemplates ?? [])];
    set((s) => ({ settings: { ...s.settings, taskTemplates: next } }));
    dbPersist.setSetting('taskTemplates', next);
    get().pushToast({ kind: 'success', title: 'Template enregistré', body: t.name });
  },
  deleteTaskTemplate: (id) => {
    const next = (get().settings.taskTemplates ?? []).filter((x) => x.id !== id);
    set((s) => ({ settings: { ...s.settings, taskTemplates: next } }));
    dbPersist.setSetting('taskTemplates', next);
  },

  updateProfile: async (patch) => {
    const profileId = get().currentProfileId;
    if (!profileId) {
      get().pushToast({ kind: 'error', title: 'Profil introuvable' });
      return;
    }
    const me = get().users.find((u) => u.id === profileId);
    if (!me) {
      get().pushToast({ kind: 'error', title: 'Profil introuvable' });
      return;
    }
    // Recompute initials if name changed (e.g. "Pamela ATOKOUNA" → "PA").
    const nextName = patch.name?.trim() || me.name;
    const nextInitials =
      patch.name !== undefined
        ? (() => {
            const parts = nextName.split(/\s+/).filter(Boolean);
            if (parts.length === 0) return me.initials;
            if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
          })()
        : me.initials;
    const updated: User = {
      ...me,
      ...patch,
      name: nextName,
      initials: nextInitials,
    };
    set((s: any) => ({
      users: s.users.map((u: User) => (u.id === profileId ? updated : u)),
    }));
    // Persist to cj_profiles (write-through).
    dbPersist.put('users', updated);
    // Also mirror `full_name` to Supabase auth metadata so the same name
    // shows up in sibling Atlas Studio apps + email templates.
    if (patch.name !== undefined) {
      try {
        await supabase.auth.updateUser({ data: { full_name: nextName } });
      } catch (err) {
        console.warn('[updateProfile] auth.updateUser failed (non-fatal)', err);
      }
    }
    get().pushToast({ kind: 'success', title: 'Profil mis à jour', duration: 2000 });
  },

  addSubtask: (taskId, title) => {
    if (!title.trim()) return;
    const list = get().subtasks.filter((s) => s.taskId === taskId);
    const sub: Subtask = { id: uid('st'), taskId, title: title.trim(), done: false, position: list.length };
    set((s: any) => ({ subtasks: [...s.subtasks, sub] }));
    dbPersist.put('subtasks', sub);
    // Ajouter une sous-action non faite dilue le crédit partiel de la tâche.
    const parent = get().tasks.find((t) => t.id === taskId);
    if (parent?.goalId) get().recomputeGoalFromTasks(parent.goalId);
  },
  toggleSubtask: (id) => {
    set((s: any) => ({
      subtasks: s.subtasks.map((x: Subtask) => (x.id === id ? { ...x, done: !x.done } : x)),
    }));
    const updated = get().subtasks.find((x) => x.id === id);
    if (updated) dbPersist.put('subtasks', updated);
    // Cocher/décocher une sous-action fait progresser le goal de la tâche.
    const parent = updated && get().tasks.find((t) => t.id === updated.taskId);
    if (parent?.goalId) get().recomputeGoalFromTasks(parent.goalId);
  },
  removeSubtask: (id) => {
    const removed = get().subtasks.find((x) => x.id === id);
    set((s: any) => ({ subtasks: s.subtasks.filter((x: Subtask) => x.id !== id) }));
    dbPersist.delete('subtasks', id);
    const parent = removed && get().tasks.find((t) => t.id === removed.taskId);
    if (parent?.goalId) get().recomputeGoalFromTasks(parent.goalId);
  },
  reorderSubtasks: (taskId, ids) => {
    set((s: any) => {
      const others = s.subtasks.filter((x: Subtask) => x.taskId !== taskId);
      const reordered = ids
        .map((id, i) => {
          const orig = s.subtasks.find((x: Subtask) => x.id === id);
          return orig ? { ...orig, position: i } : null;
        })
        .filter(Boolean) as Subtask[];
      return { subtasks: [...others, ...reordered] };
    });
    const updated = get().subtasks.filter((s) => s.taskId === taskId);
    dbPersist.bulkPut('subtasks', updated);
  },

  createBudgetLine: (projectId, { name, allocatedAmount, parentLineId }) => {
    const now = new Date().toISOString();
    const parent = parentLineId ?? null;
    // sortOrder is computed among SIBLINGS (same parent), so each level of
    // the tree keeps its own ordering.
    const maxOrder = get()
      .budgetLines.filter((l) => l.projectId === projectId && (l.parentLineId ?? null) === parent)
      .reduce((m, l) => Math.max(m, l.sortOrder), -1);
    const line: BudgetLine = {
      id: uid('bl'),
      projectId,
      parentLineId: parent,
      ownerId: get().currentProfileId ?? null,
      name: name.trim(),
      allocatedAmount: Number.isFinite(allocatedAmount) ? allocatedAmount : 0,
      currency: 'XOF',
      sortOrder: maxOrder + 1,
      notes: [],
      attachments: [],
      createdAt: now,
      updatedAt: now,
      createdVia: 'manual',
    };
    set((s) => ({ budgetLines: [...s.budgetLines, line] }));
    dbPersist.put('budgetLines', line);
    get().pushToast({ kind: 'success', title: 'Ligne budgétaire créée', body: line.name });
    return line;
  },
  updateBudgetLine: (id, patch) => {
    set((s) => ({
      budgetLines: s.budgetLines.map((l) =>
        l.id === id ? { ...l, ...patch, updatedAt: new Date().toISOString() } : l
      ),
    }));
    const updated = get().budgetLines.find((l) => l.id === id);
    if (updated) dbPersist.put('budgetLines', updated);
  },
  deleteBudgetLine: (id) => {
    const allLines = get().budgetLines;
    const line = allLines.find((l) => l.id === id);
    // Compute the whole subtree to delete (this line + all descendants),
    // mirroring the DB FK (cj_budget_lines.parent_line_id ON DELETE CASCADE).
    const toDelete = new Set<string>([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const l of allLines) {
        const parent = l.parentLineId ?? null;
        if (parent && toDelete.has(parent) && !toDelete.has(l.id)) {
          toDelete.add(l.id);
          grew = true;
        }
      }
    }
    // Detach (don't delete) expenses on ANY of the deleted lines — they
    // become "non ventilées" but keep their amount in the project total.
    // Mirrors the DB FK (cj_expenses.line_id ON DELETE SET NULL).
    const orphaned = get().expenses.filter((e) => e.lineId && toDelete.has(e.lineId));
    const now = new Date().toISOString();
    set((s) => ({
      budgetLines: s.budgetLines.filter((l) => !toDelete.has(l.id)),
      expenses: s.expenses.map((e) =>
        e.lineId && toDelete.has(e.lineId) ? { ...e, lineId: null, updatedAt: now } : e
      ),
    }));
    // The DB cascades sub-lines server-side, but delete each locally so the
    // cache mirror stays correct.
    for (const lineId of toDelete) {
      dbPersist.delete('budgetLines', lineId);
    }
    for (const e of orphaned) {
      const updated = get().expenses.find((x) => x.id === e.id);
      if (updated) dbPersist.put('expenses', updated);
    }
    get().pushToast({ kind: 'info', title: 'Ligne supprimée', body: line?.name });
  },
  createExpense: (projectId, lineId, { label, amount, status, expenseDate, vendor }) => {
    const now = new Date().toISOString();
    const expense: Expense = {
      id: uid('ex'),
      projectId,
      lineId: lineId ?? null,
      taskId: null,
      label: label.trim(),
      amount: Number.isFinite(amount) ? amount : 0,
      currency: 'XOF',
      status: status ?? 'paid',
      expenseDate: expenseDate ?? now.slice(0, 10),
      vendor: vendor?.trim() || null,
      notes: [],
      attachments: [],
      createdAt: now,
      updatedAt: now,
      createdVia: 'manual',
    };
    set((s) => ({ expenses: [...s.expenses, expense] }));
    dbPersist.put('expenses', expense);
    get().pushToast({ kind: 'success', title: 'Dépense enregistrée', body: expense.label });
    return expense;
  },
  updateExpense: (id, patch) => {
    set((s) => ({
      expenses: s.expenses.map((e) =>
        e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e
      ),
    }));
    const updated = get().expenses.find((e) => e.id === id);
    if (updated) dbPersist.put('expenses', updated);
  },
  deleteExpense: (id) => {
    const e = get().expenses.find((x) => x.id === id);
    set((s) => ({ expenses: s.expenses.filter((x) => x.id !== id) }));
    dbPersist.delete('expenses', id);
    get().pushToast({ kind: 'info', title: 'Dépense supprimée', body: e?.label });
  },
  addBudgetNote: ({ kind, id }, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const note: BudgetNote = {
      id: uid('bn'),
      text: trimmed,
      authorId: get().currentProfileId ?? null,
      at: new Date().toISOString(),
    };
    if (kind === 'line') {
      set((s) => ({
        budgetLines: s.budgetLines.map((l) =>
          l.id === id ? { ...l, notes: [...l.notes, note], updatedAt: new Date().toISOString() } : l
        ),
      }));
      const updated = get().budgetLines.find((l) => l.id === id);
      if (updated) dbPersist.put('budgetLines', updated);
    } else {
      set((s) => ({
        expenses: s.expenses.map((e) =>
          e.id === id ? { ...e, notes: [...e.notes, note], updatedAt: new Date().toISOString() } : e
        ),
      }));
      const updated = get().expenses.find((e) => e.id === id);
      if (updated) dbPersist.put('expenses', updated);
    }
  },
  addBudgetAttachment: ({ kind, id }, att) => {
    const now = new Date().toISOString();
    if (kind === 'line') {
      set((s) => ({
        budgetLines: s.budgetLines.map((l) =>
          l.id === id ? { ...l, attachments: [...l.attachments, att], updatedAt: now } : l
        ),
      }));
      const updated = get().budgetLines.find((l) => l.id === id);
      if (updated) dbPersist.put('budgetLines', updated);
    } else {
      set((s) => ({
        expenses: s.expenses.map((e) =>
          e.id === id ? { ...e, attachments: [...e.attachments, att], updatedAt: now } : e
        ),
      }));
      const updated = get().expenses.find((e) => e.id === id);
      if (updated) dbPersist.put('expenses', updated);
    }
  },
  removeBudgetAttachment: ({ kind, id }, attachmentId) => {
    const now = new Date().toISOString();
    if (kind === 'line') {
      set((s) => ({
        budgetLines: s.budgetLines.map((l) =>
          l.id === id
            ? { ...l, attachments: l.attachments.filter((a) => a.id !== attachmentId), updatedAt: now }
            : l
        ),
      }));
      const updated = get().budgetLines.find((l) => l.id === id);
      if (updated) dbPersist.put('budgetLines', updated);
    } else {
      set((s) => ({
        expenses: s.expenses.map((e) =>
          e.id === id
            ? { ...e, attachments: e.attachments.filter((a) => a.id !== attachmentId), updatedAt: now }
            : e
        ),
      }));
      const updated = get().expenses.find((e) => e.id === id);
      if (updated) dbPersist.put('expenses', updated);
    }
  },

  switchWorkspace: (ownerId) => {
    const authUserId = getCurrentAuthUserId();
    if (!authUserId || ownerId === get().activeWorkspaceId) return;
    // Persist the choice and reload: the bootstrap re-resolves the active
    // workspace from this preference and re-hydrates cleanly (data, realtime,
    // profile, cache — all keyed by the new owner).
    writeActiveWsPref(authUserId, ownerId);
    window.location.reload();
  },

  signOut: async () => {
    await supabase.auth.signOut();
    // Notify other tabs so they reset their state too (BroadcastChannel
    // listener installed in bootstrap mirrors the signOut locally).
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const ch = new BroadcastChannel('cj-auth');
        ch.postMessage({ type: 'signout' });
        ch.close();
      }
    } catch {
      /* BroadcastChannel not supported — single-tab signOut is best-effort */
    }
    // onAuthStateChange will reset the in-memory state
  },

  resetSeed: async () => {
    try {
      localStorage.removeItem('cockpit-store-v1');
    } catch {
      /* legacy key cleanup */
    }
    // Also drop the snapshot cache mirror — otherwise the next boot
    // would optimistic-hydrate from stale data we just wiped.
    clearSnapshotCache();
    // Wipe all cj_* rows in Supabase, then reload to re-run the seed.
    await wipeDatabase();
    location.reload();
  },
});

export const useApp = create<State>()((set, get) => initialState(set, get));

/* ───────────── Cache mirror — debounced rewrite on mutations ─────────────
 *
 * After the first successful hydrate, every time an entity array or the
 * settings object changes (= a mutation landed in the store), we schedule
 * a rewrite of the localStorage snapshot mirror. The 800 ms debounce
 * means rapid edits (drag-reorder, multi-field updates) only trigger one
 * write at the end of the burst, not per keystroke. Worst case lag if
 * the user closes the tab mid-burst: ~800 ms of edits aren't mirrored,
 * but the next boot still pulls the real snapshot from Supabase to fix
 * up the difference.
 */
if (typeof window !== 'undefined') {
  let cacheTimer: ReturnType<typeof setTimeout> | null = null;
  let prevEntityRefs: Partial<State> = {};
  useApp.subscribe((state) => {
    if (!state.ready) return;
    const authUserId = getCurrentAuthUserId();
    if (!authUserId) return;
    // Reference-equality short-circuit: if none of the persisted slices
    // changed, do nothing. (Toasts, modal, focus tick: ignored.)
    if (
      state.users === prevEntityRefs.users &&
      state.folders === prevEntityRefs.folders &&
      state.projects === prevEntityRefs.projects &&
      state.sections === prevEntityRefs.sections &&
      state.tasks === prevEntityRefs.tasks &&
      state.goals === prevEntityRefs.goals &&
      state.comments === prevEntityRefs.comments &&
      state.notifications === prevEntityRefs.notifications &&
      state.insights === prevEntityRefs.insights &&
      state.automations === prevEntityRefs.automations &&
      state.forms === prevEntityRefs.forms &&
      state.reports === prevEntityRefs.reports &&
      state.attachments === prevEntityRefs.attachments &&
      state.dependencies === prevEntityRefs.dependencies &&
      state.activity === prevEntityRefs.activity &&
      state.subtasks === prevEntityRefs.subtasks &&
      state.notes === prevEntityRefs.notes &&
      state.budgetLines === prevEntityRefs.budgetLines &&
      state.expenses === prevEntityRefs.expenses &&
      state.settings === prevEntityRefs.settings &&
      state.currentProfileId === prevEntityRefs.currentProfileId
    ) {
      return;
    }
    prevEntityRefs = {
      users: state.users,
      folders: state.folders,
      projects: state.projects,
      sections: state.sections,
      tasks: state.tasks,
      goals: state.goals,
      comments: state.comments,
      notifications: state.notifications,
      insights: state.insights,
      automations: state.automations,
      forms: state.forms,
      reports: state.reports,
      attachments: state.attachments,
      dependencies: state.dependencies,
      activity: state.activity,
      subtasks: state.subtasks,
      notes: state.notes,
      budgetLines: state.budgetLines,
      expenses: state.expenses,
      settings: state.settings,
      currentProfileId: state.currentProfileId,
    };
    if (cacheTimer) clearTimeout(cacheTimer);
    cacheTimer = setTimeout(() => {
      const s = useApp.getState();
      const uid = getCurrentAuthUserId();
      if (!uid || !s.ready) return;
      writeSnapshotCache(
        uid,
        {
          users: s.users,
          folders: s.folders,
          projects: s.projects,
          sections: s.sections,
          tasks: s.tasks,
          goals: s.goals,
          comments: s.comments,
          notifications: s.notifications,
          insights: s.insights,
          automations: s.automations,
          forms: s.forms,
          reports: s.reports,
          attachments: s.attachments,
          dependencies: s.dependencies,
          activity: s.activity,
          subtasks: s.subtasks,
          notes: s.notes,
          budgetLines: s.budgetLines,
          expenses: s.expenses,
          settings: s.settings as unknown as Record<string, unknown>,
        },
        s.currentProfileId ?? ''
      );
    }, 800);
  });

  // Best-effort flush on tab close: if a mutation landed within the last
  // 800 ms, the debounce hasn't fired yet — write synchronously now.
  window.addEventListener('beforeunload', () => {
    if (!cacheTimer) return;
    clearTimeout(cacheTimer);
    cacheTimer = null;
    const s = useApp.getState();
    const uid = getCurrentAuthUserId();
    if (!uid || !s.ready) return;
    writeSnapshotCache(
      uid,
      {
        users: s.users,
        folders: s.folders,
        projects: s.projects,
        sections: s.sections,
        tasks: s.tasks,
        goals: s.goals,
        comments: s.comments,
        notifications: s.notifications,
        insights: s.insights,
        automations: s.automations,
        forms: s.forms,
        reports: s.reports,
        attachments: s.attachments,
        dependencies: s.dependencies,
        activity: s.activity,
        subtasks: s.subtasks,
        notes: s.notes,
        budgetLines: s.budgetLines,
        expenses: s.expenses,
        settings: s.settings as unknown as Record<string, unknown>,
      },
      s.currentProfileId ?? ''
    );
  });
}

export const focusPresetMap = focusPresets;

/**
 * Returns the currently authenticated user's profile (the one whose
 * id === state.currentProfileId). Falls back to the first profile in
 * the array — but if you see that fallback firing in production, you
 * have an auth bootstrap bug.
 */
export function useCurrentUser() {
  return useApp((s) => {
    if (s.currentProfileId) {
      const me = s.users.find((u) => u.id === s.currentProfileId);
      if (me) return me;
    }
    return s.users[0];
  });
}
