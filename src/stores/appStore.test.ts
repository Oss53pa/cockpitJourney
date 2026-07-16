/**
 * Store integration tests — cover the high-value behaviors that have no UI
 * coverage and are easy to silently regress (approval gate, delete cascades,
 * goal rollup). The audit flagged "144/144 tests verts mais 0 ligne du store
 * testée" — this file closes the worst of that gap.
 *
 * Strategy: mock every persistence/network dependency to a no-op so the
 * store's pure logic runs in isolation, then drive it with `useApp.setState`
 * + the public actions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/repo', () => ({
  persist: {
    put: vi.fn(),
    delete: vi.fn(),
    bulkPut: vi.fn(),
    bulkDelete: vi.fn(),
    setSetting: vi.fn(),
  },
  loadSnapshot: vi.fn(async () => ({})),
  wipeDatabase: vi.fn(async () => {}),
  setCurrentAuthUserId: vi.fn(),
  setCurrentProfileId: vi.fn(),
  getCurrentAuthUserId: vi.fn(() => 'test-auth'),
}));
vi.mock('../lib/supabase', () => ({
  SUPABASE_CONFIGURED: false,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      getUser: async () => ({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => ({ error: null }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    }),
  },
}));
vi.mock('../lib/snapshotCache', () => ({
  peekSupabaseSession: () => null,
  readSnapshotCache: () => null,
  writeSnapshotCache: vi.fn(),
  clearSnapshotCache: vi.fn(),
}));
vi.mock('../lib/monitoring', () => ({
  setMonitoringUser: vi.fn(),
  captureException: vi.fn(),
}));
vi.mock('../lib/seed', () => ({
  bootstrapUserData: vi.fn(async () => {}),
  buildOfflineSnapshot: () => null,
}));

import { useApp } from './appStore';
import type { Project, Section, Task, Goal, User } from '../types';

// --- Fixtures -------------------------------------------------------------

const u = (id: string, name = id): User => ({
  id,
  name,
  initials: name.slice(0, 2).toUpperCase(),
  color: '#888',
  role: 'editor',
  email: `${id}@test`,
});

const p = (id: string, ownerId = 'u1', extras: Partial<Project> = {}): Project => ({
  id,
  name: id,
  slug: id,
  folderId: 'f1',
  description: '',
  status: 'active',
  color: '#888',
  icon: 'Compass',
  ownerId,
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  progress: 0,
  health: 'green',
  membersIds: [ownerId],
  taskCount: 0,
  ...extras,
});

const sec = (id: string, projectId: string, position = 0): Section => ({
  id,
  projectId,
  name: 'À faire',
  position,
  color: '#888',
});

const t = (id: string, projectId: string, sectionId: string, extras: Partial<Task> = {}): Task => ({
  id,
  projectId,
  sectionId,
  title: id,
  status: 'todo',
  priority: 2,
  assignees: [],
  tags: [],
  ...extras,
});

const g = (id: string, extras: Partial<Goal> = {}): Goal => ({
  id,
  title: id,
  ownerId: 'u1',
  level: 'workspace',
  metricType: 'percentage',
  targetValue: 100,
  currentValue: 0,
  period: 'quarterly',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  status: 'on_track',
  health: 'green',
  ...extras,
});

// --- Helpers --------------------------------------------------------------

function resetStore() {
  // Seed a minimal but consistent state. Each test will overlay what it needs.
  useApp.setState({
    users: [u('u1', 'Owner')],
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
    currentProfileId: 'u1',
    authStatus: 'signed_in',
    authEmail: 'u1@test',
    ready: true,
  });
}

beforeEach(resetStore);
afterEach(() => {
  vi.clearAllMocks();
});

// --- Approval gate --------------------------------------------------------

describe('approval gate', () => {
  it('toggleTaskDone refuses to close a task that requires approval and is not approved', () => {
    const task = t('t1', 'p1', 'sec1', { requiresApproval: true, approvalStatus: 'pending' });
    useApp.setState({ tasks: [task] });
    useApp.getState().toggleTaskDone('t1');
    expect(useApp.getState().tasks[0].status).toBe('todo');
  });

  it('toggleTaskDone allows closing once the task is approved', () => {
    const task = t('t1', 'p1', 'sec1', { requiresApproval: true, approvalStatus: 'approved' });
    useApp.setState({ tasks: [task] });
    useApp.getState().toggleTaskDone('t1');
    expect(useApp.getState().tasks[0].status).toBe('done');
  });

  it('toggleTaskDone reopens a done task without re-checking approval', () => {
    const task = t('t1', 'p1', 'sec1', {
      requiresApproval: true,
      approvalStatus: 'pending',
      status: 'done',
    });
    useApp.setState({ tasks: [task] });
    useApp.getState().toggleTaskDone('t1');
    expect(useApp.getState().tasks[0].status).toBe('todo');
  });

  it('moveTask to a "Terminé" section keeps the task in the new column but does NOT flip it to done', () => {
    const task = t('t1', 'p1', 'sec1', { requiresApproval: true, approvalStatus: 'pending' });
    const doneSec: Section = {
      id: 'sec_done',
      projectId: 'p1',
      name: 'Terminé',
      position: 99,
      color: '#888',
    };
    useApp.setState({
      tasks: [task],
      sections: [sec('sec1', 'p1'), doneSec],
    });
    useApp.getState().moveTask('t1', 'sec_done');
    const after = useApp.getState().tasks[0];
    expect(after.sectionId).toBe('sec_done');
    expect(after.status).toBe('todo');
  });
});

// --- deleteGoal -----------------------------------------------------------

describe('deleteGoal', () => {
  it('nulls out task.goalId on every contributing task', () => {
    const goal = g('g1');
    const tasks = [
      t('t1', 'p1', 'sec1', { goalId: 'g1' }),
      t('t2', 'p1', 'sec1', { goalId: 'g1' }),
      t('t3', 'p1', 'sec1', { goalId: 'other' }),
    ];
    useApp.setState({ goals: [goal], tasks });
    useApp.getState().deleteGoal('g1');
    const after = useApp.getState();
    expect(after.goals).toHaveLength(0);
    expect(after.tasks.find((x) => x.id === 't1')?.goalId).toBeUndefined();
    expect(after.tasks.find((x) => x.id === 't2')?.goalId).toBeUndefined();
    expect(after.tasks.find((x) => x.id === 't3')?.goalId).toBe('other');
  });
});

// --- deleteProject --------------------------------------------------------

describe('deleteProject', () => {
  it('cascades forms tied to the project', () => {
    useApp.setState({
      projects: [p('p1'), p('p2')],
      sections: [sec('sec1', 'p1'), sec('sec2', 'p2')],
      forms: [
        {
          id: 'f1',
          name: 'F1',
          projectId: 'p1',
          fields: [],
          enabled: true,
          submissions: 0,
          createdAt: '2026-01-01',
          publicUrl: 'x',
        },
        {
          id: 'f2',
          name: 'F2',
          projectId: 'p2',
          fields: [],
          enabled: true,
          submissions: 0,
          createdAt: '2026-01-01',
          publicUrl: 'y',
        },
      ],
    });
    useApp.getState().deleteProject('p1');
    const after = useApp.getState();
    expect(after.forms.map((f) => f.id)).toEqual(['f2']);
  });

  it('strips the deleted project from alsoInProjectIds of every other task', () => {
    const tasks = [
      t('t1', 'p2', 'sec2', { alsoInProjectIds: ['p1', 'p3'] }),
      t('t2', 'p3', 'sec3', { alsoInProjectIds: ['p1'] }),
      t('t3', 'p2', 'sec2'),
    ];
    useApp.setState({
      projects: [p('p1'), p('p2'), p('p3')],
      sections: [sec('sec1', 'p1'), sec('sec2', 'p2'), sec('sec3', 'p3')],
      tasks,
    });
    useApp.getState().deleteProject('p1');
    const after = useApp.getState();
    expect(after.tasks.find((x) => x.id === 't1')?.alsoInProjectIds).toEqual(['p3']);
    expect(after.tasks.find((x) => x.id === 't2')?.alsoInProjectIds).toBeUndefined();
  });

  it('promotes a shared task to its secondary project instead of deleting it', () => {
    const sharedTask = t('t1', 'p1', 'sec1', { alsoInProjectIds: ['p2'] });
    useApp.setState({
      projects: [p('p1'), p('p2')],
      sections: [sec('sec1', 'p1'), sec('sec2', 'p2', 0)],
      tasks: [sharedTask],
    });
    useApp.getState().deleteProject('p1');
    const after = useApp.getState();
    expect(after.projects.map((x) => x.id)).toEqual(['p2']);
    expect(after.tasks).toHaveLength(1);
    expect(after.tasks[0].projectId).toBe('p2');
    expect(after.tasks[0].sectionId).toBe('sec2');
    expect(after.tasks[0].alsoInProjectIds).toBeUndefined();
  });

  it('deletes a non-shared primary task outright', () => {
    useApp.setState({
      projects: [p('p1')],
      sections: [sec('sec1', 'p1')],
      tasks: [t('t1', 'p1', 'sec1')],
    });
    useApp.getState().deleteProject('p1');
    expect(useApp.getState().tasks).toHaveLength(0);
  });
});

// --- recomputeGoalFromTasks -----------------------------------------------

describe('recomputeGoalFromTasks', () => {
  it('auto-pilots a percentage goal from contributing-task completion', async () => {
    const goal = g('g1', { metricType: 'percentage', targetValue: 100, currentValue: 0 });
    useApp.setState({
      goals: [goal],
      tasks: [
        t('t1', 'p1', 'sec1', { goalId: 'g1', status: 'done' }),
        t('t2', 'p1', 'sec1', { goalId: 'g1', status: 'done' }),
        t('t3', 'p1', 'sec1', { goalId: 'g1', status: 'todo' }),
      ],
    });
    useApp.getState().recomputeGoalFromTasks('g1');
    // Microtask coalescing — wait one tick.
    await Promise.resolve();
    expect(useApp.getState().goals[0].currentValue).toBe(67);
  });

  it('auto-pilots a currency goal via the execution ratio (target × fraction)', async () => {
    const goal = g('g1', { metricType: 'currency', targetValue: 1_000_000, currentValue: 0 });
    useApp.setState({
      goals: [goal],
      tasks: [
        t('t1', 'p1', 'sec1', { goalId: 'g1', status: 'done' }),
        t('t2', 'p1', 'sec1', { goalId: 'g1', status: 'todo' }),
      ],
    });
    useApp.getState().recomputeGoalFromTasks('g1');
    await Promise.resolve();
    // 1/2 actions faites → 50% de 1 000 000.
    expect(useApp.getState().goals[0].currentValue).toBe(500_000);
  });

  it('never overwrites a goal in manual mode', async () => {
    const goal = g('g1', { metricType: 'percentage', progressMode: 'manual', currentValue: 42 });
    useApp.setState({
      goals: [goal],
      tasks: [
        t('t1', 'p1', 'sec1', { goalId: 'g1', status: 'done' }),
        t('t2', 'p1', 'sec1', { goalId: 'g1', status: 'done' }),
      ],
    });
    useApp.getState().recomputeGoalFromTasks('g1');
    await Promise.resolve();
    expect(useApp.getState().goals[0].currentValue).toBe(42);
  });

  it('gives an in-progress action partial credit from its completed sub-actions', async () => {
    const goal = g('g1', { metricType: 'percentage', targetValue: 100, currentValue: 0 });
    useApp.setState({
      goals: [goal],
      tasks: [
        t('t1', 'p1', 'sec1', { goalId: 'g1', status: 'done' }),
        t('t2', 'p1', 'sec1', { goalId: 'g1', status: 'in_progress' }),
      ],
      subtasks: [
        { id: 'st1', taskId: 't2', title: 'a', done: true, position: 0 },
        { id: 'st2', taskId: 't2', title: 'b', done: true, position: 1 },
        { id: 'st3', taskId: 't2', title: 'c', done: false, position: 2 },
        { id: 'st4', taskId: 't2', title: 'd', done: false, position: 3 },
      ],
    });
    useApp.getState().recomputeGoalFromTasks('g1');
    await Promise.resolve();
    // t1 = 1, t2 = 2/4 = 0,5 → (1 + 0,5) / 2 = 0,75 → 75%.
    expect(useApp.getState().goals[0].currentValue).toBe(75);
  });

  it('toggling a sub-action recomputes the parent action goal', async () => {
    const goal = g('g1', { metricType: 'percentage', targetValue: 100, currentValue: 0 });
    useApp.setState({
      goals: [goal],
      tasks: [t('t1', 'p1', 'sec1', { goalId: 'g1', status: 'in_progress' })],
      subtasks: [
        { id: 'st1', taskId: 't1', title: 'a', done: false, position: 0 },
        { id: 'st2', taskId: 't1', title: 'b', done: false, position: 1 },
      ],
    });
    useApp.getState().toggleSubtask('st1');
    await Promise.resolve();
    // 1/2 sous-actions faites sur l'unique action → 50%.
    expect(useApp.getState().goals[0].currentValue).toBe(50);
  });

  it('coalesces a burst of recomputes into a single updateGoal write', async () => {
    const goal = g('g1', { metricType: 'percentage', targetValue: 100, currentValue: 0 });
    useApp.setState({
      goals: [goal],
      tasks: [t('t1', 'p1', 'sec1', { goalId: 'g1', status: 'done' })],
    });
    // Five rapid recompute calls within the same JS turn — should only
    // produce one updateGoal because the microtask is deduped per goalId.
    for (let i = 0; i < 5; i++) useApp.getState().recomputeGoalFromTasks('g1');
    await Promise.resolve();
    // Final value reflects the last state, regardless of how many times we asked.
    expect(useApp.getState().goals[0].currentValue).toBe(100);
  });
});
