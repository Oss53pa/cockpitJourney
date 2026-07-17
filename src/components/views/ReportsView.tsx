import { useMemo, useState } from 'react';
import {
  FileBarChart,
  Sparkles,
  Download,
  Send,
  Trash2,
  Copy,
  MoreHorizontal,
  Calendar,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Award,
  AlertTriangle,
  ArrowRight,
  FileText,
  Mail,
  Activity,
  Users,
  Target,
  AlertOctagon,
  Info,
  BarChart3,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  Rows3,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { useApp, type Report, type ReportKind, type AttentionPoint } from '../../stores/appStore';
import type { PeriodAnalytics } from '../../lib/reportAnalytics';
import type { Task } from '../../types';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu';
import { Modal } from '../ui/Modal';
import { GoalPerformancePanel } from './GoalPerformancePanel';
import { cn, relativeTime } from '../../lib/utils';
import { ReportExportDialog } from '../reports/ReportExportDialog';

const kindLabels: Record<ReportKind, string> = {
  weekly: 'Hebdomadaire',
  monthly: 'Mensuel',
  quarterly: 'Trimestriel',
  annual: 'Annuel',
};

/** Plain-text summary of a report — used for clipboard + e-mail body. */
function reportToPlainText(report: Report): string {
  const lines: string[] = [report.title, `Période : ${report.period}`];
  if (report.narrative) {
    lines.push('', report.narrative);
  }
  const pts = report.attentionPoints || [];
  if (pts.length) {
    lines.push('', "Points d'attention :");
    pts.forEach((p) => lines.push(`- [${p.severity}] ${p.title} — ${p.detail}`));
  }
  return lines.join('\n');
}

/** Open the user's mail client with the report pre-filled. */
function emailReport(report: Report) {
  const body = encodeURIComponent(reportToPlainText(report));
  const subject = encodeURIComponent(report.title);
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

/** Copy the report summary to the clipboard; returns the promise. */
function copyReportSummary(report: Report): Promise<void> {
  return navigator.clipboard?.writeText(reportToPlainText(report)) ?? Promise.reject();
}
const kindColors: Record<ReportKind, string> = {
  weekly: 'border-atlas-amber/30 bg-atlas-amber/10 text-atlas-amber-deep',
  monthly: 'border-signal-blue/30 bg-signal-blue/10 text-signal-blue',
  quarterly: 'border-signal-violet/30 bg-signal-violet/10 text-signal-violet',
  annual: 'border-signal-green/30 bg-signal-green/10 text-signal-green',
};
const sevConfig: Record<AttentionPoint['severity'], { cls: string; icon: any; label: string }> = {
  critical: {
    cls: 'border-signal-red/40 bg-signal-red/10 text-signal-red',
    icon: AlertOctagon,
    label: 'Critique',
  },
  high: {
    cls: 'border-signal-yellow/40 bg-signal-yellow/10 text-signal-yellow',
    icon: AlertTriangle,
    label: 'Élevé',
  },
  medium: { cls: 'border-signal-blue/40 bg-signal-blue/10 text-signal-blue', icon: Info, label: 'Moyen' },
};

export function ReportsView() {
  const reports = useApp((s) => s.reports);
  const generateReport = useApp((s) => s.generateReport);
  const deleteReport = useApp((s) => s.deleteReport);
  const [filter, setFilter] = useState<'all' | ReportKind>('all');
  const [openReportId, setOpenReportId] = useState<string | null>(null);
  const [exportReportId, setExportReportId] = useState<string | null>(null);
  // Default to "table" — proper history view. Card grid stays available
  // via the toggle for visual scanning.
  const [layout, setLayout] = useState<'table' | 'cards'>('table');
  const [sortKey, setSortKey] = useState<'generatedAt' | 'kind' | 'title' | 'critical' | 'projects'>(
    'generatedAt'
  );
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const filtered = useMemo(() => {
    const base = filter === 'all' ? reports : reports.filter((r) => r.kind === filter);
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      switch (sortKey) {
        case 'generatedAt':
          return (new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime()) * dir;
        case 'kind':
          return a.kind.localeCompare(b.kind) * dir;
        case 'title':
          return a.title.localeCompare(b.title) * dir;
        case 'critical': {
          const ac = (a.attentionPoints || []).filter((x) => x.severity === 'critical').length;
          const bc = (b.attentionPoints || []).filter((x) => x.severity === 'critical').length;
          return (ac - bc) * dir;
        }
        case 'projects':
          return ((a.projects?.length ?? 0) - (b.projects?.length ?? 0)) * dir;
        default:
          return 0;
      }
    });
  }, [reports, filter, sortKey, sortDir]);

  const exportingReport = exportReportId ? reports.find((r) => r.id === exportReportId) : undefined;

  const handleSort = (k: typeof sortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(k);
      setSortDir(k === 'generatedAt' ? 'desc' : 'asc');
    }
  };

  return (
    <div className="px-8 py-7">
      <div className="flex items-end justify-between mb-7">
        <div>
          <div className="text-2xs uppercase tracking-[0.18em] text-atlas-fg-3 font-medium mb-1">
            Rapports détaillés
          </div>
          <h1 className="font-display text-3xl font-medium tracking-tight">
            Avancement, points d'attention, charge équipe
          </h1>
          <p className="text-sm text-atlas-fg-3 mt-1">
            {reports.length} rapports archivés · synthèse multi-projets · narration PROPH3T optionnelle
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Menu
            trigger={
              <button className="btn-primary text-sm px-3 py-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Générer
              </button>
            }
          >
            {(close) => (
              <>
                <MenuLabel>Type de rapport</MenuLabel>
                {(Object.keys(kindLabels) as ReportKind[]).map((k) => (
                  <MenuItem
                    key={k}
                    icon={FileBarChart}
                    onClick={() => {
                      close();
                      const r = generateReport(k);
                      setOpenReportId(r.id);
                    }}
                  >
                    {kindLabels[k]}
                  </MenuItem>
                ))}
              </>
            )}
          </Menu>
        </div>
      </div>

      {/* Rapport vivant : recalculé depuis les actions, contrairement aux
          rapports archivés ci-dessous qui sont des snapshots figés. */}
      <GoalPerformancePanel />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-7">
        {(Object.keys(kindLabels) as ReportKind[]).map((k) => {
          const count = reports.filter((r) => r.kind === k).length;
          return (
            <button
              key={k}
              onClick={() => {
                const r = generateReport(k);
                setOpenReportId(r.id);
              }}
              className="panel p-4 text-left group hover:border-atlas-amber/40 transition-all hover:-translate-y-0.5"
            >
              <div
                className={cn(
                  'w-9 h-9 rounded-xl flex items-center justify-center border mb-3',
                  kindColors[k]
                )}
              >
                <Calendar className="w-4 h-4" />
              </div>
              <div className="text-sm font-medium text-atlas-fg-1">{kindLabels[k]}</div>
              <div className="text-2xs text-atlas-fg-3 mt-0.5">
                {count} archivé{count > 1 ? 's' : ''}
              </div>
              <div className="mt-3 inline-flex items-center gap-1 text-2xs uppercase tracking-wider font-medium text-atlas-amber-deep group-hover:gap-2 transition-all">
                <RefreshCw className="w-3 h-3" /> Générer
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters + history label + layout toggle */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-2xs uppercase tracking-[0.18em] font-medium text-atlas-fg-3 mr-1">
            Historique
          </span>
          <button
            onClick={() => setFilter('all')}
            className={cn(
              'px-3 py-1 rounded-full text-2xs uppercase tracking-wider font-medium border',
              filter === 'all'
                ? 'bg-atlas-amber/15 border-atlas-amber/30 text-atlas-amber-deep'
                : 'border-atlas-line text-atlas-fg-3 hover:bg-black/[0.04]'
            )}
          >
            Tous · {reports.length}
          </button>
          {(Object.keys(kindLabels) as ReportKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn(
                'px-3 py-1 rounded-full text-2xs uppercase tracking-wider font-medium border',
                filter === k
                  ? 'bg-atlas-amber/15 border-atlas-amber/30 text-atlas-amber-deep'
                  : 'border-atlas-line text-atlas-fg-3 hover:bg-black/[0.04]'
              )}
            >
              {kindLabels[k]}
            </button>
          ))}
        </div>
        <div className="ml-auto inline-flex items-center gap-0 rounded-full border border-atlas-line bg-white p-0.5">
          <button
            onClick={() => setLayout('table')}
            aria-label="Vue tableau"
            title="Vue tableau"
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs uppercase tracking-wider font-medium transition',
              layout === 'table'
                ? 'bg-atlas-amber/15 text-atlas-amber-deep'
                : 'text-atlas-fg-3 hover:text-atlas-fg-1'
            )}
          >
            <Rows3 className="w-3 h-3" />
            Table
          </button>
          <button
            onClick={() => setLayout('cards')}
            aria-label="Vue cartes"
            title="Vue cartes"
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs uppercase tracking-wider font-medium transition',
              layout === 'cards'
                ? 'bg-atlas-amber/15 text-atlas-amber-deep'
                : 'text-atlas-fg-3 hover:text-atlas-fg-1'
            )}
          >
            <LayoutGrid className="w-3 h-3" />
            Cartes
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="panel p-10 text-center">
          <FileBarChart className="w-8 h-8 mx-auto text-atlas-fg-3 mb-2" />
          <h3 className="text-sm font-medium text-atlas-fg-1">Aucun rapport</h3>
          <p className="text-2xs text-atlas-fg-3 mt-1 mb-4">
            Générez votre premier rapport — analyse complète multi-projets.
          </p>
          <button
            onClick={() => {
              const r = generateReport('weekly');
              setOpenReportId(r.id);
            }}
            className="btn-primary text-sm px-3.5 py-1.5 inline-flex"
          >
            <Sparkles className="w-3.5 h-3.5" /> Générer hebdo
          </button>
        </div>
      ) : layout === 'table' ? (
        <ReportsHistoryTable
          reports={filtered}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          onOpen={(id) => setOpenReportId(id)}
          onExport={(id) => setExportReportId(id)}
          onDelete={(id, title) => {
            if (confirm(`Supprimer "${title}" ?`)) deleteReport(id);
          }}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((r) => (
            <ReportCard
              key={r.id}
              report={r}
              onOpen={() => setOpenReportId(r.id)}
              onExport={() => setExportReportId(r.id)}
              onDelete={() => {
                if (confirm(`Supprimer "${r.title}" ?`)) deleteReport(r.id);
              }}
            />
          ))}
        </div>
      )}

      {openReportId && (
        <ReportViewerModal
          reportId={openReportId}
          onClose={() => setOpenReportId(null)}
          onExport={() => setExportReportId(openReportId)}
        />
      )}

      {exportingReport && (
        <ReportExportDialog report={exportingReport} open onClose={() => setExportReportId(null)} />
      )}
    </div>
  );
}

/* ───────────────────── History table ─────────────────────
 *
 * Dense, sortable table of all generated reports — the proper history
 * surface. Columns: Date · Type · Titre & période · Projets · Critiques
 * · Auteur · Narration · Actions. Sortable on Date / Type / Titre /
 * Critiques / Projets via the column headers.
 */

type SortKey = 'generatedAt' | 'kind' | 'title' | 'critical' | 'projects';

function ReportsHistoryTable({
  reports,
  sortKey,
  sortDir,
  onSort,
  onOpen,
  onExport,
  onDelete,
}: {
  reports: Report[];
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
  onOpen: (id: string) => void;
  onExport: (id: string) => void;
  onDelete: (id: string, title: string) => void;
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-atlas-panel-2 border-b border-atlas-line">
              <SortableTh sortKey="generatedAt" current={sortKey} dir={sortDir} onSort={onSort}>
                Date
              </SortableTh>
              <SortableTh sortKey="kind" current={sortKey} dir={sortDir} onSort={onSort}>
                Type
              </SortableTh>
              <SortableTh sortKey="title" current={sortKey} dir={sortDir} onSort={onSort}>
                Titre & période
              </SortableTh>
              <SortableTh sortKey="projects" current={sortKey} dir={sortDir} onSort={onSort} align="right">
                Projets
              </SortableTh>
              <SortableTh sortKey="critical" current={sortKey} dir={sortDir} onSort={onSort} align="right">
                Critiques
              </SortableTh>
              <th className="text-left text-2xs uppercase tracking-[0.18em] text-atlas-fg-3 font-medium px-4 py-3">
                Auteur
              </th>
              <th className="text-center text-2xs uppercase tracking-[0.18em] text-atlas-fg-3 font-medium px-4 py-3 w-20">
                Narration
              </th>
              <th className="text-right text-2xs uppercase tracking-[0.18em] text-atlas-fg-3 font-medium px-4 py-3 whitespace-nowrap sticky right-0 bg-atlas-panel-2 z-10">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <ReportRow
                key={r.id}
                report={r}
                onOpen={() => onOpen(r.id)}
                onExport={() => onExport(r.id)}
                onDelete={() => onDelete(r.id, r.title)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortableTh({
  sortKey,
  current,
  dir,
  onSort,
  align = 'left',
  children,
}: {
  sortKey: SortKey;
  current: SortKey;
  dir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
  align?: 'left' | 'right';
  children: React.ReactNode;
}) {
  const active = current === sortKey;
  return (
    <th
      className={cn(
        'text-2xs uppercase tracking-[0.18em] font-medium px-4 py-3',
        align === 'right' ? 'text-right' : 'text-left',
        active ? 'text-atlas-amber-deep' : 'text-atlas-fg-3'
      )}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-atlas-fg-1 transition',
          align === 'right' && 'justify-end w-full'
        )}
      >
        {children}
        {active && (dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </button>
    </th>
  );
}

function ReportRow({
  report,
  onOpen,
  onExport,
  onDelete,
}: {
  report: Report;
  onOpen: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const author = useApp((s) => s.users.find((u) => u.id === report.authorId) || s.users[0]);
  const pushToast = useApp((s) => s.pushToast);
  const critical = (report.attentionPoints || []).filter((a) => a.severity === 'critical').length;
  const high = (report.attentionPoints || []).filter((a) => a.severity === 'high').length;

  const generatedAt = new Date(report.generatedAt);
  const fullDate = generatedAt.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const time = generatedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  return (
    <tr className="group/row border-b border-atlas-line/50 last:border-0 hover:bg-atlas-amber/[0.03] transition-colors">
      <td className="px-4 py-3 align-top tabular-nums">
        <div className="text-sm font-medium text-atlas-fg-1">{fullDate}</div>
        <div className="text-2xs text-atlas-fg-3">
          {time} · {relativeTime(report.generatedAt)}
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <span className={cn('chip border', kindColors[report.kind])}>{kindLabels[report.kind]}</span>
      </td>
      <td className="px-4 py-3 align-top min-w-0 max-w-[28rem]">
        <button
          type="button"
          onClick={onOpen}
          className="text-left text-sm font-medium text-atlas-fg-1 hover:text-atlas-amber-deep transition leading-snug"
        >
          {report.title}
        </button>
        <div className="text-2xs mt-0.5 inline-flex items-center gap-1.5">
          <span className="font-mono font-medium text-atlas-amber-deep tabular-nums">
            {formatPeriodRangeFromReport(report)}
          </span>
          <span className="text-atlas-fg-3">·</span>
          <span className="text-atlas-fg-3">{report.period}</span>
        </div>
      </td>
      <td className="px-4 py-3 align-top text-right tabular-nums">
        <span className="text-sm font-medium text-atlas-fg-1">{report.projects?.length ?? 0}</span>
      </td>
      <td className="px-4 py-3 align-top text-right tabular-nums">
        {critical > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-signal-red">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-red" />
            {critical}
          </span>
        ) : high > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-signal-yellow">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-yellow" />
            {high}
          </span>
        ) : (
          <span className="text-sm text-atlas-fg-3">—</span>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        <div className="inline-flex items-center gap-2 min-w-0">
          <span
            className="w-6 h-6 rounded-full text-2xs font-medium flex items-center justify-center text-white shrink-0"
            style={{ background: `linear-gradient(135deg, ${author.color}, ${author.color}99)` }}
          >
            {author.initials}
          </span>
          <span className="text-sm text-atlas-fg-2 truncate">{author.name}</span>
        </div>
      </td>
      <td className="px-4 py-3 align-top text-center">
        {report.narrative ? (
          <span
            className="inline-flex items-center gap-1 chip bg-atlas-amber/10 text-atlas-amber-deep border border-atlas-amber/30"
            title="Narration PROPH3T générée"
          >
            <Sparkles className="w-2.5 h-2.5" /> IA
          </span>
        ) : (
          <span className="text-2xs text-atlas-fg-3">—</span>
        )}
      </td>
      <td className="px-4 py-3 align-top text-right whitespace-nowrap sticky right-0 bg-white group-hover/row:bg-atlas-amber/[0.03] transition-colors">
        <div className="inline-flex items-center gap-0.5 justify-end">
          <button onClick={onOpen} className="btn-ghost !p-1.5" title="Ouvrir" aria-label="Ouvrir le rapport">
            <FileText className="w-3.5 h-3.5" />
          </button>
          <button onClick={onExport} className="btn-ghost !p-1.5" title="Exporter" aria-label="Exporter">
            <Download className="w-3.5 h-3.5" />
          </button>
          <Menu
            trigger={
              <button className="btn-ghost !p-1.5" aria-label="Plus d'actions">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            }
          >
            {(close) => (
              <>
                <MenuItem
                  icon={Mail}
                  onClick={() => {
                    close();
                    emailReport(report);
                  }}
                >
                  Envoyer par e-mail
                </MenuItem>
                <MenuItem
                  icon={Copy}
                  onClick={() => {
                    close();
                    copyReportSummary(report)
                      .then(() => pushToast({ kind: 'success', title: 'Résumé copié' }))
                      .catch(() => pushToast({ kind: 'error', title: 'Copie impossible' }));
                  }}
                >
                  Copier le résumé
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  danger
                  icon={Trash2}
                  onClick={() => {
                    close();
                    onDelete();
                  }}
                >
                  Supprimer
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </td>
    </tr>
  );
}

function ReportCard({
  report,
  onOpen,
  onExport,
  onDelete,
}: {
  report: Report;
  onOpen: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const author = useApp((s) => s.users.find((u) => u.id === report.authorId) || s.users[0]);
  const pushToast = useApp((s) => s.pushToast);
  const critical = (report.attentionPoints || []).filter((a) => a.severity === 'critical').length;

  return (
    <article className="panel p-5 hover:border-atlas-line-2 transition-colors group">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('chip border', kindColors[report.kind])}>{kindLabels[report.kind]}</span>
            {critical > 0 && (
              <span className="chip bg-signal-red/10 text-signal-red border border-signal-red/40">
                {critical} critique{critical > 1 ? 's' : ''}
              </span>
            )}
            {report.narrative && (
              <span className="chip bg-atlas-amber/10 text-atlas-amber-deep border border-atlas-amber/30">
                <Sparkles className="w-2.5 h-2.5" /> Narration IA
              </span>
            )}
          </div>
          <h3 className="font-display text-lg font-medium text-atlas-fg-1 mt-2 truncate">{report.title}</h3>
          <div className="text-2xs mt-1 inline-flex items-center gap-1.5 flex-wrap">
            <span className="font-mono font-medium text-atlas-amber-deep tabular-nums">
              {formatPeriodRangeFromReport(report)}
            </span>
            <span className="text-atlas-fg-3">
              · {report.period} · généré {relativeTime(report.generatedAt)} par {author.name}
            </span>
          </div>
        </div>
        <Menu
          trigger={
            <button className="btn-ghost !p-1.5">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          }
        >
          {(close) => (
            <>
              <MenuItem
                icon={FileText}
                onClick={() => {
                  close();
                  onOpen();
                }}
              >
                Ouvrir le détail
              </MenuItem>
              <MenuItem
                icon={Download}
                onClick={() => {
                  close();
                  onExport();
                }}
              >
                Exporter (PDF · Word · Excel · PPT)
              </MenuItem>
              <MenuItem
                icon={Mail}
                onClick={() => {
                  close();
                  emailReport(report);
                }}
              >
                Envoyer par e-mail
              </MenuItem>
              <MenuItem
                icon={Copy}
                onClick={() => {
                  close();
                  copyReportSummary(report)
                    .then(() => pushToast({ kind: 'success', title: 'Résumé copié' }))
                    .catch(() => pushToast({ kind: 'error', title: 'Copie impossible' }));
                }}
              >
                Copier le résumé
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                danger
                icon={Trash2}
                onClick={() => {
                  close();
                  onDelete();
                }}
              >
                Supprimer
              </MenuItem>
            </>
          )}
        </Menu>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {report.metrics.slice(0, 3).map((m, i) => (
          <div key={i} className="rounded-lg bg-black/[0.02] border border-atlas-line p-2.5">
            <div className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium truncate">
              {m.label}
            </div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="font-display text-base font-medium text-atlas-fg-1 tabular-nums">
                {m.value}
              </span>
              {typeof m.delta === 'number' && (
                <span
                  className={cn(
                    'text-2xs font-medium inline-flex items-center gap-0.5',
                    m.delta >= 0 ? 'text-signal-green' : 'text-signal-red'
                  )}
                >
                  {m.delta >= 0 ? '+' : ''}
                  {m.delta}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 text-2xs">
        <div className="text-atlas-fg-3">
          <span className="text-atlas-fg-1 font-medium">{(report.projects || []).length}</span> projets
        </div>
        <div className="text-atlas-fg-3">
          <span className="text-atlas-fg-1 font-medium">{(report.attentionPoints || []).length}</span> points
          d'attention
        </div>
        <div className="text-atlas-fg-3">
          <span className="text-atlas-fg-1 font-medium">{(report.topRetards || []).length}</span> retards
        </div>
      </div>

      <button onClick={onOpen} className="w-full mt-3 btn-secondary text-xs px-3 py-1.5">
        <FileText className="w-3.5 h-3.5" /> Lire le rapport complet
      </button>
    </article>
  );
}

/* ───────────────────────── Report Viewer Modal ───────────────────────── */

function ReportViewerModal({
  reportId,
  onClose,
  onExport,
}: {
  reportId: string;
  onClose: () => void;
  onExport: () => void;
}) {
  const report = useApp((s) => s.reports.find((r) => r.id === reportId));
  const author = useApp((s) => s.users.find((u) => u.id === report?.authorId) || s.users[0]);
  const tasks = useApp((s) => s.tasks);
  const generateNarrative = useApp((s) => s.generateReportNarrative);
  const [tab, setTab] = useState<
    'overview' | 'analytics' | 'projects' | 'attention' | 'workload' | 'goals' | 'retards'
  >('overview');
  const [generating, setGenerating] = useState(false);

  if (!report) return null;

  const tabs = [
    { key: 'overview' as const, label: 'Synthèse', icon: BarChart3 },
    // Analytics tab only shows up on reports generated with the enriched
    // engine (juin 2026+) — older reports don't have the analytics field.
    ...(report.analytics ? [{ key: 'analytics' as const, label: 'Analytics', icon: TrendingUp }] : []),
    { key: 'projects' as const, label: 'Projets', icon: Activity, count: (report.projects || []).length },
    {
      key: 'attention' as const,
      label: 'Attention',
      icon: AlertOctagon,
      count: (report.attentionPoints || []).length,
    },
    { key: 'workload' as const, label: 'Charge équipe', icon: Users, count: (report.workload || []).length },
    { key: 'goals' as const, label: 'Goals', icon: Target, count: (report.goalsProgress || []).length },
    {
      key: 'retards' as const,
      label: 'Retards',
      icon: AlertTriangle,
      count: (report.topRetards || []).length,
    },
  ];

  const onGenerateNarrative = async () => {
    setGenerating(true);
    await generateNarrative(reportId);
    setGenerating(false);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={report.title}
      description={`${report.period} · généré ${relativeTime(report.generatedAt)} par ${author.name}`}
      size="xl"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost text-sm px-3 py-1.5">
            Fermer
          </button>
          <button onClick={onExport} className="btn-secondary text-sm px-3 py-1.5">
            <Download className="w-3.5 h-3.5" /> Exporter…
          </button>
          <button onClick={() => emailReport(report)} className="btn-primary text-sm px-3.5 py-1.5">
            <Send className="w-3.5 h-3.5" /> Envoyer par e-mail
          </button>
        </>
      }
    >
      {/* Tab nav */}
      <nav className="flex items-center gap-0.5 border-b border-atlas-line mb-5 -mx-2 px-2 overflow-x-auto">
        {tabs.map((t) => {
          const T = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'relative inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
                active ? 'text-atlas-fg-1' : 'text-atlas-fg-3 hover:text-atlas-fg-1'
              )}
            >
              <T className="w-3.5 h-3.5" />
              {t.label}
              {typeof t.count === 'number' && t.count > 0 && (
                <span
                  className={cn(
                    'chip text-[9px] px-1.5 py-0',
                    active
                      ? 'bg-atlas-amber/15 text-atlas-amber-deep border border-atlas-amber/30'
                      : 'bg-black/[0.05] text-atlas-fg-3 border border-atlas-line'
                  )}
                >
                  {t.count}
                </span>
              )}
              {active && (
                <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-atlas-amber" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="space-y-6">
        {tab === 'overview' && (
          <>
            {/* Narration PROPH3T */}
            <div className="rounded-2xl border border-atlas-amber/25 bg-gradient-to-br from-atlas-amber/[0.10] to-transparent p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-atlas-amber-deep" />
                  <span className="text-2xs uppercase tracking-wider font-medium text-atlas-amber-deep">
                    Synthèse PROPH3T
                  </span>
                </div>
                <button
                  onClick={onGenerateNarrative}
                  disabled={generating}
                  className="btn-secondary text-2xs px-2.5 py-1"
                >
                  {generating ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  {report.narrative ? 'Régénérer' : 'Générer narration IA'}
                </button>
              </div>
              {report.narrative ? (
                <ReportMarkdown source={report.narrative} />
              ) : (
                <p className="text-sm text-atlas-fg-1 leading-relaxed">
                  Période <strong>{report.period}</strong> : {report.projects?.length || 0} projets analysés,
                  <strong>
                    {' '}
                    {(report.attentionPoints || []).filter((a) => a.severity === 'critical').length} point(s)
                    critique(s)
                  </strong>
                  , {(report.topRetards || []).length} tâche(s) en retard. Cliquez sur{' '}
                  <em>Générer narration IA</em> pour une synthèse rédigée par PROPH3T (Groq · Llama 3.3 70B).
                </p>
              )}
            </div>

            {/* Metrics */}
            <div>
              <SectionTitle icon={TrendingUp}>Indicateurs clés</SectionTitle>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {report.metrics.map((m, i) => (
                  <div key={i} className="panel p-4">
                    <div className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">
                      {m.label}
                    </div>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="font-display text-2xl font-medium text-atlas-fg-1 tabular-nums">
                        {m.value}
                      </span>
                      {typeof m.delta === 'number' && (
                        <span
                          className={cn(
                            'text-2xs font-medium inline-flex items-center gap-0.5',
                            m.delta >= 0 ? 'text-signal-green' : 'text-signal-red'
                          )}
                        >
                          {m.delta >= 0 ? (
                            <TrendingUp className="w-2.5 h-2.5" />
                          ) : (
                            <TrendingDown className="w-2.5 h-2.5" />
                          )}
                          {m.delta >= 0 ? '+' : ''}
                          {m.delta}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top achievements + blockers */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <SectionTitle icon={Award}>Faits marquants</SectionTitle>
                <ul className="space-y-2">
                  {report.highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-atlas-fg-2">
                      <span className="w-5 h-5 rounded-full bg-signal-green/15 text-signal-green flex items-center justify-center text-2xs font-medium mt-0.5 shrink-0">
                        {i + 1}
                      </span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {report.nextSteps && report.nextSteps.length > 0 && (
                <div>
                  <SectionTitle icon={ArrowRight}>Prochaines étapes</SectionTitle>
                  <ul className="space-y-2">
                    {report.nextSteps.map((s, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-atlas-fg-2">
                        <ArrowRight className="w-4 h-4 text-atlas-amber-deep mt-0.5 shrink-0" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'analytics' && report.analytics && <AnalyticsTab analytics={report.analytics} />}

        {tab === 'projects' && (
          <div className="space-y-3">
            <SectionTitle icon={Activity}>
              Avancement détaillé par projet · {report.projects?.length || 0}
            </SectionTitle>
            {(report.projects || []).map((p) => (
              <ProjectBreakdownCard
                key={p.projectId}
                breakdown={p}
                tasks={tasks.filter((t) => t.projectId === p.projectId)}
              />
            ))}
          </div>
        )}

        {tab === 'attention' && (
          <div className="space-y-2">
            <SectionTitle icon={AlertOctagon}>
              Points d'attention prioritaires · {(report.attentionPoints || []).length}
            </SectionTitle>
            {(report.attentionPoints || []).length === 0 && (
              <div className="panel p-10 text-center">
                <Award className="w-8 h-8 mx-auto text-signal-green mb-2" />
                <h3 className="text-sm font-medium text-atlas-fg-1">Aucun point d'attention</h3>
                <p className="text-2xs text-atlas-fg-3 mt-1">Tous les projets sont en zone verte.</p>
              </div>
            )}
            {(report.attentionPoints || []).map((a, i) => {
              const cfg = sevConfig[a.severity];
              const Icon = cfg.icon;
              return (
                <div key={i} className={cn('rounded-2xl border p-4', cfg.cls)}>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white/40 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="chip text-[9px] uppercase tracking-wider bg-white/40 border border-current/30">
                          {cfg.label}
                        </span>
                        <span className="text-2xs text-atlas-fg-3">{a.scope}</span>
                      </div>
                      <h4 className="font-medium text-atlas-fg-1 mt-1.5">{a.title}</h4>
                      <p className="text-sm text-atlas-fg-2 mt-1">{a.detail}</p>
                      {a.recommendation && (
                        <div className="mt-2 flex items-start gap-2 text-2xs text-atlas-fg-2 pt-2 border-t border-current/20">
                          <ArrowRight className="w-3 h-3 mt-0.5 shrink-0" />
                          <span>
                            <strong>Recommandation :</strong> {a.recommendation}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'workload' && (
          <div>
            <SectionTitle icon={Users}>Charge équipe</SectionTitle>
            <div className="space-y-2">
              {(report.workload || []).map((w) => {
                const pct = (w.plannedHours / w.capacityHours) * 100;
                const overloaded = w.status === 'overloaded';
                return (
                  <div
                    key={w.userId}
                    className="panel p-3 grid grid-cols-[180px_1fr_120px_80px] items-center gap-4"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-7 h-7 rounded-full text-xs font-medium flex items-center justify-center text-white shrink-0"
                        style={{ background: `linear-gradient(135deg, ${w.color}, ${w.color}88)` }}
                      >
                        {w.initials}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm text-atlas-fg-1 truncate">{w.name}</div>
                        <div className="text-2xs text-atlas-fg-3">{w.tasksOpen} tâches ouvertes</div>
                      </div>
                    </div>
                    <div className="relative h-2 rounded-full bg-black/[0.05] overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          overloaded
                            ? 'bg-signal-red'
                            : w.status === 'available'
                              ? 'bg-signal-green'
                              : 'bg-amber-gradient'
                        )}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <div
                      className={cn(
                        'text-xs font-mono text-right',
                        overloaded ? 'text-signal-red font-medium' : 'text-atlas-fg-3'
                      )}
                    >
                      {w.plannedHours}h / {w.capacityHours}h
                    </div>
                    <span
                      className={cn(
                        'chip border text-center justify-center',
                        overloaded
                          ? 'bg-signal-red/15 text-signal-red border-signal-red/30'
                          : w.status === 'available'
                            ? 'bg-signal-green/15 text-signal-green border-signal-green/30'
                            : 'bg-atlas-amber/15 text-atlas-amber-deep border-atlas-amber/30'
                      )}
                    >
                      {overloaded ? 'Surchargé' : w.status === 'available' ? 'Disponible' : 'Optimal'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'goals' && (
          <div>
            <SectionTitle icon={Target}>Goals · trajectoire</SectionTitle>
            <div className="space-y-2">
              {(report.goalsProgress || []).map((g) => (
                <div
                  key={g.id}
                  className="panel p-3 grid grid-cols-[1fr_120px_120px_60px] items-center gap-4"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-atlas-fg-1 truncate">{g.title}</div>
                    <div className="text-2xs text-atlas-fg-3 mt-0.5 inline-flex items-center gap-1.5">
                      <span
                        className="w-4 h-4 rounded-full text-[9px] font-medium flex items-center justify-center text-white"
                        style={{ background: g.ownerColor }}
                      >
                        {g.ownerInitials}
                      </span>
                      Propriétaire
                    </div>
                  </div>
                  <div className="relative h-2 rounded-full bg-black/[0.05] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, g.pct)}%`,
                        background:
                          g.health === 'green' ? '#4D9A6A' : g.health === 'yellow' ? '#B69248' : '#B85B4D',
                      }}
                    />
                  </div>
                  <div className="text-2xs font-mono text-right">
                    <span className="text-atlas-fg-1 font-medium">{g.pct}%</span>
                    <span className={cn('ml-2', g.delta >= 0 ? 'text-signal-green' : 'text-signal-red')}>
                      {g.delta >= 0 ? '+' : ''}
                      {g.delta}
                    </span>
                  </div>
                  <HealthBadge health={g.health} />
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'retards' && (
          <div>
            <SectionTitle icon={AlertTriangle}>Top tâches en retard</SectionTitle>
            <div className="space-y-2">
              {(report.topRetards || []).map((r) => (
                <div
                  key={r.taskId}
                  className="panel p-3 grid grid-cols-[60px_1fr_180px_80px_60px] items-center gap-3"
                >
                  <div
                    className={cn(
                      'w-12 h-12 rounded-xl flex flex-col items-center justify-center font-mono text-xs font-medium',
                      r.daysLate >= 5
                        ? 'bg-signal-red/15 text-signal-red border border-signal-red/30'
                        : r.daysLate >= 3
                          ? 'bg-signal-yellow/15 text-signal-yellow border border-signal-yellow/30'
                          : 'bg-black/[0.04] text-atlas-fg-2 border border-atlas-line'
                    )}
                  >
                    <span className="text-base">+{r.daysLate}</span>
                    <span className="text-[8px] uppercase tracking-wider">jours</span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-atlas-fg-1 truncate">{r.title}</div>
                    <div className="text-2xs text-atlas-fg-3 mt-0.5">{r.projectName}</div>
                  </div>
                  <span className="text-2xs text-atlas-fg-3">
                    Responsable <span className="text-atlas-fg-1 font-medium">{r.ownerInitials}</span>
                  </span>
                  <span
                    className={cn(
                      'chip border text-center justify-center',
                      r.priority === 4
                        ? 'bg-signal-red/10 text-signal-red border-signal-red/30'
                        : r.priority === 3
                          ? 'bg-signal-yellow/10 text-signal-yellow border-signal-yellow/30'
                          : 'bg-black/[0.04] text-atlas-fg-3 border-atlas-line'
                    )}
                  >
                    {['Faible', 'Normale', 'Haute', 'Critique'][r.priority - 1]}
                  </span>
                  <button className="btn-ghost text-2xs px-2 py-1.5 hover:text-atlas-amber-deep">
                    Voir →
                  </button>
                </div>
              ))}
              {(report.topRetards || []).length === 0 && (
                <div className="panel p-10 text-center">
                  <Award className="w-8 h-8 mx-auto text-signal-green mb-2" />
                  <h3 className="text-sm font-medium text-atlas-fg-1">Aucun retard</h3>
                  <p className="text-2xs text-atlas-fg-3 mt-1">Tout est dans les temps 🎉</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * Project section in the report viewer: header + counts + an expandable
 * task list. The user explicitly asked for "le détail des tâches dans
 * le rapport"; we read tasks live from the store filtered by projectId
 * (the report itself only carries aggregate counts). Tasks are grouped
 * by status so the reader sees what's done vs in-flight at a glance.
 */
function ProjectBreakdownCard({
  breakdown: p,
  tasks,
}: {
  breakdown: import('../../stores/appStore').ReportProjectBreakdown;
  tasks: Task[];
}) {
  const [expanded, setExpanded] = useState(false);

  const grouped = useMemo(() => {
    const out: Record<string, Task[]> = {
      in_progress: [],
      todo: [],
      in_review: [],
      done: [],
    };
    for (const t of tasks) {
      (out[t.status] ??= []).push(t);
    }
    return out;
  }, [tasks]);

  return (
    <div className="panel p-5">
      <div className="flex items-start gap-3">
        <div className="w-2 h-12 rounded-full" style={{ background: p.color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-lg font-medium text-atlas-fg-1">{p.name}</h3>
            <div className="flex items-center gap-2">
              <HealthBadge health={p.health} />
              <span className="chip bg-black/[0.04] border border-atlas-line text-atlas-fg-2">
                {p.members} membre{p.members > 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <p className="text-sm text-atlas-fg-2 mt-2">{p.summary}</p>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-black/[0.06] overflow-hidden">
              <div className="h-full rounded-full bg-amber-gradient" style={{ width: `${p.progress}%` }} />
            </div>
            <span className="text-2xs font-mono font-medium text-atlas-fg-1">{p.progress}%</span>
          </div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2">
            <MiniStat label="Total" value={String(p.tasksTotal)} />
            <MiniStat label="Livrées" value={String(p.tasksDone)} accent="green" />
            <MiniStat label="En cours" value={String(p.tasksInProgress)} accent="amber" />
            <MiniStat
              label="Retard"
              value={String(p.tasksOverdue)}
              accent={p.tasksOverdue > 0 ? 'red' : 'default'}
            />
            <MiniStat
              label="Critiques"
              value={String(p.tasksCritical)}
              accent={p.tasksCritical > 0 ? 'red' : 'default'}
            />
          </div>
          {p.riskNote && (
            <div className="mt-3 flex items-start gap-2 text-2xs text-signal-red bg-signal-red/[0.06] border border-signal-red/30 rounded-lg p-2.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{p.riskNote}</span>
            </div>
          )}

          {/* Tasks toggle */}
          {tasks.length > 0 && (
            <>
              <button
                onClick={() => setExpanded((v) => !v)}
                className="mt-4 inline-flex items-center gap-1.5 text-2xs uppercase tracking-wider font-medium text-atlas-fg-3 hover:text-atlas-amber-deep transition"
              >
                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                {expanded ? 'Masquer' : 'Voir'} le détail des {tasks.length} tâche
                {tasks.length > 1 ? 's' : ''}
              </button>
              {expanded && (
                <div className="mt-3 space-y-3 border-t border-atlas-line pt-3">
                  {(['in_progress', 'todo', 'in_review', 'done'] as const).map((status) => {
                    const list = grouped[status] || [];
                    if (list.length === 0) return null;
                    const label =
                      status === 'in_progress'
                        ? 'En cours'
                        : status === 'todo'
                          ? 'À faire'
                          : status === 'in_review'
                            ? 'En revue'
                            : 'Terminées';
                    const accent =
                      status === 'in_progress'
                        ? 'text-atlas-amber-deep'
                        : status === 'in_review'
                          ? 'text-signal-blue'
                          : status === 'done'
                            ? 'text-signal-green'
                            : 'text-atlas-fg-3';
                    return (
                      <div key={status}>
                        <div className={cn('text-2xs uppercase tracking-wider font-medium mb-1.5', accent)}>
                          {label} · {list.length}
                        </div>
                        <ul className="space-y-1">
                          {list.map((t) => (
                            <TaskBriefRow key={t.id} task={t} />
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskBriefRow({ task }: { task: Task }) {
  const overdue = task.status !== 'done' && task.dueDate && new Date(task.dueDate).getTime() < Date.now();
  const priorityColor =
    task.priority === 4
      ? 'bg-signal-red/15 text-signal-red border-signal-red/30'
      : task.priority === 3
        ? 'bg-signal-yellow/15 text-signal-yellow border-signal-yellow/30'
        : task.priority === 2
          ? 'bg-signal-blue/15 text-signal-blue border-signal-blue/30'
          : 'bg-black/[0.04] text-atlas-fg-3 border-atlas-line';
  const priorityLabel = ['Faible', 'Normale', 'Haute', 'Critique'][task.priority - 1] ?? '';

  return (
    <li className="flex items-center gap-2.5 py-1.5 text-sm">
      <span
        className={cn(
          'chip border text-[9px] uppercase tracking-wider px-1.5 py-0 font-medium',
          priorityColor
        )}
      >
        P{task.priority}
      </span>
      <span className="flex-1 min-w-0 text-atlas-fg-1 truncate">{task.title}</span>
      {task.tags && task.tags.length > 0 && (
        <span className="hidden sm:inline-flex text-2xs text-atlas-fg-3 font-light">
          #{task.tags[0]}
          {task.tags.length > 1 && <span className="ml-0.5">+{task.tags.length - 1}</span>}
        </span>
      )}
      {task.dueDate && (
        <span
          className={cn(
            'text-2xs font-mono shrink-0 tabular-nums',
            overdue ? 'text-signal-red font-medium' : 'text-atlas-fg-3'
          )}
          title={priorityLabel}
        >
          {new Date(task.dueDate).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'short',
          })}
        </span>
      )}
    </li>
  );
}

/**
 * Format the report's period as "DD/MM/YYYY → DD/MM/YYYY" using the
 * structured periodStart / periodEnd fields. Mirrors the helper used
 * by the export library so the in-app history shows the exact same
 * date range string the PDF/DOCX/PPTX/XLSX will print.
 */
function formatPeriodRangeFromReport(report: Report): string {
  if (report.periodStart && report.periodEnd) {
    const start = new Date(report.periodStart);
    const end = new Date(report.periodEnd);
    const fmt = (d: Date) =>
      d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `${fmt(start)} → ${fmt(end)}`;
  }
  return report.period;
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'red' | 'green' | 'amber' | 'default';
}) {
  const cls =
    accent === 'red'
      ? 'text-signal-red'
      : accent === 'green'
        ? 'text-signal-green'
        : accent === 'amber'
          ? 'text-atlas-amber-deep'
          : 'text-atlas-fg-1';
  return (
    <div className="rounded-md bg-black/[0.02] border border-atlas-line px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-atlas-fg-3 font-medium">{label}</div>
      <div className={cn('font-mono text-sm font-medium tabular-nums', cls)}>{value}</div>
    </div>
  );
}

function HealthBadge({ health }: { health: 'green' | 'yellow' | 'red' }) {
  const cls =
    health === 'green'
      ? 'bg-signal-green/15 text-signal-green border-signal-green/30'
      : health === 'yellow'
        ? 'bg-signal-yellow/15 text-signal-yellow border-signal-yellow/30'
        : 'bg-signal-red/15 text-signal-red border-signal-red/30';
  const label = health === 'green' ? 'Vert' : health === 'yellow' ? 'Jaune' : 'Rouge';
  return (
    <span className={cn('chip border', cls)}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" /> {label}
    </span>
  );
}

function ReportMarkdown({ source }: { source: string }) {
  const lines = source.split('\n');
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        if (line.startsWith('## '))
          return (
            <h3 key={i} className="font-display text-base font-medium text-atlas-fg-1 mt-4 first:mt-0">
              {line.slice(3)}
            </h3>
          );
        if (line.startsWith('### '))
          return (
            <h4 key={i} className="font-medium text-sm text-atlas-fg-1 mt-3">
              {line.slice(4)}
            </h4>
          );
        if (line.startsWith('- '))
          return (
            <li key={i} className="text-sm text-atlas-fg-2 ml-4 list-disc">
              {inlineMd(line.slice(2))}
            </li>
          );
        if (line.match(/^\d+\.\s/))
          return (
            <li key={i} className="text-sm text-atlas-fg-2 ml-4 list-decimal">
              {inlineMd(line.replace(/^\d+\.\s/, ''))}
            </li>
          );
        if (line.trim() === '') return <div key={i} className="h-1" />;
        return (
          <p key={i} className="text-sm text-atlas-fg-2 leading-relaxed">
            {inlineMd(line)}
          </p>
        );
      })}
    </div>
  );
}

function inlineMd(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIdx = 0;
  let key = 0;
  text.replace(re, (m, _g, idx) => {
    if (idx > lastIdx) parts.push(text.slice(lastIdx, idx));
    if (m.startsWith('**'))
      parts.push(
        <strong key={key++} className="text-atlas-fg-1 font-medium">
          {m.slice(2, -2)}
        </strong>
      );
    else
      parts.push(
        <code key={key++} className="font-mono text-2xs px-1 py-0.5 bg-black/[0.05] rounded">
          {m.slice(1, -1)}
        </code>
      );
    lastIdx = idx + m.length;
    return m;
  });
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return <>{parts}</>;
}

function SectionTitle({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <h3 className="inline-flex items-center gap-2 text-2xs uppercase tracking-[0.18em] font-medium text-atlas-fg-3 mb-3">
      <Icon className="w-3.5 h-3.5" /> {children}
    </h3>
  );
}

/* ───────────────────── Analytics tab ─────────────────────
 *
 * Surfaces the period-scoped analytics : throughput sparkline, status /
 * priority distributions, top tags, period-over-period deltas. All driven
 * by `report.analytics` (set by generateReport — buildPeriodAnalytics).
 */

const STATUS_LABEL: Record<string, string> = {
  todo: 'À faire',
  in_progress: 'En cours',
  in_review: 'En revue',
  blocked: 'Bloqué',
  done: 'Livré',
};
const STATUS_COLOR: Record<string, string> = {
  todo: 'bg-atlas-fg-3/30',
  in_progress: 'bg-signal-blue',
  in_review: 'bg-signal-violet',
  blocked: 'bg-signal-red',
  done: 'bg-signal-green',
};
const PRIO_LABEL: Record<string, string> = {
  1: 'P1 — Critique',
  2: 'P2 — Haute',
  3: 'P3 — Moyenne',
  4: 'P4 — Basse',
};
const PRIO_COLOR: Record<string, string> = {
  1: 'bg-signal-red',
  2: 'bg-signal-yellow',
  3: 'bg-signal-blue',
  4: 'bg-atlas-fg-3/40',
};

function AnalyticsTab({ analytics }: { analytics: PeriodAnalytics }) {
  const cur = analytics.current;
  const prev = analytics.previous;

  const statusTotal = Object.values(analytics.statusDistribution).reduce((a, b) => a + b, 0);
  const prioTotal = Object.values(analytics.priorityDistribution).reduce((a, b) => a + b, 0);
  const maxDaily = Math.max(1, ...analytics.dailyThroughput.map((d) => Math.max(d.completed, d.created)));
  const maxTagCount = Math.max(1, ...analytics.topTags.map((t) => t.count));

  return (
    <div className="space-y-6">
      {/* Period-over-period comparison cards */}
      <div>
        <SectionTitle icon={TrendingUp}>Période vs précédente</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ComparisonCard label="Livrées" current={cur.completed} previous={prev.completed} unit="" />
          <ComparisonCard label="Créées" current={cur.created} previous={prev.created} unit="" />
          <ComparisonCard
            label="Retard période"
            current={cur.overdueInPeriod}
            previous={prev.overdueInPeriod}
            unit=""
            inverted
          />
          <ComparisonCard label="Temps réel" current={cur.actualHours} previous={prev.actualHours} unit="h" />
        </div>
      </div>

      {/* Daily throughput sparkline */}
      <div>
        <SectionTitle icon={Activity}>Cadence quotidienne · livrées (vert) vs créées (gris)</SectionTitle>
        <div className="panel p-4">
          <div className="flex items-end gap-0.5 h-24">
            {analytics.dailyThroughput.map((d) => {
              const hDone = (d.completed / maxDaily) * 100;
              const hCreated = (d.created / maxDaily) * 100;
              return (
                <div
                  key={d.date}
                  className="flex-1 flex flex-col justify-end gap-px"
                  title={`${d.date} · ${d.completed} livrées · ${d.created} créées`}
                >
                  <div
                    className="w-full bg-atlas-fg-3/30 rounded-sm"
                    style={{ height: `${hCreated}%`, minHeight: hCreated > 0 ? '2px' : 0 }}
                  />
                  <div
                    className="w-full bg-signal-green rounded-sm"
                    style={{ height: `${hDone}%`, minHeight: hDone > 0 ? '2px' : 0 }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-2xs text-atlas-fg-3 mt-2 tabular-nums">
            <span>{analytics.dailyThroughput[0]?.date.slice(5) ?? '—'}</span>
            <span>
              Σ livrées : <strong className="text-atlas-fg-1">{cur.completed}</strong> · Σ créées :{' '}
              <strong className="text-atlas-fg-1">{cur.created}</strong>
            </span>
            <span>
              {analytics.dailyThroughput[analytics.dailyThroughput.length - 1]?.date.slice(5) ?? '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Distributions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <SectionTitle icon={BarChart3}>Statut des tâches ouvertes</SectionTitle>
          <div className="panel p-4 space-y-2">
            {(['todo', 'in_progress', 'in_review', 'blocked'] as const).map((k) => {
              const n = analytics.statusDistribution[k];
              const pct = statusTotal > 0 ? (n / statusTotal) * 100 : 0;
              return (
                <div key={k}>
                  <div className="flex items-center justify-between text-2xs mb-1">
                    <span className="text-atlas-fg-2">{STATUS_LABEL[k]}</span>
                    <span className="tabular-nums text-atlas-fg-3">
                      {n} · {Math.round(pct)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-black/[0.04] rounded-full overflow-hidden">
                    <div className={cn('h-full', STATUS_COLOR[k])} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="text-2xs text-atlas-fg-3 pt-2 border-t border-atlas-line/50 mt-2">
              Total ouvert : <strong className="text-atlas-fg-1 tabular-nums">{statusTotal}</strong> · Livrées
              (lifetime) : {analytics.statusDistribution.done}
            </div>
          </div>
        </div>

        <div>
          <SectionTitle icon={AlertTriangle}>Priorité des tâches ouvertes</SectionTitle>
          <div className="panel p-4 space-y-2">
            {([1, 2, 3, 4] as const).map((p) => {
              const n = analytics.priorityDistribution[p];
              const pct = prioTotal > 0 ? (n / prioTotal) * 100 : 0;
              return (
                <div key={p}>
                  <div className="flex items-center justify-between text-2xs mb-1">
                    <span className="text-atlas-fg-2">{PRIO_LABEL[p]}</span>
                    <span className="tabular-nums text-atlas-fg-3">
                      {n} · {Math.round(pct)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-black/[0.04] rounded-full overflow-hidden">
                    <div className={cn('h-full', PRIO_COLOR[p])} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Time analysis */}
      <div>
        <SectionTitle icon={Calendar}>Temps & cycle</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="panel p-4">
            <div className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">
              Respect des délais
            </div>
            <div className="font-display text-2xl font-medium text-atlas-fg-1 mt-1 tabular-nums">
              {cur.completed > 0 ? Math.round((cur.completedOnTime / cur.completed) * 100) + '%' : '—'}
            </div>
            <div className="text-2xs text-atlas-fg-3 mt-1">
              {cur.completedOnTime}/{cur.completed} tâches livrées dans les temps
            </div>
          </div>
          <div className="panel p-4">
            <div className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">Cycle moyen</div>
            <div className="font-display text-2xl font-medium text-atlas-fg-1 mt-1 tabular-nums">
              {cur.avgCycleHours === null
                ? '—'
                : cur.avgCycleHours < 24
                  ? `${cur.avgCycleHours} h`
                  : `${Math.round(cur.avgCycleHours / 24)} j`}
            </div>
            <div className="text-2xs text-atlas-fg-3 mt-1">Création → livraison</div>
          </div>
          <div className="panel p-4">
            <div className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">
              Réel vs estimé
            </div>
            <div className="font-display text-2xl font-medium text-atlas-fg-1 mt-1 tabular-nums">
              {cur.estimatedHours > 0
                ? `${cur.actualHours} / ${cur.estimatedHours} h`
                : `${cur.actualHours} h`}
            </div>
            <div className="text-2xs text-atlas-fg-3 mt-1">
              {cur.estimatedHours > 0
                ? `${Math.round((cur.actualHours / cur.estimatedHours) * 100)}% du budget consommé`
                : 'Aucune estimation renseignée'}
            </div>
          </div>
        </div>
      </div>

      {/* Top tags */}
      {analytics.topTags.length > 0 && (
        <div>
          <SectionTitle icon={Award}>Top tags de la période</SectionTitle>
          <div className="panel p-4">
            <div className="space-y-1.5">
              {analytics.topTags.map((t) => (
                <div key={t.tag} className="flex items-center gap-3">
                  <div className="w-32 text-2xs text-atlas-fg-2 truncate">{t.tag}</div>
                  <div className="flex-1 h-2 bg-black/[0.04] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-atlas-amber"
                      style={{ width: `${(t.count / maxTagCount) * 100}%` }}
                    />
                  </div>
                  <div className="w-8 text-right text-2xs tabular-nums text-atlas-fg-3">{t.count}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ComparisonCard({
  label,
  current,
  previous,
  unit,
  inverted = false,
}: {
  label: string;
  current: number;
  previous: number;
  unit: string;
  /** If true, a smaller value is "good" (e.g. retards) and the arrow flips colours. */
  inverted?: boolean;
}) {
  const delta = current - previous;
  const pct = previous > 0 ? Math.round((delta / previous) * 100) : null;
  const goodDirection = inverted ? delta < 0 : delta > 0;
  return (
    <div className="panel p-4">
      <div className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">{label}</div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="font-display text-2xl font-medium text-atlas-fg-1 tabular-nums">
          {current}
          {unit && <span className="text-base ml-0.5">{unit}</span>}
        </span>
        {pct !== null ? (
          <span
            className={cn(
              'text-2xs font-medium inline-flex items-center gap-0.5',
              delta === 0 ? 'text-atlas-fg-3' : goodDirection ? 'text-signal-green' : 'text-signal-red'
            )}
          >
            {delta > 0 ? (
              <TrendingUp className="w-2.5 h-2.5" />
            ) : delta < 0 ? (
              <TrendingDown className="w-2.5 h-2.5" />
            ) : null}
            {delta > 0 ? '+' : ''}
            {pct}%
          </span>
        ) : previous === 0 && current > 0 ? (
          <span className="text-2xs font-medium text-signal-green">Nouveau</span>
        ) : null}
      </div>
      <div className="text-2xs text-atlas-fg-3 mt-1 tabular-nums">
        Période précédente : {previous}
        {unit}
      </div>
    </div>
  );
}
