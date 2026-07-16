import { describe, expect, it } from 'vitest';
import { computeGoalProgress, taskWeight } from './goalProgress';
import type { Goal, Task } from '../types';

const task = (id: string, status: Task['status'], goalId?: string): Pick<Task, 'id' | 'status' | 'goalId'> => ({
  id,
  status,
  goalId,
});

const goal = (extras: Partial<Goal> = {}): Pick<Goal, 'id' | 'metricType' | 'targetValue'> => ({
  id: 'g1',
  metricType: 'percentage',
  targetValue: 100,
  ...extras,
});

describe('taskWeight', () => {
  it('gives full credit to a done task even without sub-actions', () => {
    expect(taskWeight({ id: 't1', status: 'done' }, [])).toBe(1);
  });

  it('gives zero to an unfinished task with no sub-actions', () => {
    expect(taskWeight({ id: 't1', status: 'in_progress' }, [])).toBe(0);
  });

  it('gives the sub-action completion ratio to an unfinished task', () => {
    const subs = [
      { taskId: 't1', done: true },
      { taskId: 't1', done: false },
      { taskId: 't1', done: false },
      { taskId: 't1', done: false },
    ];
    expect(taskWeight({ id: 't1', status: 'todo' }, subs)).toBe(0.25);
  });
});

describe('computeGoalProgress', () => {
  it('returns 0 for a goal with no contributing actions', () => {
    const r = computeGoalProgress(goal(), [], []);
    expect(r).toMatchObject({ fraction: 0, currentValue: 0, total: 0, status: 'off_track' });
  });

  it('weights partial credit into a percentage value', () => {
    const tasks = [task('t1', 'done', 'g1'), task('t2', 'in_progress', 'g1')];
    const subs = [
      { taskId: 't2', done: true },
      { taskId: 't2', done: false },
    ];
    const r = computeGoalProgress(goal(), tasks, subs);
    expect(r.currentValue).toBe(75); // (1 + 0.5) / 2
    expect(r.status).toBe('on_track');
  });

  it('applies the execution ratio to a currency target', () => {
    const tasks = [task('t1', 'done', 'g1'), task('t2', 'todo', 'g1')];
    const r = computeGoalProgress(goal({ metricType: 'currency', targetValue: 50_000 }), tasks, []);
    expect(r.currentValue).toBe(25_000);
  });

  it('treats a boolean goal as all-or-nothing', () => {
    const partial = computeGoalProgress(
      goal({ metricType: 'boolean', targetValue: 1 }),
      [task('t1', 'done', 'g1'), task('t2', 'todo', 'g1')],
      []
    );
    expect(partial.currentValue).toBe(0);
    const complete = computeGoalProgress(
      goal({ metricType: 'boolean', targetValue: 1 }),
      [task('t1', 'done', 'g1'), task('t2', 'done', 'g1')],
      []
    );
    expect(complete.currentValue).toBe(1);
    expect(complete.status).toBe('achieved');
  });

  it('ignores tasks linked to other goals', () => {
    const tasks = [task('t1', 'done', 'g1'), task('t2', 'done', 'g2')];
    const r = computeGoalProgress(goal(), tasks, []);
    expect(r.total).toBe(1);
    expect(r.currentValue).toBe(100);
  });
});
