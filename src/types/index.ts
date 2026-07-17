export type Priority = 1 | 2 | 3 | 4;
export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done' | 'blocked';
export type ProjectStatus = 'active' | 'paused' | 'archived' | 'completed';
export type HealthScore = 'green' | 'yellow' | 'red';

export interface User {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: string;
  color: string;
  avatarUrl?: string;
}

/**
 * High-level "life sphere" a folder belongs to.
 * - 'personnel' = perso, famille, santé, sport, loisirs, etc.
 * - 'professionnel' = clients, entreprise, missions, formations, etc.
 *
 * Sphere is a fixed binary on purpose — keeps the sidebar mental model
 * simple. If a user needs a third bucket (e.g. "Association"), they
 * can create a folder with that name inside whichever sphere fits.
 */
export type FolderSphere = 'personnel' | 'professionnel';

export interface Folder {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** Defaults to 'personnel' if missing (legacy folders pre-2026-05-17). */
  sphere?: FolderSphere;
  /** Optional rank within the sphere for drag-and-drop reorder. */
  order?: number;
  projectIds: string[];
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  folderId?: string;
  description?: string;
  status: ProjectStatus;
  color: string;
  icon: string;
  ownerId: string;
  startDate?: string;
  endDate?: string;
  health: HealthScore;
  progress: number;
  taskCount: number;
  membersIds: string[];
  /** Rétroplanning (jalons planifiés à rebours) embarqué dans le projet. */
  retroplan?: RetroPlan;
}

export interface Section {
  id: string;
  projectId: string;
  name: string;
  color: string;
  position: number;
  wipLimit?: number;
}

export interface Comment {
  id: string;
  taskId: string;
  authorId: string | null;
  /**
   * Display name when the author isn't a workspace profile — e.g. a comment
   * posted by an external participant via a share link (`authorId` is null).
   */
  authorName?: string;
  body: string;
  createdAt: string;
  reactions?: { emoji: string; count: number }[];
}

export interface Task {
  id: string;
  projectId: string;
  sectionId: string;
  parentTaskId?: string;
  title: string;
  description?: string;
  /** Point de vigilance / risque / blocage — mis en avant sur la tâche. */
  attentionPoint?: string;
  status: TaskStatus;
  priority: Priority;
  dueDate?: string;
  startDate?: string;
  estimatedMinutes?: number;
  actualMinutes?: number;
  completionDate?: string;
  /**
   * Avancement manuel en % (0-100), pour les tâches sans sous-tâches qui ne
   * sont pas encore "done" mais ont un avancement réel connu (ex. import
   * depuis une source externe avec un % précis). Compté dans le crédit
   * pondéré de `computeGoalProgress` en repli quand il n'y a pas de
   * sous-tâches — n'écrase jamais le crédit plein d'une tâche `done`.
   */
  progressPct?: number;
  assignees: string[];
  watchers?: string[];
  tags: string[];
  customFields?: Record<string, string | number | boolean>;
  subtaskIds?: string[];
  commentCount?: number;
  attachmentCount?: number;
  source?: 'manual' | 'voice' | 'whatsapp' | 'email' | 'form' | 'recurring';
  /** Goal this task contributes to (Cap stratégique → tâches). */
  goalId?: string;
  /** Approval workflow: the task must be explicitly approved before it counts as done. */
  requiresApproval?: boolean;
  approvalStatus?: 'pending' | 'approved' | 'rejected' | 'changes_requested';
  /** Secondary projects this task is also shared into. Primary stays `projectId`. */
  alsoInProjectIds?: string[];
  /** ISO timestamp — set at creation; used by the activity trajectory charts. */
  createdAt?: string;
  /** Rétroplanning (jalons planifiés à rebours) embarqué dans la tâche. */
  retroplan?: RetroPlan;
  /** Règle de récurrence simple (régénère la tâche à l'échéance). */
  recurrence?: 'daily' | 'weekly' | 'monthly';
}

/* ─────────── Rétroplanning (jalons / planning à rebours) ─────────── */

/** Un jalon du rétroplanning — une étape datée, à cocher une fois faite. */
export interface RetroStep {
  id: string;
  title: string;
  /** Date cible du jalon (ISO, ou YYYY-MM-DD). Optionnelle tant que non placée. */
  date?: string;
  done: boolean;
  sortOrder: number;
  note?: string;
}

/**
 * Rétroplanning attaché à une tâche OU un projet. Stocké dans le `data` jsonb
 * de l'entité (round-trip automatique via updateTask / updateProject) — pas de
 * table dédiée : les jalons sont peu nombreux et appartiennent à leur entité.
 */
export interface RetroPlan {
  /** Échéance depuis laquelle on planifie à rebours. */
  targetDate?: string;
  steps: RetroStep[];
}

/** Reusable task template (personal library, stored in settings). */
export interface TaskTemplate {
  id: string;
  name: string;
  title: string;
  description?: string;
  priority: Priority;
  tags: string[];
  estimatedMinutes?: number;
  taskType?: string;
}

export interface Goal {
  id: string;
  title: string;
  description?: string;
  ownerId: string;
  level: 'workspace' | 'team' | 'personal';
  parentGoalId?: string;
  metricType: 'percentage' | 'number' | 'currency' | 'boolean';
  /**
   * Pilotage de la progression :
   * - `'auto'` (défaut) : `currentValue` est recalculé depuis les actions
   *   contributrices (et leurs sous-actions) — voir `computeGoalProgress`.
   * - `'manual'` : l'utilisateur saisit `currentValue`, jamais écrasé.
   * `undefined` est traité comme `'auto'` (compat. données existantes).
   */
  progressMode?: 'auto' | 'manual';
  targetValue: number;
  currentValue: number;
  unit?: string;
  period: 'monthly' | 'quarterly' | 'semestrial' | 'annual';
  startDate: string;
  endDate: string;
  status: 'on_track' | 'at_risk' | 'off_track' | 'achieved' | 'missed';
  health: HealthScore;
  contributingTaskIds?: string[];
  childGoalIds?: string[];
}

export interface Notification {
  id: string;
  type: 'mention' | 'assignment' | 'due' | 'comment' | 'automation' | 'prophet';
  title: string;
  body?: string;
  createdAt: string;
  read: boolean;
  actorId?: string;
  taskId?: string;
  /** Profil destinataire (routé vers la colonne indexée user_id). */
  userId?: string;
}

export interface PropheticInsight {
  id: string;
  kind: 'risk' | 'pattern' | 'tip' | 'forecast' | 'win';
  title: string;
  body: string;
  confidence: number;
  /** Optional area the insight concerns (project name, "Workspace", …). */
  scope?: string;
  cta?: { label: string; action: string };
}

/* ─────────── Budget module (per-project) ─────────── */

/**
 * Cycle de vie d'une dépense (du prévisionnel au décaissement) :
 *   prévue → engagée → facturée → payée
 * `invoiced` (facturée) s'intercale entre l'engagement et le paiement —
 * la facture est reçue/émise mais pas encore réglée.
 */
export type ExpenseStatus = 'planned' | 'committed' | 'invoiced' | 'paid';

/** Free-text note attached to a budget line or an expense. */
export interface BudgetNote {
  id: string;
  text: string;
  authorId: string | null;
  at: string;
}

/**
 * File attached to a budget line or expense. The TYPE exists so the data
 * shape is stable, but upload-to-Storage is OUT OF SCOPE for this slice —
 * `attachments` arrays stay empty until the upload UI ships.
 */
export interface BudgetAttachment {
  id: string;
  name: string;
  path: string;
  size?: number;
  uploadedAt: string;
}

/** A budget line (ligne budgétaire) with an allocated amount in FCFA (XOF). */
export interface BudgetLine {
  id: string;
  projectId: string;
  ownerId: string | null;
  name: string;
  allocatedAmount: number;
  currency: string;
  sortOrder: number;
  /** Parent line for hierarchical budgets. Null/undefined = top-level. */
  parentLineId?: string | null;
  notes: BudgetNote[];
  attachments: BudgetAttachment[];
  createdAt: string;
  updatedAt: string;
  createdVia?: string;
}

/** A recorded expense against a project (optionally a specific budget line). */
export interface Expense {
  id: string;
  projectId: string;
  lineId: string | null;
  taskId?: string | null;
  label: string;
  amount: number;
  currency: string;
  status: ExpenseStatus;
  expenseDate: string;
  vendor?: string | null;
  notes: BudgetNote[];
  attachments: BudgetAttachment[];
  createdAt: string;
  updatedAt: string;
  createdVia?: string;
}

export type ViewKey =
  | 'today'
  | 'inbox'
  | 'goals'
  | 'dashboards'
  | 'focus'
  | 'projects'
  | 'project'
  | 'budget'
  | 'automations'
  | 'reports'
  | 'forms';
