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

export interface Folder {
  id: string;
  name: string;
  icon: string;
  color: string;
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
  cta?: { label: string; action: string };
}

export type ViewKey =
  | 'today'
  | 'inbox'
  | 'goals'
  | 'dashboards'
  | 'focus'
  | 'projects'
  | 'project'
  | 'automations'
  | 'reports'
  | 'forms';
