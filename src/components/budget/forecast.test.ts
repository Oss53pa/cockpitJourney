import { describe, it, expect } from 'vitest';
import {
  monthSpan,
  monthRange,
  buildSCurve,
  burnRateForecast,
  detectAnomalies,
  buildRecommendations,
} from './forecast';
import type { BudgetLine, Expense } from '../../types';

const now = '2026-01-01T00:00:00.000Z';

function line(id: string, allocated: number, partial: Partial<BudgetLine> = {}): BudgetLine {
  return {
    id,
    projectId: 'p1',
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
    ...partial,
  };
}

function expense(id: string, amount: number, expenseDate: string, partial: Partial<Expense> = {}): Expense {
  return {
    id,
    projectId: 'p1',
    lineId: null,
    label: id,
    amount,
    currency: 'XOF',
    status: 'paid',
    expenseDate,
    notes: [],
    attachments: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe('month helpers', () => {
  it('monthSpan counts inclusive months and is 0 when reversed', () => {
    expect(monthSpan('2026-01', '2026-01')).toBe(1);
    expect(monthSpan('2026-01', '2026-03')).toBe(3);
    expect(monthSpan('2025-11', '2026-02')).toBe(4);
    expect(monthSpan('2026-03', '2026-01')).toBe(0);
  });

  it('monthRange lists inclusive month keys across a year boundary', () => {
    expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('buildSCurve', () => {
  it('accumulates actual spend and draws a linear ideal to the allocated total', () => {
    const lines = [line('l1', 300)];
    const expenses = [
      expense('e1', 50, '2026-01-15'),
      expense('e2', 100, '2026-02-10'),
      expense('e3', 30, '2026-03-05'),
    ];
    const curve = buildSCurve(lines, expenses, { asOf: '2026-03-31' });
    expect(curve.points.map((p) => p.month)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(curve.points.map((p) => p.actualCumulative)).toEqual([50, 150, 180]);
    // Ideal ramps 0 → 300 linearly over 3 points (0, 150, 300).
    expect(curve.points.map((p) => p.plannedCumulative)).toEqual([0, 150, 300]);
    expect(curve.allocated).toBe(300);
    expect(curve.asOfIndex).toBe(2);
  });

  it('extends the range to asOf and marks future months as projection', () => {
    const curve = buildSCurve([line('l1', 100)], [expense('e1', 40, '2026-01-10')], {
      asOf: '2026-03-20',
    });
    expect(curve.points.map((p) => p.month)).toEqual(['2026-01', '2026-02', '2026-03']);
    // Actual stays flat after the last expense.
    expect(curve.points.map((p) => p.actualCumulative)).toEqual([40, 40, 40]);
    expect(curve.points.every((p) => !p.isFuture)).toBe(true);
    expect(curve.asOfIndex).toBe(2);
  });
});

describe('burnRateForecast', () => {
  it('returns no_data when there is nothing at all', () => {
    expect(burnRateForecast([], []).status).toBe('no_data');
  });

  it('computes monthly burn from active months and the remaining envelope', () => {
    const lines = [line('l1', 1200)];
    const expenses = [expense('e1', 200, '2026-01-10'), expense('e2', 200, '2026-02-10')];
    const f = burnRateForecast(lines, expenses, { asOf: '2026-02-28' });
    expect(f.spent).toBe(400);
    expect(f.remaining).toBe(800);
    expect(f.activeMonths).toBe(2); // Jan + Feb
    expect(f.monthlyBurn).toBe(200);
    expect(f.monthsToExhaust).toBe(4); // 800 / 200
    expect(f.status).toBe('on_track');
  });

  it('flags over_budget when realised exceeds the envelope', () => {
    const f = burnRateForecast([line('l1', 100)], [expense('e1', 150, '2026-01-10')], {
      asOf: '2026-01-31',
    });
    expect(f.status).toBe('over_budget');
    expect(f.monthsToExhaust).toBe(0);
    expect(f.exhaustionDate).toBe('2026-01-31');
  });

  it('projects to endDate and flags at_risk on projected overrun', () => {
    // 100/mo over Jan–Feb; envelope 500; project ends June → ~4 more months.
    const lines = [line('l1', 500)];
    const expenses = [expense('e1', 200, '2026-01-10'), expense('e2', 200, '2026-02-10')];
    const f = burnRateForecast(lines, expenses, { asOf: '2026-02-28', endDate: '2026-06-30' });
    // monthlyBurn = 400/2 = 200; monthsRemaining = span(Feb,Jun)-1 = 5-1 = 4.
    expect(f.monthlyBurn).toBe(200);
    expect(f.projectedAtEnd).toBe(400 + 200 * 4); // 1200
    expect(f.projectedOverrun).toBe(700);
    expect(f.status).toBe('at_risk');
  });
});

describe('detectAnomalies', () => {
  it('flags a line whose subtree spend exceeds its allocation', () => {
    const lines = [line('l1', 100)];
    const expenses = [expense('e1', 160, '2026-01-10', { lineId: 'l1' })];
    const anomalies = detectAnomalies(lines, expenses);
    const overrun = anomalies.find((a) => a.kind === 'line_overrun');
    expect(overrun).toBeTruthy();
    expect(overrun!.amount).toBe(60);
    expect(overrun!.severity).toBe('high');
  });

  it('flags an expense more than 3× the median', () => {
    const expenses = [
      expense('e1', 100, '2026-01-01'),
      expense('e2', 100, '2026-01-02'),
      expense('e3', 100, '2026-01-03'),
      expense('e4', 1000, '2026-01-04'), // spike
    ];
    const anomalies = detectAnomalies([], expenses);
    expect(anomalies.some((a) => a.kind === 'spend_spike' && a.id === 'spike-e4')).toBe(true);
  });

  it('flags spend with no allocated budget at all', () => {
    const anomalies = detectAnomalies([], [expense('e1', 500, '2026-01-01')]);
    expect(anomalies.some((a) => a.kind === 'no_budget')).toBe(true);
  });

  it('flags a large dormant prévisionnel (> 30% of the envelope)', () => {
    const lines = [line('l1', 1000)];
    const expenses = [expense('e1', 400, '2026-01-01', { status: 'planned' })];
    const anomalies = detectAnomalies(lines, expenses);
    expect(anomalies.some((a) => a.kind === 'stale_planned')).toBe(true);
  });
});

describe('buildRecommendations', () => {
  it('tells the user to set up data when there is none', () => {
    const f = burnRateForecast([], []);
    const recs = buildRecommendations(f, []);
    expect(recs).toHaveLength(1);
    expect(recs[0].tone).toBe('info');
  });

  it('emits a success rec when on track with an envelope', () => {
    const f = burnRateForecast([line('l1', 1000)], [expense('e1', 100, '2026-01-10')], {
      asOf: '2026-01-31',
    });
    const recs = buildRecommendations(f, []);
    expect(recs.some((r) => r.tone === 'success')).toBe(true);
  });

  it('warns on overrun lines', () => {
    const lines = [line('l1', 100)];
    const expenses = [expense('e1', 160, '2026-01-10', { lineId: 'l1' })];
    const anomalies = detectAnomalies(lines, expenses);
    const f = burnRateForecast(lines, expenses, { asOf: '2026-01-31' });
    const recs = buildRecommendations(f, anomalies);
    expect(recs.some((r) => r.id === 'rec-lines' && r.tone === 'warning')).toBe(true);
  });
});
