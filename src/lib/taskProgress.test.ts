import { describe, it, expect } from 'vitest';
import { completionPct, statusCounts } from './taskProgress';
import type { TaskStatus } from '../types';

const t = (status: TaskStatus) => ({ status });

describe('completionPct', () => {
  it('is 0 when there are no tasks', () => {
    expect(completionPct([])).toBe(0);
  });

  it('is the rounded ratio of done tasks to total', () => {
    expect(completionPct([t('done'), t('todo'), t('todo'), t('todo')])).toBe(25);
    expect(completionPct([t('done'), t('done')])).toBe(100);
  });

  it('reflects real statuses, not a stored field (2 done of 117 ≈ 2%)', () => {
    const tasks = [
      ...Array(89).fill(t('todo')),
      ...Array(22).fill(t('in_progress')),
      ...Array(4).fill(t('in_review')),
      ...Array(2).fill(t('done')),
    ];
    expect(tasks).toHaveLength(117);
    expect(completionPct(tasks)).toBe(2); // round(2/117*100)
  });

  it('counts only done — in_progress / in_review do not count as complete', () => {
    expect(completionPct([t('in_progress'), t('in_review'), t('blocked'), t('todo')])).toBe(0);
  });
});

describe('statusCounts', () => {
  it('returns every canonical key, zero-filled', () => {
    expect(statusCounts([])).toEqual({ todo: 0, in_progress: 0, in_review: 0, done: 0, blocked: 0 });
  });

  it('tallies each status', () => {
    const counts = statusCounts([t('todo'), t('todo'), t('done'), t('blocked')]);
    expect(counts.todo).toBe(2);
    expect(counts.done).toBe(1);
    expect(counts.blocked).toBe(1);
    expect(counts.in_progress).toBe(0);
  });
});
