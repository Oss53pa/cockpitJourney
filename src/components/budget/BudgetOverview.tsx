import { useMemo, useState } from 'react';
import {
  Wallet,
  TrendingDown,
  PiggyBank,
  Gauge,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  Layers,
} from 'lucide-react';
import { useApp } from '../../stores/appStore';
import { cn, formatFCFA } from '../../lib/utils';
import {
  buildPortfolio,
  thresholdLevel,
  type BudgetSummary,
  type FolderBudgetNode,
  type ThresholdLevel,
} from './consolidation';
import type { ViewKey } from '../../types';

/* ─────────── visual helpers (alignés sur les seuils 80 / 100 %) ─────────── */

function barColor(pct: number): string {
  if (pct > 100) return 'bg-signal-red';
  if (pct >= 80) return 'bg-signal-yellow';
  return 'bg-atlas-sage';
}

function pctText(pct: number): string {
  if (pct > 100) return 'text-signal-red';
  if (pct >= 80) return 'text-signal-yellow';
  return 'text-atlas-fg-2';
}

const thresholdCfg: Record<ThresholdLevel, { label: string; cls: string } | null> = {
  ok: null,
  warning: { label: 'Seuil 80 %', cls: 'bg-signal-yellow/15 text-signal-yellow border-signal-yellow/30' },
  reached: { label: 'Limite atteinte', cls: 'bg-signal-red/10 text-signal-red border-signal-red/30' },
  over: { label: 'Dépassement', cls: 'bg-signal-red/15 text-signal-red border-signal-red/40' },
};

function ThresholdBadge({ pct }: { pct: number }) {
  const cfg = thresholdCfg[thresholdLevel(pct)];
  if (!cfg) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 border rounded-md font-medium uppercase tracking-wider text-[9px] px-1.5 py-0.5',
        cfg.cls
      )}
    >
      <AlertTriangle className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  );
}

/* ─────────── view ─────────── */

/**
 * Vue Portefeuille consolidée, en cascade DOSSIER → PROJET. On entre sur le
 * portefeuille (tous les dossiers), on descend dans un dossier (ses projets),
 * et un clic sur un projet ouvre son budget détaillé. Chaque niveau affiche le
 * cadrage top-down (alloué) / bottom-up (réalisé), l'écart et les alertes de
 * seuil (80 % / 100 % / dépassement).
 */
export function BudgetOverview({ onNavigate }: { onNavigate: (v: ViewKey, projectId?: string) => void }) {
  const projects = useApp((s) => s.projects);
  const folders = useApp((s) => s.folders);
  const budgetLines = useApp((s) => s.budgetLines);
  const expenses = useApp((s) => s.expenses);

  const portfolio = useMemo(
    () => buildPortfolio(folders, projects, budgetLines, expenses),
    [folders, projects, budgetLines, expenses]
  );

  // Drill state : null = portefeuille ; sinon on est dans un dossier (ou bucket).
  const [drillId, setDrillId] = useState<string | null | undefined>(undefined);
  const folderNode =
    drillId !== undefined ? portfolio.folders.find((f) => (f.folder?.id ?? null) === drillId) : undefined;

  const empty = portfolio.folders.length === 0;

  return (
    <div className="px-6 sm:px-8 py-7 max-w-6xl mx-auto space-y-5">
      {/* Header + breadcrumb */}
      {folderNode ? (
        <div>
          <button
            onClick={() => setDrillId(undefined)}
            className="inline-flex items-center gap-1 text-sm text-atlas-fg-3 hover:text-atlas-fg-1 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Portefeuille
          </button>
          <h1 className="mt-1 text-2xl font-display font-medium text-atlas-fg-1 flex items-center gap-2.5">
            <FolderGlyph node={folderNode} />
            {folderNode.folder?.name ?? 'Projets sans dossier'}
          </h1>
          <p className="mt-1 text-sm text-atlas-fg-3">
            {folderNode.projects.length} projet{folderNode.projects.length > 1 ? 's' : ''} · budget consolidé
            du dossier.
          </p>
        </div>
      ) : (
        <div>
          <h1 className="text-2xl font-display font-medium text-atlas-fg-1">Budget — portefeuille</h1>
          <p className="mt-1 text-sm text-atlas-fg-3">
            Consolidation en cascade : portefeuille → dossiers → projets. Cliquez pour descendre d’un niveau.
          </p>
        </div>
      )}

      {empty ? (
        <div className="panel p-10 text-center">
          <Wallet className="w-8 h-8 mx-auto mb-2 text-atlas-fg-3 opacity-40" />
          <p className="text-sm text-atlas-fg-3">
            Aucun projet n’a encore de budget. Ouvrez un projet puis l’onglet Budget pour commencer.
          </p>
        </div>
      ) : folderNode ? (
        /* ── Niveau dossier : ses projets ── */
        <>
          <SummaryKpis summary={folderNode.summary} />
          <ConsolidatedTable
            label="Projet"
            rows={folderNode.projects.map((p) => ({
              key: p.project.id,
              name: p.project.name,
              color: p.project.color,
              summary: p.summary,
              onClick: () => onNavigate('project', p.project.id),
            }))}
            total={folderNode.summary}
            totalLabel={`Total ${folderNode.folder?.name ?? 'sans dossier'}`}
          />
        </>
      ) : (
        /* ── Niveau portefeuille : ses dossiers ── */
        <>
          <SummaryKpis summary={portfolio.summary} />
          <AlertList folders={portfolio.folders} />
          <ConsolidatedTable
            label="Dossier"
            rows={portfolio.folders.map((f) => ({
              key: f.folder?.id ?? '__none__',
              name: f.folder?.name ?? 'Projets sans dossier',
              color: f.folder?.color ?? '#95B07D',
              glyph: f.folder?.icon,
              meta: `${f.projects.length} projet${f.projects.length > 1 ? 's' : ''}`,
              summary: f.summary,
              onClick: () => setDrillId(f.folder?.id ?? null),
            }))}
            total={portfolio.summary}
            totalLabel="Total portefeuille"
          />
        </>
      )}
    </div>
  );
}

function FolderGlyph({ node }: { node: FolderBudgetNode }) {
  if (node.folder?.icon) return <span className="text-xl leading-none">{node.folder.icon}</span>;
  return (
    <span
      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
      style={{ background: `${node.folder?.color ?? '#95B07D'}22` }}
    >
      <Layers className="w-4 h-4" style={{ color: node.folder?.color ?? '#95B07D' }} />
    </span>
  );
}

/* ─────────── KPI cards : cadrage top-down / bottom-up + écart ─────────── */

function SummaryKpis({ summary }: { summary: BudgetSummary }) {
  const { allocated, spent, variance, pct, byStatus } = summary;
  const statusTotal = byStatus.planned + byStatus.committed + byStatus.invoiced + byStatus.paid;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Wallet} label="Alloué (top-down)" value={formatFCFA(allocated)} tone="neutral" />
        <Kpi icon={TrendingDown} label="Réalisé (bottom-up)" value={formatFCFA(spent)} tone="spent" />
        <Kpi
          icon={PiggyBank}
          label="Écart"
          value={formatFCFA(variance)}
          tone={variance < 0 ? 'over' : 'ok'}
          hint={variance < 0 ? 'dépassement' : 'sous budget'}
        />
        <Kpi
          icon={Gauge}
          label="Consommation"
          value={`${Math.round(pct)}%`}
          tone={pct > 100 ? 'over' : pct >= 80 ? 'spent' : 'ok'}
        />
      </div>

      {/* Barre empilée par statut (prévue → engagée → facturée → payée) */}
      {statusTotal > 0 && (
        <div className="panel p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">
              Réalisé par statut
            </span>
            <span className="text-2xs font-mono text-atlas-fg-3">{formatFCFA(statusTotal)}</span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden flex bg-black/[0.06]">
            <StackSeg value={byStatus.planned} total={statusTotal} cls="bg-atlas-fg-3/40" />
            <StackSeg value={byStatus.committed} total={statusTotal} cls="bg-signal-blue" />
            <StackSeg value={byStatus.invoiced} total={statusTotal} cls="bg-atlas-amber" />
            <StackSeg value={byStatus.paid} total={statusTotal} cls="bg-signal-green" />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-atlas-fg-3">
            <Legend cls="bg-atlas-fg-3/40" label="Prévue" value={byStatus.planned} />
            <Legend cls="bg-signal-blue" label="Engagée" value={byStatus.committed} />
            <Legend cls="bg-atlas-amber" label="Facturée" value={byStatus.invoiced} />
            <Legend cls="bg-signal-green" label="Payée" value={byStatus.paid} />
          </div>
        </div>
      )}
    </div>
  );
}

function StackSeg({ value, total, cls }: { value: number; total: number; cls: string }) {
  if (value <= 0) return null;
  return <span className={cls} style={{ width: `${(value / total) * 100}%` }} aria-hidden />;
}

function Legend({ cls, label, value }: { cls: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('w-2 h-2 rounded-sm', cls)} aria-hidden />
      {label}
      <span className="font-mono text-atlas-fg-2">{formatFCFA(value)}</span>
    </span>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  tone: 'neutral' | 'spent' | 'ok' | 'over';
  hint?: string;
}) {
  const toneCls = tone === 'over' ? 'text-signal-red' : tone === 'ok' ? 'text-atlas-sage' : 'text-atlas-fg-1';
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className={cn('mt-1.5 text-xl font-display font-medium tabular-nums', toneCls)}>{value}</div>
      {hint && <div className="text-2xs text-atlas-fg-3 mt-0.5">{hint}</div>}
    </div>
  );
}

/* ─────────── Alertes de seuil (≥ 80 % et dépassements) ─────────── */

function AlertList({ folders }: { folders: FolderBudgetNode[] }) {
  const alerts = useMemo(() => {
    const out: { name: string; pct: number; variance: number }[] = [];
    for (const f of folders) {
      for (const p of f.projects) {
        if (thresholdLevel(p.summary.pct) !== 'ok')
          out.push({ name: p.project.name, pct: p.summary.pct, variance: p.summary.variance });
      }
    }
    return out.sort((a, b) => b.pct - a.pct).slice(0, 6);
  }, [folders]);

  if (alerts.length === 0) return null;

  return (
    <div className="panel p-4 border-signal-yellow/30">
      <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-signal-yellow font-medium mb-2.5">
        <AlertTriangle className="w-3.5 h-3.5" />
        Alertes budgétaires ({alerts.length})
      </div>
      <ul className="space-y-1.5">
        {alerts.map((a) => (
          <li key={a.name} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-atlas-fg-1 truncate">{a.name}</span>
            <span className="flex items-center gap-2.5 shrink-0">
              {a.variance < 0 && (
                <span className="text-2xs font-mono text-signal-red">{formatFCFA(a.variance)}</span>
              )}
              <ThresholdBadge pct={a.pct} />
              <span
                className={cn('text-sm font-medium font-mono tabular-nums w-12 text-right', pctText(a.pct))}
              >
                {Math.round(a.pct)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─────────── Tableau consolidé générique (dossiers OU projets) ─────────── */

interface ConsolRow {
  key: string;
  name: string;
  color: string;
  glyph?: string;
  meta?: string;
  summary: BudgetSummary;
  onClick: () => void;
}

function ConsolidatedTable({
  label,
  rows,
  total,
  totalLabel,
}: {
  label: string;
  rows: ConsolRow[];
  total: BudgetSummary;
  totalLabel: string;
}) {
  const cols = 'grid grid-cols-[1.6fr_1fr_1fr_1fr_120px_56px] gap-3 px-4';
  return (
    <div className="panel overflow-hidden">
      <div
        className={cn(
          cols,
          'py-2.5 text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium bg-black/[0.02] border-b border-atlas-line'
        )}
      >
        <span>{label}</span>
        <span className="text-right">Alloué</span>
        <span className="text-right">Réalisé</span>
        <span className="text-right">Écart</span>
        <span>Consommation</span>
        <span className="text-right">%</span>
      </div>
      <div className="divide-y divide-atlas-line">
        {rows.map((r) => (
          <button
            key={r.key}
            onClick={r.onClick}
            className={cn(cols, 'py-3 items-center text-left hover:bg-black/[0.02] transition-colors w-full')}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              {r.glyph ? (
                <span className="text-base leading-none shrink-0">{r.glyph}</span>
              ) : (
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: r.color }}
                  aria-hidden
                />
              )}
              <span className="min-w-0">
                <span className="block text-sm font-medium text-atlas-fg-1 truncate">{r.name}</span>
                {r.meta && <span className="block text-2xs text-atlas-fg-3">{r.meta}</span>}
              </span>
            </span>
            <span className="text-sm tabular-nums text-atlas-fg-1 text-right">
              {formatFCFA(r.summary.allocated)}
            </span>
            <span className="text-sm tabular-nums text-atlas-fg-1 text-right">
              {formatFCFA(r.summary.spent)}
            </span>
            <span
              className={cn(
                'text-sm tabular-nums text-right',
                r.summary.variance < 0 ? 'text-signal-red' : 'text-atlas-sage'
              )}
            >
              {formatFCFA(r.summary.variance)}
            </span>
            <span className="flex items-center gap-2">
              <span className="flex-1 h-2 rounded-full bg-black/[0.06] overflow-hidden">
                <span
                  className={cn('block h-full rounded-full transition-all', barColor(r.summary.pct))}
                  style={{ width: `${Math.min(100, r.summary.pct)}%` }}
                />
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-atlas-fg-3 shrink-0" />
            </span>
            <span
              className={cn('text-sm font-medium font-mono tabular-nums text-right', pctText(r.summary.pct))}
            >
              {Math.round(r.summary.pct)}%
            </span>
          </button>
        ))}
      </div>
      {/* TOTAL */}
      <div className={cn(cols, 'py-3 items-center border-t-2 border-atlas-line bg-black/[0.02]')}>
        <span className="text-sm font-semibold text-atlas-fg-1 truncate">{totalLabel}</span>
        <span className="text-sm font-semibold tabular-nums text-atlas-fg-1 text-right">
          {formatFCFA(total.allocated)}
        </span>
        <span className="text-sm font-semibold tabular-nums text-atlas-fg-1 text-right">
          {formatFCFA(total.spent)}
        </span>
        <span
          className={cn(
            'text-sm font-semibold tabular-nums text-right',
            total.variance < 0 ? 'text-signal-red' : 'text-atlas-sage'
          )}
        >
          {formatFCFA(total.variance)}
        </span>
        <span className="h-2 rounded-full bg-black/[0.06] overflow-hidden">
          <span
            className={cn('block h-full rounded-full', barColor(total.pct))}
            style={{ width: `${Math.min(100, total.pct)}%` }}
          />
        </span>
        <span className={cn('text-sm font-semibold font-mono tabular-nums text-right', pctText(total.pct))}>
          {Math.round(total.pct)}%
        </span>
      </div>
    </div>
  );
}
