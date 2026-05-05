// Dexie database schema for CockpitJourney
// All entities live in IndexedDB as the source of truth.
// Zustand store mirrors this for fast reactive UI; mutations write through to Dexie.

import Dexie, { type Table } from 'dexie';
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

export interface Setting {
  key: string;
  value: unknown;
}

export class CockpitDB extends Dexie {
  users!: Table<User, string>;
  folders!: Table<Folder, string>;
  projects!: Table<Project, string>;
  sections!: Table<Section, string>;
  tasks!: Table<Task, string>;
  goals!: Table<Goal, string>;
  comments!: Table<Comment, string>;
  notifications!: Table<Notification, string>;
  insights!: Table<PropheticInsight, string>;
  automations!: Table<AutomationRule, string>;
  forms!: Table<IntakeForm, string>;
  reports!: Table<Report, string>;
  attachments!: Table<Attachment, string>;
  dependencies!: Table<TaskDependency, string>;
  activity!: Table<ActivityEvent, string>;
  notes!: Table<TaskNote, string>;
  subtasks!: Table<Subtask, string>;
  settings!: Table<Setting, string>;

  constructor() {
    super('cockpitjourney');
    this.version(1).stores({
      users: 'id, email',
      folders: 'id, parent_folder_id',
      projects: 'id, folderId, ownerId, status',
      sections: 'id, projectId, position',
      tasks: 'id, projectId, sectionId, parentTaskId, status, priority, dueDate',
      goals: 'id, ownerId, level, parentGoalId, status, health',
      comments: 'id, taskId, authorId, createdAt',
      notifications: 'id, read, createdAt, type',
      insights: 'id, kind',
      automations: 'id, enabled, triggerKey',
      forms: 'id, projectId, enabled',
      reports: 'id, kind, generatedAt',
      attachments: 'id, taskId, kind',
      dependencies: 'id, taskId, relatedTaskId, relation',
      activity: 'id, taskId, projectId, actorId, at',
      notes: 'taskId, updatedAt',
      subtasks: 'id, taskId, position, done',
      settings: 'key',
    });
  }
}

export const db = new CockpitDB();

/** Read-only snapshot — load all tables into memory for the Zustand cache. */
export async function loadSnapshot() {
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
    settingsRows,
  ] = await Promise.all([
    db.users.toArray(),
    db.folders.toArray(),
    db.projects.toArray(),
    db.sections.toArray(),
    db.tasks.toArray(),
    db.goals.toArray(),
    db.comments.toArray(),
    db.notifications.toArray(),
    db.insights.toArray(),
    db.automations.toArray(),
    db.forms.toArray(),
    db.reports.toArray(),
    db.attachments.toArray(),
    db.dependencies.toArray(),
    db.activity.toArray(),
    db.notes.toArray(),
    db.subtasks.toArray(),
    db.settings.toArray(),
  ]);

  const settings: Record<string, unknown> = {};
  settingsRows.forEach((s) => {
    settings[s.key] = s.value;
  });

  return {
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
    settings,
  };
}

/** Wipe and re-seed (used by Settings → Réinitialiser). */
export async function wipeDatabase() {
  await db.delete();
  await db.open();
}

/** Returns true if DB is empty (first launch). */
export async function isEmpty(): Promise<boolean> {
  const c = await db.users.count();
  return c === 0;
}

/* ───────────── Persistence helpers (write-through from store actions) ───────────── */

type TableName = Exclude<
  keyof CockpitDB,
  | 'tables'
  | 'verno'
  | 'name'
  | 'open'
  | 'close'
  | 'delete'
  | 'transaction'
  | 'on'
  | 'use'
  | 'unuse'
  | 'isOpen'
  | 'hasBeenClosed'
  | 'hasFailed'
  | 'dynamicallyOpened'
  | 'backendDB'
  | '_dbSchema'
  | '_versions'
  | '_storeNames'
  | '_allTables'
  | '_dbReadyResolve'
  | '_dbReadyPromise'
  | '_state'
  | 'core'
  | 'cache'
  | 'idbdb'
  | '_options'
  | '_middlewares'
  | 'vip'
  | 'addons'
  | 'Table'
  | 'Version'
  | 'Collection'
  | 'WhereClause'
  | 'Transaction'
  | '_runJobs'
  | 'closed'
>;

const writeQueue: Promise<unknown>[] = [];
function track<T>(p: Promise<T>): Promise<T> {
  writeQueue.push(p);
  p.finally(() => {
    const i = writeQueue.indexOf(p);
    if (i >= 0) writeQueue.splice(i, 1);
  });
  return p;
}

/** Wait for all pending writes. Useful for tests + before page unload. */
export async function flushWrites(): Promise<void> {
  while (writeQueue.length) {
    await Promise.allSettled([...writeQueue]);
  }
}

export const persist = {
  put<K extends TableName>(table: K, item: any) {
    return track(
      (db as any)[table]
        .put(item)
        .catch((err: unknown) => console.error(`[db] put ${String(table)} failed`, err))
    );
  },
  bulkPut<K extends TableName>(table: K, items: any[]) {
    return track(
      (db as any)[table]
        .bulkPut(items)
        .catch((err: unknown) => console.error(`[db] bulkPut ${String(table)} failed`, err))
    );
  },
  delete<K extends TableName>(table: K, key: string) {
    return track(
      (db as any)[table]
        .delete(key)
        .catch((err: unknown) => console.error(`[db] delete ${String(table)} failed`, err))
    );
  },
  bulkDelete<K extends TableName>(table: K, keys: string[]) {
    return track(
      (db as any)[table]
        .bulkDelete(keys)
        .catch((err: unknown) => console.error(`[db] bulkDelete ${String(table)} failed`, err))
    );
  },
  setSetting(key: string, value: unknown) {
    return track(
      db.settings.put({ key, value }).catch((err: unknown) => console.error(`[db] setSetting failed`, err))
    );
  },
};
