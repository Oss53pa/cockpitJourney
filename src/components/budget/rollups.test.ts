import { describe, it, expect } from 'vitest';
import { buildBudgetTree, computeBudgetTotals, flattenTree } from './rollups';
import type { BudgetLine, Expense } from '../../types';

const now = '2026-01-01T00:00:00.000Z';

function line(id: string, partial: Partial<BudgetLine> = {}): BudgetLine {
  return {
    id,
    projectId: 'p1',
    ownerId: null,
    name: id,
    allocatedAmount: 0,
    currency: 'XOF',
    sortOrder: 0,
    parentLineId: null,
    notes: [],
    attachments: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function expense(id: string, lineId: string | null, amount: number, partial: Partial<Expense> = {}): Expense {
  return {
    id,
    projectId: 'p1',
    lineId,
    label: id,
    amount,
    currency: 'XOF',
    status: 'paid',
    expenseDate: '2026-01-01',
    notes: [],
    attachments: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe('buildBudgetTree', () => {
  it('nests sub-lines under their parent and orders siblings by sortOrder', () => {
    const lines = [
      line('a', { sortOrder: 1, allocatedAmount: 1000 }),
      line('b', { sortOrder: 0, allocatedAmount: 500 }),
      line('a1', { parentLineId: 'a', sortOrder: 0, allocatedAmount: 300 }),
    ];
    const tree = buildBudgetTree(lines, []);
    // sortOrder 0 (b) comes before sortOrder 1 (a) at the root.
    expect(tree.map((n) => n.line.id)).toEqual(['b', 'a']);
    const a = tree.find((n) => n.line.id === 'a')!;
    expect(a.children.map((c) => c.line.id)).toEqual(['a1']);
    expect(a.depth).toBe(0);
    expect(a.children[0].depth).toBe(1);
  });

  it('rolls up subtreeSpent = ownSpent + children, remaining vs allocated', () => {
    const lines = [
      line('parent', { allocatedAmount: 1000 }),
      line('child', { parentLineId: 'parent', allocatedAmount: 400 }),
    ];
    const expenses = [
      expense('e1', 'parent', 100), // direct on parent
      expense('e2', 'child', 250), // on child
    ];
    const tree = buildBudgetTree(lines, expenses);
    const parent = tree[0];
    expect(parent.ownSpent).toBe(100);
    expect(parent.subtreeSpent).toBe(350); // 100 + 250
    expect(parent.remaining).toBe(650); // 1000 - 350
    expect(parent.children[0].subtreeSpent).toBe(250);
    expect(parent.children[0].remaining).toBe(150); // 400 - 250
  });

  it('treats a child with a missing parent as top-level (no silent loss)', () => {
    const lines = [line('orphan', { parentLineId: 'ghost' })];
    const tree = buildBudgetTree(lines, []);
    expect(tree.map((n) => n.line.id)).toEqual(['orphan']);
  });
});

describe('computeBudgetTotals', () => {
  it('counts each expense once and never double-counts through the tree', () => {
    const lines = [
      line('parent', { allocatedAmount: 1000 }),
      line('child', { parentLineId: 'parent', allocatedAmount: 400 }),
    ];
    const expenses = [
      expense('e1', 'parent', 100),
      expense('e2', 'child', 250),
      expense('e3', null, 50, { status: 'planned' }),
    ];
    const totals = computeBudgetTotals(lines, expenses);
    expect(totals.totalAllocated).toBe(1400); // 1000 + 400 (flat sum)
    expect(totals.totalSpent).toBe(400); // 100 + 250 + 50, each once
    expect(totals.totalRemaining).toBe(1000);
    expect(totals.unallocatedSpent).toBe(50);
  });

  it('groups spend by status', () => {
    const expenses = [
      expense('e1', null, 100, { status: 'planned' }),
      expense('e2', null, 200, { status: 'committed' }),
      expense('e3', null, 300, { status: 'paid' }),
    ];
    const totals = computeBudgetTotals([], expenses);
    expect(totals.byStatus).toEqual({ planned: 100, committed: 200, paid: 300 });
  });

  it('pct is 0 when nothing allocated and nothing spent', () => {
    expect(computeBudgetTotals([], []).pct).toBe(0);
  });
});

describe('flattenTree', () => {
  it('flattens depth-first with depth markers', () => {
    const lines = [
      line('a', { allocatedAmount: 1 }),
      line('a1', { parentLineId: 'a' }),
      line('a1x', { parentLineId: 'a1' }),
      line('b'),
    ];
    const flat = flattenTree(buildBudgetTree(lines, []));
    expect(flat.map((f) => [f.line.id, f.depth])).toEqual([
      ['a', 0],
      ['a1', 1],
      ['a1x', 2],
      ['b', 0],
    ]);
  });
});
