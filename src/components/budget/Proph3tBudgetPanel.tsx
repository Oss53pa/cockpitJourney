import { useMemo } from 'react';
import {
  Sparkles,
  Gauge,
  CalendarClock,
  Target,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { cn, formatFCFA } from '../../lib/utils';
import { SCurveChart } from './SCurveChart';
import {
  buildSCurve,
  burnRateForecast,
  detectAnomalies,
  buildRecommendations,
  type ForecastStatus,
  type Severity,
} from './forecast';
import type { BudgetLine, Expense } from '../../types';

const statusCfg: Record<ForecastStatus, { label: string; cls: string }> = {
  no_data: { label: 'Données insuffisantes', cls: 'bg-black/[0.04] text-atlas-fg-2 border-atlas-line' },
  on_track: {
    label: 'Sur la trajectoire',
    cls: 'bg-signal-green/15 text-signal-green border-signal-green/30',
  },
  at_risk: { label: 'À surveiller', cls: 'bg-signal-yellow/15 text-signal-yellow border-signal-yellow/30' },
  over_budget: { label: 'Budget dépassé', cls: 'bg-signal-red/15 text-signal-red border-signal-red/40' },
};

const sevCfg: Record<Severity, string> = {
  high: 'bg-signal-red/10 text-signal-red border-signal-red/30',
  medium: 'bg-signal-yellow/10 text-signal-yellow border-signal-yellow/30',
  low: 'bg-black/[0.03] text-atlas-fg-2 border-atlas-line',
};

const recIcon = { warning: AlertTriangle, info: Info, success: CheckCircle2 } as const;
const recCls = {
  warning: 'border-signal-red/30 bg-signal-red/[0.04] text-signal-red',
  info: 'border-signal-blue/30 bg-signal-blue/[0.04] text-signal-blue',
  success: 'border-signal-green/30 bg-signal-green/[0.04] text-signal-green',
} as const;

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR');
}

/**
 * Onglet PROPH3T du budget projet : prévision de burn rate, courbe en S,
 * anomalies détectées et recommandations — 100 % déterministe (cf. forecast.ts).
 */
export function Proph3tBudgetPanel({
  lines,
  expenses,
  startDate,
  endDate,
}: {
  lines: BudgetLine[];
  expenses: Expense[];
  startDate?: string;
  endDate?: string;
}) {
  const opts = useMemo(() => ({ startDate, endDate }), [startDate, endDate]);
  const forecast = useMemo(() => burnRateForecast(lines, expenses, opts), [lines, expenses, opts]);
  const curve = useMemo(() => buildSCurve(lines, expenses, opts), [lines, expenses, opts]);
  const anomalies = useMemo(() => detectAnomalies(lines, expenses), [lines, expenses]);
  const recommendations = useMemo(() => buildRecommendations(forecast, anomalies), [forecast, anomalies]);

  const sc = statusCfg[forecast.status];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-atlas-amber-deep" />
          <h3 className="text-sm font-medium text-atlas-fg-1">PROPH3T — prévision budgétaire</h3>
        </div>
        <span
          className={cn(
            'inline-flex items-center border rounded-md font-medium uppercase tracking-wider text-[10px] px-2 py-0.5',
            sc.cls
          )}
        >
          {sc.label}
        </span>
      </div>

      {/* Forecast KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Gauge} label="Rythme mensuel" value={formatFCFA(forecast.monthlyBurn)} />
        <Kpi
          icon={CalendarClock}
          label="Épuisement projeté"
          value={fmtDate(forecast.exhaustionDate)}
          hint={
            forecast.monthsToExhaust != null && forecast.monthsToExhaust > 0
              ? `dans ~${Math.round(forecast.monthsToExhaust)} mois`
              : undefined
          }
        />
        <Kpi
          icon={Target}
          label="Projeté à l'échéance"
          value={forecast.projectedAtEnd != null ? formatFCFA(forecast.projectedAtEnd) : '—'}
          hint={forecast.endDate ? `échéance ${fmtDate(forecast.endDate)}` : 'aucune échéance'}
          tone={forecast.projectedOverrun != null && forecast.projectedOverrun > 0 ? 'over' : 'ok'}
        />
        <Kpi
          icon={Gauge}
          label="Reste à dépenser"
          value={formatFCFA(forecast.remaining)}
          tone={forecast.remaining < 0 ? 'over' : 'ok'}
        />
      </div>

      {/* Courbe en S */}
      <SCurveChart curve={curve} />

      {/* Anomalies */}
      <div className="panel p-4">
        <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium mb-3">
          <AlertTriangle className="w-3.5 h-3.5" />
          Anomalies détectées {anomalies.length > 0 && `(${anomalies.length})`}
        </div>
        {anomalies.length === 0 ? (
          <p className="text-sm text-atlas-fg-3 italic flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-signal-green" />
            Aucune anomalie — le budget est cohérent.
          </p>
        ) : (
          <ul className="space-y-2">
            {anomalies.map((a) => (
              <li
                key={a.id}
                className={cn('border rounded-lg px-3 py-2.5 flex items-start gap-2.5', sevCfg[a.severity])}
              >
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-atlas-fg-1">{a.title}</div>
                  <div className="text-2xs text-atlas-fg-2 mt-0.5">{a.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recommandations */}
      <div className="panel p-4">
        <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium mb-3">
          <Lightbulb className="w-3.5 h-3.5" />
          Recommandations
        </div>
        <ul className="space-y-2">
          {recommendations.map((r) => {
            const Icon = recIcon[r.tone];
            return (
              <li
                key={r.id}
                className={cn('border rounded-lg px-3 py-2.5 flex items-start gap-2.5', recCls[r.tone])}
              >
                <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-atlas-fg-1">{r.title}</div>
                  <div className="text-2xs text-atlas-fg-2 mt-0.5">{r.detail}</div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  hint?: string;
  tone?: 'over' | 'ok';
}) {
  const toneCls = tone === 'over' ? 'text-signal-red' : tone === 'ok' ? 'text-atlas-fg-1' : 'text-atlas-fg-1';
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className={cn('mt-1.5 text-lg font-display font-medium tabular-nums', toneCls)}>{value}</div>
      {hint && <div className="text-2xs text-atlas-fg-3 mt-0.5">{hint}</div>}
    </div>
  );
}
