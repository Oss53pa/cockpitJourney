import { create } from 'zustand';
import { persist as dbPersist, loadSnapshot, wipeDatabase, setCurrentAuthUserId } from '../lib/repo';
import { seedDatabaseIfEmpty, linkAuthUserToProfile, buildOfflineSnapshot } from '../lib/seed';
import { supabase, SUPABASE_CONFIGURED } from '../lib/supabase';
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
} from '../types';

// Module-level guards: React StrictMode runs effects twice in dev, which
// would subscribe to onAuthStateChange twice and run hydrateFromSupabase
// concurrently. We guard at the module level (NOT in store state) so the
// second invocation literally cannot start.
let bootstrapStarted = false;
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

  // hydration flag — true once Supabase snapshot has been loaded
  ready: boolean;
  // auth state
  authStatus: 'loading' | 'signed_out' | 'signed_in';
  authEmail?: string;
  currentProfileId?: string;
  // true if hydrate fell back to offline mockData (Supabase unreachable)
  degraded?: boolean;

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
    proph3t: {
      provider: 'groq' | 'openrouter' | 'ollama-cloud';
      apiKey: string;
      model: string;
    };
  };

  // === actions ===
  // bootstrap (subscribe to auth + hydrate from Supabase)
  bootstrap: () => Promise<void>;
  // sign out from Supabase + reset in-memory state
  signOut: () => Promise<void>;

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

  // projects
  createProject: (p: Partial<Project> & { name: string; folderId?: string }) => Project;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;

  // automations
  toggleAutomation: (id: string) => void;
  deleteAutomation: (id: string) => void;
  createAutomation: (a: Omit<AutomationRule, 'id' | 'runs' | 'success'>) => void;

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
  addAttachment: (taskId: string, name: string, kind: Attachment['kind'], size?: string) => void;
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
  resetSeed: () => void;

  // insights
  dismissInsight: (id: string) => void;
  regenerateBrief: () => void;

  // focus
  startFocusSession: (preset: FocusSession['preset'], taskId?: string) => void;
  pauseFocus: () => void;
  resumeFocus: () => void;
  stopFocus: () => void;
  setFocusSound: (s: string) => void;
  tickFocus: () => void;

  // settings
  updateSettings: (patch: Partial<State['settings']>) => void;
}

export type ModalKind =
  | 'task-create'
  | 'task-edit'
  | 'task-delete'
  | 'project-create'
  | 'project-edit'
  | 'project-delete'
  | 'goal-create'
  | 'goal-edit'
  | 'goal-bump'
  | 'automation-create'
  | 'workspace-switch'
  | 'settings'
  | 'invite-team'
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
  const goOffline = (reason: string) => {
    if (!import.meta.env.DEV) {
      console.warn('[hydrate] Supabase unreachable in production —', reason);
      console.warn('[hydrate] falling back to signed_out (NO offline mockData in prod).');
      setCurrentAuthUserId(null);
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
    const offline = buildOfflineSnapshot(authUserId);
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
    // Hard 20s overall watchdog: regardless of where the cascade hangs
    // (seed, link, snapshot), we never trap the user beyond ~20s.
    let bailed = false;
    const overallTimeout = setTimeout(() => {
      bailed = true;
      goOffline('hydrate exceeded 20s — Supabase REST unreachable');
    }, 20_000);

    try {
      console.info('[hydrate] start for user', authUserId.slice(0, 8));
      set({ authStatus: 'signed_in', authEmail: email });
      setCurrentAuthUserId(authUserId);

      console.info('[hydrate] step 1/3 — seedDatabaseIfEmpty');
      const seeded = await seedDatabaseIfEmpty();
      if (bailed) return;
      console.info(
        seeded ? '[hydrate] seed: inserted demo data' : '[hydrate] seed: skipped (data already present)'
      );

      console.info('[hydrate] step 2/3 — linkAuthUserToProfile');
      const profileId = await linkAuthUserToProfile(authUserId, email);
      if (bailed) return;
      console.info('[hydrate] profile bound:', profileId);

      console.info('[hydrate] step 3/3 — loadSnapshot');
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
        goOffline('snapshot empty — seed never landed in Supabase');
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
        settings: { ...get().settings, ...(snap.settings as Partial<State['settings']>) },
        currentProfileId: profileId,
        ready: true,
        degraded: false,
      });
      console.info('[hydrate] DONE — ready=true');
    } catch (err) {
      clearTimeout(overallTimeout);
      console.error('[hydrate] threw — falling back to offline', err);
      goOffline(err instanceof Error ? err.message : 'unknown error');
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

  ready: false,
  authStatus: 'loading',
  authEmail: undefined,
  currentProfileId: undefined,

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
    // INITIAL_SESSION fires once on subscribe with the cached session (if any),
    // SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED fire on subsequent changes.
    supabase.auth.onAuthStateChange(async (event, session) => {
      console.info('[auth]', event, session ? `(user ${session.user.id.slice(0, 8)})` : '(no session)');
      try {
        if (event === 'SIGNED_OUT' || !session) {
          setCurrentAuthUserId(null);
          set({
            authStatus: 'signed_out',
            authEmail: undefined,
            currentProfileId: undefined,
            ready: false,
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
    };
    set((s: any) => ({ tasks: [t, ...s.tasks] }));
    dbPersist.put('tasks', t);
    get().logActivity({
      taskId: t.id,
      projectId: t.projectId,
      actorId: get().currentProfileId || 'u_pame',
      verb: 'a créé la tâche',
      target: t.title,
    });
    get().pushToast({ kind: 'success', title: 'Tâche créée', body: t.title });
    return t;
  },
  updateTask: (id, patch) => {
    set((s: any) => ({ tasks: s.tasks.map((t: any) => (t.id === id ? { ...t, ...patch } : t)) }));
    const updated = get().tasks.find((t) => t.id === id);
    if (updated) dbPersist.put('tasks', updated);
  },
  deleteTask: (id) => {
    const t = get().tasks.find((x) => x.id === id);
    set((s: any) => ({ tasks: s.tasks.filter((x: any) => x.id !== id) }));
    dbPersist.delete('tasks', id);
    if (t) {
      get().logActivity({
        projectId: t.projectId,
        actorId: get().currentProfileId || 'u_pame',
        verb: 'a supprimé la tâche',
        target: t.title,
      });
      get().pushToast({ kind: 'info', title: 'Tâche supprimée', body: t.title });
    }
  },
  toggleTaskDone: (id) => {
    const t = get().tasks.find((x) => x.id === id);
    if (!t) return;
    const isDone = t.status === 'done';
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
    const goal: Goal = { id: uid('g'), ...g };
    set((s) => ({ goals: [...s.goals, goal] }));
    dbPersist.put('goals', goal);
    get().pushToast({ kind: 'success', title: 'Goal créé', body: goal.title });
  },
  updateGoal: (id, patch) => {
    set((s) => ({ goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
    const updated = get().goals.find((g) => g.id === id);
    if (updated) dbPersist.put('goals', updated);
  },
  deleteGoal: (id) => {
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
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
    const updated = get().projects.find((p) => p.id === id);
    if (updated) dbPersist.put('projects', updated);
  },
  deleteProject: (id) => {
    const taskIds = get()
      .tasks.filter((t) => t.projectId === id)
      .map((t) => t.id);
    const sectionIds = get()
      .sections.filter((s) => s.projectId === id)
      .map((s) => s.id);
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      tasks: s.tasks.filter((t) => t.projectId !== id),
      sections: s.sections.filter((sec) => sec.projectId !== id),
    }));
    dbPersist.delete('projects', id);
    dbPersist.bulkDelete('tasks', taskIds);
    dbPersist.bulkDelete('sections', sectionIds);
    get().pushToast({ kind: 'info', title: 'Projet supprimé' });
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

  // === Forms ===
  createForm: (f) => {
    const slug = (f.name || 'form')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24);
    const form: IntakeForm = {
      id: uid('f'),
      submissions: 0,
      createdAt: new Date().toISOString(),
      publicUrl: `https://cockpitjourney.app/f/${slug}-${Math.random().toString(36).slice(2, 5)}`,
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
          velocityDelta: Math.round(Math.random() * 30 - 5),
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
      const capacity = 40;
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
        delta: Math.round(Math.random() * 12 - 2),
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
  addAttachment: (taskId, name, kind, size = '–') => {
    const at: Attachment = { id: uid('at'), taskId, name, kind, size, uploadedAt: new Date().toISOString() };
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
    } catch (err: any) {
      get().pushToast({
        kind: 'error',
        title: 'Échec génération',
        body: err?.message || 'Vérifiez votre clé API',
      });
    }
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

  addSubtask: (taskId, title) => {
    if (!title.trim()) return;
    const list = get().subtasks.filter((s) => s.taskId === taskId);
    const sub: Subtask = { id: uid('st'), taskId, title: title.trim(), done: false, position: list.length };
    set((s: any) => ({ subtasks: [...s.subtasks, sub] }));
    dbPersist.put('subtasks', sub);
  },
  toggleSubtask: (id) => {
    set((s: any) => ({
      subtasks: s.subtasks.map((x: Subtask) => (x.id === id ? { ...x, done: !x.done } : x)),
    }));
    const updated = get().subtasks.find((x) => x.id === id);
    if (updated) dbPersist.put('subtasks', updated);
  },
  removeSubtask: (id) => {
    set((s: any) => ({ subtasks: s.subtasks.filter((x: Subtask) => x.id !== id) }));
    dbPersist.delete('subtasks', id);
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

  signOut: async () => {
    await supabase.auth.signOut();
    // onAuthStateChange will reset the in-memory state
  },

  resetSeed: async () => {
    try {
      localStorage.removeItem('cockpit-store-v1');
    } catch {
      /* legacy key cleanup */
    }
    // Wipe all cj_* rows in Supabase, then reload to re-run the seed.
    await wipeDatabase();
    location.reload();
  },
});

export const useApp = create<State>()((set, get) => initialState(set, get));

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
