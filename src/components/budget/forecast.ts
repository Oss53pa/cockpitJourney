import type { BudgetLine, Expense } from '../../types';
import { buildBudgetTree } from './rollups';
import { summarize } from './consolidation';

/**
 * PROPH3T — intelligence budgétaire DÉTERMINISTE (zéro appel LLM). Tout est
 * calculé localement à partir des lignes et dépenses : courbe en S, prévision
 * de burn rate (date d'épuisement / dépassement projeté), détection d'anomalies
 * et recommandations. Fonctions pures → testables et réutilisables.
 *
 * Hypothèse de cadrage : le réalisé (bottom-up) est comparé à une trajectoire
 * linéaire idéale (planned value) entre le début et la fin de la période.
 */

/* ─────────── utilitaires de mois (clé 'yyyy-mm', tri lexical sûr) ─────────── */

function monthKey(isoDate: string): string {
  return (isoDate || '').slice(0, 7);
}

function parseMonth(key: string): { y: number; m: number } {
  const [y, m] = key.split('-').map(Number);
  return { y, m };
}

/** Nombre de mois de `aKey` à `bKey` inclus (≥ 1 si a ≤ b, sinon 0). */
export function monthSpan(aKey: string, bKey: string): number {
  if (aKey > bKey) return 0;
  const a = parseMonth(aKey);
  const b = parseMonth(bKey);
  return (b.y - a.y) * 12 + (b.m - a.m) + 1;
}

/** Liste inclusive des clés de mois de `startKey` à `endKey` (bornée à 600). */
export function monthRange(startKey: string, endKey: string): string[] {
  if (startKey > endKey) return [startKey];
  const out: string[] = [];
  let { y, m } = parseMonth(startKey);
  const end = parseMonth(endKey);
  let guard = 0;
  while ((y < end.y || (y === end.y && m <= end.m)) && guard < 600) {
    out.push(`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    guard += 1;
  }
  return out;
}

/** Ajoute `days` jours à une date ISO (yyyy-mm-dd) → nouvelle date ISO. */
function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

const DAYS_PER_MONTH = 30.4375;

/* ─────────── Courbe en S (réalisé cumulé vs trajectoire idéale) ─────────── */

export interface SCurvePoint {
  month: string;
  /** Réalisé cumulé à la fin de ce mois (plat après la dernière dépense). */
  actualCumulative: number;
  /** Trajectoire idéale linéaire (0 → alloué) sur la période. */
  plannedCumulative: number;
  /** Mois postérieur à la date d'analyse (zone de projection). */
  isFuture: boolean;
}

export interface SCurve {
  points: SCurvePoint[];
  allocated: number;
  /** Indice du dernier mois ≤ asOf (−1 si tout est futur / vide). */
  asOfIndex: number;
}

export interface ForecastOptions {
  /** Date d'analyse (par défaut : aujourd'hui). */
  asOf?: string;
  /** Début de période (sinon : 1ʳᵉ dépense). */
  startDate?: string;
  /** Fin de période (sinon : dernière dépense ou asOf). */
  endDate?: string;
}

/**
 * Construit la courbe en S mensuelle : réalisé cumulé (jusqu'à asOf) et
 * trajectoire idéale linéaire sur toute la période. Le total alloué borne
 * la trajectoire idéale ; si rien n'est alloué, elle reste plate à 0.
 */
export function buildSCurve(lines: BudgetLine[], expenses: Expense[], opts: ForecastOptions = {}): SCurve {
  const asOf = (opts.asOf ?? new Date().toISOString()).slice(0, 10);
  const asOfMonth = monthKey(asOf);
  const allocated = lines.reduce((s, l) => s + (l.allocatedAmount || 0), 0);

  const expMonths = expenses.map((e) => monthKey(e.expenseDate)).sort();
  const startKey = opts.startDate ? monthKey(opts.startDate) : (expMonths[0] ?? asOfMonth);
  let endKey = opts.endDate ? monthKey(opts.endDate) : (expMonths[expMonths.length - 1] ?? asOfMonth);
  if (asOfMonth > endKey) endKey = asOfMonth;
  if (startKey > endKey) endKey = startKey;

  const spentByMonth = new Map<string, number>();
  for (const e of expenses) {
    const k = monthKey(e.expenseDate);
    spentByMonth.set(k, (spentByMonth.get(k) ?? 0) + e.amount);
  }

  const months = monthRange(startKey, endKey);
  const n = months.length;
  let cum = 0;
  let asOfIndex = -1;
  const points: SCurvePoint[] = months.map((month, i) => {
    cum += spentByMonth.get(month) ?? 0;
    const isFuture = month > asOfMonth;
    if (!isFuture) asOfIndex = i;
    return {
      month,
      actualCumulative: cum,
      plannedCumulative: n > 1 ? (allocated * i) / (n - 1) : allocated,
      isFuture,
    };
  });

  return { points, allocated, asOfIndex };
}

/* ─────────── Prévision de burn rate ─────────── */

export type ForecastStatus = 'no_data' | 'on_track' | 'at_risk' | 'over_budget';

export interface BurnForecast {
  status: ForecastStatus;
  allocated: number;
  spent: number;
  remaining: number;
  /** Rythme moyen mensuel observé (réalisé / mois actifs). */
  monthlyBurn: number;
  /** Mois écoulés entre la 1ʳᵉ dépense et asOf (≥ 1). */
  activeMonths: number;
  /** Mois restants avant épuisement au rythme actuel (null si burn nul). */
  monthsToExhaust: number | null;
  /** Date projetée d'épuisement du budget (null si non applicable). */
  exhaustionDate: string | null;
  /** Fin de projet fournie (null sinon). */
  endDate: string | null;
  /** Dépense totale projetée à endDate au rythme actuel (null sans endDate). */
  projectedAtEnd: number | null;
  /** projectedAtEnd − allocated (positif = dépassement projeté). */
  projectedOverrun: number | null;
}

/**
 * Projette le burn rate. `monthlyBurn` = réalisé / mois actifs ; on en déduit
 * l'épuisement de l'enveloppe et, si une date de fin est connue, la dépense
 * projetée à terme et le dépassement éventuel.
 */
export function burnRateForecast(
  lines: BudgetLine[],
  expenses: Expense[],
  opts: ForecastOptions = {}
): BurnForecast {
  const asOf = (opts.asOf ?? new Date().toISOString()).slice(0, 10);
  const asOfMonth = monthKey(asOf);
  const { allocated, spent } = summarize(lines, expenses);
  const remaining = allocated - spent;
  const endDate = opts.endDate ? opts.endDate.slice(0, 10) : null;

  if (expenses.length === 0) {
    return {
      status: allocated > 0 ? 'on_track' : 'no_data',
      allocated,
      spent,
      remaining,
      monthlyBurn: 0,
      activeMonths: 0,
      monthsToExhaust: null,
      exhaustionDate: null,
      endDate,
      projectedAtEnd: allocated > 0 ? 0 : null,
      projectedOverrun: null,
    };
  }

  const firstMonth = expenses.map((e) => monthKey(e.expenseDate)).sort()[0];
  const activeMonths = Math.max(1, monthSpan(firstMonth, asOfMonth));
  const monthlyBurn = spent / activeMonths;

  let monthsToExhaust: number | null = null;
  let exhaustionDate: string | null = null;
  if (remaining <= 0) {
    monthsToExhaust = 0;
    exhaustionDate = asOf;
  } else if (monthlyBurn > 0) {
    monthsToExhaust = remaining / monthlyBurn;
    exhaustionDate = addDays(asOf, monthsToExhaust * DAYS_PER_MONTH);
  }

  let projectedAtEnd: number | null = null;
  let projectedOverrun: number | null = null;
  if (endDate) {
    const monthsRemaining = Math.max(0, monthSpan(asOfMonth, monthKey(endDate)) - 1);
    projectedAtEnd = spent + monthlyBurn * monthsRemaining;
    projectedOverrun = projectedAtEnd - allocated;
  }

  let status: ForecastStatus = 'on_track';
  if (allocated > 0 && spent > allocated) status = 'over_budget';
  else if (projectedOverrun != null && projectedOverrun > 0) status = 'at_risk';
  else if (endDate && exhaustionDate && exhaustionDate < endDate) status = 'at_risk';

  return {
    status,
    allocated,
    spent,
    remaining,
    monthlyBurn,
    activeMonths,
    monthsToExhaust,
    exhaustionDate,
    endDate,
    projectedAtEnd,
    projectedOverrun,
  };
}

/* ─────────── Détection d'anomalies ─────────── */

export type AnomalyKind = 'line_overrun' | 'spend_spike' | 'stale_planned' | 'no_budget';
export type Severity = 'high' | 'medium' | 'low';

export interface BudgetAnomaly {
  id: string;
  kind: AnomalyKind;
  severity: Severity;
  title: string;
  detail: string;
  amount?: number;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Repère les signaux anormaux : lignes en dépassement (sur tout leur sous-arbre),
 * dépenses anormalement élevées (> 3× la médiane), prévisionnel dormant
 * important, et dépenses sans enveloppe.
 */
export function detectAnomalies(lines: BudgetLine[], expenses: Expense[]): BudgetAnomaly[] {
  const out: BudgetAnomaly[] = [];
  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');

  // 1. Lignes en dépassement (sous-arbre dépensé > alloué).
  const walk = (nodes: ReturnType<typeof buildBudgetTree>) => {
    for (const node of nodes) {
      if (node.line.allocatedAmount > 0 && node.subtreeSpent > node.line.allocatedAmount) {
        const over = node.subtreeSpent - node.line.allocatedAmount;
        out.push({
          id: `over-${node.line.id}`,
          kind: 'line_overrun',
          severity: 'high',
          title: `Ligne « ${node.line.name} » en dépassement`,
          detail: `Réalisé ${fmt(node.subtreeSpent)} FCFA pour ${fmt(node.line.allocatedAmount)} alloués (+${fmt(over)}).`,
          amount: over,
        });
      }
      walk(node.children);
    }
  };
  walk(buildBudgetTree(lines, expenses));

  // 2. Dépenses anormalement élevées (> 3× la médiane), si l'échantillon suffit.
  const amounts = expenses.map((e) => e.amount).filter((a) => a > 0);
  if (amounts.length >= 4) {
    const med = median(amounts);
    const threshold = med * 3;
    for (const e of expenses) {
      if (e.amount > threshold && e.amount > 0) {
        out.push({
          id: `spike-${e.id}`,
          kind: 'spend_spike',
          severity: 'medium',
          title: `Dépense inhabituelle : ${e.label}`,
          detail: `${fmt(e.amount)} FCFA, soit > 3× la dépense médiane (${fmt(med)}).`,
          amount: e.amount,
        });
      }
    }
  }

  const { allocated, spent, byStatus } = summarize(lines, expenses);

  // 3. Prévisionnel dormant important (> 30 % de l'enveloppe au statut « Prévue »).
  if (allocated > 0 && byStatus.planned > allocated * 0.3) {
    out.push({
      id: 'stale-planned',
      kind: 'stale_planned',
      severity: 'low',
      title: 'Prévisionnel important non engagé',
      detail: `${fmt(byStatus.planned)} FCFA encore au statut « Prévue » (> 30 % de l'enveloppe).`,
      amount: byStatus.planned,
    });
  }

  // 4. Dépenses sans enveloppe budgétaire.
  if (allocated === 0 && spent > 0) {
    out.push({
      id: 'no-budget',
      kind: 'no_budget',
      severity: 'medium',
      title: 'Dépenses sans budget alloué',
      detail: `${fmt(spent)} FCFA dépensés sans aucune ligne budgétaire pour cadrer.`,
      amount: spent,
    });
  }

  const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/* ─────────── Recommandations ─────────── */

export interface BudgetRecommendation {
  id: string;
  tone: 'warning' | 'info' | 'success';
  title: string;
  detail: string;
}

/** Recommandations dérivées de la prévision et des anomalies (déterministes). */
export function buildRecommendations(
  forecast: BurnForecast,
  anomalies: BudgetAnomaly[]
): BudgetRecommendation[] {
  const out: BudgetRecommendation[] = [];
  const fmt = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
  const fmtDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR');

  if (forecast.status === 'no_data') {
    out.push({
      id: 'rec-nodata',
      tone: 'info',
      title: 'Activez les prévisions',
      detail:
        'Définissez une enveloppe (lignes) et enregistrez vos dépenses pour que PROPH3T projette le burn rate.',
    });
    return out;
  }

  if (forecast.status === 'over_budget') {
    out.push({
      id: 'rec-over',
      tone: 'warning',
      title: 'Budget dépassé',
      detail: `Le réalisé (${fmt(forecast.spent)}) dépasse l'enveloppe (${fmt(forecast.allocated)}). Réaffectez ou rehaussez l'enveloppe.`,
    });
  } else if (forecast.status === 'at_risk') {
    if (forecast.projectedOverrun != null && forecast.projectedOverrun > 0 && forecast.endDate) {
      out.push({
        id: 'rec-projected-over',
        tone: 'warning',
        title: 'Dépassement projeté',
        detail: `Au rythme de ${fmt(forecast.monthlyBurn)}/mois, le total atteindrait ${fmt(
          forecast.projectedAtEnd ?? 0
        )} à l'échéance (+${fmt(forecast.projectedOverrun)}).`,
      });
    } else if (forecast.exhaustionDate) {
      out.push({
        id: 'rec-exhaust',
        tone: 'warning',
        title: 'Épuisement avant terme',
        detail: `Au rythme actuel, l'enveloppe sera épuisée vers le ${fmtDate(forecast.exhaustionDate)}.`,
      });
    }
  } else if (forecast.status === 'on_track' && forecast.allocated > 0) {
    out.push({
      id: 'rec-ontrack',
      tone: 'success',
      title: 'Trajectoire maîtrisée',
      detail: `Rythme de ${fmt(forecast.monthlyBurn)}/mois — l'enveloppe tient${
        forecast.endDate ? " jusqu'à l'échéance" : ''
      }.`,
    });
  }

  const overruns = anomalies.filter((a) => a.kind === 'line_overrun');
  if (overruns.length > 0) {
    out.push({
      id: 'rec-lines',
      tone: 'warning',
      title: `${overruns.length} ligne${overruns.length > 1 ? 's' : ''} en dépassement`,
      detail: 'Rééquilibrez depuis les lignes sous-consommées ou ajustez les montants alloués.',
    });
  }

  if (anomalies.some((a) => a.kind === 'stale_planned')) {
    out.push({
      id: 'rec-planned',
      tone: 'info',
      title: 'Prévisionnel à confirmer',
      detail:
        'Beaucoup de montants restent « Prévue ». Engagez-les ou retirez-les pour fiabiliser la prévision.',
    });
  }

  return out;
}
