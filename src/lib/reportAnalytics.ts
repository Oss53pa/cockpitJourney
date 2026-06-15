// Premium analytics for the Reports view — period-scoped, comparable
// across consecutive periods, with throughput, status/priority breakdowns,
// cycle time, tag activity. Pure functions, no IO — easy to test.

import type { Task, Priority, TaskStatus } from '../types';

export interface PeriodMetrics {
  /** Tasks CREATED inside the period (used createdAt; falls back to nothing). */
  created: number;
  /** Tasks COMPLETED inside the period (used completionDate, else dueDate as best-effort). */
  completed: number;
  /** Of `completed`, how many were closed before or on their dueDate. */
  completedOnTime: number;
  /** Tasks still open whose dueDate fell inside the period and is now past. */
  overdueInPeriod: number;
  /** Sum of estimatedMinutes on completed tasks (hours). */
  estimatedHours: number;
  /** Sum of actualMinutes on completed tasks (hours). */
  actualHours: number;
  /** Avg lifetime (createdAt → completionDate) of completed tasks, in hours. */
  avgCycleHours: number | null;
}

export interface PeriodAnalytics {
  current: PeriodMetrics;
  previous: PeriodMetrics;
  /** Open tasks (any project) bucketed by status, evaluated at period end. */
  statusDistribution: Record<TaskStatus, number>;
  /** Open tasks bucketed by priority (P1 highest → P4 lowest). */
  priorityDistribution: Record<1 | 2 | 3 | 4, number>;
  /** Tasks completed per day across the period — sparkline-ready. */
  dailyThroughput: { date: string; completed: number; created: number }[];
  /** Top tags found on tasks active in the period, with counts. */
  topTags: { tag: string; count: number }[];
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

function withinPeriod(iso: string | undefined, lo: number, hi: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= lo && t <= hi;
}

function computePeriod(tasks: Task[], lo: number, hi: number): PeriodMetrics {
  let created = 0;
  let completed = 0;
  let completedOnTime = 0;
  let overdueInPeriod = 0;
  let estimatedMin = 0;
  let actualMin = 0;
  let cycleSum = 0;
  let cycleCount = 0;

  for (const t of tasks) {
    if (withinPeriod(t.createdAt, lo, hi)) created++;

    const completionISO = t.status === 'done' ? (t.completionDate ?? t.dueDate) : undefined;
    if (completionISO && withinPeriod(completionISO, lo, hi)) {
      completed++;
      estimatedMin += t.estimatedMinutes ?? 0;
      actualMin += t.actualMinutes ?? 0;
      if (t.dueDate) {
        const due = new Date(t.dueDate).getTime();
        const done = new Date(completionISO).getTime();
        if (Number.isFinite(due) && Number.isFinite(done) && done <= due) completedOnTime++;
      } else {
        // No due date → can't be "late" → count as on-time so the ratio
        // doesn't punish quick adhoc tasks.
        completedOnTime++;
      }
      if (t.createdAt) {
        const created_ms = new Date(t.createdAt).getTime();
        const done_ms = new Date(completionISO).getTime();
        if (Number.isFinite(created_ms) && Number.isFinite(done_ms) && done_ms >= created_ms) {
          cycleSum += done_ms - created_ms;
          cycleCount++;
        }
      }
    }

    // Overdue WITHIN the period: dueDate fell inside [lo,hi] AND task isn't done.
    if (t.status !== 'done' && t.dueDate && withinPeriod(t.dueDate, lo, hi)) {
      const due = new Date(t.dueDate).getTime();
      if (due < hi) overdueInPeriod++;
    }
  }

  return {
    created,
    completed,
    completedOnTime,
    overdueInPeriod,
    estimatedHours: Math.round(estimatedMin / 60),
    actualHours: Math.round(actualMin / 60),
    avgCycleHours: cycleCount > 0 ? Math.round(cycleSum / cycleCount / HOUR) : null,
  };
}

function dailyThroughput(
  tasks: Task[],
  lo: number,
  hi: number
): { date: string; completed: number; created: number }[] {
  // Cap at 92 days (≈ a quarter) to keep the array sensible. The annual report
  // is shown as a monthly aggregate by another tool; this one stays daily.
  const totalDays = Math.min(92, Math.max(1, Math.floor((hi - lo) / DAY) + 1));
  const buckets = new Map<string, { c: number; d: number }>();
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(lo + i * DAY);
    const k = d.toISOString().slice(0, 10);
    buckets.set(k, { c: 0, d: 0 });
  }
  for (const t of tasks) {
    if (t.createdAt) {
      const k = new Date(t.createdAt).toISOString().slice(0, 10);
      const b = buckets.get(k);
      if (b) b.c++;
    }
    const completionISO = t.status === 'done' ? (t.completionDate ?? t.dueDate) : undefined;
    if (completionISO) {
      const k = new Date(completionISO).toISOString().slice(0, 10);
      const b = buckets.get(k);
      if (b) b.d++;
    }
  }
  return Array.from(buckets.entries()).map(([date, v]) => ({
    date,
    created: v.c,
    completed: v.d,
  }));
}

function tagsActive(tasks: Task[], lo: number, hi: number): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of tasks) {
    const completionISO = t.status === 'done' ? (t.completionDate ?? t.dueDate) : undefined;
    const activeInPeriod =
      withinPeriod(t.createdAt, lo, hi) ||
      withinPeriod(completionISO, lo, hi) ||
      (t.status !== 'done' && t.dueDate && withinPeriod(t.dueDate, lo, hi));
    if (!activeInPeriod) continue;
    for (const tag of t.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

export function buildPeriodAnalytics(tasks: Task[], periodStart: Date, periodEnd: Date): PeriodAnalytics {
  const lo = periodStart.getTime();
  const hi = periodEnd.getTime();
  const len = Math.max(DAY, hi - lo);
  const prevHi = lo - 1;
  const prevLo = prevHi - len;

  // Status / priority distributions are point-in-time snapshots at hi.
  const status: Record<TaskStatus, number> = {
    todo: 0,
    in_progress: 0,
    in_review: 0,
    done: 0,
    blocked: 0,
  };
  const priority: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const t of tasks) {
    if (t.status !== 'done') {
      status[t.status] = (status[t.status] ?? 0) + 1;
      const p = (t.priority ?? 3) as Priority;
      if (p >= 1 && p <= 4) priority[p as 1 | 2 | 3 | 4]++;
    } else {
      status.done++;
    }
  }

  return {
    current: computePeriod(tasks, lo, hi),
    previous: computePeriod(tasks, prevLo, prevHi),
    statusDistribution: status,
    priorityDistribution: priority,
    dailyThroughput: dailyThroughput(tasks, lo, hi),
    topTags: tagsActive(tasks, lo, hi),
  };
}

/**
 * Percent change (current vs previous). Returns null when the previous value
 * is 0 — "+100%" from zero is misleading because growth from nothing is
 * unbounded; show "Nouveau" in the UI instead.
 */
export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
