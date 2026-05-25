import type { BudgetLine, Expense, ExpenseStatus } from '../../types';

/**
 * A budget line enriched with its children and rolled-up figures.
 * Rollups are ALWAYS derived (never stored): `ownSpent` is the sum of the
 * line's own direct expenses, `subtreeSpent` adds every descendant's spend,
 * and `remaining` is computed against the allocated amount.
 */
export interface BudgetTreeNode {
  line: BudgetLine;
  depth: number;
  /** Σ amount of expenses whose lineId === line.id (direct only). */
  ownSpent: number;
  /** ownSpent + Σ subtreeSpent of all children (whole subtree). */
  subtreeSpent: number;
  /** allocatedAmount − subtreeSpent (display value, may be negative). */
  remaining: number;
  /** Σ allocatedAmount of this line + every descendant. */
  subtreeAllocated: number;
  children: BudgetTreeNode[];
}

/** Project-level totals, each expense counted exactly once (no double-count). */
export interface BudgetTotals {
  totalAllocated: number;
  totalSpent: number;
  totalRemaining: number;
  /** 0–∞ percentage of allocated that's been spent (0 when nothing allocated). */
  pct: number;
  /** Spend grouped by expense status. */
  byStatus: Record<ExpenseStatus, number>;
  /** Spend on expenses not attached to any line. */
  unallocatedSpent: number;
}

/**
 * Build the hierarchical tree from a flat list of budget lines (already
 * filtered to one project) plus that project's expenses. Lines are linked by
 * `parentLineId`; orphaned children (parent missing) are treated as top-level
 * so nothing silently disappears. Siblings are ordered by `sortOrder`.
 */
export function buildBudgetTree(lines: BudgetLine[], expenses: Expense[]): BudgetTreeNode[] {
  // Direct spend per line.
  const ownSpentByLine = new Map<string, number>();
  for (const e of expenses) {
    if (!e.lineId) continue;
    ownSpentByLine.set(e.lineId, (ownSpentByLine.get(e.lineId) ?? 0) + e.amount);
  }

  // Children index, keyed by parent id (null/missing → root bucket).
  const ids = new Set(lines.map((l) => l.id));
  const childrenByParent = new Map<string | null, BudgetLine[]>();
  for (const l of lines) {
    const parent = l.parentLineId ?? null;
    const key = parent && ids.has(parent) ? parent : null;
    const arr = childrenByParent.get(key) ?? [];
    arr.push(l);
    childrenByParent.set(key, arr);
  }
  for (const arr of childrenByParent.values()) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const build = (line: BudgetLine, depth: number): BudgetTreeNode => {
    const ownSpent = ownSpentByLine.get(line.id) ?? 0;
    const childLines = childrenByParent.get(line.id) ?? [];
    const children = childLines.map((c) => build(c, depth + 1));
    const subtreeSpent = children.reduce((sum, c) => sum + c.subtreeSpent, ownSpent);
    const subtreeAllocated = children.reduce((sum, c) => sum + c.subtreeAllocated, line.allocatedAmount);
    return {
      line,
      depth,
      ownSpent,
      subtreeSpent,
      subtreeAllocated,
      remaining: line.allocatedAmount - subtreeSpent,
      children,
    };
  };

  return (childrenByParent.get(null) ?? []).map((l) => build(l, 0));
}

/**
 * Project totals computed on the FLAT arrays so each expense / line is counted
 * exactly once — no double counting through the tree.
 */
export function computeBudgetTotals(lines: BudgetLine[], expenses: Expense[]): BudgetTotals {
  const totalAllocated = lines.reduce((sum, l) => sum + l.allocatedAmount, 0);
  const byStatus: Record<ExpenseStatus, number> = { planned: 0, committed: 0, paid: 0 };
  let totalSpent = 0;
  let unallocatedSpent = 0;
  for (const e of expenses) {
    totalSpent += e.amount;
    byStatus[e.status] += e.amount;
    if (!e.lineId) unallocatedSpent += e.amount;
  }
  return {
    totalAllocated,
    totalSpent,
    totalRemaining: totalAllocated - totalSpent,
    pct: totalAllocated > 0 ? (totalSpent / totalAllocated) * 100 : totalSpent > 0 ? 100 : 0,
    byStatus,
    unallocatedSpent,
  };
}

/**
 * Flatten the tree depth-first into [{ line, depth }] pairs — handy for the
 * indented line picker in the expense modal.
 */
export function flattenTree(nodes: BudgetTreeNode[]): { line: BudgetLine; depth: number }[] {
  const out: { line: BudgetLine; depth: number }[] = [];
  const walk = (ns: BudgetTreeNode[]) => {
    for (const n of ns) {
      out.push({ line: n.line, depth: n.depth });
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}
