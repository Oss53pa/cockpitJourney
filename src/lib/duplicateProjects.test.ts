import { describe, expect, it } from 'vitest';
import { findDuplicateProjects, projectRichness } from './duplicateProjects';
import type { Project, Task } from '../types';

const p = (id: string, name: string, extras: Partial<Project> = {}): Project => ({
  id,
  name,
  slug: name.toLowerCase(),
  status: 'active',
  color: '#95B07D',
  icon: 'Compass',
  ownerId: 'u1',
  health: 'green',
  progress: 0,
  taskCount: 0,
  membersIds: ['u1'],
  ...extras,
});

const t = (id: string, projectId: string): Task => ({
  id,
  projectId,
  sectionId: 's1',
  title: 'x',
  status: 'todo',
  priority: 2,
  assignees: [],
  tags: [],
});

describe('projectRichness', () => {
  it('ranks an active project with tasks and description above a bare paused one', () => {
    const rich = p('a', 'x', { status: 'active', description: 'Une description' });
    const poor = p('b', 'x', { status: 'paused' });
    expect(projectRichness(rich, 3)).toBeGreaterThan(projectRichness(poor, 0));
  });

  it('counts real task volume', () => {
    expect(projectRichness(p('a', 'x'), 5)).toBeGreaterThan(projectRichness(p('a', 'x'), 0));
  });
});

describe('findDuplicateProjects', () => {
  it('returns nothing when every name is unique', () => {
    expect(findDuplicateProjects([p('a', 'Alpha'), p('b', 'Beta')], [])).toEqual([]);
  });

  it('groups same-name projects in the same folder and keeps the richest copy', () => {
    const stub = p('stub', 'Refonte site', { folderId: 'f1' });
    const full = p('full', 'Refonte site', { folderId: 'f1', description: 'Détails', status: 'active' });
    const [g] = findDuplicateProjects([stub, full], [t('t1', 'full'), t('t2', 'full')]);
    expect(g.keep.id).toBe('full');
    expect(g.remove.map((x) => x.id)).toEqual(['stub']);
  });

  it('does NOT merge homonyms living in different folders', () => {
    const a = p('a', 'Bilan', { folderId: 'f1' });
    const b = p('b', 'Bilan', { folderId: 'f2' });
    expect(findDuplicateProjects([a, b], [])).toEqual([]);
  });

  it('groups unclassified homonyms (no folderId) together', () => {
    const a = p('a', 'Sans dossier');
    const b = p('b', 'Sans dossier');
    const [g] = findDuplicateProjects([a, b], []);
    expect(g.remove).toHaveLength(1);
  });

  it('flags a group whose copies disagree on status', () => {
    const [g] = findDuplicateProjects(
      [p('a', 'Same', { status: 'active' }), p('b', 'Same', { status: 'archived' })],
      []
    );
    expect(g.conflicting).toBe(true);
  });

  it('does not flag a group whose copies agree', () => {
    const [g] = findDuplicateProjects([p('a', 'Same'), p('b', 'Same')], []);
    expect(g.conflicting).toBe(false);
  });

  it('handles triplicates, keeping one and proposing two removals', () => {
    const [g] = findDuplicateProjects(
      [p('a', 'Trio'), p('b', 'Trio', { description: 'riche' }), p('c', 'Trio')],
      []
    );
    expect(g.keep.id).toBe('b');
    expect(g.remove).toHaveLength(2);
  });
});
