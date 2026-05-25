import { describe, it, expect } from 'vitest';
import {
  summarize,
  aggregate,
  thresholdLevel,
  consumptionPct,
  buildPortfolio,
  emptyByStatus,
} from './consolidation';
import type { BudgetLine, Expense, Folder, Project } from '../../types';

const now = '2026-01-01T00:00:00.000Z';

function line(id: string, projectId: string, allocated: number): BudgetLine {
  return {
    id,
    projectId,
    ownerId: null,
    name: id,
    allocatedAmount: allocated,
    currency: 'XOF',
    sortOrder: 0,
    parentLineId: null,
    notes: [],
    attachments: [],
    createdAt: now,
    updatedAt: now,
  };
}

function expense(id: string, projectId: string, amount: number, status: Expense['status'] = 'paid'): Expense {
  return {
    id,
    projectId,
    lineId: null,
    label: id,
    amount,
    currency: 'XOF',
    status,
    expenseDate: '2026-01-01',
    notes: [],
    attachments: [],
    createdAt: now,
    updatedAt: now,
  };
}

function project(id: string, partial: Partial<Project> = {}): Project {
  return {
    id,
    name: id,
    slug: id,
    status: 'active',
    color: '#95B07D',
    icon: '📁',
    ownerId: 'u1',
    health: 'green',
    progress: 0,
    taskCount: 0,
    membersIds: [],
    ...partial,
  };
}

function folder(id: string, projectIds: string[] = []): Folder {
  return { id, name: id, icon: '📂', color: '#888', projectIds };
}

describe('consumptionPct', () => {
  it('is spent/allocated when there is an envelope', () => {
    expect(consumptionPct(50, 200)).toBe(25);
  });
  it('is 0 when nothing allocated and nothing spent', () => {
    expect(consumptionPct(0, 0)).toBe(0);
  });
  it('is 100 when spent without any envelope', () => {
    expect(consumptionPct(100, 0)).toBe(100);
  });
});

describe('thresholdLevel', () => {
  it('classifies by the 80 / 100 / over thresholds', () => {
    expect(thresholdLevel(10)).toBe('ok');
    expect(thresholdLevel(79.9)).toBe('ok');
    expect(thresholdLevel(80)).toBe('warning');
    expect(thresholdLevel(99.9)).toBe('warning');
    expect(thresholdLevel(100)).toBe('reached');
    expect(thresholdLevel(100.1)).toBe('over');
    expect(thresholdLevel(250)).toBe('over');
  });
});

describe('summarize', () => {
  it('sums allocated (top-down), spent (bottom-up) and the écart', () => {
    const s = summarize(
      [line('l1', 'p1', 1000), line('l2', 'p1', 500)],
      [expense('e1', 'p1', 300, 'paid'), expense('e2', 'p1', 200, 'committed')]
    );
    expect(s.allocated).toBe(1500);
    expect(s.spent).toBe(500);
    expect(s.variance).toBe(1000);
    expect(Math.round(s.pct)).toBe(33);
    expect(s.lineCount).toBe(2);
    expect(s.expenseCount).toBe(2);
  });

  it('splits by the four statuses and computes the firm commitment', () => {
    const s = summarize(
      [],
      [
        expense('e1', 'p1', 10, 'planned'),
        expense('e2', 'p1', 20, 'committed'),
        expense('e3', 'p1', 30, 'invoiced'),
        expense('e4', 'p1', 40, 'paid'),
      ]
    );
    expect(s.byStatus).toEqual({ planned: 10, committed: 20, invoiced: 30, paid: 40 });
    // committedFirm excludes the prévisionnel (planned).
    expect(s.committedFirm).toBe(90);
  });
});

describe('aggregate', () => {
  it('sums child summaries member-by-member without double counting', () => {
    const a = summarize([line('l1', 'p1', 1000)], [expense('e1', 'p1', 600, 'paid')]);
    const b = summarize([line('l2', 'p2', 500)], [expense('e2', 'p2', 100, 'committed')]);
    const total = aggregate([a, b]);
    expect(total.allocated).toBe(1500);
    expect(total.spent).toBe(700);
    expect(total.variance).toBe(800);
    expect(total.byStatus).toEqual({ planned: 0, committed: 100, invoiced: 0, paid: 600 });
  });

  it('of an empty list is a zeroed summary', () => {
    const total = aggregate([]);
    expect(total.allocated).toBe(0);
    expect(total.spent).toBe(0);
    expect(total.pct).toBe(0);
    expect(total.byStatus).toEqual(emptyByStatus());
  });
});

describe('buildPortfolio', () => {
  it('groups projects under their folder and rolls totals up the cascade', () => {
    const folders = [folder('f1', ['p1', 'p2'])];
    const projects = [
      project('p1', { folderId: 'f1' }),
      project('p2', { folderId: 'f1' }),
      project('p3'), // sans dossier
    ];
    const lines = [line('l1', 'p1', 1000), line('l2', 'p2', 2000), line('l3', 'p3', 500)];
    const expenses = [
      expense('e1', 'p1', 800, 'paid'),
      expense('e2', 'p2', 100, 'committed'),
      expense('e3', 'p3', 50, 'paid'),
    ];
    const tree = buildPortfolio(folders, projects, lines, expenses);

    // One real folder + the "sans dossier" bucket.
    expect(tree.folders.length).toBe(2);
    const f1 = tree.folders.find((f) => f.folder?.id === 'f1')!;
    expect(f1.projects.map((p) => p.project.id).sort()).toEqual(['p1', 'p2']);
    expect(f1.summary.allocated).toBe(3000);
    expect(f1.summary.spent).toBe(900);

    // Portfolio total spans every folder.
    expect(tree.summary.allocated).toBe(3500);
    expect(tree.summary.spent).toBe(950);
  });

  it('hides projects with no budget activity but keeps active ones', () => {
    const projects = [project('p1'), project('p2')];
    const lines = [line('l1', 'p1', 1000)];
    const tree = buildPortfolio([], projects, lines, []);
    const bucket = tree.folders.find((f) => f.folder === null)!;
    expect(bucket.projects.map((p) => p.project.id)).toEqual(['p1']);
  });

  it('puts the "sans dossier" bucket last and sorts folders by allocated desc', () => {
    const folders = [folder('small'), folder('big')];
    const projects = [
      project('ps', { folderId: 'small' }),
      project('pb', { folderId: 'big' }),
      project('po'),
    ];
    const lines = [line('ls', 'ps', 100), line('lb', 'pb', 9000), line('lo', 'po', 500)];
    const tree = buildPortfolio(folders, projects, lines, []);
    expect(tree.folders.map((f) => f.folder?.id ?? '__none__')).toEqual(['big', 'small', '__none__']);
  });

  it('orders projects within a folder by consumption % desc', () => {
    const folders = [folder('f1')];
    const projects = [project('low', { folderId: 'f1' }), project('high', { folderId: 'f1' })];
    const lines = [line('ll', 'low', 1000), line('lh', 'high', 1000)];
    const expenses = [expense('el', 'low', 100), expense('eh', 'high', 900)];
    const tree = buildPortfolio(folders, projects, lines, expenses);
    const f1 = tree.folders[0];
    expect(f1.projects.map((p) => p.project.id)).toEqual(['high', 'low']);
  });
});
