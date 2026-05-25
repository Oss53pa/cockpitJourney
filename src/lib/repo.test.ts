import { describe, it, expect } from 'vitest';
import { normalizeProject, normalizeFolder, normalizeSection, normalizeStatus, normalizeTask } from './repo';
import type { Project, Folder, Section, Task } from '../types';

const baseProject: Project = {
  id: 'p1',
  name: 'Test',
  slug: 'test',
  status: 'active',
  color: '#000',
  icon: 'compass',
  ownerId: 'u1',
  health: 'green',
  progress: 0,
  taskCount: 0,
  membersIds: ['u1'],
};

describe('normalizeProject', () => {
  it('passes a fully-formed project through unchanged in shape', () => {
    const out = normalizeProject(baseProject);
    expect(out.health).toBe('green');
    expect(out.progress).toBe(0);
    expect(out.taskCount).toBe(0);
    expect(out.membersIds).toEqual(['u1']);
  });

  it('backfills health to "green" when missing', () => {
    const broken = { ...baseProject, health: undefined as unknown as Project['health'] };
    expect(normalizeProject(broken).health).toBe('green');
  });

  it('backfills progress to 0 when missing or non-numeric', () => {
    const broken = { ...baseProject, progress: undefined as unknown as number };
    expect(normalizeProject(broken).progress).toBe(0);
    const stringy = { ...baseProject, progress: 'fifty' as unknown as number };
    expect(normalizeProject(stringy).progress).toBe(0);
  });

  it('backfills taskCount to 0 when missing', () => {
    const broken = { ...baseProject, taskCount: undefined as unknown as number };
    expect(normalizeProject(broken).taskCount).toBe(0);
  });

  it('backfills membersIds to [ownerId] when missing', () => {
    const broken = { ...baseProject, membersIds: undefined as unknown as string[] };
    expect(normalizeProject(broken).membersIds).toEqual(['u1']);
  });

  it('backfills membersIds to [ownerId] when empty array', () => {
    const broken = { ...baseProject, membersIds: [] };
    expect(normalizeProject(broken).membersIds).toEqual(['u1']);
  });

  it('preserves a populated membersIds array as-is', () => {
    const sub = { ...baseProject, membersIds: ['u1', 'u2', 'u3'] };
    expect(normalizeProject(sub).membersIds).toEqual(['u1', 'u2', 'u3']);
  });
});

describe('normalizeFolder', () => {
  const baseFolder: Folder = {
    id: 'f1',
    name: 'Personnel',
    icon: 'briefcase',
    color: '#000',
    projectIds: ['p1'],
  };

  it('passes a valid folder through', () => {
    expect(normalizeFolder(baseFolder).projectIds).toEqual(['p1']);
  });

  it('backfills projectIds to [] when missing', () => {
    const broken = { ...baseFolder, projectIds: undefined as unknown as string[] };
    expect(normalizeFolder(broken).projectIds).toEqual([]);
  });

  it('backfills projectIds to [] when not an array', () => {
    const broken = { ...baseFolder, projectIds: 'not-an-array' as unknown as string[] };
    expect(normalizeFolder(broken).projectIds).toEqual([]);
  });
});

describe('normalizeSection', () => {
  const baseSection: Section = {
    id: 's1',
    projectId: 'p1',
    name: 'À faire',
    color: '#000',
    position: 0,
  };

  it('passes a valid section through', () => {
    const out = normalizeSection(baseSection);
    expect(out.color).toBe('#000');
    expect(out.position).toBe(0);
  });

  it('backfills color to a neutral grey when missing', () => {
    const broken = { ...baseSection, color: undefined as unknown as string };
    expect(normalizeSection(broken).color).toBe('#94A3B8');
  });

  it('migrates legacy `order` to `position`', () => {
    const legacy = {
      ...baseSection,
      position: undefined as unknown as number,
      order: 2,
    } as Section & { order: number };
    expect(normalizeSection(legacy).position).toBe(2);
  });

  it('defaults position to 0 when both position and order are missing', () => {
    const broken = { ...baseSection, position: undefined as unknown as number };
    expect(normalizeSection(broken).position).toBe(0);
  });

  it('preserves position when present, ignoring legacy order', () => {
    const both = { ...baseSection, position: 5, order: 99 } as Section & { order: number };
    expect(normalizeSection(both).position).toBe(5);
  });
});

describe('normalizeStatus', () => {
  it('passes canonical statuses through unchanged', () => {
    expect(normalizeStatus('todo')).toBe('todo');
    expect(normalizeStatus('in_progress')).toBe('in_progress');
    expect(normalizeStatus('in_review')).toBe('in_review');
    expect(normalizeStatus('done')).toBe('done');
    expect(normalizeStatus('blocked')).toBe('blocked');
  });

  it('maps French aliases written by the connector / imports', () => {
    expect(normalizeStatus('a_faire')).toBe('todo');
    expect(normalizeStatus('en_cours')).toBe('in_progress');
    expect(normalizeStatus('en_validation')).toBe('in_review');
    expect(normalizeStatus('termine')).toBe('done');
    expect(normalizeStatus('terminé')).toBe('done');
    expect(normalizeStatus('bloqué')).toBe('blocked');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(normalizeStatus('  EN_COURS ')).toBe('in_progress');
  });

  it('defaults unknown / missing values to todo so the task still renders', () => {
    expect(normalizeStatus('zzz')).toBe('todo');
    expect(normalizeStatus(undefined)).toBe('todo');
    expect(normalizeStatus(null)).toBe('todo');
  });
});

describe('normalizeTask', () => {
  const baseTask: Task = {
    id: 't1',
    projectId: 'p1',
    sectionId: 's1',
    title: 'Tâche',
    status: 'todo',
    priority: 2,
    assignees: [],
    tags: [],
  };

  it('coerces a French status so the task lands in a real column', () => {
    const fr = { ...baseTask, status: 'a_faire' as unknown as Task['status'] };
    expect(normalizeTask(fr).status).toBe('todo');
  });

  it('backfills missing assignees / tags arrays', () => {
    const broken = {
      ...baseTask,
      assignees: undefined as unknown as string[],
      tags: undefined as unknown as string[],
    };
    const out = normalizeTask(broken);
    expect(out.assignees).toEqual([]);
    expect(out.tags).toEqual([]);
  });
});
