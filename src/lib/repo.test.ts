import { describe, it, expect } from 'vitest';
import { normalizeProject, normalizeFolder, normalizeSection } from './repo';
import type { Project, Folder, Section } from '../types';

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
