import { useState } from 'react';
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
} from 'lucide-react';
import { useApp, type Report, type ReportKind, type AttentionPoint } from '../../stores/appStore';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu';
import { Modal } from '../ui/Modal';
import { cn, relativeTime } from '../../lib/utils';

const kindLabels: Record<ReportKind, string> = {
  weekly: 'Hebdomadaire',
  monthly: 'Mensuel',
  quarterly: 'Trimestriel',
  annual: 'Annuel',
};
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

  const filtered = filter === 'all' ? reports : reports.filter((r) => r.kind === filter);

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

      <div className="flex items-center gap-1.5 mb-4">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.map((r) => (
          <ReportCard
            key={r.id}
            report={r}
            onOpen={() => setOpenReportId(r.id)}
            onDelete={() => {
              if (confirm(`Supprimer "${r.title}" ?`)) deleteReport(r.id);
            }}
          />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full panel p-10 text-center">
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
        )}
      </div>

      {openReportId && <ReportViewerModal reportId={openReportId} onClose={() => setOpenReportId(null)} />}
    </div>
  );
}

function ReportCard({
  report,
  onOpen,
  onDelete,
}: {
  report: Report;
  onOpen: () => void;
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
          <div className="text-2xs text-atlas-fg-3 mt-1">
            {report.period} · généré {relativeTime(report.generatedAt)} par {author.name}
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
                  pushToast({ kind: 'info', title: 'Export PDF' });
                }}
              >
                Exporter PDF
              </MenuItem>
              <MenuItem
                icon={Mail}
                onClick={() => {
                  close();
                  pushToast({ kind: 'success', title: 'Rapport envoyé par e-mail' });
                }}
              >
                Envoyer par e-mail
              </MenuItem>
              <MenuItem
                icon={Copy}
                onClick={() => {
                  close();
                  pushToast({ kind: 'success', title: 'Lien copié' });
                }}
              >
                Copier le lien
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

function ReportViewerModal({ reportId, onClose }: { reportId: string; onClose: () => void }) {
  const report = useApp((s) => s.reports.find((r) => r.id === reportId));
  const author = useApp((s) => s.users.find((u) => u.id === report?.authorId) || s.users[0]);
  const generateNarrative = useApp((s) => s.generateReportNarrative);
  const pushToast = useApp((s) => s.pushToast);
  const [tab, setTab] = useState<'overview' | 'projects' | 'attention' | 'workload' | 'goals' | 'retards'>(
    'overview'
  );
  const [generating, setGenerating] = useState(false);

  if (!report) return null;

  const tabs = [
    { key: 'overview' as const, label: 'Synthèse', icon: BarChart3 },
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
          <button
            onClick={() => pushToast({ kind: 'info', title: 'Export PDF en cours' })}
            className="btn-secondary text-sm px-3 py-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Exporter PDF
          </button>
          <button
            onClick={() => pushToast({ kind: 'success', title: "Rapport envoyé à l'équipe" })}
            className="btn-primary text-sm px-3.5 py-1.5"
          >
            <Send className="w-3.5 h-3.5" /> Envoyer
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

        {tab === 'projects' && (
          <div className="space-y-3">
            <SectionTitle icon={Activity}>
              Avancement détaillé par projet · {report.projects?.length || 0}
            </SectionTitle>
            {(report.projects || []).map((p) => (
              <div key={p.projectId} className="panel p-5">
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
                        <div
                          className="h-full rounded-full bg-amber-gradient"
                          style={{ width: `${p.progress}%` }}
                        />
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
                  </div>
                </div>
              </div>
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
