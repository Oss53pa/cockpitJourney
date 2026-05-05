import { describe, it, expect, beforeAll } from 'vitest';
import { useApp } from './appStore';
import { db, loadSnapshot, flushWrites } from '../lib/db';
import { seedDatabaseIfEmpty } from '../lib/seed';

describe('appStore — smoke tests (Dexie-backed)', () => {
  beforeAll(async () => {
    await seedDatabaseIfEmpty();
    await useApp.getState().bootstrap();
  });

  it('bootstrap loads seed entities from Dexie', async () => {
    const s = useApp.getState();
    expect(s.users.length).toBeGreaterThan(0);
    expect(s.projects.length).toBeGreaterThan(0);
    expect(s.tasks.length).toBeGreaterThan(0);
    expect(s.goals.length).toBeGreaterThan(0);
    expect(s.ready).toBe(true);
  });

  it('createTask adds a task in store and Dexie', async () => {
    const state = useApp.getState();
    const before = state.tasks.length;
    const section = state.sections[0];
    const project = state.projects.find((p) => p.id === section.projectId)!;
    const t = useApp.getState().createTask({
      title: 'Test task',
      projectId: project.id,
      sectionId: section.id,
    });
    expect(t.id).toBeTruthy();
    expect(useApp.getState().tasks.length).toBe(before + 1);
    // Wait for write-through
    await new Promise((r) => setTimeout(r, 30));
    const fromDb = await db.tasks.get(t.id);
    expect(fromDb?.title).toBe('Test task');
  });

  it('toggleTaskDone flips status', () => {
    const t = useApp.getState().tasks[0];
    const initial = t.status;
    useApp.getState().toggleTaskDone(t.id);
    const updated = useApp.getState().tasks.find((x) => x.id === t.id)!;
    if (initial === 'done') expect(updated.status).not.toBe('done');
    else expect(updated.status).toBe('done');
  });

  it('subtasks CRUD round-trip', async () => {
    const t = useApp.getState().tasks[0];
    const before = useApp.getState().subtasks.filter((s) => s.taskId === t.id).length;
    useApp.getState().addSubtask(t.id, 'My subtask');
    const after = useApp.getState().subtasks.filter((s) => s.taskId === t.id);
    expect(after.length).toBe(before + 1);
    const sub = after[after.length - 1];
    useApp.getState().toggleSubtask(sub.id);
    expect(useApp.getState().subtasks.find((x) => x.id === sub.id)!.done).toBe(true);
    useApp.getState().removeSubtask(sub.id);
    expect(useApp.getState().subtasks.find((x) => x.id === sub.id)).toBeUndefined();
    await new Promise((r) => setTimeout(r, 30));
    const dbSub = await db.subtasks.get(sub.id);
    expect(dbSub).toBeUndefined();
  });

  it('createGoal adds a goal', () => {
    const before = useApp.getState().goals.length;
    useApp.getState().createGoal({
      title: 'Goal test',
      ownerId: 'u_pame',
      level: 'personal',
      metricType: 'percentage',
      targetValue: 100,
      currentValue: 0,
      unit: '%',
      period: 'monthly',
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      status: 'on_track',
      health: 'green',
    });
    expect(useApp.getState().goals.length).toBe(before + 1);
  });

  it('toggleAutomation flips enabled and persists', async () => {
    const a = useApp.getState().automations[0];
    const initial = a.enabled;
    useApp.getState().toggleAutomation(a.id);
    expect(useApp.getState().automations.find((x) => x.id === a.id)!.enabled).toBe(!initial);
    await new Promise((r) => setTimeout(r, 30));
    const fromDb = await db.automations.get(a.id);
    expect(fromDb?.enabled).toBe(!initial);
  });

  it('generateReport produces a detailed report with breakdown', () => {
    const r = useApp.getState().generateReport('weekly');
    expect(r.id).toBeTruthy();
    expect(r.kind).toBe('weekly');
    expect(r.metrics.length).toBeGreaterThan(0);
    expect(r.projects?.length).toBeGreaterThan(0);
  });

  it('createForm produces a form with public URL', () => {
    const f = useApp.getState().createForm({
      name: 'Test form',
      projectId: useApp.getState().projects[0].id,
      enabled: true,
      fields: [],
    });
    expect(f.publicUrl).toMatch(/^https:\/\/cockpitjourney\.app\/f\//);
    expect(f.submissions).toBe(0);
  });

  it('settings update persists to Dexie', async () => {
    useApp.getState().updateSettings({ dailyBriefHour: 9 });
    expect(useApp.getState().settings.dailyBriefHour).toBe(9);
    await new Promise((r) => setTimeout(r, 30));
    const row = await db.settings.get('dailyBriefHour');
    expect(row?.value).toBe(9);
  });

  it('snapshot survives in-memory wipe + reload from Dexie (no hardcoded data leaks)', async () => {
    const section = useApp.getState().sections[0];
    const project = useApp.getState().projects.find((p) => p.id === section.projectId)!;
    useApp.getState().createTask({ title: 'Persist me', projectId: project.id, sectionId: section.id });
    await flushWrites();
    // Wipe in-memory store
    useApp.setState({
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
    } as any);
    // Force re-hydration from Dexie
    const snap = await loadSnapshot();
    useApp.setState({ ...snap, ready: true } as any);
    const persisted = useApp.getState().tasks.find((t) => t.title === 'Persist me');
    expect(persisted).toBeTruthy();
    // Cleanup so next time test runs cleanly
    if (persisted) await db.tasks.delete(persisted.id);
  });
});
