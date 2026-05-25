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
  authorId: string;
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
