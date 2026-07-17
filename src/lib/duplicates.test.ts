import { describe, expect, it } from 'vitest';
import { findDuplicateTasks, normalizeTitle, richness } from './duplicates';
import type { Task } from '../types';

const t = (id: string, title: string, extras: Partial<Task> = {}): Task => ({
  id,
  projectId: 'p1',
  sectionId: 's1',
  title,
  status: 'todo',
  priority: 2,
  assignees: [],
  tags: [],
  ...extras,
});

describe('normalizeTitle', () => {
  it('ignores case, accents and punctuation', () => {
    expect(normalizeTitle('Établir le planning macro')).toBe('etablir le planning macro');
    expect(normalizeTitle('  ETABLIR   le PLANNING, macro !  ')).toBe('etablir le planning macro');
  });
});

describe('richness', () => {
  it('ranks a done, linked task above an empty todo', () => {
    const rich = t('a', 'x', { status: 'done', goalId: 'g1', commentCount: 2 });
    const poor = t('b', 'x');
    expect(richness(rich)).toBeGreaterThan(richness(poor));
  });

  it('counts sub-actions', () => {
    expect(richness(t('a', 'x'), 3)).toBeGreaterThan(richness(t('a', 'x'), 0));
  });
});

describe('findDuplicateTasks', () => {
  it('returns nothing when every title is unique', () => {
    expect(findDuplicateTasks([t('a', 'Alpha'), t('b', 'Beta')])).toEqual([]);
  });

  it('groups same-title tasks and keeps the richest copy', () => {
    const poor = t('stub', 'Valider la note de cadrage');
    const rich = t('full', 'Valider la note de cadrage', { status: 'in_progress', goalId: 'g1' });
    const [g] = findDuplicateTasks([poor, rich]);
    expect(g.keep.id).toBe('full');
    expect(g.remove.map((x) => x.id)).toEqual(['stub']);
  });

  it('does NOT merge homonyms living in different projects', () => {
    const a = t('a', 'Valider le budget', { projectId: 'p1' });
    const b = t('b', 'Valider le budget', { projectId: 'p2' });
    expect(findDuplicateTasks([a, b])).toEqual([]);
  });

  it('flags a group whose copies disagree on status', () => {
    const [g] = findDuplicateTasks([t('a', 'Same', { status: 'done' }), t('b', 'Same', { status: 'todo' })]);
    expect(g.conflicting).toBe(true);
  });

  it('does not flag a group whose copies agree', () => {
    const [g] = findDuplicateTasks([t('a', 'Same'), t('b', 'Same')]);
    expect(g.conflicting).toBe(false);
  });

  it('handles triplicates, keeping one and proposing two removals', () => {
    const [g] = findDuplicateTasks([t('a', 'Trio'), t('b', 'Trio', { status: 'done' }), t('c', 'Trio')]);
    expect(g.keep.id).toBe('b');
    expect(g.remove).toHaveLength(2);
  });

  it('surfaces conflicting groups first', () => {
    const groups = findDuplicateTasks([
      t('x1', 'Calme', { projectId: 'p1' }),
      t('x2', 'Calme', { projectId: 'p1' }),
      t('y1', 'Litige', { projectId: 'p2', status: 'done' }),
      t('y2', 'Litige', { projectId: 'p2', status: 'todo' }),
    ]);
    expect(groups[0].conflicting).toBe(true);
  });
});
